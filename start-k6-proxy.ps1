$ErrorActionPreference = 'Stop'

# Expone el Service de Kubernetes en localhost:8001 para ejecutar K6 desde Windows.
# Deja esta consola abierta mientras se ejecuta cualquier archivo *-test.js.
kubectl proxy --address=127.0.0.1 --port=8001
