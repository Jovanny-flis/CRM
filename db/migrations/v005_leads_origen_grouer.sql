-- v005 — Origen GROUER de un prospecto (snapshot curado; sin JSON opaco en leads).
-- Idempotente: CREATE TABLE IF NOT EXISTS.
-- No abona cotizaciones ni folios FL-xxx.
--
-- Aplicar (desde la raíz del CRM, credenciales de CRM/.env):
--   mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < db/migrations/v005_leads_origen_grouer.sql

CREATE TABLE IF NOT EXISTS `leads_origen_grouer` (
  `lead_id` varchar(36) NOT NULL,
  `solicitud_id` varchar(36) NOT NULL COMMENT 'solicitudes_syntage.id en GROUER; clave de idempotencia',
  `analisis_id` varchar(36) DEFAULT NULL,
  `cotizacion_portal_id` varchar(36) DEFAULT NULL,
  `rfc` varchar(13) DEFAULT NULL,
  `pdf_disponible` tinyint(1) NOT NULL DEFAULT 0,
  `snapshot_json` json NOT NULL COMMENT 'Snapshot curado del contrato HTTP; sin buró ni insumos crudos',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`lead_id`),
  UNIQUE KEY `uk_leads_origen_grouer_solicitud` (`solicitud_id`),
  CONSTRAINT `fk_leads_origen_grouer_lead`
    FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
