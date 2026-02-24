param(
    [int]$Port = 5500
)

$ErrorActionPreference = 'Stop'

$pythonLauncher = $null

if (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonLauncher = 'py'
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonLauncher = 'python'
}

if (-not $pythonLauncher) {
    Write-Error 'Python was not found. Install Python 3 and ensure "py" or "python" is on PATH.'
    exit 1
}

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

Write-Host "Serving $root at http://localhost:$Port"
Write-Host 'Press Ctrl+C to stop.'

if ($pythonLauncher -eq 'py') {
    & py -m http.server $Port
} else {
    & python -m http.server $Port
}