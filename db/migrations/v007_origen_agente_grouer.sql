-- v007 — Quién originó un prospecto GROUER (correo del agente → usuario de la empresa).
-- Idempotente (MySQL 8+ / MariaDB): columnas solo si faltan.
-- `origen_usuario_id` se escribe en el alta y no se toca al reasignar `leads.usuario_id`.
-- No reescribe filas ya existentes: quedan en NULL (Sistema GROUER, como el alta anterior).
--
-- Aplicar (desde la raíz del CRM, credenciales de CRM/.env):
--   mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < db/migrations/v007_origen_agente_grouer.sql

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'leads_origen_grouer'
    AND COLUMN_NAME = 'agente_email'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `leads_origen_grouer` ADD COLUMN `agente_email` varchar(150) DEFAULT NULL COMMENT ''Correo del agente GROUER en el alta. NULL si la cotización no vino de un agente.'' AFTER `asignado_flising_usuario_id`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'leads_origen_grouer'
    AND COLUMN_NAME = 'origen_usuario_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `leads_origen_grouer` ADD COLUMN `origen_usuario_id` varchar(36) DEFAULT NULL COMMENT ''Usuario de la empresa GROUER resuelto por agente_email. NULL = sin coincidencia; el lead queda en Sistema GROUER. No cambia al reasignar.'' AFTER `agente_email`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
