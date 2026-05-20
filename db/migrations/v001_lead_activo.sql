-- Lead activo / inactivo con motivo de desactivación (irreversible)
ALTER TABLE `leads`
  ADD COLUMN `activo` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=activo, 0=inactivo (no reactivable)' AFTER `medio`,
  ADD COLUMN `motivo_desactivacion` TEXT NULL COMMENT 'Obligatorio al desactivar' AFTER `activo`,
  ADD COLUMN `desactivado_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'Momento en que se desactivó el lead' AFTER `motivo_desactivacion`;

UPDATE `leads` SET `activo` = 1 WHERE `activo` IS NULL;
