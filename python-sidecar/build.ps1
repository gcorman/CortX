<#
.SYNOPSIS
    Builds the CortX extractor sidecar into a self-contained executable via PyInstaller.

.DESCRIPTION
    Run this script from the python-sidecar/ directory (or from the project root).
    Output goes to python-sidecar/dist/cortx-extractor/ and is then copied to
    resources/python-sidecar/ for packaging by electron-builder.

.REQUIREMENTS
    - Python 3.10+ in PATH (or activate the venv before running this script)
    - pip install -r requirements.txt  (docling, sentence-transformers, pyinstaller)
    - ~5 GB free disk space (PyInstaller bundles the full Python runtime + ML models)

.EXAMPLE
    cd python-sidecar
    .\.venv\Scripts\Activate.ps1
    .\build.ps1
#>

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$OutputDir = Join-Path $ProjectRoot "resources\python-sidecar"

Write-Host "=== CortX Sidecar Builder ===" -ForegroundColor Cyan
Write-Host "Script dir : $ScriptDir"
Write-Host "Project root: $ProjectRoot"
Write-Host "Output dir : $OutputDir"
Write-Host ""

# 1. Run PyInstaller
Write-Host "[1/3] Running PyInstaller..." -ForegroundColor Yellow
Set-Location $ScriptDir

pyinstaller `
    --onedir `
    --name cortx-extractor `
    --distpath "$ScriptDir\dist" `
    --workpath "$ScriptDir\build" `
    --specpath "$ScriptDir" `
    --noconfirm `
    --clean `
    --collect-all docling `
    --collect-all docling_core `
    --collect-all docling_parse `
    --collect-all docling_ibm_models `
    --collect-all sentence_transformers `
    --collect-all transformers `
    --collect-all tokenizers `
    --collect-all huggingface_hub `
    --collect-all safetensors `
    --collect-all torch `
    --collect-all rapidocr `
    --collect-all onnxruntime `
    --collect-all omegaconf `
    --hidden-import docling.models.plugins `
    --hidden-import docling.backend `
    --hidden-import docling.pipeline `
    --hidden-import PIL `
    --hidden-import cv2 `
    --hidden-import easyocr `
    --hidden-import rtree `
    cortx_extractor.py

if ($LASTEXITCODE -ne 0) {
    Write-Error "PyInstaller failed with exit code $LASTEXITCODE"
    exit 1
}

Write-Host "[1/3] PyInstaller complete." -ForegroundColor Green

# 2. Pre-download the sentence-transformers model into the dist folder
#    so the first run doesn't need internet access.
Write-Host "[2/3] Pre-downloading embedding model..." -ForegroundColor Yellow
$ModelCacheDir = "$ScriptDir\dist\cortx-extractor\_internal\sentence_transformers_cache"
New-Item -ItemType Directory -Force -Path $ModelCacheDir | Out-Null

$DownloadScript = @"
import os
os.environ['SENTENCE_TRANSFORMERS_HOME'] = r'$ModelCacheDir'
from sentence_transformers import SentenceTransformer
print('Downloading intfloat/multilingual-e5-small...')
m = SentenceTransformer('intfloat/multilingual-e5-small')
print('Model downloaded to:', os.environ['SENTENCE_TRANSFORMERS_HOME'])
"@
python -c $DownloadScript

if ($LASTEXITCODE -ne 0) {
    Write-Warning "Model pre-download failed — users will need internet on first extraction."
} else {
    Write-Host "[2/3] Model pre-downloaded." -ForegroundColor Green
}

# 3. Copy dist to resources/python-sidecar/
Write-Host "[3/3] Copying to resources..." -ForegroundColor Yellow
if (Test-Path $OutputDir) {
    Remove-Item $OutputDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Copy-Item "$ScriptDir\dist\cortx-extractor\*" -Destination $OutputDir -Recurse

Write-Host "[3/3] Copied to $OutputDir" -ForegroundColor Green
Write-Host ""
Write-Host "=== Build complete! ===" -ForegroundColor Cyan
Write-Host "Executable: $OutputDir\cortx-extractor.exe"
Write-Host "Now run 'npm run build' or 'npm run dist' to package the Electron app."
