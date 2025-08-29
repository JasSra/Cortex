# Generate TypeScript API client from Swagger/OpenAPI spec
Write-Host "Generating TypeScript API client..." -ForegroundColor Green

# Change to backend directory
Set-Location -Path "$PSScriptRoot\backend"

# Build the project to ensure latest API is available
Write-Host "Building backend project..." -ForegroundColor Yellow
dotnet build --configuration Release

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

# Install NSwag CLI if not already installed
if (!(Get-Command "nswag" -ErrorAction SilentlyContinue)) {
    Write-Host "Installing NSwag CLI..." -ForegroundColor Yellow
    dotnet tool install -g NSwag.ConsoleCore
}

# Generate TypeScript client using NSwag
Write-Host "Generating TypeScript client..." -ForegroundColor Yellow
nswag run nswag.json

if ($LASTEXITCODE -eq 0) {
    Write-Host "TypeScript API client generated successfully!" -ForegroundColor Green
    Write-Host "Location: frontend/src/api/cortex-api-client.ts" -ForegroundColor Cyan
} else {
    Write-Host "Failed to generate TypeScript client!" -ForegroundColor Red
    exit 1
}
