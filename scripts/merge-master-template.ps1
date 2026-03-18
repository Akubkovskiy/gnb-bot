$ErrorActionPreference = "Stop"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$templatesDir = "C:\Users\kubko\projects\gnb-bot\templates"
$actsFile = Get-ChildItem $templatesDir -Filter *.xlsx | Where-Object {
  $_.Length -eq 75605
} | Select-Object -First 1
$aosrFile = Get-ChildItem $templatesDir -Filter *.xlsx | Where-Object {
  $_.Length -eq 39984
} | Select-Object -First 1
$outPath = Join-Path $templatesDir "GNB-master-template.xlsx"

function Release-ComObject($obj) {
  if ($null -ne $obj) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($obj)
  }
}

$actsWb = $null
$aosrWb = $null
$masterWb = $null
$cover = $null

try {
  if (-not $actsFile) { throw "Acts template not found" }
  if (-not $aosrFile) { throw "AOSR template not found" }

  if (Test-Path $outPath) {
    Remove-Item $outPath -Force
  }

  $actsWb = $excel.Workbooks.Open($actsFile.FullName)
  $actsWb.SaveCopyAs($outPath)
  $actsWb.Close($false)
  Release-ComObject($actsWb)
  $actsWb = $null

  $masterWb = $excel.Workbooks.Open($outPath)
  $aosrWb = $excel.Workbooks.Open($aosrFile.FullName)

  $cover = $masterWb.Worksheets.Add($masterWb.Worksheets.Item(1))
  $cover.Name = "01 Overview"
  $cover.Range("A1:F1").Merge() | Out-Null
  $cover.Range("A1").Value2 = "GNB master template: internal acts + AOSR"
  $cover.Range("A1").Font.Bold = $true
  $cover.Range("A1").Font.Size = 16
  $cover.Range("A1").HorizontalAlignment = -4108

  $cover.Range("A3:F14").Merge() | Out-Null
  $cover.Range("A3").Value2 = @"
What is inside:
1. Sheets 02-12 = internal acts workbook.
2. Sheets 13-15 = AOSR workbook.
3. This file is a master template for unification and future move to one data layer.
4. It is not wired into runtime yet.

How to use:
- print selected sheets/pages as needed;
- keep this workbook as the analysis and redesign base.
"@
  $cover.Range("A3").WrapText = $true
  $cover.Range("A3").VerticalAlignment = -4160
  $cover.Range("A3").HorizontalAlignment = -4131
  $cover.Range("A3:F14").Borders.LineStyle = 1
  $cover.Range("A3:F14").Borders.Weight = 2
  $cover.Columns("A:F").ColumnWidth = 18
  $cover.Rows("3:14").RowHeight = 24

  $actsNames = @(
    "02 Acts - Data",
    "03 Acts - Breakdown",
    "04 Acts - Sealing",
    "05 Acts - AOSR",
    "06 Acts - Supervision",
    "07 Acts - Acceptance",
    "08 Acts - PP",
    "09 Acts - Inspection",
    "10 Acts - Alignment",
    "11 Acts - Pipe Welding",
    "12 Acts - Inventory"
  )

  for ($i = 0; $i -lt $actsNames.Count; $i++) {
    $masterWb.Worksheets.Item($i + 2).Name = $actsNames[$i]
  }

  for ($i = 1; $i -le 3; $i++) {
    $aosrWb.Worksheets.Item($i).Copy([Type]::Missing, $masterWb.Worksheets.Item($masterWb.Worksheets.Count))
  }

  $masterWb.Worksheets.Item(13).Name = "13 AOSR - Data"
  $masterWb.Worksheets.Item(14).Name = "14 AOSR - Page 1"
  $masterWb.Worksheets.Item(15).Name = "15 AOSR - Page 2"

  $masterWb.Save()
  Write-Output "CREATED: $outPath"
  foreach ($ws in $masterWb.Worksheets) {
    Write-Output $ws.Name
  }
}
finally {
  if ($aosrWb) { $aosrWb.Close($false) }
  if ($masterWb) { $masterWb.Close($true) }
  Release-ComObject($cover)
  Release-ComObject($aosrWb)
  Release-ComObject($masterWb)
  $excel.Quit()
  Release-ComObject($excel)
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
