// === Código 01. Importación de módulos ===
// === Descripción: Se importan módulos nativos para crear el servidor HTTP, consultar el sistema operativo y procesar direcciones URL. ===
const http = require('http');
const os = require('os');
const { URL } = require('url');

// === Código 02. Configuración de la aplicación ===
// === Descripción: Se define el puerto, la versión y el mensaje que identifican esta instancia de la aplicación. ===
const PORT = process.env.PORT || 3000;
const APP_VERSION = 'v99';
const APP_MESSAGE = 'Segunda versión desplegada con Rolling Update'

// === Código 03. Contador local ===
// === Descripción: Se inicializa en cero el contador que mantiene cada instancia del servidor. ===
let localCounter = 0;

// === Código 04. Encabezados comunes ===
// === Descripción: Esta función prepara los encabezados HTTP, incluyendo el tipo de contenido y las opciones de caché y conexión. ===
function commonHeaders(contentType = 'text/html; charset=utf-8') {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Connection': 'close'
  };
}

// === Código 05. Información de la instancia ===
// === Descripción: Esta función reúne la versión, el mensaje, el nombre del pod, el contador y la hora UTC actual. ===
function info() {
  return {
    version: APP_VERSION,
    message: APP_MESSAGE,
    pod: os.hostname(),
    counter: localCounter,
    time: new Date().toISOString()
  };
}

// === Código 06. Creación y enrutamiento del servidor ===
// === Descripción: Se crea el servidor HTTP y se interpreta la ruta de cada solicitud para dirigirla al recurso correspondiente. ===
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // === Código 07. Comprobación de salud ===
  // === Descripción: La ruta GET /health responde OK para indicar que el servidor está disponible. ===
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, commonHeaders('text/plain; charset=utf-8'));
    return res.end('OK');
  }

  // === Código 08. API de información ===
  // === Descripción: La ruta GET /api/info devuelve en formato JSON los datos actuales de esta instancia. ===
  if (req.method === 'GET' && url.pathname === '/api/info') {
    res.writeHead(200, commonHeaders('application/json; charset=utf-8'));
    return res.end(JSON.stringify(info()));
  }

  // === Código 09. Incremento del contador ===
  // === Descripción: La ruta POST /increment aumenta el contador local y devuelve el estado actualizado en JSON. ===
  if (req.method === 'POST' && url.pathname === '/increment') {
    localCounter++;
    res.writeHead(200, commonHeaders('application/json; charset=utf-8'));
    return res.end(JSON.stringify({ action: 'increment', ...info() }));
  }

  // === Código 10. Página principal ===
  // === Descripción: La ruta GET / construye una página HTML con los datos de la instancia y controles para actualizar el contador. ===
  if (req.method === 'GET' && url.pathname === '/') {
    const data = info();
    const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Distributed App Lab ${data.version}</title>
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
    <h1>Distributed App Lab</h1>
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

  // === Código 11. Ruta no encontrada ===
  // === Descripción: Si la solicitud no coincide con una ruta disponible, se responde con estado 404 y un error JSON. ===
  res.writeHead(404, commonHeaders('application/json; charset=utf-8'));
  res.end(JSON.stringify({ error: 'Not found' }));
});

// === Código 12. Inicio del servidor ===
// === Descripción: El servidor escucha en el puerto configurado en todas las interfaces de red e informa su versión y hostname. ===
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Distributed App Lab ${APP_VERSION} listening on port ${PORT}`);
  console.log(`Hostname: ${os.hostname()}`);
});

// === Código 13. Cierre controlado ===
// === Descripción: Al recibir SIGTERM, el servidor deja de aceptar conexiones y se cierra; si tarda demasiado, finaliza con error. ===
process.on('SIGTERM', () => {
  console.log('SIGTERM recibido. Cerrando servidor de forma controlada...');
  server.close(() => {
    console.log('Servidor cerrado.');
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10000).unref();
});
