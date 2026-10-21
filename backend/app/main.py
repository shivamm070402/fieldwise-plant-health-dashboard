from __future__ import annotations

import io
import json
import logging
import os
import asyncio
import time
import csv
import zipfile
from contextlib import asynccontextmanager
from datetime import timezone
from pathlib import Path
from typing import Any

import httpx
import numpy as np

# Bound CPU thread pools so the first CPU inference remains responsive in local
# Windows runs and in small Railway containers.
os.environ.setdefault("TF_NUM_INTRAOP_THREADS", "2")
os.environ.setdefault("TF_NUM_INTEROP_THREADS", "2")

import tensorflow as tf
from dotenv import load_dotenv
from fastapi import FastAPI, File, Header, HTTPException, Query, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI, OpenAIError
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import desc

# Load local development settings before importing database configuration.
load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)

from .database import PredictionRecord, SessionLocal, create_tables
from .firebase_store import firebase_status, initialize_firebase, save_mobile_scan

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("fieldwise")
MODEL_DIR = Path(os.getenv("MODEL_DIR", Path(__file__).resolve().parents[1] / "models"))
MODEL_PATH = Path(os.getenv("MODEL_PATH", MODEL_DIR / "plant_disease_model.keras"))
LABELS_PATH = Path(os.getenv("LABELS_PATH", MODEL_DIR / "class_names.json"))
SIZE = 224
MAX_BYTES = int(os.getenv("MAX_UPLOAD_MB", "10")) * 1024 * 1024
MIN_PLANT_CONFIDENCE = float(os.getenv("MIN_PLANT_CONFIDENCE", "0.55"))
MIN_CAMERA_PLANT_CONFIDENCE = float(os.getenv("MIN_CAMERA_PLANT_CONFIDENCE", "0.7"))
MIN_CAMERA_GREEN_RATIO = float(os.getenv("MIN_CAMERA_GREEN_RATIO", "0.08"))
COUNTRIESNOW_BASE = "https://countriesnow.space/api/v0.1"
LOCATION_CACHE_TTL_SECONDS = 21600
WORLD_COUNTRY_CACHE_KEY = "world-country-weather"

WEATHER_FIT_LABELS = ["favorable_now", "mixed", "unfavorable", "insufficient_data"]
CARE_PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "crop_weather_fit": {
            "type": "object",
            "properties": {"label": {"type": "string", "enum": WEATHER_FIT_LABELS}, "summary": {"type": "string"}},
            "required": ["label", "summary"], "additionalProperties": False,
        },
        "disease_weather_context": {
            "type": "object",
            "properties": {
                "label": {"type": "string", "enum": ["weather_may_support_risk", "weather_not_obviously_supportive", "limited_evidence", "not_applicable"]},
                "summary": {"type": "string"},
            },
            "required": ["label", "summary"], "additionalProperties": False,
        },
        "remedy_points": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"action": {"type": "string"}, "explanation": {"type": "string"}, "solution": {"type": "string"}},
                "required": ["action", "explanation", "solution"], "additionalProperties": False,
            },
        },
        "city_comparisons": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"location": {"type": "string"}, "label": {"type": "string", "enum": WEATHER_FIT_LABELS}, "summary": {"type": "string"}},
                "required": ["location", "label", "summary"], "additionalProperties": False,
            },
        },
        "caution": {"type": "string"},
    },
    "required": ["crop_weather_fit", "disease_weather_context", "remedy_points", "city_comparisons", "caution"],
    "additionalProperties": False,
}
COUNTRY_FIT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "countries": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "country_code": {"type": "string"},
                    "label": {"type": "string", "enum": WEATHER_FIT_LABELS},
                    "summary": {"type": "string"},
                },
                "required": ["country_code", "label", "summary"], "additionalProperties": False,
            },
        },
    },
    "required": ["countries"], "additionalProperties": False,
}
LOCATION_CACHE: dict[str, tuple[float, Any]] = {}


class Predictor:
    model: Any | None = None
    labels: list[str] = []
    error: str | None = None

    def load(self) -> None:
        if not MODEL_PATH.is_file() or not LABELS_PATH.is_file():
            self.error = f"Add plant_disease_model.keras and class_names.json to {MODEL_DIR}"
            logger.warning(self.error)
            return
        try:
            labels = json.loads(LABELS_PATH.read_text(encoding="utf-8"))
            model = tf.keras.models.load_model(MODEL_PATH, compile=False)
            if not isinstance(labels, list) or model.output_shape[-1] != len(labels):
                raise ValueError("Model output count does not match class_names.json")
            self.model, self.labels, self.error = model, labels, None
        except Exception as exc:
            self.error = str(exc)
            logger.exception("Model could not be loaded")

    def predict(
        self,
        raw: bytes,
        minimum_confidence: float = MIN_PLANT_CONFIDENCE,
        require_leaf_visual_cue: bool = False,
    ) -> dict[str, Any]:
        if self.model is None:
            raise HTTPException(503, self.error or "Model unavailable")
        try:
            with Image.open(io.BytesIO(raw)) as source:
                transposed = ImageOps.exif_transpose(source)
                if transposed is None:
                    transposed = source
                image = transposed.convert("RGB").resize((SIZE, SIZE), Image.Resampling.BILINEAR)
                batch = np.expand_dims(np.asarray(image, dtype=np.float32), 0)
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
            raise HTTPException(400, "Could not read image; upload a JPG, PNG, or WebP photo") from exc
        if require_leaf_visual_cue:
            pixels = np.asarray(image, dtype=np.int16)
            red, green, blue = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
            green_ratio = float(((green > red * 1.05) & (green > blue * 1.03) & (green > 45)).mean())
            if green_ratio < MIN_CAMERA_GREEN_RATIO:
                raise HTTPException(
                    422,
                    "The camera photo does not appear to show a leaf. Point the camera at one plant leaf, fill most of the frame, and try again.",
                )
        scores = np.asarray(self.model(batch, training=False))[0].astype(np.float64)
        if len(scores) != len(self.labels) or not np.isfinite(scores).all():
            raise HTTPException(500, "Model returned invalid scores")
        scores = np.clip(scores, 0, None)
        scores /= max(float(scores.sum()), 1e-12)
        indices = np.argsort(scores)[::-1][:3]
        if float(scores[indices[0]]) < minimum_confidence:
            raise HTTPException(
                422,
                "This image could not be confidently matched to a supported leaf-disease class. Use a clear, close-up photo of one leaf and try again.",
            )
        label = self.labels[int(indices[0])]
        crop, disease = (label.split("___", 1) + [""])[:2] if "___" in label else ("Plant", label)
        disease = disease.replace("_", " ")
        return {
            "predicted_class": label,
            "crop": crop.replace("_", " "),
            "disease": disease,
            "confidence": float(scores[indices[0]]),
            "top_predictions": [{"class_name": self.labels[int(i)], "confidence": float(scores[i])} for i in indices],
            "is_healthy": "healthy" in disease.lower(),
            "advice": advice(disease),
            "disclaimer": "AI screening only. Confirm uncertain or severe cases with a local agricultural extension professional.",
        }


def advice(disease: str) -> list[str]:
    name = disease.lower()
    if "healthy" in name:
        return ["No disease pattern was identified in this image.", "Continue routine scouting and use good crop hygiene."]
    if any(word in name for word in ("virus", "mosaic", "yellow leaf curl")):
        return ["Inspect nearby plants and check for insect vectors.", "Sanitize tools and follow local guidance for managing severely affected plants.", "Ask a local extension service about resistant varieties and approved controls."]
    if any(word in name for word in ("blight", "mildew", "rust", "scab", "rot", "spot", "esca")):
        return ["Inspect several leaves, including their undersides, to confirm symptoms.", "Avoid wetting foliage where practical; remove affected debris when appropriate.", "Improve airflow and follow local crop-specific extension advice for treatment options."]
    if "mite" in name:
        return ["Inspect leaf undersides and nearby plants for mites or webbing.", "Use locally approved integrated pest-management guidance."]
    return ["Inspect more leaves and nearby plants to confirm the symptoms.", "Follow local crop-specific guidance before applying any treatment."]


predictor = Predictor()


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_tables()
    predictor.load()
    initialize_firebase()
    yield


app = FastAPI(title="Fieldwise Plant Care API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[origin.strip().rstrip("/") for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,https://shivamm070402.github.io").split(",") if origin.strip()], allow_methods=["GET", "POST"], allow_headers=["*"])


@app.get("/api/health")
def health() -> dict[str, Any]:
    firebase_ready, _ = firebase_status()
    return {"status": "ready" if predictor.model is not None else "model_unavailable", "model_ready": predictor.model is not None, "firebase_ready": firebase_ready, "classes": len(predictor.labels), "error": predictor.error}


@app.post("/api/care-plan")
async def care_plan(payload: dict[str, Any]) -> dict[str, Any]:
    api_key = require_openai_key()
    prediction = get_prediction_record(payload.get("prediction_id"))
    weather_snapshot = clean_weather_snapshot(payload.get("weather"))
    comparison_input = payload.get("comparison_weather", [])
    if not isinstance(comparison_input, list):
        raise HTTPException(422, "comparison_weather must be a list")
    comparisons = [clean_weather_snapshot(item) for item in comparison_input[:8]]
    data = {
        "crop": prediction.crop,
        "detected_disease": prediction.disease,
        "prediction_is_healthy": prediction.is_healthy,
        "model_confidence": round(float(prediction.confidence), 4),
        "selected_city_weather": weather_snapshot,
        "comparison_city_weather": comparisons,
    }
    instructions = (
        "You are a cautious crop-care assistant. The plant result is an AI image-screening label, not a confirmed diagnosis. "
        "Use only the supplied five-day weather snapshot and clearly distinguish a short forecast from seasonal crop suitability. "
        "Return 3 to 5 practical, pointwise remedies with an action, why it helps, and exactly how to do it. "
        "Prefer observation, sanitation, airflow, water management, and local extension advice. Never give pesticide doses, "
        "brand names, or unsafe chemical instructions. If the plant is healthy, provide preventive care rather than a cure. "
        "Do not claim weather caused the disease. For city comparisons, copy each supplied location string exactly. "
        "Keep explanations concise, evidence-aware, and suitable for a home grower or small farm."
    )
    plan = await openai_json_response(
        api_key=api_key, schema_name="plant_care_plan", schema=CARE_PLAN_SCHEMA,
        instructions=instructions, input_data=data, max_output_tokens=2200,
    )
    known_labels = {"favorable_now", "mixed", "unfavorable", "insufficient_data"}
    if plan.get("crop_weather_fit", {}).get("label") not in known_labels or not isinstance(plan.get("remedy_points"), list):
        raise HTTPException(502, "OpenAI returned an incomplete care plan; please retry")
    return {"plan": plan}


@app.post("/api/country-weather-suitability")
async def country_weather_suitability(payload: dict[str, Any]) -> dict[str, Any]:
    api_key = require_openai_key()
    prediction = get_prediction_record(payload.get("prediction_id"))
    countries = await world_country_weather()
    if not countries:
        raise HTTPException(502, "No country weather forecasts are available; please retry")

    ai_input = {
        "crop": prediction.crop,
        "countries": [
            {"country_code": item["country_code"], "country": item["country"], "weather": item["weather"]}
            for item in countries
        ],
    }
    instructions = (
        "Compare each country's supplied five-day forecast with the general growing conditions of the named crop. "
        "This is only a short-term forecast at one reference coordinate per country, never a country-wide or seasonal climate rating. "
        "Use favorable_now when the available near-term weather broadly fits typical crop needs, mixed when signals conflict or evidence is weak, "
        "unfavorable when a clear short-term temperature or moisture mismatch is present, and insufficient_data when key weather values are missing "
        "or crop needs cannot be estimated. Never infer an entire country's climate from this point. "
        "Return exactly one concise plain-language summary per supplied country and copy its ISO country_code exactly. "
        "Do not make planting guarantees or recommend pesticide use."
    )
    fit = await openai_json_response(
        api_key=api_key, schema_name="country_crop_weather_fit", schema=COUNTRY_FIT_SCHEMA,
        instructions=instructions, input_data=ai_input, max_output_tokens=7500,
    )
    by_code = {
        item.get("country_code", "").upper(): item
        for item in fit.get("countries", [])
        if isinstance(item, dict) and item.get("country_code")
    }
    assessed = []
    for item in countries:
        result = by_code.get(item["country_code"], {})
        label = result.get("label") if result.get("label") in WEATHER_FIT_LABELS else "insufficient_data"
        summary = result.get("summary")
        if not isinstance(summary, str) or not summary.strip():
            summary = "AI did not return an assessment for this country; check a specific local city forecast."
        assessed.append({
            "country": item["country"], "country_code": item["country_code"],
            "label": label, "summary": summary[:500], "weather": item["weather"],
        })
    return {"countries": assessed, "evaluated_count": len(assessed), "forecast_days": 5, "reference_point_count": len(assessed)}


@app.post("/api/predict")
async def predict(
    file: UploadFile = File(...),
    client_platform: str | None = Header(default=None, alias="X-Client-Platform"),
    image_source: str | None = Header(default=None, alias="X-Image-Source"),
) -> dict[str, Any]:
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(415, "Upload a JPG, PNG, or WebP image")
    raw = await file.read(MAX_BYTES + 1)
    if not raw:
        raise HTTPException(400, "Uploaded file is empty")
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, f"Image must be smaller than {MAX_BYTES // (1024 * 1024)} MB")
    minimum_confidence = MIN_CAMERA_PLANT_CONFIDENCE if (image_source or "").strip().lower() == "camera" else MIN_PLANT_CONFIDENCE
    is_camera_image = (image_source or "").strip().lower() == "camera"
    result = predictor.predict(raw, minimum_confidence=minimum_confidence, require_leaf_visual_cue=is_camera_image)
    result["filename"] = Path(file.filename or "leaf-image").name
    result["classes"] = predictor.labels
    with SessionLocal() as session:
        record = PredictionRecord(
            filename=result["filename"],
            crop=result["crop"],
            disease=result["disease"],
            predicted_class=result["predicted_class"],
            confidence=result["confidence"],
            is_healthy=result["is_healthy"],
            image_data=raw,
            image_content_type=file.content_type,
        )
        session.add(record)
        session.commit()
        session.refresh(record)
        result["history_id"] = record.id
    platform = (client_platform or "").strip().lower()
    if platform in {"android", "ios"}:
        firebase_id = await run_in_threadpool(save_mobile_scan, record.id, result, platform)
        result["firebase_saved"] = firebase_id is not None
        result["firebase_record_id"] = firebase_id
    return result


@app.post("/api/predictions/{prediction_id}/label")
async def verify_prediction_label(prediction_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    class_name = payload.get("class_name")
    if not isinstance(class_name, str) or class_name not in predictor.labels:
        raise HTTPException(422, "Choose a valid plant class from the model labels")
    with SessionLocal() as session:
        row = session.get(PredictionRecord, prediction_id)
        if row is None:
            raise HTTPException(404, "Saved scan not found")
        row.expected_class = class_name
        row.is_correct = class_name == row.predicted_class
        session.commit()
        return {"id": row.id, "expected_class": row.expected_class, "is_correct": row.is_correct}


@app.get("/api/training-data/export.zip")
def export_verified_training_data() -> Response:
    archive_buffer = io.BytesIO()
    with SessionLocal() as session:
        rows = session.query(PredictionRecord).filter(
            PredictionRecord.expected_class.is_not(None),
            PredictionRecord.image_data.is_not(None),
        ).order_by(PredictionRecord.id).all()
        with zipfile.ZipFile(archive_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            manifest_buffer = io.StringIO()
            writer = csv.writer(manifest_buffer)
            writer.writerow(["prediction_id", "image_path", "verified_class", "model_class", "model_confidence", "is_correct", "created_at"])
            for row in rows:
                ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}.get(row.image_content_type, ".img")
                image_path = f"{row.expected_class}/{row.id}{ext}"
                archive.writestr(image_path, row.image_data)
                writer.writerow([row.id, image_path, row.expected_class, row.predicted_class, row.confidence, row.is_correct, row.created_at.isoformat() if row.created_at else ""])
            archive.writestr("manifest.csv", manifest_buffer.getvalue())
    archive_buffer.seek(0)
    return Response(
        content=archive_buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="fieldwise-verified-training-data.zip"'},
    )


@app.get("/api/history")
def prediction_history(limit: int = Query(default=20, ge=1, le=100)) -> list[dict[str, Any]]:
    with SessionLocal() as session:
        rows = session.query(PredictionRecord).order_by(desc(PredictionRecord.created_at)).limit(limit).all()
        return [
            {
                "id": row.id,
                "filename": row.filename,
                "crop": row.crop,
                "disease": row.disease,
                "predicted_class": row.predicted_class,
                "confidence": row.confidence,
                "is_healthy": row.is_healthy,
                "expected_class": row.expected_class,
                "is_correct": row.is_correct,
                "image_url": f"/api/history/{row.id}/image" if row.image_data else None,
                "created_at": (row.created_at if row.created_at.tzinfo else row.created_at.replace(tzinfo=timezone.utc)).isoformat(),
            }
            for row in rows
        ]


@app.get("/api/history/{prediction_id}/image")
def prediction_image(prediction_id: int) -> Response:
    with SessionLocal() as session:
        row = session.get(PredictionRecord, prediction_id)
        if row is None or row.image_data is None:
            raise HTTPException(404, "Saved image not found")
        return Response(
            content=row.image_data,
            media_type=row.image_content_type or "image/jpeg",
            headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"},
        )


def field_notes(current: dict[str, Any], daily: dict[str, Any]) -> list[str]:
    notes = []
    rain = (daily.get("precipitation_probability_max") or [None])[0]
    humidity, wind, high = current.get("relative_humidity_2m"), current.get("wind_speed_10m"), (daily.get("temperature_2m_max") or [None])[0]
    notes.append("Rain is likely; check the field before scheduling irrigation or spraying." if rain is not None and rain >= 60 else "Check soil moisture at the field before deciding whether to irrigate.")
    if humidity is not None and humidity >= 80:
        notes.append("High humidity can favor some foliar diseases; scout leaves and maintain airflow where possible.")
    if wind is not None and wind >= 20:
        notes.append("Wind is elevated; check conditions and local label directions before any spray application.")
    if high is not None and high >= 35:
        notes.append("High temperature is forecast; monitor crops for heat stress and follow local irrigation guidance.")
    if len(notes) < 3:
        notes.append("Use this forecast as planning context and confirm conditions at the field.")
    return notes[:4]


async def request_weather(client: httpx.AsyncClient, url: str, params: dict[str, Any]) -> httpx.Response:
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = await client.get(url, params=params)
            if response.status_code not in {429, 500, 502, 503, 504}:
                response.raise_for_status()
                return response
            last_error = httpx.HTTPStatusError(
                f"Weather provider returned HTTP {response.status_code}",
                request=response.request,
                response=response,
            )
            if attempt < 2:
                retry_after = response.headers.get("Retry-After", "")
                delay = min(float(retry_after), 5.0) if retry_after.isdigit() else 0.5 * (2 ** attempt)
                await asyncio.sleep(delay)
        except httpx.TransportError as exc:
            last_error = exc
            if attempt < 2:
                await asyncio.sleep(0.5 * (2 ** attempt))
        except httpx.HTTPError:
            raise
    raise last_error or httpx.TimeoutException("Weather provider did not respond")


def weather_provider_error(location: str, exc: Exception) -> HTTPException:
    logger.warning("Weather or location provider request failed for %r: %s", location, exc)
    if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 429:
        return HTTPException(503, "Weather provider is busy; please retry in a minute")
    return HTTPException(502, "Weather provider could not return a response; please retry shortly")


def cached_location_data(cache_key: str) -> Any | None:
    cached = LOCATION_CACHE.get(cache_key)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    LOCATION_CACHE.pop(cache_key, None)
    return None


def save_location_data(cache_key: str, data: Any) -> Any:
    LOCATION_CACHE[cache_key] = (time.monotonic() + LOCATION_CACHE_TTL_SECONDS, data)
    return data


def require_openai_key() -> str:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key or api_key.lower().startswith("replace-"):
        raise HTTPException(503, "OPENAI_API_KEY is not configured on the backend")
    return api_key


async def openai_json_response(*, api_key: str, schema_name: str, schema: dict[str, Any], instructions: str, input_data: Any, max_output_tokens: int = 5000) -> dict[str, Any]:
    client = AsyncOpenAI(api_key=api_key, timeout=120.0, max_retries=1)
    try:
        response = await client.responses.create(
            model=os.getenv("OPENAI_MODEL", "gpt-6-astra").strip(),
            instructions=instructions,
            input=json.dumps(input_data, ensure_ascii=False, separators=(",", ":")),
            text={"format": {"type": "json_schema", "name": schema_name, "strict": True, "schema": schema}},
            max_output_tokens=max_output_tokens,
        )
        output_text = response.output_text
        if not output_text:
            raise ValueError("OpenAI returned an empty response")
        parsed = json.loads(output_text)
        if not isinstance(parsed, dict):
            raise ValueError("OpenAI returned an unexpected response format")
        return parsed
    except OpenAIError as exc:
        logger.warning("OpenAI request failed (%s)", type(exc).__name__)
        if getattr(exc, "status_code", None) in {401, 403}:
            raise HTTPException(502, "OpenAI rejected the configured key or model; check OPENAI_API_KEY and OPENAI_MODEL") from exc
        raise HTTPException(502, "OpenAI could not generate this result; check service access and try again") from exc
    except (ValueError, json.JSONDecodeError) as exc:
        logger.warning("OpenAI returned invalid structured output: %s", exc)
        raise HTTPException(502, "OpenAI returned an incomplete result; please retry") from exc
    finally:
        await client.close()


def clean_weather_snapshot(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise HTTPException(422, "Weather snapshot is missing or invalid")

    def finite_number(item: Any) -> float | None:
        try:
            number = float(item)
            return number if np.isfinite(number) else None
        except (TypeError, ValueError):
            return None

    forecast = value.get("forecast_5_day", [])
    safe_forecast = []
    if isinstance(forecast, list):
        for day in forecast[:5]:
            if not isinstance(day, dict):
                continue
            safe_forecast.append({
                "date": str(day.get("date", ""))[:20],
                "temperature_high_c": finite_number(day.get("temperature_high_c")),
                "temperature_low_c": finite_number(day.get("temperature_low_c")),
                "rain_probability_pct": finite_number(day.get("rain_probability_pct")),
                "precipitation_mm": finite_number(day.get("precipitation_mm")),
            })
    return {
        "location": str(value.get("location", "Selected city"))[:120],
        "current_temperature_c": finite_number(value.get("current_temperature_c")),
        "relative_humidity_pct": finite_number(value.get("relative_humidity_pct")),
        "current_precipitation_mm": finite_number(value.get("current_precipitation_mm")),
        "wind_speed_kmh": finite_number(value.get("wind_speed_kmh")),
        "forecast_5_day": safe_forecast,
    }


def get_prediction_record(prediction_id: Any) -> PredictionRecord:
    try:
        record_id = int(prediction_id)
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, "prediction_id must be an integer") from exc
    with SessionLocal() as session:
        record = session.get(PredictionRecord, record_id)
        if record is None:
            raise HTTPException(404, "Prediction not found; scan an image first")
        # Detach a value copy before the session closes.
        return PredictionRecord(
            id=record.id, crop=record.crop, disease=record.disease,
            predicted_class=record.predicted_class, confidence=record.confidence,
            is_healthy=record.is_healthy,
        )


async def world_country_weather() -> list[dict[str, Any]]:
    cached = cached_location_data(WORLD_COUNTRY_CACHE_KEY)
    if cached is not None:
        return cached

    timeout = httpx.Timeout(40.0, connect=12.0)
    headers = {"User-Agent": "FieldwisePlantDashboard/1.0"}
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=headers) as client:
        try:
            iso_response, positions_response = await asyncio.gather(
                request_weather(client, f"{COUNTRIESNOW_BASE}/countries/iso", {}),
                request_weather(client, f"{COUNTRIESNOW_BASE}/countries/positions", {}),
            )
            iso_payload, position_payload = iso_response.json(), positions_response.json()
            iso_records, positions = iso_payload.get("data", []), position_payload.get("data", [])
            if iso_payload.get("error") or position_payload.get("error") or not isinstance(iso_records, list) or not isinstance(positions, list):
                raise ValueError("Country coordinate service returned an unexpected response")
        except (httpx.HTTPError, ValueError) as exc:
            raise weather_provider_error("country reference coordinates", exc) from exc

        def country_key(value: Any) -> str:
            return " ".join(str(value or "").casefold().replace("&", "and").split())

        codes = {
            country_key(item.get("name")): str(item.get("Iso2") or item.get("iso2") or "").upper()
            for item in iso_records if isinstance(item, dict)
        }
        candidates = []
        for item in positions:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or item.get("country") or "").strip()
            code = codes.get(country_key(name))
            try:
                latitude = float(item.get("lat", item.get("latitude"))) # type: ignore
                longitude = float(item.get("long", item.get("longitude", item.get("lon")))) # type: ignore # type: ignore
            except (TypeError, ValueError):
                continue
            if name and code and np.isfinite([latitude, longitude]).all() and -90 <= latitude <= 90 and -180 <= longitude <= 180:
                candidates.append({"country": name, "country_code": code, "latitude": latitude, "longitude": longitude})

        if not candidates:
            raise HTTPException(502, "Country reference coordinates are unavailable")

        semaphore = asyncio.Semaphore(3)

        async def fetch_chunk(chunk: list[dict[str, Any]]) -> list[tuple[dict[str, Any], dict[str, Any] | None]]:
            async with semaphore:
                try:
                    response = await request_weather(client, "https://api.open-meteo.com/v1/forecast", {
                        "latitude": ",".join(f"{item['latitude']:.4f}" for item in chunk),
                        "longitude": ",".join(f"{item['longitude']:.4f}" for item in chunk),
                        "current": "temperature_2m,relative_humidity_2m",
                        "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum",
                        "forecast_days": 5, "timezone": "auto",
                    })
                    payload = response.json()
                    forecast_rows = payload if isinstance(payload, list) else [payload]
                    if len(forecast_rows) != len(chunk):
                        raise ValueError("Weather provider returned a mismatched country batch")
                    return list(zip(chunk, forecast_rows, strict=True))
                except (httpx.HTTPError, ValueError) as exc:
                    logger.warning("Country weather batch failed: %s", type(exc).__name__)
                    return [(item, None) for item in chunk]

        chunks = [candidates[index:index + 60] for index in range(0, len(candidates), 60)]
        batches = await asyncio.gather(*(fetch_chunk(chunk) for chunk in chunks))

    results = []
    for country, forecast in (item for batch in batches for item in batch):
        metrics: dict[str, Any] = {
            "current_temperature_c": None, "current_humidity_pct": None,
            "five_day_lowest_min_c": None, "five_day_highest_max_c": None,
            "five_day_rain_total_mm": None, "five_day_peak_rain_chance_pct": None,
        }
        if isinstance(forecast, dict):
            current, daily = forecast.get("current", {}), forecast.get("daily", {})
            highs = [float(value) for value in (daily.get("temperature_2m_max") or []) if value is not None]
            lows = [float(value) for value in (daily.get("temperature_2m_min") or []) if value is not None]
            rain = [float(value) for value in (daily.get("precipitation_sum") or []) if value is not None]
            rain_chance = [float(value) for value in (daily.get("precipitation_probability_max") or []) if value is not None]
            metrics = {
                "current_temperature_c": current.get("temperature_2m"),
                "current_humidity_pct": current.get("relative_humidity_2m"),
                "five_day_lowest_min_c": min(lows) if lows else None,
                "five_day_highest_max_c": max(highs) if highs else None,
                "five_day_rain_total_mm": round(sum(rain), 1) if rain else None,
                "five_day_peak_rain_chance_pct": max(rain_chance) if rain_chance else None,
            }
        results.append({**country, "weather": metrics})

    return save_location_data(WORLD_COUNTRY_CACHE_KEY, results)


def location_names(data: Any, field: str) -> list[str]:
    if isinstance(data, dict):
        data = data.get(field, [])
    if not isinstance(data, list):
        return []
    names = [item if isinstance(item, str) else item.get("name") for item in data if isinstance(item, (str, dict))]
    return sorted({name.strip() for name in names if isinstance(name, str) and name.strip()}, key=str.casefold)


@app.get("/api/weather/countries")
async def weather_countries() -> dict[str, Any]:
    cached = cached_location_data("countries")
    if cached is not None:
        return {"countries": cached}
    timeout = httpx.Timeout(20.0, connect=8.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers={"User-Agent": "FieldwisePlantDashboard/1.0"}) as client:
        try:
            response = await request_weather(client, f"{COUNTRIESNOW_BASE}/countries/iso", {})
            payload = response.json()
            if payload.get("error"):
                raise ValueError(payload.get("msg", "Country list is unavailable"))
            records = payload.get("data", [])
            if not isinstance(records, list):
                raise ValueError("Country list had an unexpected format")
        except (httpx.HTTPError, ValueError) as exc:
            raise weather_provider_error("countries", exc) from exc
    countries = sorted(
        [
            {"name": item.get("name"), "code": item.get("Iso2") or item.get("iso2")}
            for item in records
            if isinstance(item, dict) and item.get("name") and (item.get("Iso2") or item.get("iso2"))
        ],
        key=lambda item: item["name"].casefold(), # pyright: ignore[reportOptionalMemberAccess]
    )
    return {"countries": save_location_data("countries", countries)}


@app.get("/api/weather/states")
async def weather_states(country: str = Query(min_length=2, max_length=100)) -> dict[str, Any]:
    country = country.strip()
    cache_key = f"states:{country.casefold()}"
    cached = cached_location_data(cache_key)
    if cached is not None:
        return {"states": cached}
    timeout = httpx.Timeout(20.0, connect=8.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers={"User-Agent": "FieldwisePlantDashboard/1.0"}) as client:
        try:
            response = await request_weather(client, f"{COUNTRIESNOW_BASE}/countries/states/q", {"country": country})
            payload = response.json()
            if payload.get("error"):
                return {"states": save_location_data(cache_key, [])}
            states = location_names(payload.get("data", []), "states")
        except (httpx.HTTPError, ValueError) as exc:
            raise weather_provider_error(f"states for {country}", exc) from exc
    return {"states": save_location_data(cache_key, states)}


@app.get("/api/weather/cities")
async def weather_cities(
    country: str = Query(min_length=2, max_length=100),
    state: str | None = Query(default=None, min_length=1, max_length=100),
) -> dict[str, Any]:
    country = country.strip()
    state = state.strip() if state else None
    cache_key = f"cities:{country.casefold()}:{(state or '').casefold()}"
    cached = cached_location_data(cache_key)
    if cached is not None:
        return {"cities": cached}
    route = "countries/state/cities/q" if state else "countries/cities/q"
    params = {"country": country}
    if state:
        params["state"] = state
    timeout = httpx.Timeout(25.0, connect=8.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers={"User-Agent": "FieldwisePlantDashboard/1.0"}) as client:
        try:
            response = await request_weather(client, f"{COUNTRIESNOW_BASE}/{route}", params)
            payload = response.json()
            if payload.get("error"):
                raise HTTPException(404, payload.get("msg", "No cities found for this selection"))
            cities = location_names(payload.get("data", []), "cities")
        except HTTPException:
            raise
        except (httpx.HTTPError, ValueError) as exc:
            raise weather_provider_error(f"cities for {state or country}", exc) from exc
    return {"cities": save_location_data(cache_key, cities)}


@app.get("/api/weather/locations")
async def weather_locations(query: str = Query(min_length=2, max_length=100)) -> dict[str, Any]:
    """Search place names and postal codes worldwide using Open-Meteo geocoding."""
    timeout = httpx.Timeout(25.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers={"User-Agent": "FieldwisePlantDashboard/1.0"}) as client:
        try:
            response = await request_weather(client, "https://geocoding-api.open-meteo.com/v1/search", {
                "name": query.strip(), "count": 10, "language": "en", "format": "json",
            })
            results = response.json().get("results", [])
        except (httpx.HTTPError, ValueError) as exc:
            raise weather_provider_error(query, exc) from exc

    locations = []
    for place in results:
        parts = [place.get("name"), place.get("admin1"), place.get("country")]
        label = ", ".join(dict.fromkeys(part for part in parts if part))
        locations.append({
            "label": label,
            "name": place.get("name"),
            "admin1": place.get("admin1"),
            "country": place.get("country"),
            "country_code": place.get("country_code"),
            "latitude": place.get("latitude"),
            "longitude": place.get("longitude"),
        })
    return {"locations": locations}


@app.get("/api/weather")
async def weather(
    city: str | None = Query(default=None, min_length=2, max_length=100),
    latitude: float | None = Query(default=None, ge=-90, le=90),
    longitude: float | None = Query(default=None, ge=-180, le=180),
    place_name: str | None = Query(default=None, max_length=100),
    admin1: str | None = Query(default=None, max_length=100),
    country: str | None = Query(default=None, max_length=100),
    country_code: str | None = Query(default=None, min_length=2, max_length=2),
) -> dict[str, Any]:
    """Return global weather by place name or exact WGS84 coordinates."""
    if (latitude is None) != (longitude is None):
        raise HTTPException(400, "Provide both latitude and longitude")
    if latitude is None and longitude is None:
        city = (city or "").strip()
        if not city:
            raise HTTPException(400, "Enter a city, postal code, or select a location")

    timeout = httpx.Timeout(25.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers={"User-Agent": "FieldwisePlantDashboard/1.0"}) as client:
        try:
            if latitude is None or longitude is None:
                normalized_city = city.casefold()
                aliases = {"bengaluru": "Bangalore", "bangalore": "Bengaluru"}
                city_queries = [city]
                if normalized_city in aliases:
                    city_queries.append(aliases[normalized_city])
                location_queries = list(dict.fromkeys(
                    query
                    for city_query in city_queries
                    for query in (
                        city_query,
                        ", ".join(part for part in (city_query, country) if part),
                        ", ".join(part for part in (city_query, admin1, country) if part),
                    )
                ))
                results = []
                for index, location_query in enumerate(location_queries):
                    params = {"name": location_query, "count": 10, "language": "en", "format": "json"}
                    if country_code and index == 0:
                        params["countryCode"] = country_code
                    response = await request_weather(client, "https://geocoding-api.open-meteo.com/v1/search", params)
                    found = response.json().get("results", [])
                    if not isinstance(found, list) or not found:
                        continue
                    matching_country = [item for item in found if not country_code or str(item.get("country_code", "")).casefold() == country_code.casefold()]
                    if not matching_country and country:
                        matching_country = [item for item in found if str(item.get("country", "")).casefold() == country.casefold()]
                    if matching_country:
                        requested_region = (admin1 or "").casefold()
                        matching_region = [item for item in matching_country if requested_region and requested_region in " ".join(str(item.get(key, "")) for key in ("admin1", "admin2")).casefold()]
                        results = matching_region or matching_country
                        break
                    if not country_code and not country:
                        results = found
                        break
                if not results:
                    raise HTTPException(404, "Location not found worldwide; try adding its region or country")
                place = results[0]
                latitude, longitude = place["latitude"], place["longitude"]
            else:
                place = {"name": place_name or "Selected location", "admin1": admin1, "country": country}

            response = await request_weather(client, "https://api.open-meteo.com/v1/forecast", {
                "latitude": latitude, "longitude": longitude,
                "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code",
                "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum",
                "forecast_days": 5, "timezone": "auto",
            })
            forecast = response.json()
        except HTTPException:
            raise
        except (httpx.HTTPError, ValueError) as exc:
            raise weather_provider_error(city or place_name or f"{latitude},{longitude}", exc) from exc

    current, daily = forecast.get("current", {}), forecast.get("daily", {})
    return {
        "location": {
            "name": place.get("name"), "admin1": place.get("admin1"), "country": place.get("country"),
            "latitude": latitude, "longitude": longitude,
        },
        "current": current, "daily": daily, "farm_notes": field_notes(current, daily),
        "attribution": "Weather data by Open-Meteo",
    }
