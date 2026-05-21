-- v002: columna parent_id en lead_sources (UI «Canales»).
-- Solo habilita jerarquía en runtime; la migración NO inserta subcanales.

ALTER TABLE `lead_sources`
  ADD COLUMN `parent_id` varchar(36) DEFAULT NULL COMMENT 'Canal padre; NULL = canal raíz' AFTER `nombre`,
  ADD KEY `idx_lead_sources_parent` (`parent_id`),
  ADD CONSTRAINT `fk_lead_sources_parent`
    FOREIGN KEY (`parent_id`) REFERENCES `lead_sources` (`id`) ON DELETE CASCADE;
