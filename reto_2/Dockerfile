# Título: Imagen de contenedor para la aplicación del reto canary.
# Descripción: Este Dockerfile empaqueta el servidor Node.js de index.js en una imagen basada en Alpine, establece el directorio de trabajo, configura el puerto 3000 y define el comando de inicio. El script de despliegue etiqueta la misma imagen para las variantes stable y canary; cada Deployment inyecta valores distintos de APP_VERSION y APP_MESSAGE, de modo que ambas variantes pueden identificarse sin mantener dos copias del código de la aplicación.
FROM node:22-alpine
WORKDIR /app
COPY index.js .
ENV PORT=3000
EXPOSE 3000
CMD ["node", "index.js"]
