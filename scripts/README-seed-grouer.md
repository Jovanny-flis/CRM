# Semilla GROUER (alta automática de prospectos)

El Kanban de la empresa **GROUER** en este CRM recibe leads del portal GROUER (push HTTP). Las rutas inbound **ya existen** (`POST /api/integraciones/grouer/prospectos`, cancelar, GET detalle, proxy PDF). Esta semilla solo deja empresa/robot/canal listos; no vuelve a crear esas rutas.

## 1. Usuario en Firebase Auth (humano)

1. En la consola de Firebase Auth (el mismo proyecto que usa el CRM), crea un usuario técnico:
   - Nombre / display: `Sistema GROUER`
   - Email sugerido: `sistema.grouer@local.invalid` (claramente no operativo)
   - Contraseña: la que elijas; el script de BD genera un `password_hash` aleatorio y **no** inicia sesión por SMTP.
2. Copia el **UID** de ese usuario.
3. Pégalo en `CRM/.env` (nunca en git):

```
GROUER_ROBOT_FIREBASE_UID=<uid de Firebase Auth nuevo; no el operador MAIN>
```

Sin este UID, el script inserta el placeholder `PENDIENTE_PEGAR_UID_FIREBASE` y avisa en stdout. El INSERT de leads usa `usuarios.id`; el auth del CRM exige que `firebase_uid` coincida con Auth.

**No uses el usuario MAIN** (operador humano de prod).

## 2. Local

Requisito: `db/schema.sql` + `db/migrations/schema-v2.sql` aplicados; `CRM/.env` con `DB_*`.

```bash
cd CRM
npm run seed:grouer-local
```

Crea si faltan: empresa `GROUER`, pipeline `GROUER`, etapas **Nuevos** (orden 1) y **corretaje** (orden 2), usuario `Sistema GROUER`, canal `Portal GROUER` (solo esa empresa; **no** entra a `CANALES_RAIZ`). Re-ejecutar no duplica.

Al final imprime `GROUER_EMPRESA_ID=<id>`. Pégalo en `CRM/.env`. No lo subas a git.

Integración local con la API GROUER (esa ya usa el puerto 3000): `PORT=3001` en `CRM/.env`. `GROUER_API_URL=http://127.0.0.1:3000`.

## 3. Producción

**No** crea empresa, pipeline ni etapas (ya existen). Solo robot + canal `Portal GROUER`.

```bash
cd CRM
# GROUER_EMPRESA_ID opcional si ya está en .env; si no, busca nombre_comercial = GROUER
npm run seed:grouer-prod-robot
```

Si no hay empresa GROUER: error y exit 1. El humano pega en el `.env` del VPS el `id` **que ya existe** (`SELECT id FROM empresas WHERE nombre_comercial = 'GROUER'`). No inventar un id nuevo.

## 4. Inbound, PDF y red

- Auth máquina inbound: header `X-Grouer-Token` = `GROUER_CRM_SHARED_TOKEN` (mismo valor en `api/.env` de GROUER).
- Proxy PDF: operador (Firebase) → CRM `GET /api/leads/:id/informe-grouer.pdf` → GROUER `GET /api/analisis-riesgo/:id/informe.pdf` con `X-Crm-Token`. El CRM **no** llama a riesgos.
- CORS: **no** hace falta `grouer.com.mx` en `CORS_ORIGINS` del CRM. El browser del operador llama al CRM; GROUER solo recibe el proxy servidor a servidor.

Red Docker `grouer-crm` (external), **antes** del compose up si no existe. El compose ya está en git; no editarlo solo en el servidor. No `down -v`.

```bash
sudo docker network create grouer-crm
```

## 5. Variables (`CRM/.env`, no en git)

Ver `.env.example`. Valores reales solo en `.env` local o VPS. El humano pega secretos.

Checklist VPS:

| Variable | Valor prod |
|---|---|
| `GROUER_EMPRESA_ID` | Id ya existente (`SELECT` de empresa GROUER); no crear empresa en prod |
| `GROUER_CRM_SHARED_TOKEN` | El mismo secreto que en `api/.env` de GROUER |
| `GROUER_API_URL` | `http://api:3000` (servicio GROUER en `grouer-crm`) |
| `GROUER_ROBOT_FIREBASE_UID` | UID de Auth del user técnico nuevo; **no** el MAIN |

Fallback HTTPS si la red no está: `GROUER_API_URL=https://api.grouer.com.mx`.
