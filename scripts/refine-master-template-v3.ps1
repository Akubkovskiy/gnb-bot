$ErrorActionPreference = "Stop"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$src = "C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-v3.xlsx"
$dst = "C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-v5.xlsx"

function Release-ComObject($obj) {
  if ($null -ne $obj) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($obj)
  }
}

function Set-Formula($ws, $addr, $formula) {
  $ws.Range($addr).Formula = $formula
}

$wb = $null
$ws = $null

try {
  if (Test-Path $dst) {
    Remove-Item $dst -Force
  }

  $wb = $excel.Workbooks.Open($src, 0, $false)
  $ws = $wb.Worksheets.Item("00 DATA")

  # Derived values in the Value column.
  $fB3 = @'
=IF(LEN(B2)=0,"",TRIM(MID(B2,FIND("№",B2)+1,99)))
'@
  $fB8 = @'
=IF(LEN(B7)=0,"",B7)
'@
  $fB23 = @'
=IF(LEN(B22)>0,B22,"")
'@
  $fB25 = @'
=IF(LEN(B24)>0,B24,"")
'@
  $fB27 = @'
=IF(LEN(B26)>0,B26,"")
'@
  $fB30 = @'
=IF(LEN(B29)>0,SUBSTITUTE(B29,"_",""),"")
'@
  $fB34 = @'
=IF(LEN(B33)>0,SUBSTITUTE(B33,"_",""),"")
'@
  $fB38 = @'
=IF(LEN(B37)>0,SUBSTITUTE(B37,"_",""),"")
'@
  $fB43 = @'
=IF(LEN(B42)>0,SUBSTITUTE(B42,"_",""),IF(LEN(B41)>0,B41,""))
'@
  $fB51 = @'
=IF(AND(LEN(B48)>0,LEN(B50)>0),B48*B50,"")
'@
  $fB55 = @'
="Прокладке кабельных линий"
'@
  $fB56 = @'
=IF(LEN(B3)=0,"","1 (ЗП ГНБ №"&B3&")")
'@
  $fB57 = @'
=IF(LEN(B3)=0,"","2 (ЗП ГНБ №"&B3&")")
'@
  $fB58 = @'
=IF(AND(LEN(B3)=0,LEN(B6)=0),"","Закрытого перехода методом ГНБ №"&B3&" по адресу: "&B6)
'@
  $fB59 = @'
=IF(AND(LEN(B3)=0,LEN(B48)=0,LEN(B51)=0,LEN(B6)=0),"","Строительство закрытого перехода №"&B3&" методом ГНБ; Lпр.="&B48&" м, Lобщ.="&B51&" м, одна скважина из 2-х труб "&B47&", по адресу: "&B6&", проверка трубных переходов на проходимость; затягивание шнура; нумерация труб; установка заглушек.")
'@
  $fB60 = @'
=IF(AND(LEN(B3)=0,LEN(B6)=0),"","Исполнительный чертеж ЗП №"&B3&" (по адресу: "&B6&")")
'@

  Set-Formula $ws "B3" $fB3.Trim()
  Set-Formula $ws "B8" $fB8.Trim()
  Set-Formula $ws "B23" $fB23.Trim()
  Set-Formula $ws "B25" $fB25.Trim()
  Set-Formula $ws "B27" $fB27.Trim()
  Set-Formula $ws "B30" $fB30.Trim()
  Set-Formula $ws "B34" $fB34.Trim()
  Set-Formula $ws "B38" $fB38.Trim()
  Set-Formula $ws "B43" $fB43.Trim()
  Set-Formula $ws "B51" $fB51.Trim()
  Set-Formula $ws "B55" $fB55.Trim()
  Set-Formula $ws "B56" $fB56.Trim()
  Set-Formula $ws "B57" $fB57.Trim()
  Set-Formula $ws "B58" $fB58.Trim()
  Set-Formula $ws "B59" $fB59.Trim()
  Set-Formula $ws "B60" $fB60.Trim()

  $wb.SaveAs($dst, 51)
  Write-Output "REFINED: $dst"
}
finally {
  if ($wb) { $wb.Close($false) }
  Release-ComObject $ws
  Release-ComObject $wb
  $excel.Quit()
  Release-ComObject $excel
}
