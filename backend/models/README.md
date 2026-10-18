Keep these files together from one training run:

- `plant_disease_model.keras` — used by the FastAPI backend
- `class_names.json` — class order must match the model output
- `model_info.json` — input and class metadata

The backend expects 224×224 RGB images with pixel values from 0 to 255. The model weight file is excluded from normal Git commits by the repository `.gitignore`; follow the root README's private-repository/artifact deployment step to make it available on Railway.
