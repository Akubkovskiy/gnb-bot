$path = "C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-human-final.xlsx"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$wb = $excel.Workbooks.Open($path)

$guideName = "16 DATA Guide"
foreach ($ws in $wb.Worksheets) {
  if ($ws.Name -eq $guideName) {
    $ws.Delete()
    break
  }
}

$guide = $wb.Worksheets.Add()
$guide.Name = $guideName
$guide.Tab.Color = 10092543

$guide.Range("A1").Value2 = "Key"
$guide.Range("B1").Value2 = "Meaning"
$guide.Range("C1").Value2 = "Used In"
$guide.Range("D1").Value2 = "Notes"
$guide.Range("A1:D1").Font.Bold = $true
$guide.Range("A1:D1").Interior.Color = 14277081

$rows = @(
  @("title_line","Main object/title line","Acts B3; AOSR A4","Primary printable title"),
  @("object_name","Acts-facing object name","Acts B4","Human-readable acts object label"),
  @("address","Normalized printable address","Acts B5; AOSR data B5","Should be print-ready"),
  @("project_number","Raw project code","Acts B7","Project code only"),
  @("project_doc_line","AOSR project-document line","AOSR A45","May equal project number or richer runtime string"),
  @("executor","Executor / performer","Acts B10","Acts only"),
  @("org_customer_display","Short customer line","Acts B14","Acts display field"),
  @("org_customer_full_aosr","Full customer line","AOSR A7","AOSR requisites field"),
  @("org_contractor_display","Short contractor line","Acts B15","Acts display field"),
  @("org_contractor_full_aosr","Full contractor line","AOSR A10","AOSR requisites field"),
  @("org_designer_display","Short designer/subcontractor line","Acts B16","Acts display field"),
  @("org_designer_full_aosr","Full designer/subcontractor line","AOSR A13","AOSR requisites field"),
  @("sign1_desc","Signatory 1 description","Acts B20","Left cell in acts"),
  @("sign1_line","Signatory 1 signature line","Acts C20","Signature line in acts"),
  @("sign1_full_aosr","Signatory 1 full line","AOSR A24","Full printable AOSR line"),
  @("sign1_name","Signatory 1 short name","AOSR footer cells","Surname + initials"),
  @("sign2_desc","Signatory 2 description","Acts B21","Left cell in acts"),
  @("sign2_line","Signatory 2 signature line","Acts C21","Signature line in acts"),
  @("sign2_full_aosr","Signatory 2 full line","AOSR A27/A30","Full printable AOSR line"),
  @("sign2_name","Signatory 2 short name","AOSR footer cells","Surname + initials"),
  @("sign3_desc","Signatory 3 description","Acts B22","Optional acts field"),
  @("sign3_line","Signatory 3 signature line","Acts C22","Optional acts field"),
  @("sign3_full_aosr","Signatory 3 full line","AOSR A36","Full printable AOSR line"),
  @("sign3_org_name","Signatory 3 org label","AOSR A39","Separate org label near sign3"),
  @("sign3_name","Signatory 3 short name","AOSR footer cells","Surname + initials"),
  @("tech_desc","Tech supervisor description","Acts B23","Left cell in acts"),
  @("tech_line","Tech supervisor signature line","Acts C23","Signature line in acts"),
  @("tech_full_aosr","Tech supervisor full line","AOSR A22","Full printable AOSR line"),
  @("tech_name","Tech supervisor short name","AOSR footer cells","Surname + initials"),
  @("pipe_mark","Pipe mark / passport text","Acts B26","Main pipe field"),
  @("pipe_diameter_display","Pipe diameter display","Acts B27","Human-readable diameter"),
  @("materials_aosr","AOSR materials line","AOSR A49","Runtime may supply richer value"),
  @("profile_length","Profile length","Acts C31; AOSR B3","Numeric value"),
  @("plan_length","Plan length","Acts B31","Numeric value"),
  @("pipe_count","Pipe count","Acts D31; AOSR C3","Numeric value"),
  @("total_pipe_length","Derived total length","Acts E31; AOSR B4","Usually profile_length * pipe_count"),
  @("drill_diameter","Drill diameter","Acts F31","Numeric value"),
  @("configuration","Configuration text","Acts G31","May remain runtime-derived"),
  @("subsequent_works","Subsequent works line","AOSR A59","Default constant allowed"),
  @("aosr_page1_caption","AOSR page 1 caption","AOSR C18","Runtime-owned helper"),
  @("aosr_page2_caption","AOSR page 2 caption","AOSR C18","Runtime-owned helper"),
  @("aosr_object_caption","AOSR object caption","AOSR A39","Runtime-owned helper"),
  @("aosr_work_description","AOSR long work description","AOSR A43","Runtime-owned helper"),
  @("drawing_caption","Drawing caption","Downstream drawing cells","Runtime-owned helper")
)

$row = 2
foreach ($item in $rows) {
  $guide.Range("A$row").Value2 = $item[0]
  $guide.Range("B$row").Value2 = $item[1]
  $guide.Range("C$row").Value2 = $item[2]
  $guide.Range("D$row").Value2 = $item[3]
  $row++
}

$guide.Columns("A").ColumnWidth = 24
$guide.Columns("B").ColumnWidth = 34
$guide.Columns("C").ColumnWidth = 24
$guide.Columns("D").ColumnWidth = 24
$guide.Range("A:D").WrapText = $true
$guide.Range("A2:D$row").VerticalAlignment = -4160
$guide.Application.ActiveWindow.SplitRow = 1
$guide.Application.ActiveWindow.FreezePanes = $true

$wb.Save()
$wb.Close($true)
$excel.Quit()

[void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($guide)
[void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($wb)
[void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel)
