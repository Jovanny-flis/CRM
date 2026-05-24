# Migraciones CRM

## Instalación nueva

1. `db/schema.sql` — esquema base (`flising_crm` y tablas).
2. Opcional en el mismo servidor: datos iniciales según comentarios al final de `schema.sql`.
3. Aplicar `schema-v2.sql` para extensiones v2 (canales, estatus, historial de etapas).

## Base de datos existente (actualizar al estado del repo)

Ejecutar **una vez** (re-ejecutable sin error):

```bash
mysql -h HOST -u USER -p NOMBRE_BD < db/migrations/schema-v2.sql
```

**DBeaver / clientes gráficos:** usar **Execute SQL Script** (Alt+X), no **Execute SQL Statement** (Ctrl+Enter). El archivo incluye `DELIMITER`, procedimientos almacenados y varios bloques DDL; ejecutar solo la línea bajo el cursor no crea tablas como `lead_etapas_historial`.

El script es **idempotente**: columnas, índices y FKs solo se crean si faltan; la normalización masiva `leads.medio → 'Contacto directo'` corre una sola vez (tabla `_crm_migraciones`).

Verificar tablas v2:

```sql
SHOW TABLES LIKE 'lead_etapas_historial';
SHOW TABLES LIKE 'lead_estatus';
```

## Archivo vigente

| Archivo | Rol |
| ------- | --- |
| `schema-v2.sql` | Única migración acumulada: canales, estatus de prospectos, columnas de cancelación en `leads`, tabla `lead_etapas_historial`. |

Las migraciones parciales `v001`–`v004` fueron retiradas; su contenido está unificado aquí.

## Runtime (complemento)

Tras `schema-v2.sql`, el backend completa catálogos y timestamps en runtime:

- `lib/canales.js` — raíces estándar al crear empresa (`POST /api/empresas`)
- `lib/estatus-leads.js` — estatus sistema y `leads.estatus_id` pendientes en `GET` de leads/estatus
- `lib/lead-etapas-historial.js` — timestamp de etapa inicial al crear lead y al avanzar en `PUT /api/leads/:id/etapa`
