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

# Ensure API output directory exists
New-Item -ItemType Directory -Force -Path "../frontend/src/api" | Out-Null

# Try to use dotnet-swagger tool to extract OpenAPI JSON
Write-Host "Generating OpenAPI specification..." -ForegroundColor Yellow

# Check if swagger tool is installed
if (!(Get-Command "dotnet-swagger" -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Swashbuckle CLI..." -ForegroundColor Yellow
    dotnet tool install -g Swashbuckle.AspNetCore.Cli
}

# Generate OpenAPI JSON using Swashbuckle
$swaggerOutput = dotnet swagger tofile --output "../frontend/src/api/cortex-api.json" bin/Release/net8.0/CortexApi.dll v1

if ($LASTEXITCODE -eq 0) {
    Write-Host "OpenAPI specification generated successfully!" -ForegroundColor Green
} else {
    Write-Host "Failed to generate OpenAPI specification using dotnet-swagger. Falling back to running server..." -ForegroundColor Yellow
    
    # Start the backend to fetch swagger JSON
    $env:ASPNETCORE_ENVIRONMENT = "Development"
    $env:ASPNETCORE_URLS = "http://localhost:8085"
    
    $backendProcess = Start-Process -FilePath "dotnet" -ArgumentList "run --no-build --configuration Release --no-launch-profile" -NoNewWindow -PassThru
    
    # Wait for server to start
    Start-Sleep -Seconds 5
    
    # Fetch the swagger JSON
    try {
        Invoke-RestMethod -Uri "http://localhost:8085/swagger/v1/swagger.json" -OutFile "../frontend/src/api/cortex-api.json"
        Write-Host "OpenAPI specification fetched from running server!" -ForegroundColor Green
    } catch {
        Write-Host "Failed to fetch OpenAPI specification from server!" -ForegroundColor Red
        Stop-Process -Id $backendProcess.Id -Force
        exit 1
    }
    
    # Stop the backend
    Stop-Process -Id $backendProcess.Id -Force
}

# Generate TypeScript client using NSwag
Write-Host "Generating TypeScript client..." -ForegroundColor Yellow
nswag openapi2tsclient /input:"../frontend/src/api/cortex-api.json" /output:"../frontend/src/api/cortex-api-client.ts" /template:Fetch /className:CortexApiClient

if ($LASTEXITCODE -eq 0) {
    Write-Host "TypeScript API client generated successfully!" -ForegroundColor Green
    Write-Host "Location: frontend/src/api/cortex-api-client.ts" -ForegroundColor Cyan
} else {
    Write-Host "Failed to generate TypeScript client!" -ForegroundColor Red
    exit 1
}
