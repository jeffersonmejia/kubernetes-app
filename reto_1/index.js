const http = require('http');
const os = require('os');
// === Código 01. Módulo DNS para descubrir pods ===
// Permite consultar los registros SRV que publica el Service headless.
const dns = require('dns').promises;
// === Fin del Código 01 ===
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const APP_VERSION = 'reto1';
const APP_MESSAGE = 'Reto 1: descubrimiento de pods mediante DNS SRV';
// === Código 02. Identidad del pod y configuración DNS ===
// Kubernetes proporciona estos valores para identificar la réplica y localizar a sus pares.
const POD_NAME = process.env.POD_NAME || os.hostname();
const POD_IP = process.env.POD_IP || null;
const PEERS_DNS = process.env.PEERS_DNS || '';
const PEERS_LOOKUP_INTERVAL_MS = Math.max(1000, Number(process.env.PEERS_LOOKUP_INTERVAL_MS) || 5000);
const PEER_HEALTH_TIMEOUT_MS = 2000;
// === Fin del Código 02 ===

let localCounter = 0;

// === Código 03. Estado temporal de los pares ===
// Guarda en memoria los resultados recientes; la lista se reconstruye desde DNS.
let peersState = {
  serviceDns: PEERS_DNS || null,
  checkedAt: null,
  peers: [],
  error: null
};
let discoveryRunning = false;
// === Fin del Código 03 ===

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
    pod: POD_NAME,
    podIp: POD_IP,
    counter: localCounter,
    time: new Date().toISOString()
  };
}

// === Código 04. Identificación y comprobación de pares ===
// Excluye esta réplica y comprueba por HTTP la salud de los otros pods descubiertos.
function isThisPod(record) {
  return record.name.split('.')[0] === POD_NAME;
}

// verifica mediante HTTP que cada par descubierto responde en /health.
async function inspectPeer(record) {
  const host = record.name.replace(/\.$/, '');
  const peer = {
    pod: host.split('.')[0],
    host,
    port: record.port,
    url: `http://${host}:${record.port}`,
    healthy: false
  };

  try {
    const response = await fetch(`${peer.url}/health`, {
      signal: AbortSignal.timeout(PEER_HEALTH_TIMEOUT_MS)
    });
    peer.healthy = response.ok;
    peer.statusCode = response.status;
  } catch (error) {
    peer.error = error.name === 'TimeoutError' ? 'timeout' : 'unreachable';
  }

  return peer;
}

//consulta _http._tcp.<service> y contacta los pods encontrados, excepto a este mismo.
async function discoverPeers() {
  if (!PEERS_DNS || discoveryRunning) return;
  discoveryRunning = true;

  try {
    const records = await dns.resolveSrv(`_http._tcp.${PEERS_DNS}`);
    const remoteRecords = records.filter((record) => !isThisPod(record));
    const uniqueRecords = [
      ...new Map(remoteRecords.map((record) => [`${record.name}:${record.port}`, record])).values()
    ];

    peersState = {
      serviceDns: PEERS_DNS,
      checkedAt: new Date().toISOString(),
      peers: await Promise.all(uniqueRecords.map(inspectPeer)),
      error: null
    };
  } catch (error) {
    peersState = {
      serviceDns: PEERS_DNS,
      checkedAt: new Date().toISOString(),
      peers: [],
      error: error.code || error.message
    };
  } finally {
    discoveryRunning = false;
  }
}
// === Fin del Código 04 ===

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

  // === Código 05. Endpoint para consultar los pares descubiertos ===
  // Devuelve la lista actual y el estado de salud observado por esta réplica.
  if (req.method === 'GET' && url.pathname === '/api/peers') {
    res.writeHead(200, commonHeaders('application/json; charset=utf-8'));
    return res.end(JSON.stringify({
      pod: POD_NAME,
      podIp: POD_IP,
      discoveryEnabled: Boolean(PEERS_DNS),
      ...peersState
    }));
  }
  // === Fin del Código 05 ===

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
    <!-- === Código 06. Vista de pares descubiertos === -->
    <!-- Muestra los pods que esta réplica encontró y permite actualizar la lista. -->
    <h2>Pares descubiertos</h2>
    <button onclick="actualizarPares()">Actualizar pares</button>
    <pre id="peers">Consultando DNS de Kubernetes...</pre>
    <!-- === Fin del Código 06 === -->
    <pre id="result"></pre>
  </div>
  <script>
    async function incrementar() {
      const response = await fetch('/increment', { method: 'POST' });
      const data = await response.json();
      document.getElementById('result').textContent = JSON.stringify(data, null, 2);
    }
    // === Código 07. Consulta del endpoint de pares ===
    // Actualiza la vista con el resultado que devuelve esta instancia.
    async function actualizarPares() {
      const response = await fetch('/api/peers');
      const data = await response.json();
      document.getElementById('peers').textContent = JSON.stringify(data, null, 2);
    }
    actualizarPares();
    // === Fin del Código 07 ===
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
  console.log(`Distributed App Lab ${APP_VERSION} listening on port ${PORT}`);
  console.log(`Hostname: ${POD_NAME}`);
  // === Código 08. Descubrimiento inicial y periódico ===
  // Consulta DNS al iniciar el servidor y repite la búsqueda en el intervalo configurado.
  if (PEERS_DNS) {
    console.log(`Descubrimiento DNS activo: ${PEERS_DNS}`);
    discoverPeers();
    setInterval(discoverPeers, PEERS_LOOKUP_INTERVAL_MS).unref();
  } else {
    console.log('Descubrimiento DNS desactivado: configure PEERS_DNS para usarlo.');
  }
  // === Fin del Código 08 ===
});

process.on('SIGTERM', () => {
  console.log('SIGTERM recibido. Cerrando servidor de forma controlada...');
  server.close(() => {
    console.log('Servidor cerrado.');
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10000).unref();
});
