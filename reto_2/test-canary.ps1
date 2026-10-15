$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# RETO 2: cada petición nace dentro del clúster para pasar por el Service ClusterIP.
# Esto permite observar cómo llegan respuestas de stable y canary.
$Request = "(async()=>{for(let i=0;i<20;i++){const r=await fetch('http://distributed-app-reto2-service/api/info');const d=await r.json();console.log(d.version,d.pod)}})().catch(e=>{console.error(e);process.exit(1)})"
kubectl exec deployment/distributed-app-reto2-stable -- node -e $Request
if ($LASTEXITCODE -ne 0) { throw 'Fallaron las solicitudes de prueba del Service.' }
