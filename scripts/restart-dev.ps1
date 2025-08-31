# Restart Dev Server Script
# This script builds the frontend and restarts the dev server cleanly

param(
    [string]$ProjectPath = "c:\Code\Cortex"
)

Write-Host "🔨 Building frontend..." -ForegroundColor Yellow

# Change to frontend directory
Push-Location "$ProjectPath\frontend"

try {
    # Build the frontend
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed!" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✅ Build successful!" -ForegroundColor Green
    
    # Find and kill existing dev server processes
    Write-Host "🔍 Looking for existing dev server processes..." -ForegroundColor Yellow
    
    # Find Node.js processes running Next.js dev server
    $devProcesses = Get-Process | Where-Object { 
        $_.ProcessName -eq "node" -and 
        $_.CommandLine -match "next.*dev" 
    } -ErrorAction SilentlyContinue
    
    if ($devProcesses) {
        Write-Host "🛑 Stopping existing dev server processes..." -ForegroundColor Yellow
        $devProcesses | ForEach-Object {
            Write-Host "  Stopping process $($_.Id) - $($_.ProcessName)" -ForegroundColor Gray
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
    }
    
    # Also try to find by port (more reliable)
    $portProcess = netstat -ano | findstr ":3000.*LISTENING"
    if ($portProcess) {
        $processId = ($portProcess -split '\s+')[-1]
        if ($processId -and $processId -match '^\d+$') {
            Write-Host "🛑 Stopping process using port 3000 (PID: $processId)..." -ForegroundColor Yellow
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        }
    }
    
    Write-Host "🚀 Starting new dev server..." -ForegroundColor Green
    
    # Start new dev server in background
    Start-Process powershell -ArgumentList "-NoProfile", "-Command", "cd '$ProjectPath\frontend'; npm run dev" -WindowStyle Hidden
    
    Write-Host "✅ Dev server restarted successfully!" -ForegroundColor Green
    Write-Host "📍 Frontend available at: http://localhost:3000" -ForegroundColor Cyan
    
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}
