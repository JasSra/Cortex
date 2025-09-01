#!/usr/bin/env pwsh
# Test word count calculation

$sampleText = "X-ray crystallography reveals the atomic structure of crystals and molecules. This technique has been crucial for understanding protein structures, drug design, and developing new materials."

Write-Host "Sample text: $sampleText" -ForegroundColor Yellow
Write-Host "Length: $($sampleText.Length) characters" -ForegroundColor Cyan

# Count words the same way the frontend does
$wordCount = ($sampleText.Trim() -split '\s+').Length
Write-Host "Word count: $wordCount words" -ForegroundColor Green

Write-Host "`nExpected: Frontend should now show $wordCount words instead of 0" -ForegroundColor Magenta
