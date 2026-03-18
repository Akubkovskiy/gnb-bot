$ErrorActionPreference = "Stop"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$path = "C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-v2.xlsx"

function Release-ComObject($obj) {
  if ($null -ne $obj) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($obj)
  }
}

$wb = $null
$ws = $null

try {
  $wb = $excel.Workbooks.Open($path)
  $ws = $wb.Worksheets.Item("00 DATA")

  $headers = @("FieldKey", "Group", "RawOrFormatted", "ActsTarget", "AosrTarget", "Notes")
  for ($i = 0; $i -lt $headers.Count; $i++) {
    $ws.Cells.Item(1, $i + 1).Value2 = $headers[$i]
    $ws.Cells.Item(1, $i + 1).Font.Bold = $true
  }

  $rows = @(
    @("gnb_number", "identity", "raw", "B6/A31", "B2(short)", "full number for acts, short derived for AOSR"),
    @("gnb_number_short", "identity", "raw", "-", "B2", "number without prefix"),
    @("title_line", "identity", "raw", "B3", "A4", "long object title"),
    @("object_name", "identity", "raw", "B4", "-", "acts-only visual field today"),
    @("address", "identity", "raw", "B5", "B5", "shared"),
    @("project_number", "identity", "raw", "B7", "A45", "project doc line in AOSR"),
    @("executor", "identity", "raw", "B10", "-", "acts-only field"),
    @("start_date_day", "dates", "raw", "-", "C6", "AOSR component"),
    @("start_date_month", "dates", "raw", "-", "D6", "AOSR component"),
    @("start_date_year", "dates", "raw", "-", "E6", "AOSR component"),
    @("end_date_day", "dates", "raw", "-", "C7", "AOSR component"),
    @("end_date_month", "dates", "raw", "-", "D7", "AOSR component"),
    @("end_date_year", "dates", "raw", "-", "E7", "AOSR component"),
    @("act_date_day", "dates", "raw", "-", "C8", "AOSR component"),
    @("act_date_month", "dates", "raw", "-", "D8", "AOSR component"),
    @("act_date_year", "dates", "raw", "-", "E8", "AOSR component"),
    @("start_date_internal", "dates", "formatted", "B8", "-", "formatted acts string"),
    @("end_date_internal", "dates", "formatted", "B9", "-", "formatted acts string"),
    @("act_date_internal", "dates", "formatted", "B11", "-", "formatted acts string"),
    @("org_customer_display", "organizations", "formatted", "B14", "-", "department + short name"),
    @("org_customer_full_aosr", "organizations", "formatted", "-", "A7", "full requisites string"),
    @("org_contractor_display", "organizations", "formatted", "B15", "-", "acts display"),
    @("org_contractor_full_aosr", "organizations", "formatted", "-", "A10", "full requisites string"),
    @("org_designer_display", "organizations", "formatted", "B16", "-", "acts display"),
    @("org_designer_full_aosr", "organizations", "formatted", "-", "A13", "full requisites string"),
    @("sign1_desc", "signatories", "formatted", "B20", "-", "acts B-column"),
    @("sign1_line", "signatories", "formatted", "C20", "-", "acts C-column"),
    @("sign1_full_aosr", "signatories", "formatted", "-", "A24", "full AOSR line"),
    @("sign2_desc", "signatories", "formatted", "B21", "-", "acts B-column"),
    @("sign2_line", "signatories", "formatted", "C21", "-", "acts C-column"),
    @("sign2_full_aosr", "signatories", "formatted", "-", "A27/A30", "full AOSR line"),
    @("sign3_desc", "signatories", "formatted", "B22", "-", "acts B-column optional"),
    @("sign3_line", "signatories", "formatted", "C22", "-", "acts C-column optional"),
    @("sign3_full_aosr", "signatories", "formatted", "-", "A36", "full AOSR line"),
    @("tech_desc", "signatories", "formatted", "B23", "-", "acts B-column"),
    @("tech_line", "signatories", "formatted", "C23", "-", "acts C-column"),
    @("tech_full_aosr", "signatories", "formatted", "-", "A22", "full AOSR line"),
    @("pipe_mark", "pipe", "raw", "B26", "A49(part)", "shared source"),
    @("pipe_diameter_display", "pipe", "formatted", "B27", "-", "acts display value"),
    @("profile_length", "gnb_params", "raw", "C31", "B3", "shared"),
    @("plan_length", "gnb_params", "raw", "B31", "-", "acts-only today"),
    @("pipe_count", "gnb_params", "raw", "D31", "C3", "shared"),
    @("total_pipe_length", "gnb_params", "formula", "E31", "B4", "derived"),
    @("drill_diameter", "gnb_params", "raw", "F31", "-", "acts-only today"),
    @("configuration", "gnb_params", "raw", "G31", "-", "legacy field, verify necessity"),
    @("materials_aosr", "materials", "formatted", "-", "A49", "combined materials/certs string"),
    @("subsequent_works", "materials", "formatted", "-", "A59", "default AOSR text")
  )

  for ($r = 0; $r -lt $rows.Count; $r++) {
    for ($c = 0; $c -lt $rows[$r].Count; $c++) {
      $ws.Cells.Item($r + 2, $c + 1).Value2 = $rows[$r][$c]
    }
  }

  $ws.Columns("A:F").AutoFit() | Out-Null
  $wb.Save()
  Write-Output "DATA layout populated"
}
finally {
  if ($wb) { $wb.Close($true) }
  Release-ComObject($ws)
  Release-ComObject($wb)
  $excel.Quit()
  Release-ComObject($excel)
}
