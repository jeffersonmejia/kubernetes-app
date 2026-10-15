$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$LocalBuildImage = 'distributed-app-reto2:build'
$StableImage = 'docker.io/library/distributed-app-reto2:stable'
$CanaryImage = 'docker.io/library/distributed-app-reto2:canary'

docker build -t $LocalBuildImage .
if ($LASTEXITCODE -ne 0) { throw 'Falló docker build.' }
docker tag $LocalBuildImage $StableImage
if ($LASTEXITCODE -ne 0) { throw 'Falló el etiquetado de la imagen stable.' }
docker tag $LocalBuildImage $CanaryImage
if ($LASTEXITCODE -ne 0) { throw 'Falló el etiquetado de la imagen canary.' }

# Docker Desktop ejecuta Kubernetes dentro de nodos kind con containerd propio.
# Las dos etiquetas se transmiten por stdin y se importan localmente en cada nodo.
$NodeOutput = kubectl get nodes -o jsonpath='{.items[*].metadata.name}'
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($NodeOutput)) {
    throw 'No se encontraron nodos Kubernetes. Verifica que Docker Desktop Kubernetes esté iniciado.'
}

foreach ($NodeName in ($NodeOutput -split '\s+')) {
    if ([string]::IsNullOrWhiteSpace($NodeName)) { continue }
    docker save $StableImage $CanaryImage | docker exec -i $NodeName ctr -n k8s.io images import -
    if ($LASTEXITCODE -ne 0) { throw "No se pudieron importar las imágenes en el nodo $NodeName." }
}

kubectl apply -f service.yaml
if ($LASTEXITCODE -ne 0) { throw 'Falló la creación del Service.' }
kubectl apply -f stable-deployment.yaml
if ($LASTEXITCODE -ne 0) { throw 'Falló el despliegue stable.' }
kubectl apply -f canary-deployment.yaml
if ($LASTEXITCODE -ne 0) { throw 'Falló el despliegue canary.' }

kubectl rollout status deployment/distributed-app-reto2-stable
if ($LASTEXITCODE -ne 0) { throw 'El despliegue stable no quedó listo.' }
kubectl rollout status deployment/distributed-app-reto2-canary
if ($LASTEXITCODE -ne 0) { throw 'El despliegue canary no quedó listo.' }

kubectl get pods -l app=distributed-app-reto2 -o wide
kubectl get endpoints distributed-app-reto2-service
Write-Host 'Para probar el reparto, abre otra PowerShell y ejecuta: kubectl port-forward service/distributed-app-reto2-service 30082:80'
Write-Host 'Luego consulta http://localhost:30082/api/info varias veces'
