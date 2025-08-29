#!/bin/bash

# Generate TypeScript API client from Swagger/OpenAPI spec
echo "Generating TypeScript API client..."

# Change to backend directory
cd "$(dirname "$0")/backend" || exit 1

# Build the project to ensure latest API is available
echo "Building backend project..."
dotnet build --configuration Release

# Generate the OpenAPI specification
echo "Generating OpenAPI specification..."
dotnet swagger tofile --output ../frontend/src/api/cortex-api.json bin/Release/net8.0/CortexApi.dll v1

# Generate TypeScript client using NSwag
echo "Generating TypeScript client..."
nswag run nswag.json

echo "TypeScript API client generated successfully!"
echo "Location: frontend/src/api/cortex-api-client.ts"
