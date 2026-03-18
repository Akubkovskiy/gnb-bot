$ErrorActionPreference = "Stop"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$src = "C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-final.xlsx"
$dst = "C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-ready.xlsx"

function Release-ComObject($obj) {
  if ($null -ne $obj) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($obj)
  }
}

function Set-PrintSetup($ws, $printArea, $orientation = 1) {
  $ps = $ws.PageSetup
  $ps.PrintArea = $printArea
  $ps.PaperSize = 9 # A4
  $ps.Orientation = $orientation # 1 portrait, 2 landscape
  $ps.Zoom = $false
  $ps.FitToPagesWide = 1
  $ps.FitToPagesTall = 1
  $ps.CenterHorizontally = $true
  $ps.CenterVertically = $false
}

$wb = $null

try {
  if (Test-Path $dst) {
    Remove-Item $dst -Force
  }

  $wb = $excel.Workbooks.Open($src, 0, $false)

  # Overview formatting
  $overview = $wb.Worksheets.Item("01 Overview")
  $overview.Tab.Color = 15773696
  $overview.Range("A1:F1").Merge() | Out-Null
  $overview.Range("A1").Value2 = "GNB Master Template"
  $overview.Range("A1").Font.Bold = $true
  $overview.Range("A1").Font.Size = 16
  $overview.Range("A3").Value2 = "How to use"
  $overview.Range("A3").Font.Bold = $true
  $overview.Range("A4").Value2 = "1. Fill only 00 DATA or generate it from runtime."
  $overview.Range("A5").Value2 = "2. Do not type directly into print sheets."
  $overview.Range("A6").Value2 = "3. Print sheets are already prepared for A4 output."
  $overview.Range("A8").Value2 = "Sheet groups"
  $overview.Range("A8").Font.Bold = $true
  $overview.Range("A9").Value2 = "00 DATA, 02 Acts - Data, 13 AOSR - Data = service/data sheets"
  $overview.Range("A10").Value2 = "03-12 = internal acts print sheets"
  $overview.Range("A11").Value2 = "14-15 = AOSR print sheets"
  $overview.Range("A13").Value2 = "Source of truth: 00 DATA"
  $overview.Columns("A:F").AutoFit() | Out-Null

  # Tab colors and service sheet visibility/readability
  foreach ($name in @("00 DATA","02 Acts - Data","13 AOSR - Data")) {
    $ws = $wb.Worksheets.Item($name)
    $ws.Tab.Color = 13431551
    $ws.PageSetup.PrintArea = ""
  }
  foreach ($name in @("03 Acts - Breakdown","04 Acts - Sealing","05 Acts - AOSR","06 Acts - Supervision","07 Acts - Acceptance","08 Acts - PP","09 Acts - Inspection","10 Acts - Alignment","11 Acts - Pipe Welding","12 Acts - Inventory")) {
    $wb.Worksheets.Item($name).Tab.Color = 13434879
  }
  foreach ($name in @("14 AOSR - Page 1","15 AOSR - Page 2")) {
    $wb.Worksheets.Item($name).Tab.Color = 10092543
  }

  # Acts print areas based on validated content bounds
  Set-PrintSetup ($wb.Worksheets.Item("03 Acts - Breakdown")) '$A$1:$J$33'
  Set-PrintSetup ($wb.Worksheets.Item("04 Acts - Sealing")) '$A$1:$I$37'
  Set-PrintSetup ($wb.Worksheets.Item("05 Acts - AOSR")) '$A$1:$H$34'
  Set-PrintSetup ($wb.Worksheets.Item("06 Acts - Supervision")) '$A$1:$H$39'
  Set-PrintSetup ($wb.Worksheets.Item("07 Acts - Acceptance")) '$A$1:$H$35'
  Set-PrintSetup ($wb.Worksheets.Item("08 Acts - PP")) '$A$1:$H$38'
  Set-PrintSetup ($wb.Worksheets.Item("09 Acts - Inspection")) '$A$1:$G$45'
  Set-PrintSetup ($wb.Worksheets.Item("10 Acts - Alignment")) '$A$1:$I$37'
  Set-PrintSetup ($wb.Worksheets.Item("11 Acts - Pipe Welding")) '$A$1:$H$39'
  Set-PrintSetup ($wb.Worksheets.Item("12 Acts - Inventory")) '$A$1:$K$24'

  # Keep AOSR page areas explicit and A4
  Set-PrintSetup ($wb.Worksheets.Item("14 AOSR - Page 1")) '$A$1:$AJ$87'
  Set-PrintSetup ($wb.Worksheets.Item("15 AOSR - Page 2")) '$A$1:$AJ$86'

  $wb.SaveAs($dst, 51)
  Write-Output "READY: $dst"
}
finally {
  if ($wb) { $wb.Close($false) }
  Release-ComObject $wb
  $excel.Quit()
  Release-ComObject $excel
}
