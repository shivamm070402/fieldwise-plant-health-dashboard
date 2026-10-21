# Fieldwise plant health dashboard

React (JavaScript) + Vite frontend with GSAP motion, a FastAPI inference API, and SQLAlchemy prediction history. PostgreSQL is the production database; local development uses SQLite when `DATABASE_URL` is unset. MongoDB is not needed for the current data model. No Docker is required.

The Expo app keeps the Fieldwise visual style in a phone-sized layout. Mobile scan results and uploaded image bytes are stored in the configured SQL history; when Firebase Admin credentials are configured on FastAPI, mobile prediction metadata is also mirrored to Firestore `mobile_scan_tests`. See `mobile/README.md` for Firebase setup and field-test data notes.

## Live deployment

- **GitHub Pages:** https://shivamm070402.github.io/fieldwise-plant-health-dashboard/
- **Dashboard:** https://fieldwise-plant-health-dashboard.netlify.app
- **Railway API health:** https://fieldwise-plant-health-dashboard-production.up.railway.app/api/health
- GitHub Pages, Netlify, and Railway are connected to the `main` branch for automatic deploys. The GitHub Pages site serves the frontend; API requests go to Railway.

The public demo currently has no login or per-account isolation. Scan results and uploaded images are shared and publicly accessible; add authentication before using private or sensitive plant images.

## 1. Add the trained model

The supplied model ZIP has been unpacked to `backend/models/`. It contains the Keras weights, matching class names, and metadata. Keep all three files from the same training run:

```text
backend/models/plant_disease_model.keras
backend/models/class_names.json
backend/models/model_info.json
```

The current checkpoint evaluates at 96.36% top-1 accuracy on the downloaded dataset's 17,572-image `valid` split (224×224 RGB preprocessing). This is a curated-dataset result, not a guarantee for real field/mobile photos; collect and label representative phone images before using them for field-accuracy claims or retraining.

The API expects 224×224 RGB input with pixel values in the 0–255 range, matching this model metadata. This repository includes tracked model weights and backend code, so making the repository public also makes those files public. Do not place database credentials in the frontend.

## Download the Kaggle dataset

Download the Kaggle image dataset into `backend/datasets/new-plant-diseases-dataset/` with KaggleHub:

1. Sign in to Kaggle and create an API token if KaggleHub requests authentication. Keep it private; configure it as `KAGGLE_API_TOKEN` or save the token file at `%USERPROFILE%\.kaggle\kaggle.json`.
2. In PowerShell, install requirements and run the downloader:

   ```powershell
   cd "D:\Plant detection\backend"
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   .\.venv\Scripts\python.exe .\download_dataset.py
   ```

3. Start the backend and open the dashboard. In **Browse Kaggle test images**, click **Index Kaggle images**, choose the `test` or `valid` split, optionally filter by plant/disease, select a sample, and click **Analyze selected image**. The Kaggle `test` folder has unlabeled images, so it shows predictions without a ground-truth match check; labeled `valid` images show the prediction against the folder label. For a fair accuracy check, use a split that was excluded when the imported model was trained.

The `dataset_images` database table stores file paths, labels, split names, and file metadata; the large dataset images remain in the Git-ignored folder. Each scan is saved to the `predictions` table with its prediction, confidence, image, and (for labeled Kaggle samples) expected class and match result. The catalog uses the same configured SQLite/PostgreSQL database as scan history.

## 2. Run locally on Windows

The backend model uses `tensorflow-cpu==2.16.1`, which is not available for Python 3.14. Install 64-bit Python 3.11 first (for example, `winget install --id Python.Python.3.11 --exact`), then restart VS Code. The helper checks the Python 3.11 launcher and the standard per-user install path.

Start the API first. This helper creates/uses `backend/.venv`, installs requirements into that interpreter, and launches Uvicorn through it so global Python 3.14 cannot be selected by accident. It runs without the Uvicorn reload subprocess, which also avoids the Windows `SpawnProcess` path:

```powershell
cd "D:\Plant detection\backend"
.\run_backend.ps1
```

If `.venv` was created with the wrong Python version, remove only that generated environment folder (`Remove-Item -Recurse -Force .venv`) and rerun the helper after Python 3.11 is installed.

To run the backend commands manually instead (using the standard per-user Python 3.11 install path):

```powershell
cd "D:\Plant detection\backend"
$python311 = "$env:USERPROFILE\AppData\Local\Programs\Python\Python311\python.exe"
& $python311 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --port 8001
```

The API creates `backend/fieldwise.db` automatically for local development. It loads the model from `backend/models/` and exposes `/api/health`, `/api/predict`, `/api/history`, and `/api/weather`.

### Enable ChatGPT weather and remedy plans

AI care plans and worldwide weather matches are generated by the FastAPI backend through the OpenAI Responses API. The TensorFlow model remains responsible for image prediction. OpenAI receives the saved crop/disease labels and weather values; the plant image is not sent. The worldwide comparison uses one reference coordinate for each country and the current five-day forecast, so it is not a country-wide or seasonal climate rating.

1. In PowerShell, create the private backend settings file and open it:

   ```powershell
   cd "D:\Plant detection\backend"
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   notepad .env
   ```

2. Add your OpenAI API key to `OPENAI_API_KEY`. Keep `OPENAI_MODEL=gpt-6-astra` unless you want to configure another model available to your API project. The backend loads `backend/.env` on startup, and the file is ignored by Git. Never put the key in a `VITE_` frontend variable.
3. Install the new backend dependencies and run the server:

   ```powershell
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   .\run_backend.ps1
   ```

After a prediction and weather load, the dashboard asks `POST /api/care-plan` for a short-term crop-weather fit, disease-weather context, and cautious care steps. It also calls `POST /api/country-weather-suitability` to compare the predicted crop with five-day forecasts at reference coordinates across countries. If the API key is missing or the OpenAI service is unavailable, local extension guidance remains visible and worldwide AI matches are unavailable. For Railway, set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in the backend service variables; never set the secret as a `VITE_` frontend variable.

In a second PowerShell window:

```powershell
cd "D:\Plant detection\frontend"
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). Vite forwards `/api` requests to `http://127.0.0.1:8001` by default. Set `VITE_API_PROXY_TARGET` if your backend uses another local port.

## 3. Deploy the API to Railway (no Docker)

1. Push this project to a Git repository. Choose a private repository if you do not want the model artifact public.
2. In Railway, create a project and add a **PostgreSQL** database.
3. Add a service from the repository and set its **Root Directory** to `/backend`. Railway detects Python from `requirements.txt`; `.python-version` selects Python 3.11. The `Procfile` starts Uvicorn on Railway's `$PORT`.
4. In the API service variables, add `DATABASE_URL` as a reference to the PostgreSQL service's `DATABASE_URL` (Railway dashboard → Variables → Add Reference Variable). The API accepts Railway's `postgres://` and `postgresql://` URL schemes.
5. Make `plant_disease_model.keras` and `class_names.json` available in `backend/models/` in the deployed service. The current `.gitignore` keeps model weights out of normal Git commits; for a private repo, explicitly add the weights to Git, or arrange artifact retrieval separately. Set `MODEL_DIR` only if the files are in a different directory.
6. Set `CORS_ORIGINS` to the exact Netlify site origin after deploying the frontend, for example `https://your-site.netlify.app` (no trailing slash). For local testing, include `http://localhost:5173` as well, comma-separated.
7. Generate a public domain for the Railway API service. Check `https://<your-api-domain>/api/health`; it should report `model_ready: true` once the model files are present.

The API creates or migrates the prediction and dataset catalog tables at startup. `GET /api/history` returns the latest 20 scans by default (maximum 100). Railway does not receive the ignored local Kaggle folder automatically; add the dataset to a persistent Railway volume and set `DATASET_DIR` if you also want dataset browsing in the deployed API. Keep Kaggle credentials in Railway variables and out of the repository.

## 4. Deploy the frontend to Netlify

1. In Netlify, choose **Add new site → Import an existing project** and connect the same repository.
2. The root `netlify.toml` sets the base directory to `frontend`, runs `npm run build`, publishes `dist`, and configures a single-page-app fallback.
3. In Netlify site environment variables, set `VITE_API_BASE_URL` to the Railway API origin, for example `https://your-api-domain.up.railway.app` (no trailing slash). Vite embeds this value during the build, so trigger a fresh deploy after changing it.
4. Copy the Netlify site origin into Railway's `CORS_ORIGINS` variable and redeploy the API.
5. Open the Netlify URL, upload a leaf photo, run a scan, and confirm the result appears in Prediction history.

## 5. Deploy the frontend to GitHub Pages

The `.github/workflows/pages.yml` workflow builds `frontend/` and publishes it to GitHub Pages on pushes to `main`. It uses the project-site base path `/fieldwise-plant-health-dashboard/` and reads the backend URL from the `VITE_API_BASE_URL` repository variable.

1. Make the repository public or use a GitHub plan that supports Pages for private repositories.
2. In repository **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**.
3. Set the repository variable `VITE_API_BASE_URL` to the deployed API origin (for example, `https://fieldwise-api-<hash>-as.a.run.app`, without a trailing slash). Set the backend `CORS_ORIGINS` to `https://shivamm070402.github.io` (and any other frontend origins you use).
4. Push changes to `main` or run **Actions → Deploy frontend to GitHub Pages → Run workflow**. The published site is https://shivamm070402.github.io/fieldwise-plant-health-dashboard/.

## 6. Deploy both apps from GitHub (Pages + Cloud Run)

GitHub Pages can host the frontend, but it cannot run the FastAPI backend. The `.github/workflows/deploy-backend.yml` workflow deploys the API to Google Cloud Run whenever backend files change on `main`, or when manually started from the Actions tab. It expects these GitHub repository settings under **Settings → Secrets and variables → Actions**:

- Variables: `GCP_PROJECT_ID`, `GCP_REGION` (for example `asia-south1`), `CORS_ORIGINS` (`https://shivamm070402.github.io`), and `VITE_API_BASE_URL` (the Cloud Run API URL, set after the first backend deployment).
- Secrets: `GCP_SA_KEY` (the Google Cloud service-account JSON key) and `DATABASE_URL` (a PostgreSQL connection URL for persistent scan history and image data).

In Google Cloud, create/select a project, enable Cloud Run and Cloud Build APIs, create a service account with Cloud Run Admin, Cloud Build Editor, Artifact Registry Writer, Service Usage Consumer, and Service Account User permissions, then save its JSON key as `GCP_SA_KEY`. Create a PostgreSQL database separately and save its connection URL as `DATABASE_URL`; Cloud Run's local filesystem and SQLite are not persistent storage. Never commit either key or database URL.

The model weights are excluded by `.gitignore`, so the deployment workflow requires `backend/models/plant_disease_model.keras` and `backend/models/class_names.json` to be present in the GitHub checkout. Store the model in a private repository or use an artifact-storage mechanism; do not make a private model public just to deploy. After setting the variables/secrets and making sure the model is available, push the workflow and backend to `main`. When the first backend run succeeds, copy the service URL from its Actions log into `VITE_API_BASE_URL`, then run the Pages workflow again. Confirm the API at `<Cloud Run URL>/api/health`.

## 7. Main files and endpoints

- `frontend/src/App.jsx` — dashboard, image upload, weather, history, and GSAP animations.
- `backend/app/main.py` — model inference, weather, health, and history API.
- `backend/app/database.py` — PostgreSQL/SQLite connection, prediction history, and Kaggle image catalog tables.
- `backend/download_dataset.py` — KaggleHub dataset download helper.
- `netlify.toml` — Netlify frontend build and SPA routing.
- `GET /api/health` — model readiness.
- `POST /api/predict` — multipart upload using field `file` (JPG, PNG, or WebP; 10 MB maximum).
- `GET /api/dataset/status`, `POST /api/dataset/index`, and `GET /api/dataset/images?split=valid` — local Kaggle dataset catalog and image browser.
- `GET /api/dataset/images/{id}/file` and `POST /api/dataset/predict/{id}` — serve and classify a selected catalog image.
- `GET /api/history?limit=20` — latest persisted scan results.
- `GET /api/weather/countries`, `/api/weather/states?country=India`, and `/api/weather/cities?country=India&state=Karnataka` — cascading worldwide country, state/province, and city lists.
- `GET /api/weather?city=Bengaluru&admin1=Karnataka&country_code=IN` — current weather, five-day forecast, and general planning notes; also accepts latitude/longitude for an exact selected location.
- `POST /api/care-plan` — combines a saved model prediction with the selected city and up to eight compared city forecasts to return an AI-generated short-term weather fit and remedy plan.
- `POST /api/country-weather-suitability` with `{"prediction_id": 123}` — fetches one five-day weather forecast per country reference coordinate and asks AI to classify crop weather fit for each country.

Country, state/province, and city lists are supplied by CountriesNow; weather and coordinate forecasts are supplied by Open-Meteo. The dashboard loads each location list after you choose the level above it. Disease results are screening guidance, not a confirmed diagnosis; verify uncertain cases with a local agricultural expert.
