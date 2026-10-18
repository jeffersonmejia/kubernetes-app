# Pruebas de escalabilidad horizontal: 1, 3 y 10 replicas; 20, 50, 100, 200 y 500 VUs.
# Ejecutar desde PowerShell con: powershell -ExecutionPolicy Bypass -File .\ejecutar-escalabilidad.ps1
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$deployment = 'distributed-app'
$namespace = 'default'
$replicasList = @(1, 3, 10)
$vusList = @(20, 50, 100, 200, 500)
$resultados = Join-Path $PSScriptRoot 'resultados'
$scriptK6 = Join-Path $PSScriptRoot 'baseline-test.js'

if (-not (Test-Path $scriptK6)) { throw 'No se encontro baseline-test.js en esta carpeta.' }
foreach ($cmd in @('kubectl', 'k6')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "No se encontro $cmd en PATH." }
}
if (-not (Test-NetConnection -ComputerName 127.0.0.1 -Port 8001 -InformationLevel Quiet -WarningAction SilentlyContinue)) {
    throw 'El puerto 8001 no responde. Inicia kubectl proxy --port=8001 en otra ventana.'
}

New-Item -ItemType Directory -Path $resultados -Force | Out-Null
$fallos = @()

foreach ($replicas in $replicasList) {
    Write-Host "`n== Escalando $deployment a $replicas replicas ==" -ForegroundColor Cyan
    & kubectl -n $namespace scale "deployment/$deployment" "--replicas=$replicas"
    if ($LASTEXITCODE -ne 0) { throw "Fallo el escalado a $replicas replicas." }
    & kubectl -n $namespace rollout status "deployment/$deployment" --timeout=180s
    if ($LASTEXITCODE -ne 0) { throw "El deployment no completo rollout con $replicas replicas." }

    # Esperar al numero exacto de replicas disponibles, con limite de 180 segundos.
    $limite = (Get-Date).AddSeconds(180)
    do {
        $disponiblesRaw = & kubectl -n $namespace get "deployment/$deployment" -o 'jsonpath={.status.availableReplicas}'
        if ($LASTEXITCODE -ne 0) { throw 'No fue posible consultar replicas disponibles.' }
        $disponibles = if ([string]::IsNullOrWhiteSpace($disponiblesRaw)) { 0 } else { [int]$disponiblesRaw }
        if ($disponibles -eq $replicas) { break }
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $limite)
    if ($disponibles -ne $replicas) { throw "Tiempo agotado esperando $replicas replicas disponibles (actual: $disponibles)." }

    Start-Sleep -Seconds 5
    foreach ($vus in $vusList) {
        $nombre = "${replicas}replicas_${vus}vus.json"
        $ruta = Join-Path $resultados $nombre
        Write-Host "`n== Prueba: $replicas replicas / $vus VUs ==" -ForegroundColor Yellow
        & k6 run -e "VUS=$vus" "--summary-export=$ruta" $scriptK6
        $codigo = $LASTEXITCODE
        if ($codigo -ne 0) {
            $fallos += "$replicas replicas / $vus VUs (exit $codigo)"
            Write-Warning "k6 termino con codigo $codigo. Puede indicar thresholds incumplidos; revisar JSON."
        }
        if (-not (Test-Path $ruta)) {
            $fallos += "Sin JSON: $nombre"
            Write-Warning "No se genero $nombre"
        }
        Start-Sleep -Seconds 10
    }
}

$archivos = @(Get-ChildItem $resultados -Filter '*replicas_*vus.json' -File)
Write-Host "`nFinalizado. Archivos JSON: $($archivos.Count) de 15" -ForegroundColor Green
if ($fallos.Count -gt 0) {
    Write-Warning 'Experimentos por revisar:'
    $fallos | ForEach-Object { Write-Host " - $_" }
}
Write-Host "Resultados: $resultados"
