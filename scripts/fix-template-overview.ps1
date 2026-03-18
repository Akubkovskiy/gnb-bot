$ErrorActionPreference = "Stop"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$src = "C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-ready.xlsx"
$dst = "C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-ready-v2.xlsx"

function Release-ComObject($obj) {
  if ($null -ne $obj) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($obj)
  }
}

$wb = $null
$ws = $null

try {
  if (Test-Path $dst) {
    Remove-Item $dst -Force
  }

  $wb = $excel.Workbooks.Open($src, 0, $false)
  $ws = $wb.Worksheets.Item("01 Overview")

  $ws.Range("A4").Value2 = "1. Fill only 00 DATA or generate it from runtime."
  $ws.Range("A5").Value2 = "2. Do not type directly into print sheets."
  $ws.Range("A6").Value2 = "3. Print sheets are prepared for A4 output."
  $ws.Range("A8").Value2 = "Sheet groups"
  $ws.Range("A8").Font.Bold = $true
  $ws.Range("A9").Value2 = "00 DATA, 02 Acts - Data, 13 AOSR - Data = service/data sheets"
  $ws.Range("A10").Value2 = "03-12 = internal acts print sheets"
  $ws.Range("A11").Value2 = "14-15 = AOSR print sheets"
  $ws.Range("A13").Value2 = "Source of truth: 00 DATA"
  $ws.Columns("A:F").AutoFit() | Out-Null

  $wb.SaveAs($dst, 51)
  Write-Output "OVERVIEW_FIXED: $dst"
}
finally {
  if ($wb) { $wb.Close($false) }
  Release-ComObject $ws
  Release-ComObject $wb
  $excel.Quit()
  Release-ComObject $excel
}
