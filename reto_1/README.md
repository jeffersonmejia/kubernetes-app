# Reto 1: descubrimiento de pods

Esta carpeta contiene una variante aislada de la aplicación para implementar el descubrimiento entre pods mediante DNS de Kubernetes. Los archivos del proyecto original en la carpeta raíz conservan su comportamiento.

## Archivos

- `index.js`: servidor original con la ruta nueva `GET /api/peers` y la consulta periódica de DNS SRV. Los cambios están marcados con comentarios `RETO 1`.
- `peer-service.yaml`: Service headless que publica los pods para el descubrimiento.
- `statefulset.yaml`: StatefulSet que asigna nombres estables, inyecta la identidad del pod y activa la comprobación de salud.
- `service.yaml`: Service NodePort; para acceder desde Windows se usa `kubectl port-forward` al puerto local `30080`.
- `Dockerfile`: imagen de la aplicación para esta carpeta.

## Construir y desplegar

El clúster de Docker Desktop usa `kind`, cuyo nodo tiene un almacén de imágenes `containerd` separado del almacén local de Docker. Por eso, `run.ps1` construye la imagen localmente y la importa directamente en cada nodo del clúster; no publica la imagen ni requiere iniciar sesión en Docker Hub.

Desde PowerShell en esta carpeta, ejecuta:

```powershell
.\run.ps1
```

El script carga la imagen directamente en los nodos de Docker Desktop, reemplaza el Deployment anterior por el StatefulSet y espera las réplicas. Eliminar el Deployment puede causar una interrupción breve mientras se recrean los pods. No se necesita repositorio público, `docker login` ni `docker push`.

Para acceder desde Windows, abre otra PowerShell y ejecuta `kubectl port-forward service/distributed-app-service 30080:80`. Mientras ese comando siga activo, consulta `http://localhost:30080/api/peers` o abre `http://localhost:30080/` y usa **Actualizar pares**. Cada réplica muestra los otros pods que encontró y el resultado de su comprobación `/health`.

## Cómo funciona

1. El StatefulSet asigna nombres estables, como `distributed-app-0` y `distributed-app-1`.
2. El Service headless publica registros SRV para los pods listos.
3. Cada servidor consulta `_http._tcp.distributed-app-peers.<namespace>.svc.cluster.local` cada cinco segundos.
4. La aplicación omite su propio pod, consulta `/health` de los demás y publica su lista en `/api/peers`.

La lista se mantiene solo en memoria y se vuelve a crear desde DNS. No se agregó base de datos ni servicio de estado centralizado.
