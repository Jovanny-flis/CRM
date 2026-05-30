# CRM

## 1. Descripción general

CRM es el sistema interno para operar el pipeline comercial de forma multiempresa. Centraliza captación de clientes, gestión de leads, configuración de embudos de venta y cotización de arrendamiento financiero.

- Backend Node.js + Express (`index.js`), persistencia con MariaDB/MySQL vía `mysql2` y pool en `db.js`.
- Frontend React + Vite en `frontend/`.
- Autenticación de usuarios con Firebase Auth (cliente) y Firebase Admin (servidor); perfil operativo y roles en base de datos.
- DDL base en `db/schema.sql`; evolución en `db/migrations/schema-v2.sql` (idempotente).

| Módulo             | Descripción |
| ------------------ | ----------- |
| Autenticación      | Inicio de sesión con correo y contraseña vía Firebase; trazo del perfil CRM con `POST /api/login/firebase`. Recuperación de contraseña desde el login mediante `sendPasswordResetEmail` de Firebase. **Sesión en la SPA:** expiración por inactividad (20 min), aviso 2 min antes, una sola pestaña activa por usuario y mensajes en el login (ver [Gestión de sesión](#gestión-de-sesión-frontend)). |
| Empresas           | CRUD de empresas (alcance `super_admin` en API). |
| Usuarios y agentes | Alta, edición y baja sincronizada con Firebase Auth; jerarquía por rol y empresa. |
| Pipelines y etapas | Embudos y etapas por empresa; catálogo de **estatus** de prospectos (flags de suma, movilidad y **bloquea folio asignado**). |
| Leads              | **Oportunidades** en el embudo (tabla `leads`): varias por empresa con el **mismo nombre** de cliente; en el Kanban se distinguen por etapa, estatus, folio activo y demás datos de la tarjeta. Canales (`lead_sources`), estatus (`lead_estatus`), **tipo de persona** opcional (`PM`, `PF`, `PFAE`), drag & drop, confirmación al avanzar de etapa, `lead_etapas_historial` y cancelación con motivo. **Un folio activo por lead** en tablero; **Cambiar cotización** en el modal sustituye el folio visible y libera los demás (`lead_id` NULL), salvo **folio congelado** (`bloquea_cotizacion` en el estatus o estatus **cancelado**): sin vincular, sin cambiar ni mover el folio a otro lead; **Replicar cotización** sigue permitido. |
| Dashboard          | Resumen de leads, valor y cotizaciones por empresa (con filtro para rol `agente`). |
| Cotizador          | Cálculo y folio secuencial (FL-001…). **Automotriz** / **Otro** (GPS y trámites solo en Automotriz). Parámetros §10 en BD para **réplica idéntica**. **Guardar DB** abre modal: solo cotización, **nueva oportunidad** o **vincular a existente** (`ModalDestinoProspecto`; excluye oportunidades con folio congelado). El select del formulario lista **un nombre por persona** y solo **copia** nombre/tipo de persona; no vincula al guardar. **Réplica** sin nombre ni prospecto; el operador completa y decide al guardar o desde el historial (menú ⋮). **Generar PDF** y guardado exigen obligatorios y sin errores de cálculo. API `/api/cotizaciones` pública por producto; la SPA exige login. |

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
│  Rutas por rol; token Firebase en API; timeout inactividad  │
│  y una sola pestaña (lib/sesion.js, useGestionSesion)       │
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
│   ├── cotizacion-guardar.js
│   ├── cotizacion-vinculo.js
│   ├── estatus-leads.js
│   ├── lead-etapas-historial.js
│   └── leads.js
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
    │   ├── cotizacion-activos/
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
        │   ├── AvisoSesionModal.jsx
        │   ├── ModalDestinoProspecto.jsx
        │   ├── SelectorCanales.jsx
        │   └── Sidebar.jsx
        ├── constants/
        │   └── tipoPersona.js
        ├── hooks/
        │   └── useGestionSesion.js
        ├── layouts/
        │   └── DashboardLayout.jsx
        ├── lib/
        │   ├── cotizacionFormulario.js
        │   ├── destinoProspectoCotizacion.js
        │   └── sesion.js
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

7. Si la BD ya existía o es instalación que debe incluir canales jerárquicos, estatus de prospectos (incl. **`bloquea_cotizacion`**), trazabilidad de etapas, `tipo_persona` en leads y columnas del cotizador (activo automotriz, parámetros §10 para réplica, etc.), aplicar la migración unificada (segura de re-ejecutar):
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
- `leads` (1) → (N) filas en `cotizaciones`, pero en **producto** solo **una cotización activa** por lead a la vez (`lead_id` en esa fila; las demás quedan libres tras vincular)
- `clientes_globales` (0..1) → (N) `leads` vía `cliente_global_id` (previsto para unificar **personas** por RFC; no unifica leads ni cotizaciones)

**Conceptos en la aplicación**

| Concepto | Tabla / campo | Comportamiento |
| -------- | ------------- | -------------- |
| Persona / cliente | Nombre en `leads.nombre` hoy; a futuro `clientes_globales` + RFC | Puede haber **varios leads** (oportunidades) con el mismo nombre. |
| Oportunidad (prospecto) | `leads` | Un trato en el embudo: etapa, estatus, agente, historial de etapas. |
| Cotización | `cotizaciones` | Folio con parámetros financieros; puede existir sin lead (`lead_id` NULL). |
| Cotización **activa** del lead | Única fila con `lead_id` = ese lead | La que el operador eligió al vincular; el tablero y `GET /leads` muestran esa. Al vincular otra, las previas del mismo lead se **liberan**, salvo **folio congelado** (ver estatus). |
| Folio **congelado** | `lead_estatus.bloquea_cotizacion` o `codigo = cancelado` | Sin vincular cotización al lead, sin cambiar la activa ni reasignar ese folio a otro lead. Aplica de forma retroactiva a leads ya en ese estatus. **Replicar** genera folio nuevo sin alterar el vínculo original. |

**Extensiones v2** (tras `db/migrations/schema-v2.sql`): `lead_sources.parent_id`; en `leads`: `estatus_id`, `tipo_persona` (`PM` | `PF` | `PFAE`, opcional), `motivo_desactivacion`, `desactivado_at` y columna legada `activo` (solo migración histórica); tabla `lead_estatus` con estatus sistema `activo` / `cancelado` y personalizados por empresa (`incluir_en_suma`, `permite_mover`, **`bloquea_cotizacion`**); tabla `lead_etapas_historial` con `alcanzado_at` por par `(lead_id, stage_id)`; en `cotizaciones`: `folio` (AUTO_INCREMENT, FL-001…), `nombre_activo`, `marca`, `modelo`, `version`, `anio` (solo Automotriz), `tipo_arrendamiento` y parámetros del cotizador (`tasa_anual`, pago inicial/residual/comisión/seguro/GPS/servicios y flags `is_*`) para réplica y guardado fiel.

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
  `version` varchar(100) DEFAULT NULL,           -- solo tipo Automotriz; añadido en schema-v2
  `anio` int DEFAULT NULL,                       -- solo Automotriz; NULL en Otro; añadido en schema-v2
  -- Parámetros del formulario (schema-v2 §10): tipo_arrendamiento, tasa_anual,
  -- pago_inicial_valor, is_pago_inicial_pct, residual_valor, is_residual_pct,
  -- comision_valor, is_comision_pct, seguro_valor, is_seguro_contado, is_seguro_anual,
  -- gps_valor, is_gps_contado, servicios_valor (GPS/trámites en 0 si no es Automotriz)
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
| GET | `/leads/:empresa_id` | `super_admin`, `supervisor`, `admin_empresa`, `agente` | `validarEmpresaParam`; incluye `tipo_persona`, `nombre_etapa` (etapa actual vía `pipeline_stages`), estatus del catálogo (`estatus_bloquea_cotizacion`, `estatus_permite_mover`, etc.) y datos de la **cotización activa** (única con `lead_id` en ese prospecto; join por folio más reciente entre las vinculadas). Campos `cotizacion_*` en la respuesta. |
| POST | `/leads` | mismos | `empresa_id` del body debe coincidir con el del usuario; acepta `tipo_persona` opcional (`PM`, `PF`, `PFAE`); registra timestamp de etapa inicial |
| PUT | `/leads/:id` | mismos | `validarRecursoEmpresa` (empresa del lead); acepta `tipo_persona` opcional |
| PUT | `/leads/:id/etapa` | mismos | `validarRecursoEmpresa`; mueve en el embudo y aplica reglas de `lead_etapas_historial` |
| PUT | `/leads/:lead_id/vincular-cotizacion` | Ninguna (pública) | **Cambiar cotización** en el tablero: deja un solo folio activo en el lead (`activarCotizacionEnLead`); las demás cotizaciones de ese lead quedan con `lead_id` NULL. Sincroniza `leads.valor` desde la cotización elegida. Rechaza destino u origen con **folio congelado** (`assertPuedeVincularCotizacionEnLead`). |
| GET | `/estatus-leads/:empresa_id` | mismos | Catálogo por empresa; semilla `activo` / `cancelado` |
| POST | `/estatus-leads` | `super_admin`, `admin_empresa` | Alta de estatus personalizado (`incluir_en_suma`, `permite_mover`, `bloquea_cotizacion`) |
| PUT | `/estatus-leads/:id` | mismos | Renombrar / color / flags personalizados; sistema: `activo` solo nombre/color; `cancelado` solo nombre (siempre congela folio) |
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
| `db/migrations/schema-v2.sql` | **Única migración acumulada**, idempotente. Incluye canales, estatus (`bloquea_cotizacion`), historial de etapas, columnas del cotizador (`folio`, activo automotriz, **§10 parámetros del formulario**) y `leads.tipo_persona`. |
| `db/migrations/README.md` | Instrucciones y tabla de registro `_crm_migraciones`. |

```bash
mysql -h HOST -u USER -p NOMBRE_BD < db/migrations/schema-v2.sql
```

**Qué hace `schema-v2.sql` (resumen):**

| Bloque | Detalle |
| ------ | ------- |
| `leads` | `activo` (legado), `motivo_desactivacion`, `desactivado_at`, `estatus_id`, `tipo_persona` |
| `lead_sources` | `parent_id` + FK; limpieza de raíces no estándar e inserción del catálogo de 9 canales por empresa |
| `leads.medio` | Normalización única a `Contacto directo` (no se repite si ya consta en `_crm_migraciones`) |
| `lead_estatus` | Tabla + semilla `activo` / `cancelado` por empresa; columnas `incluir_en_suma`, `permite_mover`, **`bloquea_cotizacion`**; `cancelado` con `bloquea_cotizacion = 1`; asigna `estatus_id` según `activo` histórico |
| `lead_etapas_historial` | Tabla con `UNIQUE (lead_id, stage_id)` y `alcanzado_at`; sin backfill en leads existentes |
| `cotizaciones` | `folio`, `nombre_activo`, `marca`, `modelo`, `version`, `anio` |
| `cotizaciones` (§10) | `tipo_arrendamiento`, `tasa_anual`, `pago_inicial_valor`, `is_pago_inicial_pct`, `residual_valor`, `is_residual_pct`, `comision_valor`, `is_comision_pct`, `seguro_valor`, `is_seguro_contado`, `is_seguro_anual`, `gps_valor`, `is_gps_contado`, `servicios_valor` |

**Complemento en runtime:** `lib/canales.js`, `lib/estatus-leads.js`, `lib/lead-etapas-historial.js`, `lib/leads.js`, `lib/cotizacion-guardar.js`, `lib/cotizacion-vinculo.js` (`assertPuedeVincularCotizacionEnLead`, `leadBloqueaCotizacion`) y en `index.js` la función `activarCotizacionEnLead` (un folio activo por lead al vincular, con validación de folio congelado).

**Tipo de persona del prospecto (`leads.tipo_persona`):**

- Valores permitidos: `PM` (persona moral), `PF` (persona física), `PFAE` (persona física con actividad empresarial). Campo **opcional**; leads existentes quedan en `NULL` hasta que un operador lo indique.
- Captura en alta/edición de prospectos (`LeadsView.jsx`), en el cotizador al crear o vincular un lead (`CotizadorView.jsx`) y constantes compartidas en `frontend/src/constants/tipoPersona.js`.
- En el tablero Kanban se muestra un badge con la abreviatura (entre el folio de cotización y el estatus del lead) solo cuando tiene valor.

**Estatus de prospectos:** catálogo por empresa en Pipelines (sección bajo el embudo, componente `AdminEstatusLeads.jsx`). Sistema: `activo` (inicial, suma, mueve, sin congelar folio) y `cancelado` (oculto en suma, bloqueado en embudo, **folio congelado** siempre, motivo obligatorio). Los personalizados definen color, suma, movilidad y opcionalmente **Bloquea folio asignado** (`bloquea_cotizacion`): impide cualquier vinculación o cambio de cotización en leads con ese estatus (retroactivo). La app usa `estatus_id`; no el booleano `activo`.

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
| POST | `/cotizaciones` | Crea cotización con **folio nuevo** (AUTO_INCREMENT). Body según §10 en `lib/cotizacion-guardar.js`. Si el body trae `lead_id`, tras el INSERT se ejecuta `activarCotizacionEnLead` (un folio activo; libera los demás del mismo lead; falla si el lead tiene folio congelado). La SPA suele crear el folio sin `lead_id` y vincular después con `PUT …/vincular-lead`. |
| GET | `/cotizaciones/lead/:lead_id` | Cotizaciones con `lead_id` = ese prospecto (en la práctica, el folio activo; las liberadas no aparecen porque tienen `lead_id` NULL) |
| GET | `/cotizaciones/empresa/:empresa_id` | Listado por empresa; filtra por `usuario_id` si `rol=agente` en query |
| GET | `/cotizaciones/buscar/:empresa_id` | Cotizaciones **libres** (`lead_id IS NULL`); `termino` filtra folio/activo (buscador del modal de lead) |
| GET | `/cotizaciones/:id` | Detalle completo (réplica desde leads u otras pantallas). Definida **después** de rutas con segmento fijo (`lead`, `empresa`, `buscar`) |
| PUT | `/cotizaciones/:id/vincular-lead` | Asigna la cotización al lead como **folio activo** (no crea folio nuevo); libera las demás del mismo lead y actualiza `leads.valor`. Rechaza destino u origen con folio congelado. |

**Tipos de arrendamiento y campos (`CotizadorView.jsx`, `frontend/src/lib/cotizacionFormulario.js`):**

| Concepto | Automotriz | Otro |
| -------- | ---------- | ---- |
| Activo | `marca`, `modelo`, `version`, `año` obligatorios | `nombre_activo` obligatorio |
| `tipo_activo` en BD | Tipo de vehículo (Sedan, SUV, …) | Literal `Otro` |
| `anio` en BD | Entero o NULL si vacío | Siempre NULL |
| GPS / trámites e impuestos | Editables; entran en renta y pago inicial | No aplican: UI deshabilitada, valores vacíos, cálculo y guardado en **0** |
| Seguro | Editable | Editable |
| Residual máximo | Tabla por tipo de vehículo y plazo | Tabla `tablaResidualOtro` |

Al cambiar el select de **Automotriz → Otro**, el front limpia marca/modelo/versión/año, GPS y trámites.

**Réplica de cotización:**

- **Historial** (`CotizadorView`): menú ⋮ por fila → *Replicar cotización* (también con prospecto ya vinculado).
- **Modal de lead** (`LeadsView`): enlace *Replicar cotización* cuando hay cotización asignada (también en leads cancelados o con folio congelado); navega a `/cotizador` con `replicarCotizacionId`. *Cambiar cotización* oculto si el estatus congela el folio.
- `cotizacionAFormData(..., { paraReplicar: true })`: mismos parámetros financieros y de activo; **`nombre_cliente`**, `tipo_persona` y prospecto vacíos (el operador los asigna).
- Al **Guardar DB** tras replicar: mismo modal que un alta normal (folio nuevo; la cotización origen no se modifica).
- Cotizaciones **antes** de la migración §10 pueden replicarse con defaults parciales.

**Guardar y prospecto (`ModalDestinoProspecto`):**

- **Guardar DB** / **Generar PDF:** deshabilitados si hay errores de cálculo o faltan obligatorios (incluido nombre de cliente).
- Flujo **Guardar DB:** (1) `POST /cotizaciones` sin `lead_id`; (2) según elección del modal, opcionalmente `POST /leads` (nueva oportunidad) y `PUT /cotizaciones/:id/vincular-lead`.
- Opciones del modal:
  - **Solo guardar cotización** — folio en historial; sin tarjeta en el tablero hasta vincular después.
  - **Nueva oportunidad** — `POST /leads` siempre crea fila nueva (aunque el nombre ya exista; aviso si hay homónimos).
  - **Vincular a oportunidad existente** — selector con nombre, folio activo, etapa y estatus; omite oportunidades con folio congelado; deja ese folio como único activo del lead elegible.
- Select **Copiar datos de oportunidad existente** en el formulario: lista **un nombre por persona** (aunque haya varias oportunidades homónimas); solo rellena nombre y `tipo_persona` del lead más reciente con ese nombre; **no** envía `lead_id` al guardar.
- **Historial (menú ⋮):** *Replicar*; *Nueva oportunidad* (pide nombre si hace falta); *Vincular a oportunidad existente* — misma regla de folio activo, sin crear folio nuevo.
- **Tablero:** *Cambiar cotización* en el modal del lead usa `PUT /leads/:id/vincular-cotizacion` (solo cotizaciones libres en el buscador; no disponible con folio congelado).

**Un folio activo por lead (backend):**

- Función `activarCotizacionEnLead` en `index.js`: valida con `assertPuedeVincularCotizacionEnLead` (`lib/cotizacion-vinculo.js`); pone `lead_id` NULL en todas las cotizaciones del lead y asigna la elegida; sincroniza `leads.valor`.
- **Folio congelado:** lead con `bloquea_cotizacion = 1` o estatus `cancelado` — no acepta vinculación (ni primera cotización); una cotización ya ligada a ese lead no puede reasignarse a otro.
- Usada en `POST /cotizaciones` (si viene `lead_id`), `PUT /cotizaciones/:id/vincular-lead` y `PUT /leads/:lead_id/vincular-cotizacion`.

**Archivos clave:**

- `frontend/src/components/ModalDestinoProspecto.jsx` — modal de destino al guardar o desde historial; excluye leads con folio congelado del selector.
- `frontend/src/lib/destinoProspectoCotizacion.js` — alta de oportunidad, `vincular-lead`, etiqueta del modal de destino, deduplicación de nombres en el cotizador y helpers `leadBloqueaCotizacion` / `estatusBloqueaCotizacion`.
- `frontend/src/lib/cotizacionFormulario.js` — estado del formulario ↔ BD y payload de guardado.
- `lib/cotizacion-guardar.js` — normalización e INSERT (completo / legado).

Cotizaciones automotrices anteriores al campo `version` conservan `NULL` en BD; el detalle en leads muestra versión cuando existe.

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

### Gestión de sesión (frontend)

La política de sesión aplica **solo a la SPA del CRM** (`frontend/`). No hay timeout de inactividad en el backend: `verificarToken` sigue validando el Firebase ID token en cada petición protegida mientras el cliente lo envíe.

| Regla | Comportamiento |
| ----- | -------------- |
| Inactividad | Tras **20 minutos** sin actividad del usuario, cierre forzado: `signOut` de Firebase y borrado de `usuarioCRM` en `localStorage`. |
| Aviso previo | A los **18 minutos** (2 min antes del cierre) se muestra `AvisoSesionModal` con cuenta regresiva y botón **Seguir conectado**, que reinicia el temporizador. |
| Qué cuenta como actividad | Eventos estándar en ventana: `mousedown`, `mousemove`, `keydown`, `scroll`, `touchstart`, `click` (con throttle de 1 s para no reiniciar en exceso). |
| Una sola pestaña | Coordinación vía `localStorage` (`crm_pestana_activa`) y `sessionStorage` (`crm_tab_id`). La pestaña que carga o recupera el foco **toma el control**; las demás reciben el evento `storage` y cierran sesión. Al cerrar la pestaña activa se libera el bloqueo (`beforeunload`). |
| Cierre manual | El botón del sidebar usa `cerrarSesion()` en `lib/sesion.js` (misma rutina centralizada). |
| Mensajes en login | Tras expirar por inactividad o por abrir otra pestaña, `LoginView` muestra un aviso en ámbar (textos en `MENSAJES_LOGIN` dentro de `lib/sesion.js`). |

**Archivos implicados**

| Archivo | Rol |
| ------- | --- |
| `frontend/src/lib/sesion.js` | Constantes de tiempo, bloqueo de pestaña, `cerrarSesion()`, mensajes de login |
| `frontend/src/hooks/useGestionSesion.js` | Temporizadores de inactividad, latido de pestaña, listeners de actividad y `storage` |
| `frontend/src/components/AvisoSesionModal.jsx` | Modal de aviso 2 minutos antes del cierre |
| `frontend/src/App.jsx` | Activa el hook cuando hay usuario autenticado |
| `frontend/src/pages/LoginView.jsx` | Consume y muestra el mensaje post-cierre |

Los tiempos están fijos en código (`TIEMPO_INACTIVIDAD_MS` y `AVISO_PREVIO_MS` en `sesion.js`), no en variables de entorno.

**Prueba local acelerada:** para validar sin esperar 20 minutos, reducir temporalmente en `sesion.js` (revertir antes de commit):

```javascript
export const TIEMPO_INACTIVIDAD_MS = 2 * 60 * 1000;
export const AVISO_PREVIO_MS = 30 * 1000;
```

**Cotizador:** Los endpoints REST del cotizador no requieren autenticación (módulo público en API por decisión de producto). La aplicación web sigue mostrando el cotizador solo a usuarios que hayan iniciado sesión en la SPA, pero la API no refuerza el mismo límite en esas rutas.

---

## 11. Deuda técnica

| Área | Problema |
| ---- | -------- |
| Autorización Firebase | No se usan custom claims en el token; el rol y `empresa_id` se leen de la BD en `verificarToken` (una sola query reutilizada por la cadena). Optimización pendiente, no es un riesgo de seguridad. |
| Sesión por inactividad | El timeout de 20 minutos y la pestaña única se aplican solo en el frontend; la API no invalida tokens por idle. Si se requiere enforcement en servidor, haría falta registro de última actividad por usuario. |
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
