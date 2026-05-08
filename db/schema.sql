-- =============================================================================
-- CRM — Schema canonico de base de datos (flising_crm)
-- Fecha de referencia: 2026-05-04
-- Descripcion: DDL final sin tabla tenants; lead_sources referencia empresas.id.
-- Uso: ejecutar este archivo completo en un servidor MySQL/MariaDB con permisos
--      suficientes para crear base y tablas.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS flising_crm;
USE flising_crm;

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
  `usuario_id` varchar(36) DEFAULT NULL,
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

-- =============================================================================
-- Usuario inicial super_admin (manual)
-- -----------------------------------------------------------------------------
-- 1. Instalar dependencias del backend si aun no lo hiciste: desde la raiz del
--    repo ejecuta `npm install`.
-- 2. Generar el hash bcrypt (10 rounds), sustituyendo TU_PASSWORD por la clave
--    deseada:
--
--    node -e "require('bcrypt').hash('TU_PASSWORD', 10).then(h => console.log(h))"
--
-- 3. Copiar el hash que imprime la consola y pegarlo en PASSWORD_HASH_BCRYPT
--    abajo. Ajustar nombre, email y UUID si lo necesitas (el id debe ser un
--    UUID valido de 36 caracteres, coherente con el resto de la app).
-- 4. Descomentar el INSERT y ejecutarlo contra flising_crm (puedes usar el
--    cliente mysql o importar solo esa sentencia).
-- =============================================================================
--
-- INSERT INTO usuarios (
--   id,
--   nombre,
--   email,
--   password_hash,
--   empresa_id,
--   rol
-- ) VALUES (
--   UUID(),
--   'Super Admin',
--   'admin@ejemplo.com',
--   'PASSWORD_HASH_BCRYPT',
--   NULL,
--   'super_admin'
-- );
