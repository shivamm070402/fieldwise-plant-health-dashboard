# Fieldwise Mobile

Cross-platform Expo React Native client for Fieldwise plant screening. It supports Android phones (including Google Pixel), iOS, camera capture, photo-library selection, and the existing FastAPI `/api/predict` endpoint.

## 1. Configure the backend URL

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_BASE_URL` to the backend's reachable base URL, without a trailing slash. The phone and backend must be able to reach one another.

- For a physical phone on the same trusted Wi-Fi as a development PC, use the PC's LAN IPv4 address, for example `http://192.168.1.25:8001`. Replace the example address with the actual address from `ipconfig`, allow port 8001 through Windows Firewall, then set `$env:BACKEND_HOST = '0.0.0.0'` before running `backend/run_backend.ps1`. Only expose the local development server on a trusted network.
- For an Android emulator, the host machine is usually available at `http://10.0.2.2:8001`.
- For an iOS simulator, use `http://127.0.0.1:8001` when the backend runs on the same Mac.
- For a release build, use a publicly reachable HTTPS backend URL. Android cleartext HTTP is enabled only when the configured URL starts with `http://`; use HTTPS for any distributed build. Do not put API secrets in the mobile app; keep them on FastAPI.

Restart Expo after changing `.env` because `EXPO_PUBLIC_*` values are bundled into the app.

## 2. Save mobile field tests to Firebase

The app sends an Android/iOS platform header with each scan. FastAPI saves the image and result in its configured SQL history as before, then writes the prediction metadata to Firestore collection `mobile_scan_tests` when Firebase Admin is configured. The Firestore document contains the prediction, confidence, top matches, device platform, and server timestamp; the photo itself remains in the backend database.

Create a Firebase service account for the project and configure the backend environment (never put the service-account key in the mobile app):

```text
FIREBASE_PROJECT_ID=your-firebase-project-id
GOOGLE_APPLICATION_CREDENTIALS=D:\secure\firebase-service-account.json
```

Install the updated backend dependencies and restart FastAPI. For Railway, set both variables in the backend service settings and provide the service-account JSON through the platform's secret variables or a protected mounted file. The mobile result says whether the scan reached Firestore; if not, it is still in the backend's SQL history.

Mobile camera scans are collected as real-world *unlabeled* evaluation examples. They do not automatically retrain the model: have an agricultural expert verify/correct each label and split reviewed examples into train/validation/test data before retraining. Never evaluate on photos already used for training.

## 3. Run on a device

```powershell
cd mobile
npm install
npx expo install --fix
npx expo start
```

Install Expo Go on a test phone and scan the QR code. Camera capture requires a real device with camera permission; emulators may have a virtual camera.

## 4. Create an Android APK

Install dependencies, sign in to an Expo account, link the project, and set the preview backend URL in EAS:

```powershell
npm install
npx expo install --fix
npx eas-cli login
npx eas-cli init
npx eas-cli env:set --name EXPO_PUBLIC_API_BASE_URL --value https://your-backend.example.com --environment preview --visibility plaintext
npm run build:apk
```

EAS Build uploads the project to Expo's build service and returns an APK download link when the build completes. Google Play Store submissions should use an AAB production profile instead.

## 5. iOS

The same React Native project supports iOS. Use `npx expo run:ios` on macOS with Xcode for a local simulator/device build, or configure an iOS EAS build. An Android APK cannot be installed on iPhone; iOS requires its own signed app build.
