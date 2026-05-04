# Plan de trabajo — CRM a producción

## Hito 1 — Fundamentos del repo (Día 1)
- **Proteger `main` y acordar flujo de branches** con el otro dev. Todo cambio entra por PR, `main` = lo que va a Hostinger.
- **Crear `.env.example`** con todas las variables documentadas: `DB_*`, `PORT`, `EMAIL_*`, `VITE_API_URL`, dejar las futuras variables de Firebase para hito 3 pendientes.
- **Variable de entorno en el frontend**: reemplazar la `baseURL` hardcodeada en `api.js` por `import.meta.env.VITE_API_URL`. Sin esto el build de producción apunta a localhost.

---

## Hito 2 — Schema limpio (Días 1-2)
- **Rediseñar el DDL sin `tenants`**: nueva versión del schema que elimina la tabla obsoleta, limpia `usuarios.tenant_id` y migra `lead_sources` para apuntar a `empresas.id`.
- **Recrear la BD en Hostinger** con el schema nuevo. Los datos actuales son de prueba y se descartan.
- **Documentar el DDL versionado** en el repo como `db/schema.sql` — punto de verdad único del estado de la base de datos.

---

## Hito 3 — Firebase Auth (Días 2-5)
- **Backend — middleware de verificación**: instalar `firebase-admin`, crear middleware `verificarToken` que valide el `idToken` en cada request y exponga `req.user` con uid y rol.
- **Backend — custom claims de rol**: asignar `rol` como custom claim en Firebase para que el backend pueda verificar permisos sin consultar la BD en cada request.
- **Frontend — reemplazar login**: integrar SDK de Firebase cliente, usar `signInWithEmailAndPassword`, adjuntar `idToken` en header `Authorization` de cada llamada Axios.
- **Frontend — retirar gate de localStorage**: eliminar la lógica de auth actual basada en `localStorage`.
- **Ajustar PK de usuarios**: usar el UID de Firebase como `id` en la tabla `usuarios` para mantener consistencia entre Firebase y la BD.

---

## Hito 4 — Seguridad perimetral (Día 5)
- **CORS**: reemplazar `origin: '*'` por el dominio de producción en Hostinger. Mantener `localhost:5173` solo para entorno de desarrollo.
- **TLS**: retirar `NODE_TLS_REJECT_UNAUTHORIZED = '0'` y verificar que SMTP funcione correctamente con TLS válido en producción.
- **Variables SMTP en hPanel**: confirmar que `EMAIL_*` están configuradas en el panel de Hostinger.

---

## Hito 5 — Deploy en Hostinger (Días 5-7)
- **Build del frontend**: ejecutar `npm run build`, el `dist/` resultante se sirve como archivos estáticos desde Hostinger.
- **Configurar la app Node en hPanel**: apuntar el entry point a `index.js`, configurar todas las variables de entorno en el panel.
- **Verificar flujo completo en producción**: login, leads, cotizador y recuperación de contraseña funcionando contra la BD real en Hostinger.
- **Crear usuario `super_admin` inicial** en Firebase Console y con el INSERT correspondiente en la BD.

---

## Backlog — Post-producción
- Separar `index.js` en capas (rutas / controladores / servicios)
- Corregir los 21 errores activos de ESLint
- Tests automatizados (unitarios + integración API)
- CI/CD básico: lint + build en cada PR
- Logging estructurado y manejo centralizado de errores
- Eliminar assets de plantilla Vite del repo (`react.svg`, `vite.svg`, `README.md` interno)
