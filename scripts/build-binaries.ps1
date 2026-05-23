# build-binaries.ps1 — cross-compile the schemalock binary on Windows hosts.
# Equivalent to build-binaries.sh for Windows contributors.
#
# Usage: .\scripts\build-binaries.ps1 [-Force]
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$VscodeDir = Resolve-Path "$ScriptDir\.."
$AppDir    = Resolve-Path "$VscodeDir\..\app"
$BinDir    = Join-Path $VscodeDir "bin"

$LdFlags = "-s -w"

function Build-Platform {
    param(
        [string]$GoOS,
        [string]$GoArch,
        [string]$DirName,
        [string]$BinaryName = "schemalock"
    )

    $outDir  = Join-Path $BinDir $DirName
    $outFile = Join-Path $outDir $BinaryName

    if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

    if (-not $Force -and (Test-Path $outFile)) {
        $binTime = (Get-Item $outFile).LastWriteTime
        $newer = Get-ChildItem "$AppDir\*.go" -Recurse | Where-Object { $_.LastWriteTime -gt $binTime }
        if (-not $newer) {
            Write-Host "  skipping  $DirName\$BinaryName (up to date)"
            return
        }
        Write-Host "  rebuilding $DirName\$BinaryName (source changed)"
    } else {
        Write-Host "  building  $DirName\$BinaryName  (GOOS=$GoOS GOARCH=$GoArch)"
    }

    $env:GOOS   = $GoOS
    $env:GOARCH = $GoArch
    Push-Location $AppDir
    try {
        go build -ldflags $LdFlags -o $outFile .\cmd\schemalock
    } finally {
        Pop-Location
        Remove-Item Env:\GOOS   -ErrorAction SilentlyContinue
        Remove-Item Env:\GOARCH -ErrorAction SilentlyContinue
    }
}

Write-Host "Building schemalock binaries from $AppDir -> $BinDir"

Build-Platform linux  amd64  linux-x64    schemalock
Build-Platform linux  arm64  linux-arm64  schemalock
Build-Platform darwin amd64  darwin-x64   schemalock
Build-Platform darwin arm64  darwin-arm64 schemalock
Build-Platform windows amd64 win32-x64   schemalock.exe

Write-Host "Done."
