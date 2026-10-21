$ErrorActionPreference = 'Stop'

$backendDir = $PSScriptRoot
$venvPython = Join-Path $backendDir '.venv\Scripts\python.exe'
$requirements = Join-Path $backendDir 'requirements.txt'
$python311 = $null

$createdVenv = $false
if (-not (Test-Path -LiteralPath $venvPython)) {
    $launcherPython = $null
    try {
        $launcherPython = & py -3.11 -c 'import sys; print(sys.executable)' 2>$null
    } catch {
        $launcherPython = $null
    }
    if ($LASTEXITCODE -eq 0 -and $launcherPython) {
        $python311 = $launcherPython.Trim()
    } else {
        $localInstall = Join-Path $env:USERPROFILE 'AppData\Local\Programs\Python\Python311\python.exe'
        if (Test-Path -LiteralPath $localInstall) { $python311 = $localInstall }
    }
    if (-not $python311 -or -not (Test-Path -LiteralPath $python311)) {
        throw 'Python 3.11 is not installed. Install 64-bit Python 3.11, restart VS Code, then run this script again.'
    }
    & $python311 -m venv (Join-Path $backendDir '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python 3.11 virtual environment.' }
    $createdVenv = $true
}

$venvVersionOutput = & $venvPython -c 'import sys; print(sys.version_info[0], sys.version_info[1], sep=chr(46))'
$venvVersionExitCode = $LASTEXITCODE
$venvVersion = ($venvVersionOutput | Out-String).Trim()
if ($venvVersionExitCode -ne 0 -or $venvVersion -ne '3.11') {
    throw 'The existing backend .venv is not a working Python 3.11 environment. Remove backend\.venv, then run this script again.'
}

if ($createdVenv) {
    & $venvPython -m pip install -r $requirements
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check your network and rerun this script.' }
} else {
    & $venvPython -c 'import importlib.util, sys; sys.exit(0 if importlib.util.find_spec("openai") and importlib.util.find_spec("dotenv") else 1)' 2>$null
    if ($LASTEXITCODE -ne 0) {
        & $venvPython -m pip install -r $requirements
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check your network and rerun this script.' }
    }
}

Set-Location $backendDir
if (-not $env:TF_NUM_INTRAOP_THREADS) { $env:TF_NUM_INTRAOP_THREADS = '2' }
if (-not $env:TF_NUM_INTEROP_THREADS) { $env:TF_NUM_INTEROP_THREADS = '2' }
Write-Host "Starting Fieldwise API with Python $venvVersion from $venvPython"
$backendHost = if ($env:BACKEND_HOST) { $env:BACKEND_HOST } else { '127.0.0.1' }
$backendPort = if ($env:BACKEND_PORT) { $env:BACKEND_PORT } else { '8001' }
& $venvPython -m uvicorn app.main:app --host $backendHost --port $backendPort
