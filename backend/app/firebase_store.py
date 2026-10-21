from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger("fieldwise")
_firestore_client: Any | None = None
_firebase_error: str | None = None


def firebase_status() -> tuple[bool, str | None]:
    return _firestore_client is not None, _firebase_error


def initialize_firebase() -> None:
    global _firestore_client, _firebase_error
    project_id = os.getenv("FIREBASE_PROJECT_ID")
    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if not (service_account_json or credentials_path):
        _firebase_error = "Firebase Admin credentials are not configured"
        logger.warning(_firebase_error)
        return

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        if not firebase_admin._apps:
            credential = credentials.Certificate(json.loads(service_account_json)) if service_account_json else credentials.Certificate(credentials_path)
            options = {"projectId": project_id} if project_id else None
            firebase_admin.initialize_app(credential, options)
        _firestore_client = firestore.client()
        _firebase_error = None
        logger.info("Firebase Firestore is ready for mobile scan records")
    except Exception as exc:
        _firebase_error = str(exc)
        logger.exception("Firebase Firestore could not be initialized")


def save_mobile_scan(record_id: int, result: dict[str, Any], platform: str) -> str | None:
    if _firestore_client is None:
        return None
    try:
        from firebase_admin import firestore

        document_id = f"mobile-{record_id}"
        _firestore_client.collection("mobile_scan_tests").document(document_id).set({
            "history_id": record_id,
            "platform": platform,
            "source": "real_world_mobile_capture",
            "predicted_class": result["predicted_class"],
            "crop": result["crop"],
            "disease": result["disease"],
            "confidence": float(result["confidence"]),
            "is_healthy": bool(result["is_healthy"]),
            "top_predictions": result["top_predictions"],
            "created_at": firestore.SERVER_TIMESTAMP,
            "ground_truth": None,
        })
        return document_id
    except Exception:
        logger.exception("Could not save mobile scan %s to Firebase", record_id)
        return None
