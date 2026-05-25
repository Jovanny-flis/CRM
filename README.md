# CRM

## 1. Descripción general

CRM es el sistema interno para operar el pipeline comercial de forma multiempresa. Centraliza captación de clientes, gestión de leads, configuración de embudos de venta y cotización de arrendamiento financiero.

- Backend Node.js + Express (`index.js`), persistencia con MariaDB/MySQL vía `mysql2` y pool en `db.js`.
- Frontend React + Vite en `frontend/`.
- Autenticación de usuarios con Firebase Auth (cliente) y Firebase Admin (servidor); perfil operativo y roles en base de datos.
- DDL base en `db/schema.sql`; evolución en `db/migrations/schema-v2.sql` (idempotente).

| Módulo             | Descripción |
| ------------------ | ----------- |
| Autenticación      | Inicio de sesión con correo y contraseña vía Firebase; trazo del perfil CRM con `POST /api/login/firebase`. Recuperación de contraseña desde el login mediante `sendPasswordResetEmail` de Firebase. |
| Empresas           | CRUD de empresas (alcance `super_admin` en API). |
| Usuarios y agentes | Alta, edición y baja sincronizada con Firebase Auth; jerarquía por rol y empresa. |
| Pipelines y etapas | Embudos y etapas por empresa. |
| Leads              | Prospectos, canales (`lead_sources`), estatus configurables (`lead_estatus`), tablero Kanban con drag & drop, confirmación al avanzar de etapa, trazabilidad temporal por etapa (`lead_etapas_historial`) y cancelación con motivo. |
| Dashboard          | Resumen de leads, valor y cotizaciones por empresa (con filtro para rol `agente`). |
| Cotizador          | Cálculo de arrendamiento y guardado de cotizaciones con folio secuencial (FL-001…). Soporta tipo **Automotriz** con campos `marca`, `modelo` y `año`. Las cotizaciones pueden vincularse a un lead desde el tablero Kanban; el lead muestra el detalle de la cotización asignada en su modal. El **módulo cotizador en producto es público en la API**: los endpoints bajo `/api/cotizaciones` no exigen `Authorization`. La UI del cotizador en la SPA está detrás del flujo de login como el resto de pantalla principal (ver Roles y permisos). |

---

## 2. Stack tecnológico

### Backend

| Capa | Tecnología | Versión (package.json) | Propósito |
| ---- | ---------- | ---------------------- | --------- |
| Runtime | Node.js | (compatible con el equipo; no fijado en el repo) | Ejecutar la API |
| Framework | express | ^5.2.1 | API REST |
| Base de datos | MySQL / MariaDB | (servidor según entorno) | Persistencia |
| Cliente DB | mysql2 | ^3.22.1 | Pool y consultas |
| Hash | bcrypt | ^6.0.0 | Hash de contraseñas en BD |
| Configuración | dotenv | ^17.4.2 | Variables de entorno |
| Correo | nodemailer | ^8.0.6 | Integración SMTP del backend |
| CORS | cors | ^2.8.6 | Orígenes permitidos desde `CORS_ORIGINS` (lista separada por comas) |
| Firebase Admin | firebase-admin | ^13.8.0 | Verificación de `idToken` y gestión de usuarios en Auth |

### Frontend

| Capa | Tecnología | Versión (package.json) | Propósito |
| ---- | ---------- | ---------------------- | --------- |
| UI | react / react-dom | ^19.2.4 | Interfaz |
| Build | vite | ^8.0.4 | Dev y build |
| Estilos | tailwindcss | ^4.2.2 | Utilidades CSS |
| PostCSS | @tailwindcss/postcss, postcss, autoprefixer | ^4.2.2 / ^8.5.10 / ^10.5.0 | Pipeline |
| Plugins Vite | @tailwindcss/vite, @vitejs/plugin-react | ^4.2.2 / ^6.0.1 | Integración |
| Ruteo | react-router-dom | ^7.14.1 | SPA |
| HTTP | axios | ^1.15.0 | Cliente API |
| Auth cliente | firebase | ^12.12.1 | `signInWithEmailAndPassword`, token, recuperación |
| Iconos | lucide-react | ^1.8.0 | Iconografía |
| Lint | eslint y plugins | ^9.39.4 (frontend) | Calidad estática |

---

## 3. Arquitectura

```text
┌─────────────────────────────────────────────────────────────┐
│  Navegador — React + Vite (frontend/)                       │
│  Rutas protegidas por rol en App.jsx; token Firebase en API │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS/HTTP — Axios (VITE_API_URL)
                             │ Authorization: Bearer <idToken> en rutas protegidas
┌────────────────────────────▼────────────────────────────────┐
│  Express (index.js) + middlewares/authMiddleware.js            │
│  CORS: solo orígenes listados en CORS_ORIGINS                 │
│  verificarToken (Firebase ID token) + revisarRol (rol en BD) │
│  Rutas /api/cotizaciones* sin middleware de token (públicas) │
└──────────────┬──────────────────────────────┬─────────────────┘
               │ mysql2 pool (db.js)            │ Firebase Admin (firebase.js + credencial)
               │                                │ nodemailer (SMTP)
┌──────────────▼──────────────┐    ┌────────────▼──────────────┐
│  MariaDB/MySQL (flising_crm) │    │  Firebase Auth / SMTP     │
└────────────────────────────┘    └───────────────────────────┘
```

---

## 4. Estructura del repositorio

```text
CRM/
├── db.js
├── db/
│   ├── schema.sql
│   ├── seeds/
│   └── migrations/
│       ├── README.md
│       └── schema-v2.sql
├── lib/
│   ├── canales.js
│   ├── estatus-leads.js
│   └── lead-etapas-historial.js
├── eslint.config.mjs
├── firebase.js
├── index.js
├── middlewares/
│   └── authMiddleware.js
├── package.json
├── package-lock.json
├── .env.example
├── .gitignore
├── plan-produccion-crm.md
├── README.md
└── frontend/
    ├── eslint.config.js
    ├── index.html
    ├── package.json
    ├── package-lock.json
    ├── postcss.config.js
    ├── public/
    │   └── icons.svg
    ├── tailwind.config.js
    ├── vite.config.js
    ├── .env.example
    ├── .gitignore
    ├── README.md
    └── src/
        ├── api.js
        ├── App.jsx
        ├── firebase.js
        ├── index.css
        ├── main.jsx
        ├── components/
        │   ├── AdminEstatusLeads.jsx
        │   ├── SelectorCanales.jsx
        │   └── Sidebar.jsx
        ├── layouts/
        │   └── DashboardLayout.jsx
        └── pages/
            ├── AgentesView.jsx
            ├── CotizadorView.jsx
            ├── DashboardView.jsx
            ├── EmpresasView.jsx
            ├── LeadsView.jsx
            ├── LoginView.jsx
            └── PipelinesView.jsx
```

La credencial de Firebase Admin debe proporcionarse como `firebase-key.json` en la raíz (listado en `.gitignore`; no incluir claves en el repositorio).

---

## 5. Requisitos previos

- Node.js y npm instalados (versiones acordadas con el equipo).
- Servidor MySQL o MariaDB.
- Proyecto Firebase (Auth habilitado, aplicación web, cuenta de servicio para Admin SDK).
- Opcional: SMTP para rutas que envían correo desde el backend.

---

## 6. Configuración local

1. Clonar el repositorio y entrar al directorio del proyecto.

2. Instalar dependencias del backend:
   ```bash
   npm install
   ```

3. Colocar la cuenta de servicio de Firebase en `firebase-key.json` (raíz).

4. Instalar dependencias del frontend:
   ```bash
   cd frontend && npm install && cd ..
   ```

5. Variables de entorno:
   - Copiar `.env.example` a `.env` en la raíz y completar `DB_*`, `PORT`, `CORS_ORIGINS` y `EMAIL_*` si se usan las rutas SMTP del backend.
   - Copiar `frontend/.env.example` a `frontend/.env` y completar `VITE_API_URL` y las variables `VITE_FIREBASE_*`.

6. Crear la base ejecutando `db/schema.sql` en el servidor SQL (crea `flising_crm` y tablas).

7. Si la BD ya existía o es instalación que debe incluir canales jerárquicos, estatus de prospectos y trazabilidad de etapas, aplicar la migración unificada (segura de re-ejecutar):
   ```bash
   mysql -h HOST -u USER -p NOMBRE_BD < db/migrations/schema-v2.sql
   ```
   En clientes gráficos (p. ej. DBeaver) usar **Execute SQL Script** (Alt+X), no una sola sentencia con Ctrl+Enter, para que corra el archivo completo incluido `DELIMITER` y `CREATE TABLE`.
   Detalle en `db/migrations/README.md`.

8. Dar de alta usuarios en Firebase Auth y filas en `usuarios` con `firebase_uid` coherente (el alta vía API crea ambos). Para un `super_admin` inicial, seguir el bloque comentado al final de `db/schema.sql` y la consola de Firebase según el procedimiento del equipo.

9. Arrancar el backend:
   ```bash
   node index.js
   ```

10. Arrancar el frontend:
   ```bash
   cd frontend && npm run dev
   ```

11. Por defecto el frontend de desarrollo suele atender en el puerto `5173` y la API en `PORT` (por defecto `3000`). La URL base de la API debe coincidir con `VITE_API_URL`, y el origen del navegador (p. ej. `http://localhost:5173`) debe figurar en `CORS_ORIGINS`.

---

## 7. Variables de entorno

### Raíz (`.env`)

| Variable | Uso |
| -------- | --- |
| `DB_HOST` | Host MySQL/MariaDB |
| `DB_USER` | Usuario |
| `DB_PASSWORD` | Contraseña |
| `DB_NAME` | Base de datos (p. ej. `flising_crm`) |
| `PORT` | Puerto de Express |
| `EMAIL_HOST` | Host SMTP (nodemailer en `index.js`) |
| `EMAIL_PORT` | Puerto SMTP |
| `EMAIL_USER` | Usuario SMTP |
| `EMAIL_PASS` | Contraseña SMTP |
| `CORS_ORIGINS` | Orígenes del navegador autorizados para llamar a la API, separados por comas. Si está vacía o ausente, no se admite ningún origen en peticiones cross-origin. |
| `FRONTEND_BASE_URL` | Base del frontend para enlaces absolutos (documentada en `.env.example`); el código del backend puede seguir usando URLs fijas en algunos flujos (ver Deuda técnica). |

### Frontend (`frontend/.env`)

| Variable | Uso |
| -------- | --- |
| `VITE_API_URL` | Base URL de la API (incluir `/api` si la app así lo espera) |
| `VITE_FIREBASE_API_KEY` | Configuración web Firebase |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender ID |
| `VITE_FIREBASE_APP_ID` | App ID |

---

## 8. Modelo de datos

Relaciones principales:

- `empresas` (1) → (N) `usuarios`, `pipelines`, `lead_sources`, `lead_estatus`
- `pipelines` (1) → (N) `pipeline_stages`
- `pipeline_stages` (1) → (N) `leads`
- `leads` (1) → (N) `lead_etapas_historial` (una fila por etapa alcanzada hacia adelante)
- `pipeline_stages` (1) → (N) `lead_etapas_historial`
- `lead_estatus` (1) → (N) `leads` vía `estatus_id`
- `usuarios` (1) → (N) `leads`, `cotizaciones` (campos opcionales según tabla)
- `leads` (0..1) → (N) `cotizaciones`
- `clientes_globales` (0..1) → (N) `leads` vía `cliente_global_id`

**Extensiones v2** (tras `db/migrations/schema-v2.sql`): `lead_sources.parent_id`; en `leads`: `estatus_id`, `motivo_desactivacion`, `desactivado_at` y columna legada `activo` (solo migración histórica); tabla `lead_estatus` con estatus sistema `activo` / `cancelado` y personalizados por empresa; tabla `lead_etapas_historial` con `alcanzado_at` por par `(lead_id, stage_id)`; en `cotizaciones`: `folio` (AUTO_INCREMENT, identificador visible FL-001…), `nombre_activo`, `marca`, `modelo`, `anio`.

DDL base en `db/schema.sql`:

```sql
CREATE TABLE `empresas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre_comercial` varchar(100) NOT NULL,
  `rfc` varchar(20) DEFAULT NULL,
  `direccion` text DEFAULT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `correo` varchar(100) DEFAULT NULL,
  `color_principal` varchar(7) DEFAULT '#2563eb',
  `color_secundario` varchar(7) DEFAULT '#64748b',
  `logo_url` varchar(255) DEFAULT NULL,
  `plan_suscripcion` enum('gratis','pro','unlimited') DEFAULT 'gratis',
  `fecha_creacion` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `usuarios` (
  `id` varchar(36) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `empresa_id` int(11) DEFAULT NULL,
  `rol` enum('super_admin','admin_empresa','supervisor','agente') DEFAULT 'agente',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `supervisor_id` varchar(36) DEFAULT NULL,
  `firebase_uid` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `fk_supervisor` (`supervisor_id`),
  KEY `fk_usuario_empresa` (`empresa_id`),
  CONSTRAINT `fk_supervisor` FOREIGN KEY (`supervisor_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_usuario_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pipelines` (
  `id` varchar(36) NOT NULL,
  `empresa_id` int(11) DEFAULT NULL,
  `nombre` varchar(100) NOT NULL,
  `clave` varchar(50) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `empresa_id` (`empresa_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pipeline_stages` (
  `id` varchar(36) NOT NULL,
  `pipeline_id` varchar(36) NOT NULL,
  `nombre_etapa` varchar(100) NOT NULL,
  `orden` int(11) NOT NULL,
  `color_hex` varchar(7) DEFAULT '#CCCCCC',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `pipeline_id` (`pipeline_id`),
  CONSTRAINT `pipeline_stages_ibfk_1` FOREIGN KEY (`pipeline_id`) REFERENCES `pipelines` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `clientes_globales` (
  `id` varchar(36) NOT NULL,
  `rfc` varchar(20) DEFAULT NULL,
  `nombre_fiscal` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `rfc` (`rfc`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `lead_sources` (
  `id` varchar(36) NOT NULL,
  `empresa_id` int(11) DEFAULT NULL,
  `nombre` varchar(100) NOT NULL,
  `parent_id` varchar(36) DEFAULT NULL COMMENT 'Canal padre; NULL = canal raíz',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `empresa_id` (`empresa_id`),
  KEY `idx_lead_sources_parent` (`parent_id`),
  CONSTRAINT `fk_lead_sources_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`),
  CONSTRAINT `fk_lead_sources_parent` FOREIGN KEY (`parent_id`) REFERENCES `lead_sources` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `leads` (
  `id` varchar(36) NOT NULL,
  `empresa_id` int(11) DEFAULT NULL,
  `usuario_id` varchar(36) NOT NULL,
  `stage_id` varchar(36) NOT NULL,
  `cliente_global_id` varchar(36) DEFAULT NULL,
  `nombre` varchar(150) NOT NULL,
  `correo` varchar(150) DEFAULT NULL,
  `telefono` varchar(50) DEFAULT NULL,
  `valor` decimal(10,2) DEFAULT 0.00,
  `medio` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `empresa_id` (`empresa_id`),
  KEY `usuario_id` (`usuario_id`),
  KEY `stage_id` (`stage_id`),
  KEY `cliente_global_id` (`cliente_global_id`),
  CONSTRAINT `leads_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `leads_ibfk_3` FOREIGN KEY (`stage_id`) REFERENCES `pipeline_stages` (`id`),
  CONSTRAINT `leads_ibfk_4` FOREIGN KEY (`cliente_global_id`) REFERENCES `clientes_globales` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cotizaciones` (
  `id` varchar(36) NOT NULL,
  `folio` int unsigned NOT NULL AUTO_INCREMENT,  -- identificador visible FL-001…; añadido en schema-v2
  `empresa_id` int(11) NOT NULL,
  `lead_id` varchar(36) DEFAULT NULL,
  `usuario_id` varchar(36) DEFAULT NULL,
  `tipo_activo` varchar(50) NOT NULL,
  `nombre_activo` varchar(200) DEFAULT NULL,     -- descripción libre del bien; añadido en schema-v2
  `marca` varchar(100) DEFAULT NULL,             -- solo tipo Automotriz; añadido en schema-v2
  `modelo` varchar(100) DEFAULT NULL,            -- solo tipo Automotriz; añadido en schema-v2
  `anio` int DEFAULT NULL,                       -- solo tipo Automotriz; añadido en schema-v2
  `valor_activo` decimal(12,2) NOT NULL,
  `plazo` int(11) NOT NULL,
  `tipo_renta` varchar(20) NOT NULL,
  `porcentaje_vr` decimal(5,2) NOT NULL,
  `vr_calculado` decimal(12,2) NOT NULL,
  `pago_inicial` decimal(12,2) NOT NULL,
  `renta_mensual_sin_iva` decimal(12,2) NOT NULL,
  `renta_mensual_con_iva` decimal(12,2) NOT NULL,
  `fecha_creacion` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `folio` (`folio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 9. Rutas de la API

Prefijo efectivo: las rutas siguientes están definidas en `index.js` como `/api/...`. La base pública debe coincidir con cómo se configure `VITE_API_URL` (por ejemplo `http://localhost:3000/api`).

### Autenticación y puente CRM

| Método | Endpoint | Protección | Descripción |
| ------ | -------- | ---------- | ----------- |
| POST | `/login/firebase` | Ninguna | Recibe `uid` y `email`; responde perfil de `usuarios` y vincula `firebase_uid` si faltaba. |

### Empresas (`verificarToken` + `revisarRol(['super_admin'])`)

| Método | Endpoint | Notas |
| ------ | -------- | ----- |
| GET | `/empresas` | Listado global |
| POST | `/empresas` | Semilla catálogo raíz de canales (`sembrarCanalesDefaultEmpresa`) |
| PUT | `/empresas/:id` | |
| DELETE | `/empresas/:id` | |

### Usuarios

| Método | Endpoint | Roles permitidos (tras token) | Aislamiento por empresa |
| ------ | -------- | ----------------------------- | ----------------------- |
| GET | `/usuarios` | `super_admin` | N/A (acceso global) |
| GET | `/usuarios/empresa/:empresa_id` | `super_admin`, `supervisor`, `admin_empresa`, `agente` | `validarEmpresaParam` |
| POST | `/usuarios` | `super_admin`, `supervisor`, `admin_empresa` | `empresa_id` del body debe coincidir con el del usuario autenticado; solo `super_admin` puede crear `super_admin` |
| PUT | `/usuarios/:id` | `super_admin`, `supervisor`, `admin_empresa` | El usuario objetivo y el `empresa_id` enviado deben pertenecer a la empresa del usuario autenticado; solo `super_admin` puede elevar a `super_admin` |
| DELETE | `/usuarios/:id` | `super_admin`, `admin_empresa` | El usuario objetivo debe pertenecer a la empresa del usuario autenticado; nadie puede borrarse a sí mismo |

### Pipelines y etapas (`verificarToken` + roles indicados)

| Método | Endpoint | Roles | Aislamiento por empresa |
| ------ | -------- | ----- | ----------------------- |
| GET | `/pipelines/:empresa_id` | `super_admin`, `supervisor`, `admin_empresa`, `agente` | `validarEmpresaParam` |
| POST | `/pipelines` | mismos | `empresa_id` del body debe coincidir con el del usuario |
| PUT | `/pipelines/:id` | mismos | `validarRecursoEmpresa` (empresa del pipeline) |
| GET | `/etapas/:pipeline_id` | mismos | `validarRecursoEmpresa` (empresa del pipeline) |
| POST | `/etapas` | mismos | El pipeline objetivo debe pertenecer a la empresa del usuario |
| PUT | `/etapas/:id` | mismos | `validarRecursoEmpresa` (vía JOIN con `pipelines`) |

### Leads y canales (API `medios`)

En la interfaz la sección se llama **Canales**; en base de datos y API se mantiene la nomenclatura histórica (`lead_sources`, columna `leads.medio`, rutas `/api/medios`).

| Método | Endpoint | Roles | Aislamiento por empresa |
| ------ | -------- | ----- | ----------------------- |
| GET | `/leads/:empresa_id` | `super_admin`, `supervisor`, `admin_empresa`, `agente` | `validarEmpresaParam`; incluye `etapas_alcanzadas` (IDs de etapas con timestamp) y datos de la cotización vinculada (`cotizacion_id`, `cotizacion_folio`, `cotizacion_marca`, etc.) |
| POST | `/leads` | mismos | `empresa_id` del body debe coincidir con el del usuario; registra timestamp de etapa inicial |
| PUT | `/leads/:id` | mismos | `validarRecursoEmpresa` (empresa del lead) |
| PUT | `/leads/:id/etapa` | mismos | `validarRecursoEmpresa`; mueve en el embudo y aplica reglas de `lead_etapas_historial` |
| PUT | `/leads/:lead_id/vincular-cotizacion` | Ninguna (pública) | Desvincula cualquier cotización previa del lead y asigna la nueva; la cotización debe estar libre (`lead_id IS NULL`) |
| GET | `/estatus-leads/:empresa_id` | mismos | Catálogo por empresa; semilla `activo` / `cancelado` |
| POST | `/estatus-leads` | `super_admin`, `admin_empresa` | Alta de estatus personalizado |
| PUT | `/estatus-leads/:id` | mismos | Renombrar / color / flags (sistema: reglas fijas) |
| PUT | `/estatus-leads/reordenar` | mismos | Orden de estatus intermedios |
| DELETE | `/estatus-leads/:id` | mismos | Reasigna leads afectados a `activo` |
| GET | `/medios/:empresa_id` | mismos | `validarEmpresaParam`; solo lista canales (sin re-sembrar) |
| POST | `/medios` | mismos | `empresa_id` del body; cualquier usuario autenticado puede CRUD |
| PUT | `/medios/:id` | mismos | `validarRecursoEmpresa` (empresa del canal) |
| DELETE | `/medios/:id` | mismos | `validarRecursoEmpresa`; no modifica `leads.medio` histórico |

**Catálogo de canales (`lead_sources`):**

- En UI la sección se llama **Canales**; en BD/API se mantiene `lead_sources`, columna `leads.medio` y rutas `/api/medios`.
- Jerarquía opcional con `parent_id` (subcanales). Al eliminar un canal padre, sus subcanales se eliminan en cascada (`ON DELETE CASCADE`).
- El valor persistido en el lead es el **nombre** del canal o subcanal elegido (`leads.medio`), no el UUID del catálogo. Eliminar un canal del catálogo no altera el texto ya guardado en leads.
- **Default:** `Contacto directo` (`MEDIO_DEFAULT` en `lib/canales.js` y `SelectorCanales.jsx`). Al crear/editar un lead sin selección explícita se persiste ese valor.
- **Catálogo raíz estándar** (9 canales, iguales para todas las empresas): Referidos de clientes, Marketing digital, Socios, Agentes, Eventos empresariales, Concesionarios, Webinars, Contacto directo, Cotizador. Definido en `lib/canales.js`.
- **Subcanales:** no se siembran en migración ni en semilla automática del backend. Cada empresa los crea desde el front:
  - Botón **Nuevo** (pie del combobox): canal raíz.
  - Menú ⋮ de un canal raíz → **Nuevo subcanal**: alta bajo ese padre.
  - Menú ⋮ → Editar / Eliminar en cualquier canal o subcanal.
- **Semilla en runtime:** al crear una empresa (`POST /api/empresas`) se insertan las raíces faltantes vía `sembrarCanalesDefaultEmpresa` en `lib/canales.js`. `GET /api/medios/:empresa_id` **solo lista** el catálogo existente (no re-sembrar). Empresas antiguas dependen de `schema-v2.sql` o del alta de empresa para tener el catálogo raíz.
- **UI:** `frontend/src/components/SelectorCanales.jsx` — combobox con listas anidadas (flecha `>` por canal con hijos), portal flotante para scroll fuera del modal, CRUD inline.

**Migración SQL (estado actual del repo)**

| Archivo | Uso |
| ------- | --- |
| `db/schema.sql` | Instalación nueva: esquema base completo. **No modificar.** |
| `db/migrations/schema-v2.sql` | **Única migración acumulada**, idempotente. Aplicar sobre BD existente después de `schema.sql`. Incluye canales jerárquicos, catálogo raíz, estatus de prospectos, trazabilidad de etapas, datos iniciales y columnas del cotizador (`folio`, `nombre_activo`, `marca`, `modelo`, `anio`). |
| `db/migrations/README.md` | Instrucciones y tabla de registro `_crm_migraciones`. |

```bash
mysql -h HOST -u USER -p NOMBRE_BD < db/migrations/schema-v2.sql
```

**Qué hace `schema-v2.sql` (resumen):**

| Bloque | Detalle |
| ------ | ------- |
| `leads` | `activo` (legado), `motivo_desactivacion`, `desactivado_at`, `estatus_id` |
| `lead_sources` | `parent_id` + FK; limpieza de raíces no estándar e inserción del catálogo de 9 canales por empresa |
| `leads.medio` | Normalización única a `Contacto directo` (no se repite si ya consta en `_crm_migraciones`) |
| `lead_estatus` | Tabla + semilla `activo` / `cancelado` por empresa; asigna `estatus_id` según `activo` histórico |
| `lead_etapas_historial` | Tabla con `UNIQUE (lead_id, stage_id)` y `alcanzado_at`; sin backfill en leads existentes |
| `cotizaciones` | `folio` (INT AUTO_INCREMENT, clave UNIQUE), `nombre_activo`, `marca`, `modelo`, `anio` |

**Complemento en runtime:** `lib/canales.js` (semilla al crear empresa), `lib/estatus-leads.js` (catálogo de estatus en `GET` de leads/estatus) y `lib/lead-etapas-historial.js` (timestamps al crear lead y al mover de etapa).

**Estatus de prospectos:** catálogo por empresa en Pipelines (sección bajo el embudo, componente `AdminEstatusLeads.jsx`). Sistema: `activo` (inicial, suma, mueve) y `cancelado` (oculto en suma, bloqueado, motivo obligatorio). Los personalizados definen color, suma y movilidad. La app usa `estatus_id`; no el booleano `activo`.

**Trazabilidad de etapas (`lead_etapas_historial`):**

- Al **crear** un lead con `stage_id`, se registra la etapa inicial (`registrarEtapaInicial`).
- Al **avanzar** en el embudo (`PUT /leads/:id/etapa`, orden destino > origen), se insertan timestamps solo para etapas intermedias y destino que aún no tengan registro; si se **salta** etapas, comparten el mismo `alcanzado_at`.
- Al **retroceder**, solo se actualiza `leads.stage_id`; no se crean ni modifican filas del historial.
- Al **re-avanzar** hacia etapas ya registradas, no hay nuevos timestamps (la restricción `UNIQUE` impide duplicados).
- Leads existentes antes del deploy **no** reciben backfill; el historial empieza con movimientos posteriores a la migración (y con leads nuevos desde el alta).
- **UI (`LeadsView.jsx`):** popup de confirmación solo si el avance cubriría al menos una etapa sin timestamp; retroceso y re-avance sobre etapas ya registradas mueven sin popup. Soltar en la misma columna se ignora.

Los subcanales y estatus personalizados se gestionan desde el front tras la migración.

### Cotizador (API pública por decisión de producto)

Sin `verificarToken`. Cualquier cliente que conozca la URL puede crear o leer cotizaciones según estos contratos; el filtrado por `rol`/`usuario_id` en listados depende de query params enviados por el cliente.

| Método | Endpoint | Notas |
| ------ | -------- | ----- |
| POST | `/cotizaciones` | Crea cotización; acepta `folio` (AUTO_INCREMENT), `nombre_activo`, `marca`, `modelo`, `anio` además de los campos financieros |
| GET | `/cotizaciones/lead/:lead_id` | Historial de cotizaciones de un lead |
| GET | `/cotizaciones/empresa/:empresa_id` | Listado por empresa; filtra por `usuario_id` si `rol=agente` en query |
| GET | `/cotizaciones/buscar/:empresa_id` | Busca cotizaciones **sin lead asignado** (`lead_id IS NULL`); query param `termino` filtra por folio, nombre o tipo de activo. Usado por el buscador inteligente del Kanban |
| PUT | `/cotizaciones/:id/vincular-lead` | Vincula una cotización a un lead por su ID |

### Dashboard

| Método | Endpoint | Roles | Aislamiento por empresa |
| ------ | -------- | ----- | ----------------------- |
| GET | `/dashboard/:empresa_id` | `super_admin`, `admin_empresa`, `supervisor`, `agente` | `validarEmpresaParam` |

El backend ignora la query string `usuario_id`/`rol`: si el usuario autenticado tiene rol `agente`, el dashboard se filtra contra `req.usuarioCRM.id` para evitar suplantación entre agentes.

---

## 10. Roles y permisos

Roles en base de datos: `super_admin`, `admin_empresa`, `supervisor`, `agente`.

**Backend:** Cadena de middlewares en `middlewares/authMiddleware.js`:

1. `verificarToken`: valida la firma del Firebase ID token y carga el perfil CRM (`id`, `rol`, `empresa_id`) en `req.usuarioCRM` con una sola consulta a BD reutilizable por el resto de la cadena.
2. `revisarRol(rolesPermitidos)`: compara `req.usuarioCRM.rol` contra la lista permitida (sin tocar BD).
3. `validarEmpresaParam(paramName)`: para rutas con `:empresa_id` en URL, exige que coincida con el `empresa_id` del usuario autenticado. `super_admin` pasa siempre.
4. `validarRecursoEmpresa(sql, paramName)`: para rutas con `:id` (lead, pipeline, etapa, etc.), ejecuta `sql` para obtener el `empresa_id` real del recurso y lo compara contra el del usuario. `super_admin` pasa siempre.

Endpoints que reciben `empresa_id` en el body (`POST /api/leads`, `POST /api/pipelines`, `POST /api/usuarios`, `PUT /api/usuarios/:id`) validan en línea con el helper `puedeOperarEnEmpresa` para impedir crear/editar recursos en empresas ajenas.

**Frontend:** `App.jsx` envuelve rutas en `RutaProtegida` según `usuario.rol`. `Sidebar.jsx` filtra ítems de menú por rol. Tras el login, el perfil se guarda en `localStorage` bajo `usuarioCRM` para hidratar UI y parámetros de consulta; las peticiones autenticadas añaden `Authorization: Bearer` con el token de Firebase vía interceptor en `api.js`. **Estas restricciones de UI son meramente cosméticas**: la autoridad real está en el backend.

**Cotizador:** Los endpoints REST del cotizador no requieren autenticación (módulo público en API por decisión de producto). La aplicación web sigue mostrando el cotizador solo a usuarios que hayan iniciado sesión en la SPA, pero la API no refuerza el mismo límite en esas rutas.

---

## 11. Deuda técnica

| Área | Problema |
| ---- | -------- |
| Autorización Firebase | No se usan custom claims en el token; el rol y `empresa_id` se leen de la BD en `verificarToken` (una sola query reutilizada por la cadena). Optimización pendiente, no es un riesgo de seguridad. |
| Arquitectura backend | Toda la API en `index.js` sin capas separadas (rutas/controladores/servicios). |
| Calidad | ESLint con múltiples errores en `frontend/` y en `index.js`. |
| Calidad | Sin tests automatizados en scripts del repo. |
| Operación | Sin pipeline de CI/CD en el repositorio. |
| UX / datos | Dashboard y vistas asumen `empresa_id` para usuarios de empresa; perfiles sin empresa pueden tener comportamiento limitado. |

---

## 12. Próximos pasos sugeridos

- Valorar custom claims de Firebase si conviene reducir la consulta de perfil que hace `verificarToken` (hoy 1 query/request).
- Introducir pipeline de CI/CD; incluir `db/migrations/schema-v2.sql` en el despliegue de BD existentes.
- Modularizar el backend (rutas, controladores, servicios).
- Dejar ESLint sin errores y mantener reglas en CI.
- Añadir pruebas automatizadas y un pipeline mínimo de integración continua.
- Logging estructurado y manejo centralizado de errores.
- Pantalla de consulta del historial temporal de etapas por lead (`lead_etapas_historial`), cuando el producto lo requiera (hoy los datos se persisten en BD sin UI).
