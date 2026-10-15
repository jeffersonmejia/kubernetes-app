# Reto 2: Canary Deployment

Esta carpeta implementa una demostración aislada de despliegue canary. No modifica los archivos del proyecto original ni los de `reto_1`.

## Cómo funciona

- El Deployment `distributed-app-reto2-stable` ejecuta cuatro réplicas de la versión estable (`v1`).
- El Deployment `distributed-app-reto2-canary` ejecuta una réplica de prueba (`v2-canary`).
- Ambos usan el mismo Service `distributed-app-reto2-service`, cuyo selector incluye stable y canary.
- El Service tiene NodePort `30082`, independiente del puerto usado por el reto 1.
- Cada respuesta de `GET /api/info` muestra la versión y el nombre del pod que respondió.

Con cuatro pods estables y uno canary, Kubernetes reparte las conexiones aproximadamente 80/20. Es una proporción orientativa basada en endpoints y conexiones; no es un porcentaje garantizado por solicitud, y conexiones persistentes pueden afectar la distribución.

Para mantener el ejemplo ejecutable sin duplicar el código, ambos tags Docker contienen la misma imagen de esta app; cada Deployment recibe `APP_VERSION` y `APP_MESSAGE` distintos desde su manifiesto. En un despliegue real, el tag canary apuntaría al artefacto que contiene los cambios candidatos.

## Ejecutar

1. En PowerShell, desde esta carpeta, ejecuta `.\run.ps1`. El script construye las imágenes y las carga directamente en los nodos del clúster local, sin iniciar sesión ni publicarlas.
2. Para observar la distribución entre versiones, ejecuta `.\test-canary.ps1`. El script hace 20 solicitudes desde dentro del clúster al Service y muestra la versión y el pod que responde. El reenvío local con `kubectl port-forward service/...` selecciona un pod y no sirve para medir la distribución del Service.
3. Para abrir una respuesta en el navegador, en otra PowerShell ejecuta `kubectl port-forward service/distributed-app-reto2-service 30082:80` y déjalo activo; luego abre `http://localhost:30082/api/info`. Ese reenvío muestra un pod individual; usa `test-canary.ps1` para observar el reparto.

## Promover o revertir

Para simular la promoción de la versión nueva, aumenta las réplicas canary y reduce las estables. Para revertir, aplica de nuevo las cantidades iniciales (4 stable y 1 canary), o elimina el Deployment canary:

```powershell
kubectl scale deployment/distributed-app-reto2-canary --replicas=0
kubectl scale deployment/distributed-app-reto2-stable --replicas=5
```

## Limpieza

```powershell
kubectl delete -f service.yaml
kubectl delete deployment distributed-app-reto2-stable distributed-app-reto2-canary
```

Los manifiestos separan los Deployments y los selectores de `reto_1`, así que se pueden desplegar en el mismo namespace sin mezclar sus pods. No se aplica ningún manifiesto hasta que ejecutes `run.ps1`.
