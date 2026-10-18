$ErrorActionPreference = 'Stop'

$destination = Join-Path $PSScriptRoot 'datasets\new-plant-diseases-dataset'
$tokenPath = Join-Path $env:USERPROFILE '.kaggle\kaggle.json'
$venvKaggle = Join-Path $PSScriptRoot '.venv\Scripts\kaggle.exe'

if (-not (Test-Path -LiteralPath $tokenPath)) {
    throw "Kaggle API credentials are missing. Create a Kaggle API token from your Kaggle account settings and save kaggle.json to $tokenPath. Keep the token private."
}

$kaggleCommand = Get-Command kaggle -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath $venvKaggle) {
    $kaggleExe = $venvKaggle
} elseif ($kaggleCommand) {
    $kaggleExe = $kaggleCommand.Source
} else {
    throw 'Kaggle CLI is not installed. Install it with: python -m pip install kaggle'
}

New-Item -ItemType Directory -Force -Path $destination | Out-Null
& $kaggleExe datasets download -d vipoooool/new-plant-diseases-dataset -p $destination --unzip
if ($LASTEXITCODE -ne 0) {
    throw 'Kaggle download failed. Confirm your token and accept the dataset access terms on Kaggle, then run this script again.'
}
Write-Host "Dataset downloaded to $destination"
