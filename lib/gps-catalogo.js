/** Ensambla proveedores con sus productos para el cotizador. */
const listarCatalogoGpsEmpresa = async (db, empresaId) => {
    const [proveedores] = await db.query(
        `SELECT id, empresa_id, nombre, created_at
         FROM gps_proveedores
         WHERE empresa_id = ?
         ORDER BY nombre ASC`,
        [empresaId],
    );

    if (!proveedores.length) return [];

    const ids = proveedores.map((p) => p.id);
    const placeholders = ids.map(() => '?').join(', ');
    const [productos] = await db.query(
        `SELECT id, proveedor_id, nombre, precio, created_at
         FROM gps_productos
         WHERE proveedor_id IN (${placeholders})
         ORDER BY nombre ASC`,
        ids,
    );

    const productosPorProveedor = {};
    productos.forEach((prod) => {
        if (!productosPorProveedor[prod.proveedor_id]) {
            productosPorProveedor[prod.proveedor_id] = [];
        }
        productosPorProveedor[prod.proveedor_id].push({
            id: prod.id,
            nombre: prod.nombre,
            precio: Number(prod.precio),
        });
    });

    return proveedores.map((prov) => ({
        id: prov.id,
        empresa_id: prov.empresa_id,
        nombre: prov.nombre,
        productos: productosPorProveedor[prov.id] || [],
    }));
};

const precioGpsValido = (precio) => {
    const n = Number(precio);
    return Number.isFinite(n) && n >= 0;
};

module.exports = {
    listarCatalogoGpsEmpresa,
    precioGpsValido,
};
