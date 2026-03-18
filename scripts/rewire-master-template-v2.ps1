$ErrorActionPreference = "Stop"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$path = "C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-v2.xlsx"
$tempPath = "C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-v3.xlsx"

function Release-ComObject($obj) {
  if ($null -ne $obj) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($obj)
  }
}

function Set-Formula($ws, $addr, $formula) {
  $ws.Range($addr).Formula = $formula
}

function Set-Value($ws, $addr, $value) {
  $ws.Range($addr).Value2 = $value
}

function KeyFormula($key) {
  $lookup = "INDEX('00 DATA'!`$B:`$B,MATCH(`"$key`",'00 DATA'!`$A:`$A,0))"
  return "=IFERROR(IF(LEN($lookup&`"`")=0,`"`",$lookup),`"`")"
}

$rows = @(
  @("gnb_number", "", "identity", "raw", "B6/A31", "B2(short)", "full number for acts, short derived for AOSR"),
  @("gnb_number_short", "", "identity", "raw", "-", "B2", "number without prefix"),
  @("title_line", "", "identity", "raw", "B3", "A4", "long object title"),
  @("object_name", "", "identity", "raw", "B4", "-", "acts-only visual field today"),
  @("address", "", "identity", "raw", "B5", "B5", "shared"),
  @("project_number", "", "identity", "raw", "B7", "A45", "project doc line in AOSR"),
  @("project_doc_line", "", "identity", "formatted", "-", "A45", "full AOSR project doc line"),
  @("executor", "", "identity", "raw", "B10", "-", "acts-only field"),
  @("start_date_day", "", "dates", "raw", "-", "C6", "AOSR component"),
  @("start_date_month", "", "dates", "raw", "-", "D6", "AOSR component"),
  @("start_date_year", "", "dates", "raw", "-", "E6", "AOSR component"),
  @("end_date_day", "", "dates", "raw", "-", "C7", "AOSR component"),
  @("end_date_month", "", "dates", "raw", "-", "D7", "AOSR component"),
  @("end_date_year", "", "dates", "raw", "-", "E7", "AOSR component"),
  @("act_date_day", "", "dates", "raw", "-", "C8", "AOSR component"),
  @("act_date_month", "", "dates", "raw", "-", "D8", "AOSR component"),
  @("act_date_year", "", "dates", "raw", "-", "E8", "AOSR component"),
  @("start_date_internal", "", "dates", "formatted", "B8", "-", "formatted acts string"),
  @("end_date_internal", "", "dates", "formatted", "B9", "-", "formatted acts string"),
  @("act_date_internal", "", "dates", "formatted", "B11", "-", "formatted acts string"),
  @("org_customer_display", "", "organizations", "formatted", "B14", "-", "department + short name"),
  @("org_customer_full_aosr", "", "organizations", "formatted", "-", "A7", "full requisites string"),
  @("org_contractor_display", "", "organizations", "formatted", "B15", "-", "acts display"),
  @("org_contractor_full_aosr", "", "organizations", "formatted", "-", "A10", "full requisites string"),
  @("org_designer_display", "", "organizations", "formatted", "B16", "-", "acts display"),
  @("org_designer_full_aosr", "", "organizations", "formatted", "-", "A13", "full requisites string"),
  @("sign1_desc", "", "signatories", "formatted", "B20", "-", "acts B-column"),
  @("sign1_line", "", "signatories", "formatted", "C20", "-", "acts C-column"),
  @("sign1_full_aosr", "", "signatories", "formatted", "-", "A24", "full AOSR line"),
  @("sign1_name", "", "signatories", "formatted", "-", "A73/A72", "short full name"),
  @("sign2_desc", "", "signatories", "formatted", "B21", "-", "acts B-column"),
  @("sign2_line", "", "signatories", "formatted", "C21", "-", "acts C-column"),
  @("sign2_full_aosr", "", "signatories", "formatted", "-", "A27/A30", "full AOSR line"),
  @("sign2_name", "", "signatories", "formatted", "-", "A76/A75/A80/A79", "short full name"),
  @("sign3_desc", "", "signatories", "formatted", "B22", "-", "acts B-column optional"),
  @("sign3_line", "", "signatories", "formatted", "C22", "-", "acts C-column optional"),
  @("sign3_full_aosr", "", "signatories", "formatted", "-", "A36", "full AOSR line"),
  @("sign3_org_name", "", "signatories", "formatted", "-", "A39", "sign3 organization"),
  @("sign3_name", "", "signatories", "formatted", "-", "A86/A85", "short full name"),
  @("tech_desc", "", "signatories", "formatted", "B23", "-", "acts B-column"),
  @("tech_line", "", "signatories", "formatted", "C23", "-", "acts C-column"),
  @("tech_full_aosr", "", "signatories", "formatted", "-", "A22", "full AOSR line"),
  @("tech_name", "", "signatories", "formatted", "-", "A70/A69", "short full name"),
  @("designer_name", "", "signatories", "formatted", "-", "A83/A82", "designer representative"),
  @("pipe_mark", "", "pipe", "raw", "B26", "A49(part)", "shared source"),
  @("pipe_diameter_display", "", "pipe", "formatted", "B27", "-", "acts display value"),
  @("profile_length", "", "gnb_params", "raw", "C31", "B3", "shared"),
  @("plan_length", "", "gnb_params", "raw", "B31", "-", "acts-only today"),
  @("pipe_count", "", "gnb_params", "raw", "D31", "C3", "shared"),
  @("total_pipe_length", "", "gnb_params", "formula", "E31", "B4", "derived"),
  @("drill_diameter", "", "gnb_params", "raw", "F31", "-", "acts-only today"),
  @("configuration", "", "gnb_params", "raw", "G31", "-", "legacy field, verify necessity"),
  @("materials_aosr", "", "materials", "formatted", "-", "A49", "combined materials/certs string"),
  @("subsequent_works", "", "materials", "formatted", "-", "A59", "default AOSR text"),
  @("aosr_page1_caption", "", "helpers", "formatted", "-", "C18", "page 1 title"),
  @("aosr_page2_caption", "", "helpers", "formatted", "-", "C18", "page 2 title"),
  @("aosr_object_caption", "", "helpers", "formatted", "-", "A39", "object/address caption"),
  @("aosr_work_description", "", "helpers", "formatted", "-", "A43", "works description"),
  @("drawing_caption", "", "helpers", "formatted", "-", "G52", "drawing caption")
)

$wb = $null
$wsData = $null
$wsActs = $null
$wsAosrData = $null
$wsAosr1 = $null
$wsAosr2 = $null

try {
  $wb = $excel.Workbooks.Open($path, 0, $false)
  $wsData = $wb.Worksheets.Item("00 DATA")
  $wsActs = $wb.Worksheets.Item("02 Acts - Data")
  $wsAosrData = $wb.Worksheets.Item("13 AOSR - Data")
  $wsAosr1 = $wb.Worksheets.Item("14 AOSR - Page 1")
  $wsAosr2 = $wb.Worksheets.Item("15 AOSR - Page 2")

  $headers = @("FieldKey", "Value", "Group", "RawOrFormatted", "ActsTarget", "AosrTarget", "Notes")
  $wsData.Cells.Clear()
  for ($i = 0; $i -lt $headers.Count; $i++) {
    $wsData.Cells.Item(1, $i + 1).Value2 = $headers[$i]
    $wsData.Cells.Item(1, $i + 1).Font.Bold = $true
  }

  for ($r = 0; $r -lt $rows.Count; $r++) {
    for ($c = 0; $c -lt $rows[$r].Count; $c++) {
      $wsData.Cells.Item($r + 2, $c + 1).Value2 = $rows[$r][$c]
    }
  }

  # Seed the data sheet with the sample values already living in the legacy acts data layer.
  $seedMap = @{
    "title_line" = [string]$wsActs.Range("B3").Value2
    "object_name" = [string]$wsActs.Range("B4").Value2
    "address" = [string]$wsActs.Range("B5").Value2
    "gnb_number" = [string]$wsActs.Range("B6").Value2
    "project_number" = [string]$wsActs.Range("B7").Value2
    "project_doc_line" = [string]$wsAosr1.Range("A45").Text
    "start_date_internal" = [string]$wsActs.Range("B8").Value2
    "end_date_internal" = [string]$wsActs.Range("B9").Value2
    "executor" = [string]$wsActs.Range("B10").Value2
    "act_date_internal" = [string]$wsActs.Range("B11").Value2
    "org_customer_display" = [string]$wsActs.Range("B14").Value2
    "org_contractor_display" = [string]$wsActs.Range("B15").Value2
    "org_designer_display" = [string]$wsActs.Range("B16").Value2
    "sign1_desc" = [string]$wsActs.Range("B20").Value2
    "sign1_line" = [string]$wsActs.Range("C20").Value2
    "sign2_desc" = [string]$wsActs.Range("B21").Value2
    "sign2_line" = [string]$wsActs.Range("C21").Value2
    "sign3_desc" = [string]$wsActs.Range("B22").Value2
    "sign3_line" = [string]$wsActs.Range("C22").Value2
    "tech_desc" = [string]$wsActs.Range("B23").Value2
    "tech_line" = [string]$wsActs.Range("C23").Value2
    "pipe_mark" = [string]$wsActs.Range("B26").Value2
    "pipe_diameter_display" = [string]$wsActs.Range("B27").Value2
    "plan_length" = [string]$wsActs.Range("B31").Value2
    "profile_length" = [string]$wsActs.Range("C31").Value2
    "pipe_count" = [string]$wsActs.Range("D31").Value2
    "total_pipe_length" = [string]$wsActs.Range("E31").Value2
    "drill_diameter" = [string]$wsActs.Range("F31").Value2
    "configuration" = [string]$wsActs.Range("G31").Value2
    "aosr_page1_caption" = [string]$wsAosr1.Range("C18").Text
    "aosr_page2_caption" = [string]$wsAosr2.Range("C18").Text
    "aosr_object_caption" = [string]$wsAosr1.Range("A39").Text
    "aosr_work_description" = [string]$wsAosr2.Range("A43").Text
    "drawing_caption" = [string]$wsAosr2.Range("G52").Text
  }

  # Seed AOSR compact values if present.
  $seedMap["gnb_number_short"] = [string]$wsAosrData.Range("B2").Value2
  $seedMap["start_date_day"] = [string]$wsAosrData.Range("C6").Value2
  $seedMap["start_date_month"] = [string]$wsAosrData.Range("D6").Value2
  $seedMap["start_date_year"] = [string]$wsAosrData.Range("E6").Value2
  $seedMap["end_date_day"] = [string]$wsAosrData.Range("C7").Value2
  $seedMap["end_date_month"] = [string]$wsAosrData.Range("D7").Value2
  $seedMap["end_date_year"] = [string]$wsAosrData.Range("E7").Value2
  $seedMap["act_date_day"] = [string]$wsAosrData.Range("C8").Value2
  $seedMap["act_date_month"] = [string]$wsAosrData.Range("D8").Value2
  $seedMap["act_date_year"] = [string]$wsAosrData.Range("E8").Value2

  for ($row = 2; $row -le ($rows.Count + 1); $row++) {
    $key = [string]$wsData.Cells.Item($row, 1).Value2
    if ($seedMap.ContainsKey($key) -and $seedMap[$key] -ne $null -and $seedMap[$key] -ne "") {
      $wsData.Cells.Item($row, 2).Value2 = $seedMap[$key]
    }
  }

  $wsData.Columns("A:G").AutoFit() | Out-Null

  # Acts compatibility layer.
  Set-Formula $wsActs "B3" (KeyFormula "title_line")
  Set-Formula $wsActs "B4" (KeyFormula "object_name")
  Set-Formula $wsActs "B5" (KeyFormula "address")
  Set-Formula $wsActs "B6" (KeyFormula "gnb_number")
  Set-Formula $wsActs "B7" (KeyFormula "project_number")
  Set-Formula $wsActs "B8" (KeyFormula "start_date_internal")
  Set-Formula $wsActs "B9" (KeyFormula "end_date_internal")
  Set-Formula $wsActs "B10" (KeyFormula "executor")
  Set-Formula $wsActs "B11" (KeyFormula "act_date_internal")
  Set-Formula $wsActs "B14" (KeyFormula "org_customer_display")
  Set-Formula $wsActs "B15" (KeyFormula "org_contractor_display")
  Set-Formula $wsActs "B16" (KeyFormula "org_designer_display")
  Set-Formula $wsActs "B20" (KeyFormula "sign1_desc")
  Set-Formula $wsActs "C20" (KeyFormula "sign1_line")
  Set-Formula $wsActs "B21" (KeyFormula "sign2_desc")
  Set-Formula $wsActs "C21" (KeyFormula "sign2_line")
  Set-Formula $wsActs "B22" (KeyFormula "sign3_desc")
  Set-Formula $wsActs "C22" (KeyFormula "sign3_line")
  Set-Formula $wsActs "B23" (KeyFormula "tech_desc")
  Set-Formula $wsActs "C23" (KeyFormula "tech_line")
  Set-Formula $wsActs "B26" (KeyFormula "pipe_mark")
  Set-Formula $wsActs "B27" (KeyFormula "pipe_diameter_display")
  Set-Formula $wsActs "A31" (KeyFormula "gnb_number")
  Set-Formula $wsActs "B31" (KeyFormula "plan_length")
  Set-Formula $wsActs "C31" (KeyFormula "profile_length")
  Set-Formula $wsActs "D31" (KeyFormula "pipe_count")
  Set-Formula $wsActs "E31" '=IFERROR(C31*D31,"")'
  Set-Formula $wsActs "F31" (KeyFormula "drill_diameter")
  Set-Formula $wsActs "G31" (KeyFormula "configuration")

  # AOSR compact data sheet.
  Set-Value $wsAosrData "A2" "переход №"
  Set-Value $wsAosrData "A3" "Lпр="
  Set-Value $wsAosrData "A4" "Длина труб="
  Set-Value $wsAosrData "A5" "Адрес"
  Set-Value $wsAosrData "A6" "Дата начала"
  Set-Value $wsAosrData "A7" "Дата окончания"
  Set-Value $wsAosrData "A8" "Дата акта"
  Set-Formula $wsAosrData "B2" (KeyFormula "gnb_number_short")
  Set-Formula $wsAosrData "B3" (KeyFormula "profile_length")
  Set-Formula $wsAosrData "C3" (KeyFormula "pipe_count")
  Set-Formula $wsAosrData "B4" '=IFERROR(B3*C3,"")'
  Set-Formula $wsAosrData "B5" (KeyFormula "address")
  Set-Formula $wsAosrData "C6" (KeyFormula "start_date_day")
  Set-Formula $wsAosrData "D6" (KeyFormula "start_date_month")
  Set-Formula $wsAosrData "E6" (KeyFormula "start_date_year")
  Set-Formula $wsAosrData "C7" (KeyFormula "end_date_day")
  Set-Formula $wsAosrData "D7" (KeyFormula "end_date_month")
  Set-Formula $wsAosrData "E7" (KeyFormula "end_date_year")
  Set-Formula $wsAosrData "C8" (KeyFormula "act_date_day")
  Set-Formula $wsAosrData "D8" (KeyFormula "act_date_month")
  Set-Formula $wsAosrData "E8" (KeyFormula "act_date_year")

  # AOSR page 1 direct data pulls.
  Set-Formula $wsAosr1 "A4" (KeyFormula "title_line")
  Set-Formula $wsAosr1 "A7" (KeyFormula "org_customer_full_aosr")
  Set-Formula $wsAosr1 "A10" (KeyFormula "org_contractor_full_aosr")
  Set-Formula $wsAosr1 "A13" (KeyFormula "org_designer_full_aosr")
  Set-Formula $wsAosr1 "A22" (KeyFormula "tech_full_aosr")
  Set-Formula $wsAosr1 "A24" (KeyFormula "sign1_full_aosr")
  Set-Formula $wsAosr1 "A27" (KeyFormula "sign2_full_aosr")
  Set-Formula $wsAosr1 "A30" (KeyFormula "sign2_full_aosr")
  Set-Formula $wsAosr1 "A36" (KeyFormula "sign3_full_aosr")
  Set-Formula $wsAosr1 "A39" (KeyFormula "aosr_object_caption")
  Set-Formula $wsAosr1 "A45" (KeyFormula "project_doc_line")
  Set-Formula $wsAosr1 "A70" (KeyFormula "tech_name")
  Set-Formula $wsAosr1 "A73" (KeyFormula "sign1_name")
  Set-Formula $wsAosr1 "A76" (KeyFormula "sign2_name")
  Set-Formula $wsAosr1 "A80" (KeyFormula "sign2_name")
  Set-Formula $wsAosr1 "A83" (KeyFormula "designer_name")
  Set-Formula $wsAosr1 "A86" (KeyFormula "sign3_name")
  Set-Formula $wsAosr1 "C18" (KeyFormula "aosr_page1_caption")
  Set-Formula $wsAosr1 "Y18" "='13 AOSR - Data'!C6"
  Set-Formula $wsAosr1 "AB18" "='13 AOSR - Data'!D6"
  Set-Formula $wsAosr1 "AG18" "='13 AOSR - Data'!E6"
  Set-Formula $wsAosr1 "A63" "='15 AOSR - Page 2'!A64"

  # AOSR page 2 internal links only.
  Set-Formula $wsAosr2 "A4" "='14 AOSR - Page 1'!A4"
  Set-Formula $wsAosr2 "A7" "='14 AOSR - Page 1'!A7"
  Set-Formula $wsAosr2 "A10" "='14 AOSR - Page 1'!A10"
  Set-Formula $wsAosr2 "A13" "='14 AOSR - Page 1'!A13"
  Set-Formula $wsAosr2 "A22" "='14 AOSR - Page 1'!A22"
  Set-Formula $wsAosr2 "A24" "='14 AOSR - Page 1'!A24"
  Set-Formula $wsAosr2 "A27" "='14 AOSR - Page 1'!A27"
  Set-Formula $wsAosr2 "A30" "='14 AOSR - Page 1'!A30"
  Set-Formula $wsAosr2 "A36" (KeyFormula "sign3_full_aosr")
  Set-Formula $wsAosr2 "A39" (KeyFormula "sign3_org_name")
  Set-Formula $wsAosr2 "C18" (KeyFormula "aosr_page2_caption")
  Set-Formula $wsAosr2 "Y18" "='13 AOSR - Data'!C8"
  Set-Formula $wsAosr2 "AB18" "='13 AOSR - Data'!D8"
  Set-Formula $wsAosr2 "AG18" "='13 AOSR - Data'!E8"
  Set-Formula $wsAosr2 "A43" (KeyFormula "aosr_work_description")
  Set-Formula $wsAosr2 "A46" "='14 AOSR - Page 1'!A45"
  Set-Formula $wsAosr2 "A49" (KeyFormula "materials_aosr")
  Set-Formula $wsAosr2 "A59" (KeyFormula "subsequent_works")
  Set-Formula $wsAosr2 "G52" (KeyFormula "drawing_caption")
  Set-Formula $wsAosr2 "M54" "='13 AOSR - Data'!C6"
  Set-Formula $wsAosr2 "P54" "='13 AOSR - Data'!D6"
  Set-Formula $wsAosr2 "U54" "='13 AOSR - Data'!E6"
  Set-Formula $wsAosr2 "M55" "='13 AOSR - Data'!C7"
  Set-Formula $wsAosr2 "P55" "='13 AOSR - Data'!D7"
  Set-Formula $wsAosr2 "U55" "='13 AOSR - Data'!E7"
  Set-Formula $wsAosr2 "A69" (KeyFormula "tech_name")
  Set-Formula $wsAosr2 "A72" (KeyFormula "sign1_name")
  Set-Formula $wsAosr2 "A75" (KeyFormula "sign2_name")
  Set-Formula $wsAosr2 "A79" (KeyFormula "sign2_name")
  Set-Formula $wsAosr2 "A82" (KeyFormula "designer_name")
  Set-Formula $wsAosr2 "A85" (KeyFormula "sign3_name")

  if (Test-Path $tempPath) {
    Remove-Item $tempPath -Force
  }
  $wb.SaveCopyAs($tempPath)
  Write-Output "Rewired master template v2"
}
finally {
  if ($wb) { $wb.Close($false) }
  Release-ComObject $wsAosr2
  Release-ComObject $wsAosr1
  Release-ComObject $wsAosrData
  Release-ComObject $wsActs
  Release-ComObject $wsData
  Release-ComObject $wb
  $excel.Quit()
  Release-ComObject $excel
}

[System.GC]::Collect()
[System.GC]::WaitForPendingFinalizers()
Start-Sleep -Milliseconds 1500
