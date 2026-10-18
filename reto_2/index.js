// Título: Aplicación web instrumentada para una demostración de despliegue canary.
// Descripción: Este servidor Node.js ofrece la misma funcionalidad a las variantes estable y candidata, y obtiene su identidad de las variables APP_VERSION y APP_MESSAGE que Kubernetes define en cada Deployment. El endpoint /api/info informa la versión, el mensaje, el nombre del pod, el contador local y la hora de respuesta; la página principal muestra esos datos y permite generar una solicitud adicional. Así, al enviar tráfico al Service compartido, se puede reconocer qué variante atendió cada solicitud y observar el comportamiento del despliegue sin duplicar la aplicación.
const http = require('http');
const os = require('os');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
// Descripción: este bloque permite que una sola aplicación represente las variantes estable y canary. Kubernetes asigna APP_VERSION y APP_MESSAGE con valores distintos en cada Deployment; la función info incorpora esos valores junto con el nombre del pod, el contador local y la hora para que las respuestas permitan identificar qué instancia atendió la solicitud.
// INICIO DEL CÓDIGO CANARY QUE SE DEBE COPIAR
const APP_VERSION = process.env.APP_VERSION || 'v1';
const APP_MESSAGE = process.env.APP_MESSAGE || 'Versión estable';
let localCounter = 0;

function commonHeaders(contentType = 'text/html; charset=utf-8') {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Connection': 'close'
  };
}

function info() {
  return {
    version: APP_VERSION,
    message: APP_MESSAGE,
    pod: os.hostname(),
    counter: localCounter,
    time: new Date().toISOString()
  };
}
// FIN DEL CÓDIGO CANARY QUE SE DEBE COPIAR

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, commonHeaders('text/plain; charset=utf-8'));
    return res.end('OK');
  }

  if (req.method === 'GET' && url.pathname === '/api/info') {
    res.writeHead(200, commonHeaders('application/json; charset=utf-8'));
    return res.end(JSON.stringify(info()));
  }

  if (req.method === 'POST' && url.pathname === '/increment') {
    localCounter++;
    res.writeHead(200, commonHeaders('application/json; charset=utf-8'));
    return res.end(JSON.stringify({ action: 'increment', ...info() }));
  }

  if (req.method === 'GET' && url.pathname === '/') {
    const data = info();
    const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <!-- Título: muestra que esta aplicación forma parte de la demostración de despliegue canary. -->
  <title>Canary Deployment ${data.version}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 760px; margin: 50px auto; padding: 0 20px; background: #f4f6f8; }
    .card { background: white; border-radius: 14px; padding: 28px; box-shadow: 0 4px 16px rgba(0,0,0,.08); }
    code { background: #eef1f4; padding: 3px 7px; border-radius: 6px; }
    button { padding: 10px 16px; margin-right: 8px; cursor: pointer; }
    .value { font-weight: bold; }
    #result { white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="card">
    <!-- Descripción: permite comparar la versión estable y la canary según el pod que responde. -->
    <h1>Canary Deployment</h1>
    <p>${data.message}</p>
    <p>Versión: <span class="value">${data.version}</span></p>
    <p>Servidor / Pod: <code>${data.pod}</code></p>
    <p>Contador local: <span class="value">${data.counter}</span></p>
    <p>Hora UTC: ${data.time}</p>
    <button onclick="incrementar()">Incrementar contador local</button>
    <button onclick="location.reload()">Nueva solicitud</button>
    <pre id="result"></pre>
  </div>
  <script>
    async function incrementar() {
      const response = await fetch('/increment', { method: 'POST' });
      const data = await response.json();
      document.getElementById('result').textContent = JSON.stringify(data, null, 2);
    }
  </script>
</body>
</html>`;
    res.writeHead(200, commonHeaders());
    return res.end(html);
  }

  res.writeHead(404, commonHeaders('application/json; charset=utf-8'));
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Canary demo ${APP_VERSION} listening on port ${PORT}`);
  console.log(`Hostname: ${os.hostname()}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM recibido. Cerrando servidor de forma controlada...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
});
