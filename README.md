# CRM

## 1. Descripcion general

CRM es el sistema interno para operar el pipeline comercial de forma multiempresa (SaaS interno). El sistema centraliza captacion de clientes, gestion de leads, configuracion de embudos de venta y cotizacion de arrendamiento financiero.

Estado actual documentado:

- Backend Node.js + Express en un unico archivo (`index.js`).
- Frontend React + Vite en `frontend/`.
- Persistencia en MariaDB sin ORM; el DDL canonico esta versionado en `db/schema.sql`.
- Flujo funcional principal activo, con deuda tecnica relevante detallada en este documento.


| Modulo             | Descripcion                                                        |
| ------------------ | ------------------------------------------------------------------ |
| Autenticacion      | Login con correo/contrasena y recuperacion de contrasena por SMTP. |
| Empresas           | CRUD de empresas para el modelo multiempresa.                      |
| Usuarios y agentes | Alta, edicion, baja y jerarquia operativa de usuarios por rol.     |
| Pipelines y etapas | Definicion de embudos comerciales y etapas por empresa.            |
| Leads              | Gestion de prospectos y movimiento entre etapas (drag and drop).   |
| Cotizador          | Calculo de arrendamiento, guardado de cotizaciones e historial.    |


## 2. Stack tecnologico

### Backend


| Capa                   | Tecnologia      | Version            | Proposito                           |
| ---------------------- | --------------- | ------------------ | ----------------------------------- |
| Runtime                | Node.js         | 24.15.0 (ver nota) | Ejecutar API backend                |
| Framework              | Express         | 5.2.1              | API REST y middlewares              |
| Base de datos          | MySQL / MariaDB | 10.4.32 (ver nota) | Persistencia transaccional          |
| Cliente DB             | mysql2          | 3.22.1             | Conexion y queries SQL              |
| Seguridad credenciales | bcrypt          | 6.0.0              | Hash de contrasenas                 |
| Configuracion          | dotenv          | 17.4.2             | Carga de variables de entorno       |
| Correo                 | nodemailer      | 8.0.6              | Recuperacion de contrasena via SMTP |
| CORS                   | cors            | 2.8.6              | Politica CORS para API              |


> Las versiones de Node.js y MariaDB quedan pendientes de confirmar antes de configurar entornos nuevos.

### Frontend


| Capa         | Tecnologia       | Version | Proposito                       |
| ------------ | ---------------- | ------- | ------------------------------- |
| Framework UI | React            | 19.2.4  | Interfaz y estado de aplicacion |
| Build tool   | Vite             | 8.0.4   | Dev server y build frontend     |
| Ruteo        | React Router DOM | 7.14.1  | Navegacion SPA                  |
| HTTP client  | Axios            | 1.15.0  | Consumo de API backend          |
| UI/CSS       | TailwindCSS      | 4.2.2   | Estilos utilitarios             |
| Linting      | ESLint           | 9.39.4  | Validacion estatica de codigo   |


## 3. Arquitectura

Diagrama ASCII de la arquitectura actual:

```text
┌─────────────────────────────────────────────────────────┐
│                    Navegador del usuario                │
│                  React 19 + Vite (frontend/)           │
│  App.jsx + pages/* + Sidebar + DashboardLayout         │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP (Axios/fetch)
                           │ baseURL: http://localhost:3000/api
┌──────────────────────────▼──────────────────────────────┐
│                  API REST Express (index.js)           │
│  Auth, usuarios, empresas, pipelines, leads, cotizador │
│  Sin separacion por capas (todo en un archivo)         │
└───────────────┬──────────────────────────┬──────────────┘
                │                          │
                │ SQL (mysql2)             │ SMTP (nodemailer)
┌───────────────▼───────────────┐   ┌──────▼────────────────┐
│   MariaDB/MySQL (flising_crm) │   │     Servidor SMTP      │
│ tablas: usuarios, leads, etc. │   │ recuperacion password  │
└───────────────────────────────┘   └────────────────────────┘
```

Comunicacion actual:

- El frontend consume la API por `http://localhost:3000/api`.
- El backend ejecuta SQL directo con `mysql2` contra `flising_crm`.
- El flujo de recuperacion usa `nodemailer` con variables `EMAIL_*`.
- No existe gateway/API proxy, ni microservicios, ni colas.

## 4. Estructura del repositorio

```text
CRM/
├─ index.js                     # Servidor Express completo (backend monolitico en 1 archivo)
├─ package.json                 # Dependencias y scripts backend
├─ package-lock.json            # Lockfile backend
├─ .env                         # Variables locales (no versionado por .gitignore)
├─ .env.example                 # Plantilla de variables de entorno (raiz)
├─ .gitignore                   # Ignora node_modules y .env
├─ db/
│  └─ schema.sql                # DDL canonico de la base flising_crm
└─ frontend/
   ├─ package.json              # Dependencias y scripts frontend
   ├─ package-lock.json         # Lockfile frontend
   ├─ .env.example              # Plantilla de variables Vite (p. ej. VITE_API_URL)
   ├─ vite.config.js            # Configuracion de Vite
   ├─ tailwind.config.js        # Configuracion de Tailwind
   ├─ postcss.config.js         # Configuracion PostCSS
   ├─ eslint.config.js          # Reglas de lint frontend
   ├─ index.html                # HTML base de la SPA
   ├─ README.md                 # Artefacto de plantilla Vite — pendiente de eliminar del repo
   ├─ public/
   │  ├─ favicon.svg            # Favicon
   │  └─ icons.svg              # Iconos estaticos
   └─ src/
      ├─ main.jsx               # Punto de entrada React
      ├─ App.jsx                # Ruteo principal y gate de autenticacion
      ├─ api.js                 # Instancia Axios (baseURL via VITE_API_URL)
      ├─ index.css              # Estilos globales
      ├─ components/
      │  └─ Sidebar.jsx         # Navegacion lateral por rol
      ├─ layouts/
      │  └─ DashboardLayout.jsx # Layout principal autenticado
      ├─ pages/
      │  ├─ LoginView.jsx       # Login y solicitud de recuperacion
      │  ├─ ResetPasswordView.jsx # Cambio de contrasena via token
      │  ├─ LeadsView.jsx       # Tablero de leads por etapas
      │  ├─ AgentesView.jsx     # CRUD de usuarios/agentes
      │  ├─ EmpresasView.jsx    # CRUD de empresas
      │  ├─ PipelinesView.jsx   # Configuracion de embudos y etapas
      │  └─ CotizadorView.jsx   # Cotizador financiero e historial
      └─ assets/
         ├─ hero.png            # Recurso grafico
         ├─ react.svg           # Recurso plantilla
         └─ vite.svg            # Recurso plantilla
```

## 5. Requisitos previos

Las versiones indicadas corresponden al entorno de desarrollo conocido al momento de esta documentacion. Confirmar versiones optimas antes de configurar un entorno nuevo.

- Node.js: v24.15.0 (entorno conocido; confirmar version minima con el equipo).
- npm: v11.12.1 (incluido con Node.js).
- MySQL o MariaDB: MariaDB 10.4.32 via XAMPP (entorno conocido; confirmar compatibilidad con el equipo).
- Acceso SMTP valido para el flujo de recuperacion de contrasena.
- Git para clonar el repositorio.

## 6. Configuracion local

1. Clonar repositorio:
  ```bash
   git clone <url-del-repo>
   cd CRM
  ```
2. Instalar dependencias backend:
  ```bash
   npm install
  ```
3. Instalar dependencias frontend:
  ```bash
   cd frontend
   npm install
   cd ..
  ```
4. Configurar variables de entorno backend en `.env` (raiz):
  - Completar `DB_*`, `PORT`, `EMAIL_*`.
5. Importar schema SQL en MySQL:
   - Ejecutar `db/schema.sql` (crea la base `flising_crm` si no existe y aplica el DDL).
   - Alternativa: usar el DDL de la seccion 8 como referencia.
6. Crear el primer usuario `super_admin` (manual, sin seed automatico):
  Paso 6a — Crear la empresa base si la base de datos esta vacia:
   Paso 6b — Generar el hash bcrypt de la contrasena (rounds: 10) desde la raiz del proyecto:
   Paso 6c — Insertar el usuario `super_admin` con el hash generado:
7. Arrancar backend (desde raiz):
  ```bash
   node index.js
  ```
8. Arrancar frontend (en otra terminal):
  ```bash
   cd frontend
   npm run dev
  ```
9. Abrir frontend:
  - URL por defecto Vite: `http://localhost:5173`
  - API esperada: `http://localhost:3000/api`

## 7. Variables de entorno

Archivo: `.env` en la raiz del repositorio.


| Variable      | Requerida | Descripcion                | Ejemplo               |
| ------------- | --------- | -------------------------- | --------------------- |
| `DB_HOST`     | Si        | Host de MySQL              | `localhost`           |
| `DB_USER`     | Si        | Usuario de MySQL           | `root`                |
| `DB_PASSWORD` | Si        | Contrasena de MySQL        | `secret123`           |
| `DB_NAME`     | Si        | Nombre de base de datos    | `flising_crm`         |
| `PORT`        | Si        | Puerto de API Express      | `3000`                |
| `EMAIL_HOST`  | Si        | Host SMTP para nodemailer  | `smtp.gmail.com`      |
| `EMAIL_PORT`  | Si        | Puerto SMTP                | `465`                 |
| `EMAIL_USER`  | Si        | Correo emisor SMTP         | `soporte@dominio.com` |
| `EMAIL_PASS`  | Si        | Password/app password SMTP | `********`            |


Notas operativas:

- El `.env` actual del repo local contiene `DB_*` y `PORT`.
- `EMAIL_*` son requeridas por recuperacion de contrasena, pero no estan en el `.env` actual.

## 8. Modelo de datos

### Entidades principales

- `empresas`: entidad multiempresa principal.
  - Campos clave: `id`, `nombre_comercial`, `rfc`, `plan_suscripcion`, colores de marca.
- `usuarios`: usuarios del sistema por empresa y rol.
  - Campos clave: `id`, `nombre`, `email`, `password_hash`, `empresa_id`, `rol`, `supervisor_id`, `reset_token`.
- `pipelines`: embudos comerciales por empresa.
  - Campos clave: `id`, `empresa_id`, `nombre`, `clave`.
- `pipeline_stages`: etapas dentro de cada pipeline.
  - Campos clave: `id`, `pipeline_id`, `nombre_etapa`, `orden`, `color_hex`.
- `leads`: prospectos comerciales.
  - Campos clave: `id`, `empresa_id`, `usuario_id`, `stage_id`, `nombre`, `correo`, `telefono`, `valor`, `medio`.
- `cotizaciones`: resultados de cotizacion financiera.
  - Campos clave: `id`, `empresa_id`, `lead_id`, `usuario_id`, `tipo_activo`, `plazo`, `pago_inicial`, `renta_mensual_*`.
- `clientes_globales`: catalogo fiscal global de clientes.
  - Campos clave: `id`, `rfc`, `nombre_fiscal`.
- `lead_sources`: catalogo de origen de leads por empresa.
  - Campos clave: `id`, `empresa_id`, `nombre`.

### Relaciones principales

- `empresas (1) -> (N) usuarios` via `usuarios.empresa_id`.
- `empresas (1) -> (N) pipelines` via `pipelines.empresa_id`.
- `empresas (1) -> (N) lead_sources` via `lead_sources.empresa_id`.
- `pipelines (1) -> (N) pipeline_stages` via `pipeline_stages.pipeline_id`.
- `pipeline_stages (1) -> (N) leads` via `leads.stage_id`.
- `usuarios (1) -> (N) leads` via `leads.usuario_id`.
- `usuarios (1) -> (N) cotizaciones` via `cotizaciones.usuario_id`.
- `leads (0..1) -> (N) cotizaciones` via `cotizaciones.lead_id`.
- `clientes_globales (1) -> (N) leads` via `leads.cliente_global_id`.

### DDL completo (estado actual)

Orden de creacion compatible con las claves foraneas. Copia autoritativa en `db/schema.sql`.

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
  `reset_token` varchar(255) DEFAULT NULL,
  `reset_token_expira` datetime DEFAULT NULL,
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
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `empresa_id` (`empresa_id`),
  CONSTRAINT `fk_lead_sources_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`)
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
  `empresa_id` int(11) NOT NULL,
  `lead_id` varchar(36) DEFAULT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `tipo_activo` varchar(50) NOT NULL,
  `valor_activo` decimal(12,2) NOT NULL,
  `plazo` int(11) NOT NULL,
  `tipo_renta` varchar(20) NOT NULL,
  `porcentaje_vr` decimal(5,2) NOT NULL,
  `vr_calculado` decimal(12,2) NOT NULL,
  `pago_inicial` decimal(12,2) NOT NULL,
  `renta_mensual_sin_iva` decimal(12,2) NOT NULL,
  `renta_mensual_con_iva` decimal(12,2) NOT NULL,
  `fecha_creacion` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```



## 9. Rutas de la API

Base URL: `http://localhost:3000/api`

### Autenticacion


| Metodo | Endpoint           | Descripcion                                 |
| ------ | ------------------ | ------------------------------------------- |
| POST   | `/login`           | Login por email y contrasena                |
| POST   | `/olvide-password` | Genera token y envia correo de recuperacion |
| POST   | `/reset-password`  | Actualiza contrasena con token              |


### Empresas


| Metodo | Endpoint        | Descripcion       |
| ------ | --------------- | ----------------- |
| GET    | `/empresas`     | Lista empresas    |
| POST   | `/empresas`     | Crea empresa      |
| PUT    | `/empresas/:id` | Actualiza empresa |
| DELETE | `/empresas/:id` | Elimina empresa   |


### Usuarios y agentes


| Metodo | Endpoint                        | Descripcion                |
| ------ | ------------------------------- | -------------------------- |
| GET    | `/usuarios`                     | Lista global de usuarios   |
| GET    | `/usuarios/empresa/:empresa_id` | Lista usuarios por empresa |
| POST   | `/usuarios`                     | Crea usuario               |
| PUT    | `/usuarios/:id`                 | Actualiza usuario          |
| DELETE | `/usuarios/:id`                 | Elimina usuario            |


### Pipelines y etapas


| Metodo | Endpoint                 | Descripcion                 |
| ------ | ------------------------ | --------------------------- |
| GET    | `/pipelines/:empresa_id` | Lista pipelines por empresa |
| POST   | `/pipelines`             | Crea pipeline               |
| PUT    | `/pipelines/:id`         | Actualiza pipeline          |
| GET    | `/etapas/:pipeline_id`   | Lista etapas por pipeline   |
| POST   | `/etapas`                | Crea etapa                  |
| PUT    | `/etapas/:id`            | Actualiza etapa             |


### Leads


| Metodo | Endpoint             | Descripcion                                |
| ------ | -------------------- | ------------------------------------------ |
| GET    | `/leads/:empresa_id` | Lista leads por empresa                    |
| POST   | `/leads`             | Crea lead                                  |
| PUT    | `/leads/:id`         | Actualiza lead                             |
| PUT    | `/leads/:id/etapa`   | Mueve lead de etapa                        |
| GET    | `/medios/:empresa_id` | Lista fuentes de lead (`lead_sources`) por empresa |

### Cotizador


| Metodo | Endpoint                            | Descripcion                                            |
| ------ | ----------------------------------- | ------------------------------------------------------ |
| POST   | `/cotizaciones`                     | Guarda cotizacion                                      |
| GET    | `/cotizaciones/lead/:lead_id`       | Historial de cotizaciones por lead                     |
| GET    | `/cotizaciones/empresa/:empresa_id` | Historial de cotizaciones por empresa (filtro por rol) |
| PUT    | `/cotizaciones/:id/vincular-lead`   | Vincula cotizacion a lead                              |


## 10. Roles y permisos


| Rol             | Descripcion                          | Permisos principales (estado actual)                              |
| --------------- | ------------------------------------ | ----------------------------------------------------------------- |
| `super_admin`   | Administracion global del sistema    | Gestion de empresas, usuarios y vistas globales                   |
| `admin_empresa` | Administracion operativa por empresa | Gestion de usuarios de su empresa, pipelines, leads, cotizaciones |
| `supervisor`    | Lider comercial                      | Gestion de equipo y seguimiento operativo                         |
| `agente`        | Ejecutivo comercial                  | Gestion de leads y cotizaciones propias                           |


Nota critica:

- El control de acceso y visibilidad vive principalmente en frontend (`localStorage` + menus/rutas).
- El backend no implementa middleware robusto de autorizacion por rol.
- Migrar estas responsabilidades a Firebase.

## 11. Deuda tecnica


| Area          | Problema                                                                                                                                                                 | Severidad |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| Base de datos | Sin herramienta de migraciones incrementales (Flyway/Liquibase, etc.); el DDL base esta versionado en `db/schema.sql`.                                                      | Media     |
| Backend       | Todo el backend esta en un solo archivo (`index.js`). Sin separacion de capas ni controladores.                                                                          | Media     |
| Backend       | CORS abierto (`origin: '*'`).                                                                                                                                            | Media     |
| Backend       | `NODE_TLS_REJECT_UNAUTHORIZED` forzado a `'0'` en runtime.                                                                                                               | Media     |
| Backend       | Sin middleware de autorizacion por rol en API.                                                                                                                           | Media     |
| Backend       | Variables SMTP no incluidas en `.env` actual del repositorio.                                                                                                            | Media     |
| Frontend      | Posibles URLs de API residuales fuera de `VITE_API_URL` en `api.js`; conviene auditar el resto del codigo.                                                                | Baja      |
| Frontend      | 21 errores activos de ESLint.                                                                                                                                            | Baja      |
| General       | Sin tests automatizados.                                                                                                                                                 | Media     |
| General       | Sin CI/CD.                                                                                                                                                               | Baja      |


## 12. Proximos pasos sugeridos

### Critico

1. Integrar Firebase Auth y Firebase Admin SDK para login y asignación de custom claims de rol.
2. Reemplazar el gate de localStorage en frontend y el CORS abierto en backend por validación de token en cada endpoint.
3. Retirar `NODE_TLS_REJECT_UNAUTHORIZED='0'` y configurar TLS correctamente.
4. Definir herramienta y flujo de migraciones incrementales sobre el DDL base en `db/schema.sql`.

### Importante

1. Separar backend por capas (rutas/controladores/servicios/repositorios).
2. Corregir errores de ESLint activos y dejar lint en verde.
3. Documentar y automatizar seed inicial (`super_admin` + empresa base).

### Deseable

1. Incorporar tests automatizados (unitarios e integracion API).
2. Agregar pipeline CI/CD basico para lint (opcional) + test + build.
3. Incorporar observabilidad minima (logging estructurado y manejo centralizado de errores).

