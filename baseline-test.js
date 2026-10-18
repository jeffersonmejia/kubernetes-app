
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    scenarios: {
        baseline: {
            executor: 'constant-vus',
            vus: Number(__ENV.VUS || 100),
            duration: '30s',
            // Evita esperar los 30 s predeterminados al cerrar la carga.
            gracefulStop: '2s',
        },
    },

    noConnectionReuse: true,
    noVUConnectionReuse: true,

    thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<250'],
    },
};

// kubectl proxy reenvía las solicitudes al Service de Kubernetes.
const TARGET_URL = __ENV.TARGET_URL ||
    'http://127.0.0.1:8001/api/v1/namespaces/default/services/http:distributed-app-service:80/proxy/api/info';

export default function () {

    const res = http.get(TARGET_URL, { timeout: '5s' });

    check(res, {
        'status is 200': (r) => r.status === 200,
    });

    if (res.status === 200) {

        const data = res.json();

        // Mostrar solo las primeras 2 iteraciones
        // de cada usuario virtual.
        if (__ITER < 2) {

            console.log(
                `VU ${__VU} | ` +
                `Iteration ${__ITER} | ` +
                `Pod: ${data.pod} | ` +
                `Version: ${data.version}`
            );
        }
    }

    sleep(0.1);
}
