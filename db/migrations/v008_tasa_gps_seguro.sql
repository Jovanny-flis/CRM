-- v008 — Tasa independiente para GPS y Seguro financiados (antes usaban tasa_anual).
-- Idempotente (MySQL 8+ / MariaDB): columnas solo si faltan.
-- NULL = usa tasa_anual (compatibilidad con cotizaciones ya guardadas).
--
-- Aplicar (desde la raíz del CRM, credenciales de CRM/.env):
--   mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < db/migrations/v008_tasa_gps_seguro.sql

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cotizaciones'
    AND COLUMN_NAME = 'tasa_gps'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `cotizaciones` ADD COLUMN `tasa_gps` DECIMAL(12,4) NULL COMMENT ''Tasa anual del GPS financiado; NULL = usa tasa_anual'' AFTER `tasa_anual`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cotizaciones'
    AND COLUMN_NAME = 'tasa_seguro'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `cotizaciones` ADD COLUMN `tasa_seguro` DECIMAL(12,4) NULL COMMENT ''Tasa anual del seguro financiado; NULL = usa tasa_anual'' AFTER `tasa_gps`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
