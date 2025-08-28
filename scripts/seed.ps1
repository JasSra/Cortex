# Seed script to ingest example files into Cortex (PowerShell)

Param(
    [string]$ApiUrl = "http://localhost:8080",
    [string]$ExamplesDir = "./examples"
)

Write-Host "🌱 Seeding Cortex with example files..." -ForegroundColor Green

# Check API
try {
    $health = Invoke-RestMethod -Method GET -Uri "$ApiUrl/health" -TimeoutSec 5
    Write-Host "✅ API is running at $ApiUrl" -ForegroundColor Green
}
catch {
    Write-Host "❌ API not available at $ApiUrl" -ForegroundColor Red
    Write-Host "Please start the backend first (Docker Compose or 'cd backend; dotnet run')" -ForegroundColor Yellow
    exit 1
}

if (!(Test-Path $ExamplesDir)) {
    Write-Host "❌ Examples directory not found: $ExamplesDir" -ForegroundColor Red
    exit 1
}

# Upload supported files
$supported = @(".md", ".txt")
$files = Get-ChildItem -Path $ExamplesDir -File | Where-Object { $_.Extension.ToLower() -in $supported }

if ($files.Count -eq 0) {
    Write-Host "⚠️  No .md or .txt files found in $ExamplesDir" -ForegroundColor Yellow
}

foreach ($file in $files) {
    Write-Host "📄 Uploading: $($file.Name)" -ForegroundColor Cyan
    try {
        $form = @{ files = Get-Item $file.FullName }
        $response = Invoke-WebRequest -Method Post -Uri "$ApiUrl/ingest/files" -Form $form -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            $json = $response.Content | ConvertFrom-Json
            foreach ($item in $json) {
                Write-Host ("   → Note ID: {0}, Chunks: {1}" -f $item.noteId, $item.countChunks)
            }
            Write-Host "✅ Uploaded: $($file.Name)" -ForegroundColor Green
        }
        else {
            Write-Host "❌ Failed: $($file.Name) (HTTP $($response.StatusCode))" -ForegroundColor Red
            Write-Host $response.Content
        }
    }
    catch {
        Write-Host "❌ Error uploading $($file.Name): $_" -ForegroundColor Red
    }
}

# Test search (POST /search)
Write-Host "🔍 Testing search for 'cortex'..." -ForegroundColor Yellow
try {
    $body = @{ q = 'cortex'; k = 5; mode = 'hybrid'; alpha = 0.6 } | ConvertTo-Json
    $search = Invoke-RestMethod -Method Post -Uri "$ApiUrl/search" -ContentType 'application/json' -Body $body
    if ($search -and $search.hits -and $search.hits.Count -gt 0) {
        Write-Host "✅ Search is working!" -ForegroundColor Green
        $search.hits | Select-Object -First 5 | ForEach-Object { Write-Host ("   → {0} (score {1:N3})" -f $_.title, $_.score) }
    }
    else {
        Write-Host "⚠️  Search returned no results" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "⚠️  Search request failed: $_" -ForegroundColor Yellow
}

Write-Host "🎉 Seeding complete!" -ForegroundColor Green
