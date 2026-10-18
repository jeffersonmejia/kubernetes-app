$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# La prueba se ejecuta dentro de Kubernetes para resolver el DNS del Service
# y enviar tráfico al balanceador que conoce las tres réplicas.
kubectl create configmap distributed-app-smoke-script `
    --from-file=smoke-test.js=smoke-test.js `
    --dry-run=client -o yaml | kubectl apply -f -
if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el ConfigMap de la prueba smoke.' }

# Solo se elimina el Job anterior con este nombre para poder repetir la prueba.
kubectl delete job distributed-app-smoke --ignore-not-found
if ($LASTEXITCODE -ne 0) { throw 'No se pudo eliminar el Job smoke anterior.' }

kubectl apply -f smoke-job.yaml
if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar el Job smoke.' }

kubectl wait --for=condition=complete job/distributed-app-smoke --timeout=90s
if ($LASTEXITCODE -ne 0) { throw 'La prueba smoke no terminó correctamente.' }

kubectl logs job/distributed-app-smoke
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron obtener los resultados de la prueba smoke.' }
