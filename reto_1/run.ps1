$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$LocalImage = 'docker.io/library/distributed-app:reto1'

docker build -t $LocalImage .
if ($LASTEXITCODE -ne 0) { throw 'Falló docker build.' }

# Docker Desktop ejecuta Kubernetes dentro de nodos kind con containerd propio.
# Se transmite el tar local por stdin y se importa en el namespace k8s.io de cada nodo.
$NodeOutput = kubectl get nodes -o jsonpath='{.items[*].metadata.name}'
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($NodeOutput)) {
    throw 'No se encontraron nodos Kubernetes. Verifica que Docker Desktop Kubernetes esté iniciado.'
}

foreach ($NodeName in ($NodeOutput -split '\s+')) {
    if ([string]::IsNullOrWhiteSpace($NodeName)) { continue }
    docker save $LocalImage | docker exec -i $NodeName ctr -n k8s.io images import -
    if ($LASTEXITCODE -ne 0) { throw "No se pudo importar la imagen en el nodo $NodeName." }
}

kubectl apply -f peer-service.yaml
if ($LASTEXITCODE -ne 0) { throw 'Falló kubectl apply para peer-service.yaml.' }

kubectl delete deployment distributed-app --ignore-not-found
if ($LASTEXITCODE -ne 0) { throw 'Falló la eliminación del Deployment anterior.' }

kubectl apply -f statefulset.yaml
if ($LASTEXITCODE -ne 0) { throw 'Falló kubectl apply para el StatefulSet.' }

kubectl apply -f service.yaml
if ($LASTEXITCODE -ne 0) { throw 'Falló kubectl apply para service.yaml.' }

kubectl rollout status statefulset/distributed-app
if ($LASTEXITCODE -ne 0) { throw 'El StatefulSet no terminó de desplegarse correctamente.' }

kubectl get pods -l app=distributed-app -o wide
if ($LASTEXITCODE -ne 0) { throw 'Falló la consulta de pods.' }

Write-Host 'Para consultar la app, abre otra PowerShell y ejecuta: kubectl port-forward service/distributed-app-service 30080:80'
Write-Host 'Luego abre http://localhost:30080/api/peers'
