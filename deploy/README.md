# Despliegue con Docker

Requisitos previos:
- Docker y Docker Compose instalados en el VPS.
- Una red externa `traefik-proxy` ya creada, con Traefik corriendo por separado y escuchando en 80/443 con resolución de certificados Let's Encrypt.
- En la raíz del repo: un `.env` (basado en `.env.example`) con las variables del backend, y un `firebase-key.json` (credencial de Firebase Admin, nunca versionado).
- En esta carpeta (`deploy/`): un `.env` (basado en `.env.example`) con las credenciales de la base de datos y las variables `VITE_*` del frontend.

Para desplegar:

```bash
cd deploy
docker network create traefik-proxy   # solo si no existe ya
docker compose up -d --build
```

Esto levanta 3 contenedores: `db` (MariaDB), `backend` (Node/Express en `api.flising.cloud`) y `frontend` (build de Vite servido con Nginx en `flow.flising.cloud`).
