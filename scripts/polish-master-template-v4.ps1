$ErrorActionPreference = "Stop"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$src = "C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-v4.xlsx"
$dst = "C:\Users\kubko\projects\gnb-bot\templates\GNB-master-template-v6.xlsx"

function Release-ComObject($obj) {
  if ($null -ne $obj) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($obj)
  }
}

function Set-Value($ws, $addr, $value) {
  $ws.Range($addr).Value2 = $value
}

$wb = $null
$ws = $null

try {
  if (Test-Path $dst) {
    Remove-Item $dst -Force
  }

  $wb = $excel.Workbooks.Open($src, 0, $false)
  $ws = $wb.Worksheets.Item("00 DATA")

  $gnbNumber = [string]$ws.Range("B2").Text
  $address = [string]$ws.Range("B6").Text
  $projectNumber = [string]$ws.Range("B7").Text
  $sign1Line = [string]$ws.Range("B29").Text
  $sign2Line = [string]$ws.Range("B33").Text
  $sign3Line = [string]$ws.Range("B37").Text
  $techLine = [string]$ws.Range("B42").Text
  $techDesc = [string]$ws.Range("B41").Text
  $orgCustomer = [string]$ws.Range("B22").Text
  $orgContractor = [string]$ws.Range("B24").Text
  $orgDesigner = [string]$ws.Range("B26").Text
  $profileLength = [string]$ws.Range("B48").Text
  $pipeCount = [string]$ws.Range("B50").Text
  $totalPipeLength = [string]$ws.Range("B51").Text
  $pipeDiameter = [string]$ws.Range("B47").Text

  $shortNumber = $gnbNumber
  if ($shortNumber -match "№\s*(.+)$") {
    $shortNumber = $Matches[1].Trim()
  }

  if ([string]::IsNullOrWhiteSpace($totalPipeLength) -and -not [string]::IsNullOrWhiteSpace($profileLength) -and -not [string]::IsNullOrWhiteSpace($pipeCount)) {
    try {
      $totalPipeLength = ([double]($profileLength -replace ",","." ) * [double]($pipeCount -replace ",","." )).ToString("0.##").Replace(".", ",")
    } catch {}
  }

  Set-Value $ws "B3" $shortNumber
  Set-Value $ws "B8" $projectNumber
  Set-Value $ws "B23" $orgCustomer
  Set-Value $ws "B25" $orgContractor
  Set-Value $ws "B27" $orgDesigner
  Set-Value $ws "B30" ($sign1Line -replace "_", "")
  Set-Value $ws "B34" ($sign2Line -replace "_", "")
  Set-Value $ws "B38" ($sign3Line -replace "_", "")
  if ([string]::IsNullOrWhiteSpace($techLine)) {
    Set-Value $ws "B43" $techDesc
  } else {
    Set-Value $ws "B43" ($techLine -replace "_", "")
  }
  Set-Value $ws "B51" $totalPipeLength
  Set-Value $ws "B55" "Прокладке кабельных линий"
  Set-Value $ws "B56" ("1 (ЗП ГНБ №" + $shortNumber + ")")
  Set-Value $ws "B57" ("2 (ЗП ГНБ №" + $shortNumber + ")")
  Set-Value $ws "B58" ("Закрытого перехода методом ГНБ №" + $shortNumber + " по адресу: " + $address)
  Set-Value $ws "B59" ("Строительство закрытого перехода №" + $shortNumber + " методом ГНБ; Lпр.=" + $profileLength + " м, Lобщ.=" + $totalPipeLength + " м, одна скважина из 2-х труб " + $pipeDiameter + ", по адресу: " + $address + ", проверка трубных переходов на проходимость; затягивание шнура; нумерация труб; установка заглушек.")
  Set-Value $ws "B60" ("Исполнительный чертеж ЗП №" + $shortNumber + " (по адресу: " + $address + ")")

  $wb.SaveAs($dst, 51)
  Write-Output "POLISHED: $dst"
}
finally {
  if ($wb) { $wb.Close($false) }
  Release-ComObject $ws
  Release-ComObject $wb
  $excel.Quit()
  Release-ComObject $excel
}
