$ErrorActionPreference = "Stop"

$Python = "D:\cap2\.venv-whisper\Scripts\python.exe"
$Worker = "D:\cap2\voice\worker\worker.py"

Write-Host "Using Python:"
& $Python -c "import platform, sys; print(platform.architecture()); print(sys.executable)"

Write-Host "Starting voice worker..."
& $Python $Worker
