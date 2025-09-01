#!/usr/bin/env pwsh
# Simple chunking test script

Write-Host "Testing chunking fixes..." -ForegroundColor Green

# Test 1: Normal content
Write-Host "`n1. Testing normal content..." -ForegroundColor Yellow
$content1 = @'
{
  "files": [
    {
      "fileName": "normal-test.txt",
      "fileType": "txt", 
      "content": "This is a normal sentence. This is another sentence with content."
    }
  ]
}
'@

$headers = @{
  'Content-Type' = 'application/json'
  'X-UserId' = 'default'
  'X-Roles' = 'Admin'
}

try {
  $result1 = Invoke-RestMethod -Uri "http://localhost:8081/api/Ingest/files" -Method POST -Body $content1 -Headers $headers
  Write-Host "✓ Normal content upload successful" -ForegroundColor Green
} catch {
  Write-Host "✗ Normal content upload failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Content with empty lines  
Write-Host "`n2. Testing content with empty lines..." -ForegroundColor Yellow
$content2 = @'
{
  "files": [
    {
      "fileName": "empty-lines-test.txt",
      "fileType": "txt", 
      "content": "First line with content\n\n\n\nSecond line after many empty lines\n\n\nThird line"
    }
  ]
}
'@

try {
  $result2 = Invoke-RestMethod -Uri "http://localhost:8081/api/Ingest/files" -Method POST -Body $content2 -Headers $headers
  Write-Host "✓ Empty lines content upload successful" -ForegroundColor Green
} catch {
  Write-Host "✗ Empty lines content upload failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Content without punctuation
Write-Host "`n3. Testing content without punctuation..." -ForegroundColor Yellow
$content3 = @'
{
  "files": [
    {
      "fileName": "no-punctuation-test.txt",
      "fileType": "txt", 
      "content": "This is content without proper punctuation marks just words and spaces"
    }
  ]
}
'@

try {
  $result3 = Invoke-RestMethod -Uri "http://localhost:8081/api/Ingest/files" -Method POST -Body $content3 -Headers $headers
  Write-Host "✓ No punctuation content upload successful" -ForegroundColor Green
} catch {
  Write-Host "✗ No punctuation content upload failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Check audit status
Write-Host "`n4. Checking audit status..." -ForegroundColor Yellow
try {
  $audit = curl.exe -s -H "X-UserId: default" -H "X-Roles: Admin" "http://localhost:8081/api/Admin/indexing/audit" | ConvertFrom-Json
  $summary = $audit.summary
  Write-Host "Notes: $($summary.notes), No Chunks: $($summary.noChunks), Complete: $($summary.complete)" -ForegroundColor Cyan
  
  if ($summary.noChunks -eq 0) {
    Write-Host "✓ All notes have chunks - chunking is working!" -ForegroundColor Green
  } else {
    Write-Host "✗ Some notes still have no chunks: $($summary.noChunks)" -ForegroundColor Red
  }
} catch {
  Write-Host "✗ Failed to check audit status: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nChunking test completed!" -ForegroundColor Green
