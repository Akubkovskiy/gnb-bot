$ErrorActionPreference = "Stop"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$src = "C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template.xlsx"
$dst = "C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-v2.xlsx"

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

  $wb = $excel.Workbooks.Open($src)
  $sheetNames = @($wb.Worksheets | ForEach-Object { $_.Name })
  if ($sheetNames -notcontains "00 DATA") {
    $ws = $wb.Worksheets.Add($wb.Worksheets.Item(1))
    $ws.Name = "00 DATA"
    $ws.Cells.Item(1, 1).Value2 = "FieldKey"
    $ws.Cells.Item(1, 2).Value2 = "Group"
    $ws.Cells.Item(1, 3).Value2 = "RawOrFormatted"
    $ws.Cells.Item(1, 4).Value2 = "ActsTarget"
    $ws.Cells.Item(1, 5).Value2 = "AosrTarget"
    $ws.Cells.Item(1, 6).Value2 = "Notes"
  }

  $wb.SaveAs($dst, 51)
  Write-Output "SAVED: $dst"
  foreach ($sh in $wb.Worksheets) {
    Write-Output $sh.Name
  }
}
finally {
  if ($wb) { $wb.Close($true) }
  Release-ComObject($ws)
  Release-ComObject($wb)
  $excel.Quit()
  Release-ComObject($excel)
}
