$src = "C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-human-final.xlsx"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$wb = $excel.Workbooks.Open($src)
$ws = $wb.Worksheets.Item("00 DATA")

# Runtime owns these long helper captions.
# Keep workbook slots blank instead of storing fragile Russian formulas.
$ws.Range("B56:B60").ClearContents()

$wb.Save()
$wb.Close($true)
$excel.Quit()

[void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($ws)
[void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($wb)
[void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel)
