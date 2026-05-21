-- v003: catálogo genérico de canales raíz (todas las empresas) + normalización de leads.medio
-- Subcanales: NO se migran; cada empresa los da de alta desde el front (menú ⋮ → Nuevo subcanal).
-- Ejecutar una sola vez en producción después de v002.

-- 1) Eliminar subcanales del catálogo
DELETE FROM lead_sources WHERE parent_id IS NOT NULL;

-- 2) Eliminar canales raíz fuera del catálogo estándar
DELETE FROM lead_sources
WHERE parent_id IS NULL
  AND nombre NOT IN (
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

-- 3) Insertar canales raíz faltantes por empresa
INSERT INTO lead_sources (id, empresa_id, nombre, parent_id)
SELECT UUID(), e.id, c.nombre, NULL
FROM empresas e
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
  FROM lead_sources ls
  WHERE ls.empresa_id = e.id
    AND ls.nombre = c.nombre
    AND ls.parent_id IS NULL
);

-- 4) Normalizar medio en todos los leads existentes
UPDATE leads SET medio = 'Contacto directo';
