import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    // Varias VU y conexiones nuevas permiten que el Service reparta solicitudes
    // entre las tres réplicas del Deployment.
    vus: 3,
    duration: '10s',
    noConnectionReuse: true,
    noVUConnectionReuse: true,

    thresholds: {
        http_req_failed: ['rate<0.01'],
        checks: ['rate>0.99'],
    },
};

// Por defecto K6 se ejecuta desde Windows a través de kubectl proxy.
// El Job interno define TARGET_URL para consultar el DNS propio del clúster.
const TARGET_URL = __ENV.TARGET_URL ||
    'http://127.0.0.1:8001/api/v1/namespaces/default/services/http:distributed-app-service:80/proxy/api/info';

export default function () {

    const res = http.get(TARGET_URL);

    check(res, {
        'status is 200': (r) => r.status === 200,
        'response contains version':
            (r) => r.body.includes('version'),
    });

    if (res.status === 200) {

        const data = res.json();

        console.log(
            `VU ${__VU} | ` +
            `Iteration ${__ITER} | ` +
            `Pod: ${data.pod} | ` +
            `Version: ${data.version}`
        );
    }

    sleep(1);
}
