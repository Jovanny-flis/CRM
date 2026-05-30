-- =============================================================================
-- CRM — Migración unificada schema v2 (idempotente)
-- =============================================================================
-- Aplica sobre una BD ya creada con db/schema.sql.
-- Seguro de ejecutar varias veces: omite DDL existente y DML destructivo ya aplicado.
--
-- Uso:
--   mysql -h HOST -u USER -p NOMBRE_BD < db/migrations/schema-v2.sql
--
-- Incluye (estado actual del repo):
--   • leads: motivo_desactivacion, desactivado_at (legado activo/inactivo)
--   • lead_sources: parent_id (jerarquía de canales)
--   • Catálogo raíz de canales por empresa + normalización única de leads.medio
--   • lead_estatus + leads.estatus_id (estatus de prospectos)
--   • Semilla activo/cancelado y asignación estatus_id en leads existentes
--   • lead_etapas_historial (timestamps por etapa alcanzada hacia adelante)
--   • cotizaciones: folio (AUTO_INCREMENT), nombre_activo, marca, modelo, version, anio
--   • cotizaciones: parámetros del cotizador (tasa, pagos, seguro, GPS, etc.) para réplica idéntica
--   • gps_proveedores + gps_productos — catálogo GPS por empresa (cotizador)
--   • leads: tipo_persona (PM | PF | PFAE, opcional)
--
-- Semilla incremental en runtime (si faltan datos tras la migración):
--   • lib/canales.js — catálogo raíz al crear empresa (POST /empresas); no re-sembrar en GET /medios
--   • lib/estatus-leads.js — estatus sistema y leads sin estatus_id en GET leads/estatus
-- =============================================================================

SET NAMES utf8mb4;
SET @db := DATABASE();

-- -----------------------------------------------------------------------------
-- Registro de pasos DML de una sola ejecución
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `_crm_migraciones` (
  `clave` varchar(64) NOT NULL,
  `aplicada_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Procedimientos auxiliares (reutilizables en re-ejecuciones)
-- -----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS `crm_add_column_if_missing`;
DELIMITER $$
CREATE PROCEDURE `crm_add_column_if_missing`(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @db
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `crm_add_index_if_missing`;
DELIMITER $$
CREATE PROCEDURE `crm_add_index_if_missing`(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = @db
      AND TABLE_NAME = p_table
      AND INDEX_NAME = p_index
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `crm_add_fk_if_missing`;
DELIMITER $$
CREATE PROCEDURE `crm_add_fk_if_missing`(
  IN p_table VARCHAR(64),
  IN p_constraint VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = @db
      AND TABLE_NAME = p_table
      AND CONSTRAINT_NAME = p_constraint
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD CONSTRAINT `', p_constraint, '` ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- -----------------------------------------------------------------------------
-- 1) leads — columnas de cancelación (legado; la app usa estatus_id)
-- -----------------------------------------------------------------------------
CALL crm_add_column_if_missing('leads', 'activo',
  "TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Legado: 1=activo, 0=inactivo. Migrado a estatus_id' AFTER `medio`");
CALL crm_add_column_if_missing('leads', 'motivo_desactivacion',
  "TEXT NULL COMMENT 'Obligatorio al pasar a estatus cancelado' AFTER `activo`");
CALL crm_add_column_if_missing('leads', 'desactivado_at',
  "TIMESTAMP NULL DEFAULT NULL COMMENT 'Momento de cancelación' AFTER `motivo_desactivacion`");

UPDATE `leads` SET `activo` = 1 WHERE `activo` IS NULL;

-- -----------------------------------------------------------------------------
-- 2) lead_sources — jerarquía (Canales con subcanales)
-- -----------------------------------------------------------------------------
CALL crm_add_column_if_missing('lead_sources', 'parent_id',
  "varchar(36) DEFAULT NULL COMMENT 'Canal padre; NULL = raíz' AFTER `nombre`");
CALL crm_add_index_if_missing('lead_sources', 'idx_lead_sources_parent',
  'KEY `idx_lead_sources_parent` (`parent_id`)');
CALL crm_add_fk_if_missing('lead_sources', 'fk_lead_sources_parent',
  'FOREIGN KEY (`parent_id`) REFERENCES `lead_sources` (`id`) ON DELETE CASCADE');

-- -----------------------------------------------------------------------------
-- 3) lead_estatus — catálogo por empresa
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `lead_estatus` (
  `id` varchar(36) NOT NULL,
  `empresa_id` int(11) NOT NULL,
  `codigo` varchar(50) NOT NULL COMMENT 'activo | cancelado | custom_…',
  `nombre` varchar(100) NOT NULL,
  `color_hex` varchar(7) DEFAULT NULL COMMENT 'NULL = sin color (neutro)',
  `incluir_en_suma` tinyint(1) NOT NULL DEFAULT 1,
  `permite_mover` tinyint(1) NOT NULL DEFAULT 1,
  `bloquea_cotizacion` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Congela folio: sin vincular ni cambiar cotización',
  `es_sistema` tinyint(1) NOT NULL DEFAULT 0,
  `orden` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lead_estatus_empresa_codigo` (`empresa_id`, `codigo`),
  KEY `idx_lead_estatus_empresa` (`empresa_id`),
  CONSTRAINT `fk_lead_estatus_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CALL crm_add_column_if_missing('lead_estatus', 'bloquea_cotizacion',
  "tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Congela folio: sin vincular ni cambiar cotización' AFTER `permite_mover`");

UPDATE `lead_estatus` SET `bloquea_cotizacion` = 1 WHERE `codigo` = 'cancelado';

-- -----------------------------------------------------------------------------
-- 4) leads.estatus_id
-- -----------------------------------------------------------------------------
CALL crm_add_column_if_missing('leads', 'estatus_id',
  "varchar(36) DEFAULT NULL COMMENT 'FK lead_estatus' AFTER `medio`");
CALL crm_add_index_if_missing('leads', 'idx_leads_estatus',
  'KEY `idx_leads_estatus` (`estatus_id`)');
CALL crm_add_fk_if_missing('leads', 'fk_leads_estatus',
  'FOREIGN KEY (`estatus_id`) REFERENCES `lead_estatus` (`id`)');

-- -----------------------------------------------------------------------------
-- 5) Canales raíz estándar (idempotente; no borra subcanales creados después)
-- -----------------------------------------------------------------------------
DELETE FROM `lead_sources` WHERE `parent_id` IS NOT NULL;

DELETE FROM `lead_sources`
WHERE `parent_id` IS NULL
  AND `nombre` NOT IN (
    'Referidos de clientes',
    'Marketing digital',
    'Socios',
    'Agentes',
    'Eventos empresariales',
    'Concesionarios',
    'Webinars',
    'Contacto directo',
    'Cotizador'
  );

INSERT INTO `lead_sources` (`id`, `empresa_id`, `nombre`, `parent_id`)
SELECT UUID(), e.`id`, c.`nombre`, NULL
FROM `empresas` e
CROSS JOIN (
  SELECT 'Referidos de clientes' AS nombre UNION ALL
  SELECT 'Marketing digital' UNION ALL
  SELECT 'Socios' UNION ALL
  SELECT 'Agentes' UNION ALL
  SELECT 'Eventos empresariales' UNION ALL
  SELECT 'Concesionarios' UNION ALL
  SELECT 'Webinars' UNION ALL
  SELECT 'Contacto directo' UNION ALL
  SELECT 'Cotizador'
) c
WHERE NOT EXISTS (
  SELECT 1
  FROM `lead_sources` ls
  WHERE ls.`empresa_id` = e.`id`
    AND ls.`nombre` = c.`nombre`
    AND ls.`parent_id` IS NULL
);

-- Normalización única de leads.medio (no se repite si ya se aplicó)
DROP PROCEDURE IF EXISTS `crm_dml_leads_medio_contacto_directo`;
DELIMITER $$
CREATE PROCEDURE `crm_dml_leads_medio_contacto_directo`()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM `_crm_migraciones` WHERE `clave` = 'leads_medio_contacto_directo') THEN
    UPDATE `leads` SET `medio` = 'Contacto directo';
    INSERT INTO `_crm_migraciones` (`clave`) VALUES ('leads_medio_contacto_directo');
  END IF;
END$$
DELIMITER ;
CALL `crm_dml_leads_medio_contacto_directo`();
DROP PROCEDURE IF EXISTS `crm_dml_leads_medio_contacto_directo`;

-- -----------------------------------------------------------------------------
-- 6) Estatus sistema por empresa + asignación en leads
-- -----------------------------------------------------------------------------
INSERT INTO `lead_estatus` (
  `id`, `empresa_id`, `codigo`, `nombre`, `color_hex`,
  `incluir_en_suma`, `permite_mover`, `bloquea_cotizacion`, `es_sistema`, `orden`
)
SELECT UUID(), e.`id`, 'activo', 'Activo', NULL, 1, 1, 0, 1, 0
FROM `empresas` e
WHERE NOT EXISTS (
  SELECT 1 FROM `lead_estatus` le
  WHERE le.`empresa_id` = e.`id` AND le.`codigo` = 'activo'
);

INSERT INTO `lead_estatus` (
  `id`, `empresa_id`, `codigo`, `nombre`, `color_hex`,
  `incluir_en_suma`, `permite_mover`, `bloquea_cotizacion`, `es_sistema`, `orden`
)
SELECT UUID(), e.`id`, 'cancelado', 'Cancelado', '#94a3b8', 0, 0, 1, 1, 9999
FROM `empresas` e
WHERE NOT EXISTS (
  SELECT 1 FROM `lead_estatus` le
  WHERE le.`empresa_id` = e.`id` AND le.`codigo` = 'cancelado'
);

UPDATE `leads` l
INNER JOIN `lead_estatus` ea ON ea.`empresa_id` = l.`empresa_id` AND ea.`codigo` = 'activo'
INNER JOIN `lead_estatus` ec ON ec.`empresa_id` = l.`empresa_id` AND ec.`codigo` = 'cancelado'
SET l.`estatus_id` = CASE WHEN l.`activo` = 0 THEN ec.`id` ELSE ea.`id` END
WHERE l.`estatus_id` IS NULL;

-- -----------------------------------------------------------------------------
-- 7) lead_etapas_historial — trazabilidad temporal por etapa del embudo
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `lead_etapas_historial` (
  `id` varchar(36) NOT NULL,
  `lead_id` varchar(36) NOT NULL,
  `stage_id` varchar(36) NOT NULL,
  `alcanzado_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lead_etapas_historial_lead_stage` (`lead_id`, `stage_id`),
  KEY `idx_lead_etapas_historial_lead` (`lead_id`),
  KEY `idx_lead_etapas_historial_stage` (`stage_id`),
  CONSTRAINT `fk_leh_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_leh_stage` FOREIGN KEY (`stage_id`) REFERENCES `pipeline_stages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Marcar migración unificada aplicada
INSERT IGNORE INTO `_crm_migraciones` (`clave`) VALUES ('schema_v2_unificado');

-- -----------------------------------------------------------------------------
-- 8) cotizaciones — columnas de folio, activo automotriz y vínculo a lead
-- -----------------------------------------------------------------------------
-- folio: identificador secuencial visible (FL-001, FL-002, …)
CALL crm_add_column_if_missing('cotizaciones', 'folio',
  "INT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE AFTER `id`");

-- nombre_activo: descripción libre del bien cotizado
CALL crm_add_column_if_missing('cotizaciones', 'nombre_activo',
  "VARCHAR(200) NULL AFTER `tipo_activo`");

-- marca / modelo / anio: campos específicos para tipo Automotriz
CALL crm_add_column_if_missing('cotizaciones', 'marca',
  "VARCHAR(100) NULL AFTER `nombre_activo`");
CALL crm_add_column_if_missing('cotizaciones', 'modelo',
  "VARCHAR(100) NULL AFTER `marca`");
CALL crm_add_column_if_missing('cotizaciones', 'version',
  "VARCHAR(100) NULL COMMENT 'Versión del vehículo (automotriz)' AFTER `modelo`");
CALL crm_add_column_if_missing('cotizaciones', 'anio',
  "INT NULL AFTER `version`");

-- -----------------------------------------------------------------------------
-- 9) leads — tipo de persona del prospecto (opcional)
-- -----------------------------------------------------------------------------
CALL crm_add_column_if_missing('leads', 'tipo_persona',
  "VARCHAR(4) NULL DEFAULT NULL COMMENT 'PM | PF | PFAE' AFTER `medio`");

-- -----------------------------------------------------------------------------
-- 10) cotizaciones — parámetros completos del cotizador (réplica idéntica)
-- -----------------------------------------------------------------------------
CALL crm_add_column_if_missing('cotizaciones', 'tipo_arrendamiento',
  "VARCHAR(20) NULL COMMENT 'Automotriz | Otro' AFTER `tipo_activo`");

CALL crm_add_column_if_missing('cotizaciones', 'tasa_anual',
  "DECIMAL(5,2) NULL AFTER `plazo`");

CALL crm_add_column_if_missing('cotizaciones', 'pago_inicial_valor',
  "DECIMAL(12,4) NULL COMMENT 'Valor capturado en formulario (monto o %)' AFTER `tasa_anual`");
CALL crm_add_column_if_missing('cotizaciones', 'is_pago_inicial_pct',
  "TINYINT(1) NULL DEFAULT 1 AFTER `pago_inicial_valor`");

CALL crm_add_column_if_missing('cotizaciones', 'residual_valor',
  "DECIMAL(12,4) NULL AFTER `is_pago_inicial_pct`");
CALL crm_add_column_if_missing('cotizaciones', 'is_residual_pct',
  "TINYINT(1) NULL DEFAULT 1 AFTER `residual_valor`");

CALL crm_add_column_if_missing('cotizaciones', 'comision_valor',
  "DECIMAL(12,4) NULL AFTER `is_residual_pct`");
CALL crm_add_column_if_missing('cotizaciones', 'is_comision_pct',
  "TINYINT(1) NULL DEFAULT 1 AFTER `comision_valor`");

CALL crm_add_column_if_missing('cotizaciones', 'seguro_valor',
  "DECIMAL(12,4) NULL AFTER `is_comision_pct`");
CALL crm_add_column_if_missing('cotizaciones', 'is_seguro_contado',
  "TINYINT(1) NULL DEFAULT 1 AFTER `seguro_valor`");
CALL crm_add_column_if_missing('cotizaciones', 'is_seguro_anual',
  "TINYINT(1) NULL DEFAULT 1 AFTER `is_seguro_contado`");

CALL crm_add_column_if_missing('cotizaciones', 'gps_valor',
  "DECIMAL(12,4) NULL AFTER `is_seguro_anual`");
CALL crm_add_column_if_missing('cotizaciones', 'is_gps_contado',
  "TINYINT(1) NULL DEFAULT 1 AFTER `gps_valor`");

CALL crm_add_column_if_missing('cotizaciones', 'servicios_valor',
  "DECIMAL(12,4) NULL AFTER `is_gps_contado`");

-- -----------------------------------------------------------------------------
-- 11) Catálogo GPS por empresa (proveedores → productos con precio IVA incl.)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `gps_proveedores` (
  `id` varchar(36) NOT NULL,
  `empresa_id` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gps_proveedor_empresa_nombre` (`empresa_id`, `nombre`),
  KEY `idx_gps_proveedores_empresa` (`empresa_id`),
  CONSTRAINT `fk_gps_proveedores_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `gps_productos` (
  `id` varchar(36) NOT NULL,
  `proveedor_id` varchar(36) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `precio` decimal(12,4) NOT NULL COMMENT 'Precio con IVA incluido',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gps_producto_proveedor_nombre` (`proveedor_id`, `nombre`),
  KEY `idx_gps_productos_proveedor` (`proveedor_id`),
  CONSTRAINT `fk_gps_productos_proveedor` FOREIGN KEY (`proveedor_id`) REFERENCES `gps_proveedores` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Fin (los procedimientos crm_add_* pueden quedarse para futuras ampliaciones)
-- -----------------------------------------------------------------------------
