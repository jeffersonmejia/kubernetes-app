$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# Este script despliega la aplicación general de la raíz, sin los retos.
$LocalImage = 'docker.io/library/distributed-app:v1'

docker build -t $LocalImage .
if ($LASTEXITCODE -ne 0) { throw 'Falló docker build.' }

$Context = kubectl config current-context
if ($LASTEXITCODE -ne 0) { throw 'No se pudo leer el contexto actual de kubectl.' }
if ($Context -ne 'docker-desktop') {
    throw "El contexto actual es '$Context'. Cambia a Docker Desktop con: kubectl config use-context docker-desktop"
}

$NodeOutput = kubectl get nodes -o jsonpath='{.items[*].metadata.name}'
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($NodeOutput)) {
    throw 'No se encontraron nodos Kubernetes. Verifica que Docker Desktop Kubernetes esté iniciado.'
}

# El nodo kind de Docker Desktop usa un almacén containerd separado de Docker.
# Se transmite la imagen local por stdin y se importa en el namespace k8s.io.
foreach ($NodeName in ($NodeOutput -split '\s+')) {
    if ([string]::IsNullOrWhiteSpace($NodeName)) { continue }
    docker save $LocalImage | docker exec -i $NodeName ctr -n k8s.io images import -
    if ($LASTEXITCODE -ne 0) { throw "No se pudo importar la imagen en el nodo $NodeName." }
}

# RETO 1 usa un StatefulSet con el mismo nombre y selector; se retira para volver
# al Deployment general sin mezclar pods ni registros DNS del reto.
kubectl delete statefulset distributed-app --ignore-not-found
if ($LASTEXITCODE -ne 0) { throw 'No se pudo retirar el StatefulSet de reto_1.' }
kubectl delete service distributed-app-peers --ignore-not-found
if ($LASTEXITCODE -ne 0) { throw 'No se pudo retirar el Service headless de reto_1.' }

kubectl apply -f deployment.yaml
if ($LASTEXITCODE -ne 0) { throw 'Falló la aplicación de deployment.yaml.' }
kubectl apply -f service.yaml
if ($LASTEXITCODE -ne 0) { throw 'Falló la aplicación de service.yaml.' }

kubectl rollout status deployment/distributed-app
if ($LASTEXITCODE -ne 0) { throw 'El Deployment general no terminó de desplegarse.' }
kubectl get pods -l app=distributed-app -o wide
if ($LASTEXITCODE -ne 0) { throw 'Falló la consulta de pods.' }

Write-Host 'Para abrir la aplicación, ejecuta en otra PowerShell: kubectl port-forward service/distributed-app-service 30080:80'
Write-Host 'Luego visita http://localhost:30080/'
