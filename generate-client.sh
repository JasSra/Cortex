#!/bin/bash

# Generate TypeScript API client from Swagger/OpenAPI spec
echo "Generating TypeScript API client..."

# Change to backend directory
cd "$(dirname "$0")/backend" || exit 1

# Ensure dotnet tools are on PATH for this session
export PATH="$PATH:$HOME/.dotnet/tools"

# Build the project to ensure latest API is available
echo "Building backend project..."
dotnet build --configuration Release

# Generate the OpenAPI specification
echo "Generating OpenAPI specification..."
# Ensure API output directory exists
mkdir -p ../frontend/src/api
if ! dotnet swagger tofile --output ../frontend/src/api/cortex-api.json bin/Release/net8.0/CortexApi.dll v1; then
	echo "dotnet swagger not found via dotnet tool, trying 'swagger' directly..."
	if ! command -v swagger >/dev/null 2>&1; then
		echo "'swagger' CLI not found, falling back to running the backend and fetching /swagger/v1/swagger.json..."
		export ASPNETCORE_ENVIRONMENT=Development
		export ASPNETCORE_URLS=${ASPNETCORE_URLS:-http://localhost:8081}
		dotnet run --no-build &
		API_PID=$!
		echo "Started backend (PID: $API_PID) at $ASPNETCORE_URLS"
		# Wait for the server to be up
		for i in {1..60}; do
			if curl -sf "$ASPNETCORE_URLS/swagger/v1/swagger.json" >/dev/null; then
				break
			fi
			sleep 0.5
		done
		if ! curl -sf "$ASPNETCORE_URLS/swagger/v1/swagger.json" -o ../frontend/src/api/cortex-api.json; then
			echo "ERROR: Failed to fetch swagger JSON from $ASPNETCORE_URLS"
			kill $API_PID 2>/dev/null || true
			exit 1
		fi
		# Stop the backend
		kill $API_PID 2>/dev/null || true
	else
		# Try using the swagger CLI directly
		if ! swagger tofile --output ../frontend/src/api/cortex-api.json bin/Release/net8.0/CortexApi.dll v1; then
			echo "'swagger' CLI failed. Falling back to running backend to fetch swagger JSON..."
			export ASPNETCORE_ENVIRONMENT=Development
			export ASPNETCORE_URLS=${ASPNETCORE_URLS:-http://localhost:8081}
			dotnet run --no-build &
			API_PID=$!
			echo "Started backend (PID: $API_PID) at $ASPNETCORE_URLS"
			for i in {1..60}; do
				if curl -sf "$ASPNETCORE_URLS/swagger/v1/swagger.json" >/dev/null; then
					break
				fi
				sleep 0.5
			done
			if ! curl -sf "$ASPNETCORE_URLS/swagger/v1/swagger.json" -o ../frontend/src/api/cortex-api.json; then
				echo "ERROR: Failed to fetch swagger JSON from $ASPNETCORE_URLS"
				kill $API_PID 2>/dev/null || true
				exit 1
			fi
			kill $API_PID 2>/dev/null || true
		fi
	fi
fi

# Generate TypeScript client using NSwag
echo "Generating TypeScript client..."
# Ensure API output directory exists
mkdir -p ../frontend/src/api
nswag openapi2tsclient \
	/input:../frontend/src/api/cortex-api.json \
	/output:../frontend/src/api/cortex-api-client.ts \
	/template:Fetch \
	/className:CortexApiClient

echo "TypeScript API client generated successfully!"
echo "Location: frontend/src/api/cortex-api-client.ts"
