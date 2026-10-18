The Kaggle image files belong here and stay on disk; only their split/class/path metadata and each scan result are written to the configured SQLite or PostgreSQL database. Large image files are ignored by Git.

From the `backend` folder, install the KaggleHub dependency and download the dataset:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe download_dataset.py
```

Kaggle may require your account token in `KAGGLE_API_TOKEN` or `%USERPROFILE%\.kaggle\kaggle.json`. The download is placed in `new-plant-diseases-dataset/`. Start the API, click **Index Kaggle images**, select the `test` or `valid` split, choose an image, and click **Analyze selected image**.
