import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 20 },
    { duration: '40s', target: 20 },
    { duration: '10s', target: 0 },
  ],
  gracefulStop: '2s',
  noConnectionReuse: true,
  noVUConnectionReuse: true,

  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
    checks: ['rate>0.99'],
  },
};

const TARGET_URL = __ENV.TARGET_URL ||
  'http://127.0.0.1:8001/api/v1/namespaces/default/services/http:distributed-app-service:80/proxy/api/info';

export default function () {

  const res = http.get(TARGET_URL, { timeout: '5s' });

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
  });

  if (success) {

    const data = res.json();

    // Mostrar una muestra para no saturar la consola
    if (__ITER % 10 === 0) {

      console.log(
        `VU ${__VU} | ` +
        `Iteration ${__ITER} | ` +
        `Pod: ${data.pod} | ` +
        `Version: ${data.version}`
      );
    }
  }

  sleep(0.25);
}
