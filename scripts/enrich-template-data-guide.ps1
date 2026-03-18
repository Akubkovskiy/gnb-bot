$path = "C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-human-final.xlsx"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$wb = $excel.Workbooks.Open($path)
$wsData = $wb.Worksheets.Item("00 DATA")
$wsOverview = $wb.Worksheets.Item("01 Overview")

# Extend DATA legend with human-readable guide columns.
$wsData.Range("E1").Value2 = "Meaning"
$wsData.Range("F1").Value2 = "PrintTargets"
$wsData.Range("A1:F1").Font.Bold = $true
$wsData.Range("A1:F1").Interior.Color = 14277081

$descriptions = @{
  "gnb_number" = @("Full printed GNB number", "Acts B6; Acts A31")
  "gnb_number_short" = @("Short GNB number for compact captions", "AOSR Data B2; helper captions")
  "title_line" = @("Main title / object line", "Acts data B3; AOSR page 1 A4")
  "object_name" = @("Acts-facing object name", "Acts data B4")
  "address" = @("Normalized printable address", "Acts data B5; AOSR data B5")
  "project_number" = @("Raw project code", "Acts data B7")
  "project_doc_line" = @("AOSR project-document line", "AOSR page 1 A45")
  "executor" = @("Executor / performer line", "Acts data B10")
  "org_customer_display" = @("Short customer line for acts", "Acts data B14")
  "org_customer_full_aosr" = @("Full customer line for AOSR", "AOSR page 1 A7")
  "org_contractor_display" = @("Short contractor line for acts", "Acts data B15")
  "org_contractor_full_aosr" = @("Full contractor line for AOSR", "AOSR page 1 A10")
  "org_designer_display" = @("Short designer/subcontractor line for acts", "Acts data B16")
  "org_designer_full_aosr" = @("Full designer/subcontractor line for AOSR", "AOSR page 1 A13")
  "sign1_desc" = @("Acts left cell: role/org description for sign1", "Acts data B20")
  "sign1_line" = @("Acts signature line for sign1", "Acts data C20")
  "sign1_full_aosr" = @("Full printable AOSR line for sign1", "AOSR page 1 A24")
  "sign1_name" = @("Short surname+initials for AOSR footer", "AOSR pages A73 / A72")
  "sign2_desc" = @("Acts left cell: role/org description for sign2", "Acts data B21")
  "sign2_line" = @("Acts signature line for sign2", "Acts data C21")
  "sign2_full_aosr" = @("Full printable AOSR line for sign2", "AOSR page 1 A27 / A30")
  "sign2_name" = @("Short surname+initials for AOSR footer", "AOSR pages A76 / A80")
  "sign3_desc" = @("Acts left cell: role/org description for sign3", "Acts data B22")
  "sign3_line" = @("Acts signature line for sign3", "Acts data C22")
  "sign3_full_aosr" = @("Full printable AOSR line for sign3", "AOSR page 1 A36; page 2 A36")
  "sign3_org_name" = @("Organization label near sign3 in AOSR", "AOSR page 2 A39")
  "sign3_name" = @("Short surname+initials for AOSR footer", "AOSR pages A86 / A85")
  "tech_desc" = @("Acts left cell: role/org description for tech supervisor", "Acts data B23")
  "tech_line" = @("Acts signature line for tech supervisor", "Acts data C23")
  "tech_full_aosr" = @("Full printable AOSR line for tech supervisor", "AOSR page 1 A22")
  "tech_name" = @("Short surname+initials for AOSR footer", "AOSR pages A70 / A69")
  "pipe_mark" = @("Pipe mark / passport text", "Acts data B26")
  "pipe_diameter_display" = @("Human-readable pipe diameter", "Acts data B27")
  "materials_aosr" = @("Materials line for AOSR", "AOSR page 2 A49")
  "plan_length" = @("Plan length", "Acts data B31")
  "profile_length" = @("Profile length", "Acts data C31; AOSR data B3")
  "pipe_count" = @("Pipe count", "Acts data D31; AOSR data C3")
  "total_pipe_length" = @("Derived total length", "Acts data E31; AOSR data B4")
  "drill_diameter" = @("Drill diameter", "Acts data F31")
  "configuration" = @("Configuration string", "Acts data G31")
  "subsequent_works" = @("Subsequent works line", "AOSR page 2 A59")
  "aosr_page1_caption" = @("Runtime-owned helper caption", "AOSR page 1 C18")
  "aosr_page2_caption" = @("Runtime-owned helper caption", "AOSR page 2 C18")
  "aosr_object_caption" = @("Runtime-owned helper object sentence", "AOSR page 1 A39")
  "aosr_work_description" = @("Runtime-owned helper long work description", "AOSR page 1 A43")
  "drawing_caption" = @("Runtime-owned helper drawing caption", "Downstream drawing cells")
}

foreach ($i in 2..120) {
  $key = $wsData.Range("A$i").Text
  if ($descriptions.ContainsKey($key)) {
    $wsData.Range("E$i").Value2 = $descriptions[$key][0]
    $wsData.Range("F$i").Value2 = $descriptions[$key][1]
  }
}

# Make guide columns readable.
$wsData.Columns("A").ColumnWidth = 28
$wsData.Columns("B").ColumnWidth = 48
$wsData.Columns("C").ColumnWidth = 18
$wsData.Columns("D").ColumnWidth = 16
$wsData.Columns("E").ColumnWidth = 44
$wsData.Columns("F").ColumnWidth = 32
$wsData.Range("E:F").WrapText = $true

# Add explicit explanation for signatory logic to the overview page.
$wsOverview.Range("A15").Value2 = "Signatory Logic"
$wsOverview.Range("A15").Font.Bold = $true
$wsOverview.Range("A16").Value2 = "signX_desc = acts left cell (role / organization description)"
$wsOverview.Range("A17").Value2 = "signX_line = acts signature line"
$wsOverview.Range("A18").Value2 = "signX_full_aosr = full printable AOSR line"
$wsOverview.Range("A19").Value2 = "signX_name = short surname + initials for AOSR footer"
$wsOverview.Range("A20").Value2 = "tech_* fields follow the same pattern as sign1-3"
$wsOverview.Range("A21").Value2 = "Long AOSR helper captions are runtime-owned and intentionally blank in template."
$wsOverview.Range("A15:A21").WrapText = $true

$wb.Save()
$wb.Close($true)
$excel.Quit()

[void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($wsOverview)
[void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($wsData)
[void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($wb)
[void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel)
