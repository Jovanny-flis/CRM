# Migraciones CRM

## Instalación nueva

1. `db/schema.sql` — esquema base (`flising_crm` y tablas).
2. Opcional en el mismo servidor: datos iniciales según comentarios al final de `schema.sql`.

## Base de datos existente (actualizar al estado del repo)

Ejecutar **una vez** (re-ejecutable sin error):

```bash
mysql -h HOST -u USER -p NOMBRE_BD < db/migrations/schema-v2.sql
```

El script es **idempotente**: columnas, índices y FKs solo se crean si faltan; la normalización masiva `leads.medio → 'Contacto directo'` corre una sola vez (tabla `_crm_migraciones`).

## Archivo vigente

| Archivo | Rol |
| ------- | --- |
| `schema-v2.sql` | Única migración acumulada: canales, estatus de prospectos, columnas de cancelación en `leads`. |

Las migraciones parciales `v001`–`v004` fueron retiradas; su contenido está unificado aquí.

## Runtime (complemento)

Tras `schema-v2.sql`, el backend puede completar catálogos por empresa:

- `lib/canales.js` — raíces faltantes en `GET /api/medios/:empresa_id`
- `lib/estatus-leads.js` — estatus sistema y `leads.estatus_id` pendientes en `GET` de leads/estatus
