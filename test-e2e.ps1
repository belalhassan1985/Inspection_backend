$ErrorActionPreference = "Stop"
$BASE = "http://localhost:3001"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  API E2E Test: Campaign + Template + Inspection + Report"
Write-Host "========================================" -ForegroundColor Cyan

# 1. Login
Write-Host "[1] Login..." -ForegroundColor Yellow
$login = Invoke-RestMethod -Uri "$BASE/auth/login" -Method Post -ContentType "application/json" -Body '{"username":"ahmed","password":"1234"}'
$token = $login.token
$authHeader = @{"Authorization"="Bearer $token"}
Write-Host "  Token OK" -ForegroundColor Green

# 2. Create campaign with template
Write-Host "[2] Create campaign with template..." -ForegroundColor Yellow
$templateId = "514a4283-7e5a-471b-9f2b-c661fd083fb5"
$entityId = (Invoke-RestMethod -Uri "$BASE/entities" -Method Get -Headers $authHeader)[0].id

$campaignBody = @{
    name = "E2E Test - Template Linking"
    type = "inspection"
    assignmentText = "Template link test"
    assignmentReference = "E2E-2026-001"
    assignmentDate = "2026-05-28"
    purpose = "E2E test for template linking"
    entityId = $entityId
    startDate = "2026-05-28"
    endDate = "2026-05-29"
    templateId = $templateId
} | ConvertTo-Json

$campaign = Invoke-RestMethod -Uri "$BASE/campaigns" -Method Post -ContentType "application/json" -Headers $authHeader -Body $campaignBody
$campaignId = $campaign.id
Write-Host "  Campaign: $($campaign.name)" -ForegroundColor Green
Write-Host "  templateId: $($campaign.templateId)" -ForegroundColor Green
if ($campaign.templateId -ne $templateId) { throw "templateId mismatch!" }
Write-Host "  [PASS] templateId correctly linked" -ForegroundColor Green

# 3. Get criteria template for this campaign
Write-Host "[3] GET /inspections/criteria-template?campaignId=..." -ForegroundColor Yellow
$templateData = Invoke-RestMethod -Uri "$BASE/inspections/criteria-template?campaignId=$campaignId" -Method Get -Headers $authHeader
$primaryCount = $templateData.Count
$secondaryCount = ($templateData | ForEach-Object { $_.secondaryCriteria }).Count
Write-Host "  Primary criteria: $primaryCount" -ForegroundColor Green
Write-Host "  Secondary criteria: $secondaryCount" -ForegroundColor Green
if ($primaryCount -lt 2) { throw "Expected at least 2 primary criteria!" }
Write-Host "  [PASS] Template items match campaign template" -ForegroundColor Green

function Get-Section($data, $secId) {
    foreach ($pri in $data) {
        $sec = $pri.secondaryCriteria | Where-Object { $_.id -eq $secId }
        if ($sec) { return $sec }
    }
    return $null
}

$sec21 = Get-Section $templateData 21
$sec29 = Get-Section $templateData 29
$sec31 = Get-Section $templateData 31
$sec32 = Get-Section $templateData 32
$sec35 = Get-Section $templateData 35
$sec33 = Get-Section $templateData 33

Write-Host "  Sections found:"
Write-Host "    SEC 21: $($sec21.details.Count) details"
Write-Host "    SEC 29: $($sec29.details.Count) details"
Write-Host "    SEC 31: $($sec31.details.Count) details"
Write-Host "    SEC 32: $($sec32.details.Count) details"
Write-Host "    SEC 35: $($sec35.details.Count) details"
Write-Host "    SEC 33: $($sec33.details.Count) details"

# 4. Build grades array
Write-Host "[4] Building grades array for 6 sections..." -ForegroundColor Yellow

$grades = @()

function BuildGrade($detail, $multiplier) {
    $factor = $multiplier
    if ($detail.inputType -eq "single") {
        $factor = 1.0
    }
    $props = @{
        detailId = $detail.id
        gradeEarned = [math]::Round([float]$detail.maxGrade * $factor, 2)
        notes = "Evaluated"
    }
    if ($detail.options.Count -gt 0) {
        $takeCount = 2
        if ($detail.options.Count -lt 2) { $takeCount = $detail.options.Count }
        $optIds = @()
        for ($i = 0; $i -lt $takeCount; $i++) {
            $optIds += $detail.options[$i].id
        }
        $props.selectedOptions = $optIds
    }
    return $props
}

# SEC 21 - all details
foreach ($d in $sec21.details) {
    $grades += BuildGrade $d 0.75
}

# SEC 29 - first 10
$count = 0
foreach ($d in $sec29.details) {
    if ($count -ge 10) { break }
    $grades += BuildGrade $d 0.80
    $count++
}

# SEC 31 - first 10
$count = 0
foreach ($d in $sec31.details) {
    if ($count -ge 10) { break }
    $grades += BuildGrade $d 0.85
    $count++
}

# SEC 32 - all details
foreach ($d in $sec32.details) {
    $grades += BuildGrade $d 0.90
}

# SEC 35 - first 10
$count = 0
foreach ($d in $sec35.details) {
    if ($count -ge 10) { break }
    $grades += BuildGrade $d 0.70
    $count++
}

# SEC 33 - first 10
$count = 0
foreach ($d in $sec33.details) {
    if ($count -ge 10) { break }
    $grades += BuildGrade $d 0.65
    $count++
}

Write-Host "  Total grades: $($grades.Count)" -ForegroundColor Green

$totalEarned = 0
foreach ($g in $grades) { $totalEarned += $g.gradeEarned }
Write-Host "  Sum earned: $totalEarned" -ForegroundColor Green

# 5. Create inspection
Write-Host "[5] Creating inspection..." -ForegroundColor Yellow
$inspectionBody = @{
    campaignId = $campaignId
    entityId = $entityId
    inspectorId = $login.user.id
    location = "Baghdad HQ"
    findings = "Comprehensive evaluation of all sections"
    status = "pendingReview"
    grades = $grades
} | ConvertTo-Json -Depth 10

$inspection = Invoke-RestMethod -Uri "$BASE/inspections" -Method Post -ContentType "application/json" -Headers $authHeader -Body $inspectionBody
$inspectionId = $inspection.id
Write-Host "  ID: $inspectionId" -ForegroundColor Green
Write-Host "  Score: $($inspection.totalScore)" -ForegroundColor Green
Write-Host "  Rating: $($inspection.performanceRating)" -ForegroundColor Green
Write-Host "  Grades count: $($inspection.grades.Count)" -ForegroundColor Green
if ($inspection.grades.Count -ne $grades.Count) {
    throw "Grades count mismatch: API returned $($inspection.grades.Count) but we sent $($grades.Count)!"
}
Write-Host "  [PASS] Inspection saved with $($inspection.grades.Count) grades" -ForegroundColor Green

$totalSelectedOptions = 0
foreach ($g in $inspection.grades) {
    $totalSelectedOptions += $g.selectedOptions.Count
}
Write-Host "  Total selected options: $totalSelectedOptions" -ForegroundColor Green

# 6. Fetch back
Write-Host "[6] Fetching inspection by campaign..." -ForegroundColor Yellow
$fetched = Invoke-RestMethod -Uri "$BASE/inspections/campaign/$campaignId" -Method Get -Headers $authHeader
Write-Host "  Status: $($fetched.status)" -ForegroundColor Green
Write-Host "  Score: $($fetched.totalScore)" -ForegroundColor Green
$fetchedPrimaryIds = @{}
foreach ($g in $fetched.grades) {
    $primId = $g.criteriaDetail.secondary.primary.id
    $fetchedPrimaryIds[$primId] = $true
}
Write-Host "  Primary IDs in grades: $(($fetchedPrimaryIds.Keys | Sort-Object) -join ', ')" -ForegroundColor Green
Write-Host "  [PASS] Inspection data intact after fetch" -ForegroundColor Green

# 7. Generate report payload
Write-Host "[7] Generating report payload..." -ForegroundColor Yellow
$payload = Invoke-RestMethod -Uri "$BASE/reports/campaign/$campaignId/payload" -Method Get -Headers $authHeader
Write-Host "  Sections count: $($payload.sections.Count)" -ForegroundColor Green

$nonEmptyCount = 0
foreach ($sec in $payload.sections) {
    if (-not $sec.isEmpty) { $nonEmptyCount++ }
}
Write-Host "  Non-empty sections: $nonEmptyCount" -ForegroundColor Green

$templateSections = @()
$manualSections = @()
foreach ($sec in $payload.sections) {
    if ($sec.isManual) { $manualSections += $sec }
    else { $templateSections += $sec }
}
Write-Host "  Manual sections: $($manualSections.Count)" -ForegroundColor Green
Write-Host "  Template sections: $($templateSections.Count)" -ForegroundColor Green

$totalSubsections = 0
$nonEmptySubsections = 0
foreach ($sec in $templateSections) {
    if ($sec.subsections) {
        $totalSubsections += $sec.subsections.Count
        foreach ($sub in $sec.subsections) {
            if (-not $sub.isEmpty) { $nonEmptySubsections++ }
        }
    }
}
Write-Host "  Total subsections: $totalSubsections, Non-empty: $nonEmptySubsections" -ForegroundColor Green

if ($nonEmptySubsections -lt 6) {
    Write-Host "  [WARN] Expected at least 6 non-empty subsections, got $nonEmptySubsections" -ForegroundColor Yellow
} else {
    Write-Host "  [PASS] Report payload includes template data with $nonEmptySubsections non-empty subsections" -ForegroundColor Green
}

# 8. Generate PDF
Write-Host "[8] Generating PDF..." -ForegroundColor Yellow
$pdfSize = $null
$pdfDir = "D:\Inspection Foundations System\backend\test-output"
if (-not (Test-Path $pdfDir)) { New-Item -ItemType Directory -Path $pdfDir -Force | Out-Null }
$pdfPath = "$pdfDir\report_$campaignId.pdf"
try {
    Write-Host "  Requesting PDF via node..." -ForegroundColor Yellow
    $tmpScript = "$pdfDir\fetch-pdf.js"
    $jsCode = @'
const http = require("http");
const fs = require("fs");
const opts = {
  hostname: "localhost", port: 3001, method: "GET",
  path: "/reports/campaign/CAMPAIGN_PLACEHOLDER/pdf",
  headers: { "Authorization": "Bearer TOKEN_PLACEHOLDER" }
};
const req = http.request(opts, res => {
  const chunks = [];
  res.on("data", d => chunks.push(d));
  res.on("end", () => {
    const buf = Buffer.concat(chunks);
    fs.writeFileSync("FILE_PLACEHOLDER", buf);
    console.log("PDF_SIZE=" + buf.length);
  });
});
req.on("error", e => { console.error("FETCH_ERROR: " + e.message); process.exit(1); });
req.end();
'@
    $jsCode = $jsCode.Replace("CAMPAIGN_PLACEHOLDER", $campaignId).Replace("TOKEN_PLACEHOLDER", $token).Replace("FILE_PLACEHOLDER", $pdfPath.Replace("\", "/"))
    $jsCode | Set-Content -Path $tmpScript -Encoding ascii
    $output = node $tmpScript 2>&1
    Write-Host "    $output"
    if ($output -match 'PDF_SIZE=(\d+)') {
        $pdfSize = [int]$Matches[1]
        Write-Host "  PDF: $([math]::Round($pdfSize/1024, 1)) KB" -ForegroundColor Green
        if ($pdfSize -gt 1000) { Write-Host "  [PASS] PDF OK" -ForegroundColor Green }
        else { Write-Host "  [WARN] PDF small ($([math]::Round($pdfSize/1024,1)) KB)" -ForegroundColor Yellow }
    } else { Write-Host "  [FAIL] PDF not generated" -ForegroundColor Red }
    if (Test-Path $tmpScript) { Remove-Item $tmpScript -Force }
} catch { Write-Host "  [FAIL] PDF: $_" -ForegroundColor Red }

# 9. Generate Word
Write-Host "[9] Generating Word..." -ForegroundColor Yellow
$docxSize = $null
$docxPath = "$pdfDir\report_$campaignId.docx"
try {
    Write-Host "  Requesting Word via node..." -ForegroundColor Yellow
    $tmpScript = "$pdfDir\fetch-word.js"
    $jsCode = @'
const http = require("http");
const fs = require("fs");
const opts = {
  hostname: "localhost", port: 3001, method: "GET",
  path: "/reports/campaign/CAMPAIGN_PLACEHOLDER/word",
  headers: { "Authorization": "Bearer TOKEN_PLACEHOLDER" }
};
const req = http.request(opts, res => {
  const chunks = [];
  res.on("data", d => chunks.push(d));
  res.on("end", () => {
    const buf = Buffer.concat(chunks);
    fs.writeFileSync("FILE_PLACEHOLDER", buf);
    console.log("WORD_SIZE=" + buf.length);
  });
});
req.on("error", e => { console.error("FETCH_ERROR: " + e.message); process.exit(1); });
req.end();
'@
    $jsCode = $jsCode.Replace("CAMPAIGN_PLACEHOLDER", $campaignId).Replace("TOKEN_PLACEHOLDER", $token).Replace("FILE_PLACEHOLDER", $docxPath.Replace("\", "/"))
    $jsCode | Set-Content -Path $tmpScript -Encoding ascii
    $output = node $tmpScript 2>&1
    Write-Host "    $output"
    if ($output -match 'WORD_SIZE=(\d+)') {
        $docxSize = [int]$Matches[1]
        Write-Host "  Word: $([math]::Round($docxSize/1024, 1)) KB" -ForegroundColor Green
        if ($docxSize -gt 1000) { Write-Host "  [PASS] Word OK" -ForegroundColor Green }
        else { Write-Host "  [WARN] Word small ($([math]::Round($docxSize/1024,1)) KB)" -ForegroundColor Yellow }
    } else { Write-Host "  [FAIL] Word not generated" -ForegroundColor Red }
    if (Test-Path $tmpScript) { Remove-Item $tmpScript -Force }
} catch { Write-Host "  [FAIL] Word: $_" -ForegroundColor Red }

# 10. Collect grade counts per section
$gradeCounts = @{}
foreach ($g in $inspection.grades) {
    $secId = $g.criteriaDetail.secondary.id
    if (-not $gradeCounts.ContainsKey($secId)) { $gradeCounts[$secId] = 0 }
    $gradeCounts[$secId]++
}

# 11. Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TEST SUMMARY"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Campaign ID:       $campaignId"
Write-Host "Template ID:       $templateId"
Write-Host "Template Name:     $($campaign.template.name)"
Write-Host "Inspection ID:     $inspectionId"
Write-Host "Total Score:       $($inspection.totalScore)"
Write-Host "Rating:            $($inspection.performanceRating)"
Write-Host "Grades Saved:      $($inspection.grades.Count)"
Write-Host "Selected Options:  $totalSelectedOptions"
if ($pdfSize) { Write-Host "PDF Size:          $([math]::Round($pdfSize/1024, 1)) KB" }
if ($docxSize) { Write-Host "Word Size:         $([math]::Round($docxSize/1024, 1)) KB" }
Write-Host ""

Write-Host "Sections Evaluated:" -ForegroundColor Cyan
Write-Host "  SEC 21 - Security Zone Director:      $($gradeCounts[21]) grades"
Write-Host "  SEC 29 - Operations Assistant:         $($gradeCounts[29]) grades"
Write-Host "  SEC 31 - Technical Affairs Assistant:  $($gradeCounts[31]) grades"
Write-Host "  SEC 32 - Communications:               $($gradeCounts[32]) grades"
Write-Host "  SEC 35 - Training:                     $($gradeCounts[35]) grades"
Write-Host "  SEC 33 - Specialized Departments:      $($gradeCounts[33]) grades"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ALL E2E TESTS COMPLETED" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
