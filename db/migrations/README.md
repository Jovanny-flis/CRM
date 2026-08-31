# Migraciones CRM

## Instalación nueva

1. `db/schema.sql` — esquema base (`flising_crm` y tablas).
2. Opcional en el mismo servidor: datos iniciales según comentarios al final de `schema.sql`.
3. Aplicar `schema-v2.sql` para extensiones v2 (canales, estatus, historial de etapas).

## Base de datos existente (actualizar al estado del repo)

Ejecutar **una vez** (re-ejecutable sin error):

```bash
mysql -h HOST -u USER -p NOMBRE_BD < db/migrations/schema-v2.sql
mysql -h HOST -u USER -p NOMBRE_BD < db/migrations/v005_leads_origen_grouer.sql
```

**DBeaver / clientes gráficos:** usar **Execute SQL Script** (Alt+X), no **Execute SQL Statement** (Ctrl+Enter). El archivo incluye `DELIMITER`, procedimientos almacenados y varios bloques DDL; ejecutar solo la línea bajo el cursor no crea tablas como `lead_etapas_historial`.

El script es **idempotente**: columnas, índices y FKs solo se crean si faltan; la normalización masiva `leads.medio → 'Contacto directo'` corre una sola vez (tabla `_crm_migraciones`).

Verificar tablas v2 y v005:

```sql
SHOW TABLES LIKE 'lead_etapas_historial';
SHOW TABLES LIKE 'lead_estatus';
SHOW TABLES LIKE 'leads_origen_grouer';
```

## Archivos vigentes

| Archivo | Rol |
| ------- | --- |
| `schema-v2.sql` | Única migración acumulada v2: canales, estatus de prospectos (**`pendiente_autorizacion`**), columnas de cancelación en `leads`, tabla `lead_etapas_historial`, activo automotriz en `cotizaciones`, **§10** parámetros del cotizador y **§13** cotización especial (`es_especial`, `autorizacion_estado`). |
| `v005_leads_origen_grouer.sql` | Tabla hija `leads_origen_grouer` (snapshot curado del alta GROUER; UNIQUE `solicitud_id`). Idempotente (`CREATE TABLE IF NOT EXISTS`). |

Las migraciones parciales `v001`–`v004` fueron retiradas; su contenido está unificado en `schema-v2.sql`.

Aplicar v005 sobre una base que ya tiene `schema-v2.sql`:

```bash
mysql -h HOST -u USER -p NOMBRE_BD < db/migrations/v005_leads_origen_grouer.sql
```

## Runtime (complemento)

Tras `schema-v2.sql`, el backend completa catálogos y timestamps en runtime:

- `lib/canales.js` — raíces estándar al crear empresa (`POST /api/empresas`)
- `lib/estatus-leads.js` — estatus sistema (`activo`, `pendiente_autorizacion`, `cancelado`) y `leads.estatus_id` pendientes en `GET` de leads/estatus
- `lib/cotizacion-especial.js` — flags al guardar, autorización y vínculo permanente
- `lib/lead-etapas-historial.js` — timestamp de etapa inicial al crear lead y al avanzar en `PUT /api/leads/:id/etapa`
