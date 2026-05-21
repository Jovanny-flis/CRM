-- Cambios acumulados sobre schema.sql (no reemplaza el DDL histórico).
-- Aplicar vía migraciones parciales en db/migrations/ (orden v001 → v002 → v003).

-- v001: activo, motivo_desactivacion, desactivado_at
ALTER TABLE `leads`
  ADD COLUMN `activo` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=activo, 0=inactivo (no reactivable)' AFTER `medio`,
  ADD COLUMN `motivo_desactivacion` TEXT NULL COMMENT 'Obligatorio al desactivar' AFTER `activo`,
  ADD COLUMN `desactivado_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'Momento en que se desactivó el lead' AFTER `motivo_desactivacion`;

-- v002: parent_id en lead_sources (subcanales creados desde el front; sin semilla en migración)
ALTER TABLE `lead_sources`
  ADD COLUMN `parent_id` varchar(36) DEFAULT NULL COMMENT 'Canal padre; NULL = canal raíz' AFTER `nombre`,
  ADD KEY `idx_lead_sources_parent` (`parent_id`),
  ADD CONSTRAINT `fk_lead_sources_parent`
    FOREIGN KEY (`parent_id`) REFERENCES `lead_sources` (`id`) ON DELETE CASCADE;

-- v003: DML genérico (catálogo raíz + leads.medio) → db/migrations/v003_canales_raiz.sql
