# Propuesta para el reto 1: ¿Cómo hacer que todos los pods se conozcan sin base de datos centralizada?

La implementación está aislada en esta carpeta; los archivos del proyecto original en la raíz conservan su lógica.

## Propuesta

Usar el DNS de Kubernetes para que cada instancia descubra las direcciones de las demás. Para ello, se propone ejecutar la aplicación como un **StatefulSet** y crear un **Service headless** (`clusterIP: None`) que agrupe a todos los pods.

Cada pod consulta el registro SRV del Service, por ejemplo:

```text
_http._tcp.distributed-app-peers.default.svc.cluster.local
```

Kubernetes devuelve los nombres DNS y puertos de los pods asociados al Service. La aplicación excluye su propia identidad y consulta `/health` de los otros pods mediante HTTP. No hace falta guardar la lista de miembros en una base de datos de la aplicación.

## ¿Por qué usar un StatefulSet?

Un `Deployment` crea pods con nombres generados que pueden cambiar al reiniciarse. Un `StatefulSet` asigna una identidad estable a cada réplica. Por ejemplo, con tres réplicas y el Service headless llamado `distributed-app-peers`, los nombres DNS individuales son:

```text
distributed-app-0.distributed-app-peers.default.svc.cluster.local
distributed-app-1.distributed-app-peers.default.svc.cluster.local
distributed-app-2.distributed-app-peers.default.svc.cluster.local
```

La identidad estable facilita que un pod pueda dirigirse a otro. El nombre común del Service permite descubrir el conjunto actual de direcciones.

## Arquitectura propuesta

1. Kubernetes inicia las réplicas de la aplicación.
2. Cada pod obtiene su nombre e identidad desde el hostname del contenedor.
3. Cada pod consulta periódicamente los registros SRV del Service headless para obtener los nombres y puertos de los miembros disponibles.
4. La aplicación mantiene en memoria la lista de pares descubiertos, comprueba su endpoint `/health` y publica el resultado en `GET /api/peers`.
5. Si las réplicas cambian, Kubernetes actualiza los registros DNS y los pods vuelven a consultar el nombre del Service.

```text
                    DNS de Kubernetes
                           |
            distributed-app-peers.default.svc
                 /         |         \
       distributed-app-0  -1          -2
                 <------ HTTP ------->
```

## Manifiesto del Service headless

Este Service es interno al clúster y se usa para descubrimiento. Puede coexistir con el Service `NodePort` actual, que se conserva para acceder a la aplicación desde fuera del clúster.

El manifiesto se encuentra en `peer-service.yaml`. El puerto tiene el nombre `http` para que Kubernetes publique los registros SRV que consulta Node.js.

El StatefulSet se configura en `statefulset.yaml` y referencia el Service headless con `serviceName`. También inyecta el nombre e IP del pod mediante Downward API y configura `PEERS_DNS`:

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: distributed-app
spec:
  serviceName: distributed-app-peers
  replicas: 3
  selector:
    matchLabels:
      app: distributed-app
  template:
    metadata:
      labels:
        app: distributed-app
    spec:
      containers:
        - name: distributed-app
          image: docker.io/library/distributed-app:reto1
          imagePullPolicy: Never
          env:
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
            - name: POD_IP
              valueFrom:
                fieldRef:
                  fieldPath: status.podIP
            - name: POD_NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
            - name: PEERS_DNS
              value: distributed-app-peers.$(POD_NAMESPACE).svc.cluster.local
          ports:
            - name: http
              containerPort: 3000
```

## Implementación en la aplicación

- Identifica el pod con `POD_NAME`, inyectado por Kubernetes, y usa `os.hostname()` como alternativa local.
- Resuelve periódicamente `_http._tcp.${PEERS_DNS}` con `dns.promises.resolveSrv` cada cinco segundos.
- Excluye su propia identidad y comprueba `GET /health` en cada pod remoto, con un tiempo límite de dos segundos.
- Expone `GET /api/peers` con el nombre del pod, el Service DNS consultado, la hora de actualización, el estado de cada par y posibles errores de resolución.
- Muestra la respuesta de `/api/peers` en la página principal y ofrece un botón para actualizarla.

La lista de pares es temporal y se reconstruye desde DNS. No es un dato persistente ni depende de un servidor de base de datos.

## Ventajas

- No requiere una base de datos centralizada ni un servicio de registro adicional.
- Usa el mecanismo de descubrimiento integrado en Kubernetes.
- Permite que las instancias obtengan las direcciones de los pods disponibles.
- El StatefulSet da nombres estables a las réplicas.
- Se puede observar el descubrimiento con un endpoint HTTP y con consultas DNS desde los pods.

## Alcance y limitaciones

Esta solución permite descubrir las direcciones de los pods, pero el DNS no mantiene una conexión permanente ni garantiza que todos los pares estén disponibles en todo momento. La lista puede cambiar cuando un pod se crea, se elimina o deja de estar listo; por eso cada instancia debe volver a consultar DNS y manejar errores o direcciones temporalmente inaccesibles.

El control plane de Kubernetes mantiene el estado de los objetos y publica los registros DNS. Por tanto, se elimina la base de datos centralizada de la aplicación, aunque el descubrimiento sigue dependiendo de los servicios del propio clúster.

## Plan para demostrar el reto

1. Desde esta carpeta, construir la imagen: `docker build -t distributed-app:reto1 .`.
2. Crear el Service headless y el StatefulSet con tres réplicas.
3. Verificar que los pods tengan nombres estables (`distributed-app-0`, `-1`, `-2`).
4. Consultar los registros DNS SRV desde un pod y comprobar que incluyen los otros pods.
5. Consultar `/api/peers` en cada instancia y comparar las listas descubiertas y sus estados de salud.
6. Eliminar una réplica de prueba y comprobar que, tras la actualización de DNS y la siguiente consulta, los pods reflejen el cambio.

### Aplicación en un clúster que ya tiene el Deployment anterior

El Deployment anterior y el StatefulSet no deben administrar simultáneamente pods con las mismas etiquetas. Desde esta carpeta, primero se construye la imagen y se aplica el Service headless; luego se elimina el Deployment anterior y se aplica el StatefulSet junto con el Service NodePort:

```powershell
.\run.ps1
```

El script construye la imagen en Docker local y la importa directamente en el almacén `containerd` de los nodos de Docker Desktop. No es necesario publicarla en un registry ni iniciar sesión.

La sustitución puede causar una interrupción breve mientras se recrean las réplicas.

## Conclusión propuesta para el informe

La implementación propuesta descubre pods mediante registros DNS SRV de Kubernetes con un Service headless asociado a un StatefulSet. Cada instancia consulta periódicamente esos registros, comprueba la salud de sus pares por HTTP y publica los resultados en `/api/peers`. Así, la aplicación no necesita una base de datos centralizada para almacenar miembros; Kubernetes proporciona el mecanismo de descubrimiento y el StatefulSet asigna nombres estables a las réplicas.

## Observación y justificación de la propuesta

Una alternativa consiste en crear un servicio central de estado que almacene, por ejemplo, un contador en memoria y reciba las operaciones de todos los pods. Esta alternativa permite compartir un dato sin utilizar una base de datos, pero los pods se comunican con ese servicio central y no descubren directamente qué otros pods existen. Además, si el servicio mantiene el estado en memoria y se reinicia, el dato se pierde.

Por ese motivo, para este reto se propone el descubrimiento mediante DNS de Kubernetes y un Service headless: el enunciado pregunta cómo hacer que **todos los pods se conozcan**, por lo que el objetivo principal es que cada pod pueda descubrir y contactar a los demás. El servicio central de estado sería apropiado para un objetivo distinto, como compartir un contador entre réplicas, pero no demuestra por sí solo el conocimiento o descubrimiento mutuo entre pods.
