-- v006 — Trazabilidad del envío GROUER → empresa FLISING.
-- Idempotente (MySQL 8+ / MariaDB): columnas e índice solo si faltan.
-- El clon en FLISING es un lead tradicional (sin snapshot GROUER).
--
-- Aplicar (desde la raíz del CRM, credenciales de CRM/.env):
--   mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < db/migrations/v006_envio_flising.sql

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'leads_origen_grouer'
    AND COLUMN_NAME = 'flising_lead_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `leads_origen_grouer` ADD COLUMN `flising_lead_id` varchar(36) DEFAULT NULL COMMENT ''Lead clonado en empresa FLISING'' AFTER `snapshot_json`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'leads_origen_grouer'
    AND COLUMN_NAME = 'enviado_a_flising_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `leads_origen_grouer` ADD COLUMN `enviado_a_flising_at` timestamp NULL DEFAULT NULL AFTER `flising_lead_id`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'leads_origen_grouer'
    AND COLUMN_NAME = 'asignado_flising_usuario_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `leads_origen_grouer` ADD COLUMN `asignado_flising_usuario_id` varchar(36) DEFAULT NULL AFTER `enviado_a_flising_at`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'leads_origen_grouer'
    AND INDEX_NAME = 'uk_leads_origen_grouer_flising_lead'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE `leads_origen_grouer` ADD UNIQUE KEY `uk_leads_origen_grouer_flising_lead` (`flising_lead_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
