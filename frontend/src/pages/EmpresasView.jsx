import { useState, useEffect } from 'react';

const EmpresasView = () => {
    const [empresas, setEmpresas] = useState([]);
    const [editandoId, setEditandoId] = useState(null);
    const [formData, setFormData] = useState({
        nombre_comercial: '', rfc: '', direccion: '', telefono: '', correo: '',
        color_principal: '#2563eb', color_secundario: '#64748b'
    });

    useEffect(() => { obtenerEmpresas(); }, []);

    const obtenerEmpresas = async () => {
        const res = await fetch('http://localhost:3000/api/empresas');
        const data = await res.json();
        setEmpresas(Array.isArray(data) ? data : []);
    };

const handleSubmit = async (e) => {
    e.preventDefault();
    // Esto enviará 'nombre_comercial' al backend
    try {
        const res = await fetch(editandoId 
            ? `http://localhost:3000/api/empresas/${editandoId}` 
            : 'http://localhost:3000/api/empresas', {
            method: editandoId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData) // formData ya tiene nombre_comercial
        });

        if (res.ok) {
            alert("✅ ¡Guardado con éxito!");
            cancelarEdicion();
            obtenerEmpresas(); // Esto recargará la tabla de abajo
        } else {
            const errorData = await res.json();
            alert("❌ Error: " + errorData.error);
        }
    } catch (error) {
        alert("❌ Error de conexión");
    }
};

    const eliminarEmpresa = async (id) => {
        if (!confirm("¿Seguro que quieres eliminar esta empresa?")) return;
        const res = await fetch(`http://localhost:3000/api/empresas/${id}`, { method: 'DELETE' });
        if (res.ok) obtenerEmpresas();
        else alert("No se puede eliminar: tiene datos vinculados.");
    };

    const cargarEdicion = (emp) => {
        setEditandoId(emp.id);
        setFormData({
            nombre_comercial: emp.nombre_comercial, rfc: emp.rfc, direccion: emp.direccion,
            telefono: emp.telefono, correo: emp.correo,
            color_principal: emp.color_principal, color_secundario: emp.color_secundario
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const cancelarEdicion = () => {
        setEditandoId(null);
        setFormData({ nombre_comercial: '', rfc: '', direccion: '', telefono: '', correo: '', color_principal: '#2563eb', color_secundario: '#64748b' });
    };

    return (
        <div className="p-8 bg-slate-50 min-h-screen">
            <h1 className="text-3xl font-bold text-slate-800 mb-8">
                {editandoId ? '📝 Editando Empresa' : '🏢 Registro de Empresas'}
            </h1>
            
            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-sm border mb-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <input type="text" placeholder="Nombre Comercial" className="w-full p-2 border rounded-lg" value={formData.nombre_comercial} onChange={e => setFormData({...formData, nombre_comercial: e.target.value})} required />
                        <input type="text" placeholder="RFC" className="w-full p-2 border rounded-lg" value={formData.rfc} onChange={e => setFormData({...formData, rfc: e.target.value})} />
                        <input type="text" placeholder="Dirección" className="w-full p-2 border rounded-lg" value={formData.direccion} onChange={e => setFormData({...formData, direccion: e.target.value})} />
                        <div className="flex gap-4">
                            <input type="text" placeholder="Teléfono" className="w-1/2 p-2 border rounded-lg" value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} />
                            <input type="email" placeholder="Correo" className="w-1/2 p-2 border rounded-lg" value={formData.correo} onChange={e => setFormData({...formData, correo: e.target.value})} />
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <input type="color" className="h-10 w-20" value={formData.color_principal} onChange={e => setFormData({...formData, color_principal: e.target.value})} />
                            <span>Color Principal</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <input type="color" className="h-10 w-20" value={formData.color_secundario} onChange={e => setFormData({...formData, color_secundario: e.target.value})} />
                            <span>Color Secundario</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-4 mt-8">
                    <button className={`flex-1 py-3 rounded-xl font-bold text-white transition ${editandoId ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
                        {editandoId ? 'Actualizar Cambios' : 'Registrar Empresa'}
                    </button>
                    {editandoId && <button type="button" onClick={cancelarEdicion} className="px-6 py-3 bg-slate-200 rounded-xl font-bold">Cancelar</button>}
                </div>
            </form>

            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b">
                        <tr>
                            <th className="p-4">Empresa</th>
                            <th className="p-4">Contacto</th>
                            <th className="p-4">Colores</th>
                            <th className="p-4 text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {empresas.map(emp => (
                            <tr key={emp.id} className="border-b hover:bg-slate-50 transition">
                                <td className="p-4">
                                    <div className="font-bold">{emp.nombre_comercial}</div>
                                    <div className="text-xs text-slate-400">RFC: {emp.rfc}</div>
                                </td>
                                <td className="p-4 text-sm">
                                    <div>{emp.correo}</div>
                                    <div className="text-slate-400">{emp.telefono}</div>
                                </td>
                                <td className="p-4">
                                    <div className="flex gap-1">
                                        <div className="w-5 h-5 rounded-full border" style={{backgroundColor: emp.color_principal}}></div>
                                        <div className="w-5 h-5 rounded-full border" style={{backgroundColor: emp.color_secundario}}></div>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="flex justify-center gap-2">
                                        <button onClick={() => cargarEdicion(emp)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg">Editar</button>
                                        <button onClick={() => eliminarEmpresa(emp.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">Eliminar</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default EmpresasView;