# Título: Prueba de observación de tráfico entre versiones.
# Descripción: En este código se observa que la prueba primero verifica que existan réplicas listas de las versiones stable y canary, condición necesaria para que el Service tenga endpoints disponibles. Después ejecuta veinte solicitudes al endpoint /api/info desde un pod del clúster hacia el Service compartido e imprime la versión y el nombre del pod que responde. Esto permite comprobar la participación de ambas variantes y observar el reparto de esa muestra; no supone que Kubernetes garantice una proporción exacta por solicitud. Si falta alguna variante, el script indica que debe ejecutarse run.ps1 para desplegarla.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# INICIO DEL FRAGMENTO DE PRUEBA QUE SE DEBE COPIAR
$StableReady = kubectl get deployment distributed-app-reto2-stable -o jsonpath='{.status.readyReplicas}'
if ($LASTEXITCODE -ne 0) { throw 'No se encontró el Deployment estable. Ejecuta .\run.ps1 antes del test.' }
$CanaryReady = kubectl get deployment distributed-app-reto2-canary -o jsonpath='{.status.readyReplicas}'
if ($LASTEXITCODE -ne 0) { throw 'No se encontró el Deployment canary. Ejecuta .\run.ps1 antes del test.' }
if ([string]::IsNullOrWhiteSpace($StableReady) -or [int]$StableReady -lt 1 -or [string]::IsNullOrWhiteSpace($CanaryReady) -or [int]$CanaryReady -lt 1) {
    throw 'No hay pods listos de ambas versiones. Ejecuta .\run.ps1 y vuelve a correr .\test-canary.ps1.'
}
$Request = "(async()=>{for(let i=0;i<20;i++){const r=await fetch('http://distributed-app-reto2-service/api/info');const d=await r.json();console.log(d.version,d.pod)}})().catch(e=>{console.error(e);process.exit(1)})"
kubectl exec deployment/distributed-app-reto2-stable -- node -e $Request
if ($LASTEXITCODE -ne 0) { throw 'Fallaron las solicitudes de prueba del Service.' }
# FIN DEL FRAGMENTO DE PRUEBA QUE SE DEBE COPIAR
