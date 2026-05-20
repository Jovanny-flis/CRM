-- Cambios sobre schema.sql (no reemplaza el DDL histórico)
-- v001: activo, motivo_desactivacion
-- v002: desactivado_at

ALTER TABLE `leads`
  ADD COLUMN `activo` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=activo, 0=inactivo (no reactivable)' AFTER `medio`,
  ADD COLUMN `motivo_desactivacion` TEXT NULL COMMENT 'Obligatorio al desactivar' AFTER `activo`;

ALTER TABLE `leads`
  ADD COLUMN `desactivado_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'Momento en que se desactivó el lead' AFTER `motivo_desactivacion`;
