"""Download the Kaggle plant disease image dataset into backend/datasets."""

from pathlib import Path

import kagglehub


DATASET_HANDLE = "vipoooool/new-plant-diseases-dataset"
OUTPUT_DIR = Path(__file__).resolve().parent / "datasets" / "new-plant-diseases-dataset"


def main() -> None:
    if OUTPUT_DIR.exists() and any(OUTPUT_DIR.iterdir()):
        print(f"Dataset folder already has files: {OUTPUT_DIR}")
        print("Keep the existing download, or move that folder before downloading again.")
        return

    OUTPUT_DIR.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {DATASET_HANDLE} to {OUTPUT_DIR} (this may take a while).")
    try:
        path = kagglehub.dataset_download(DATASET_HANDLE, output_dir=str(OUTPUT_DIR))
    except Exception as exc:
        print("KaggleHub could not download the dataset.")
        print("Sign in to Kaggle and configure KAGGLE_API_TOKEN or the Kaggle token file at %USERPROFILE%\\.kaggle\\kaggle.json.")
        print(f"KaggleHub error: {exc}")
        raise SystemExit(1) from exc
    print("Path to dataset files:", path)
    print("Next, start the backend and click 'Index Kaggle images' in the dashboard.")


if __name__ == "__main__":
    main()
