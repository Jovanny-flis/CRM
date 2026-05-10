import { useState, useEffect } from 'react';
import { auth } from '../firebase'; // Ojo: la ruta '../firebase' depende de dónde tengas guardado tu archivo de configuración de Firebase en el frontend
const EmpresasView = () => {
    const [empresas, setEmpresas] = useState([]);
    const [editandoId, setEditandoId] = useState(null);
    const [formData, setFormData] = useState({
        nombre_comercial: '', rfc: '', direccion: '', telefono: '', correo: '',
        color_principal: '#2563eb', color_secundario: '#64748b'
    });

    useEffect(() => { obtenerEmpresas(); }, []);

// Asegúrate de tener importado 'auth' desde tu archivo de configuración de Firebase del frontend
// Ejemplo: import { auth } from '../firebase'; 

const [accesoDenegado, setAccesoDenegado] = useState(false);

const obtenerEmpresas = async () => {
    try {
        // 1. Le decimos a React que espere a que Firebase confirme el estado de la sesión
        const usuarioActual = await new Promise((resolve) => {
            const unsubscribe = auth.onAuthStateChanged((user) => {
                unsubscribe(); // Nos desuscribimos inmediatamente para no crear un ciclo
                resolve(user);
            });
        });
        
        if (!usuarioActual) {
            console.log("Definitivamente no hay sesión iniciada en el navegador.");
            setEmpresas([]);
            return;
        }

        // 2. Ahora sí, le pedimos a Firebase que nos genere el "gafete" (Token)
        const token = await usuarioActual.getIdToken();

        // 3. Hacemos la petición enviando el token en la cabecera
        const res = await fetch('http://localhost:3000/api/empresas', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}` 
            }
        });

        // 4. Si el backend nos rebota (ej. no es super_admin), limpiamos la pantalla
        if (!res.ok) {
            console.log("Acceso denegado por el backend.");
            setEmpresas([]); 
            setAccesoDenegado(true);
            return;
        }

        // Si todo sale bien, guardamos las empresas
        const data = await res.json();
        setEmpresas(Array.isArray(data) ? data : []);

    } catch (error) {
        console.error("Error al obtener las empresas:", error);
        setEmpresas([]);
    }
};

const handleSubmit = async (e) => {
    e.preventDefault();
    try {
        // 1. Obtenemos el usuario actual de Firebase para sacar el token
        const usuarioActual = auth.currentUser;
        if (!usuarioActual) {
            return alert("❌ No hay una sesión activa. Por favor, vuelve a iniciar sesión.");
        }

        // 2. Generamos el token (el "gafete" de Super Admin)
        const token = await usuarioActual.getIdToken();

        // 3. Hacemos la petición enviando el token en los headers
        const res = await fetch(editandoId 
            ? `http://localhost:3000/api/empresas/${editandoId}` 
            : 'http://localhost:3000/api/empresas', {
            method: editandoId ? 'PUT' : 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` // <--- ESTO ES LO QUE FALTABA
            },
            body: JSON.stringify(formData)
        });

        if (res.ok) {
            alert("✅ ¡Guardado con éxito!");
            cancelarEdicion();
            obtenerEmpresas(); 
        } else {
            const errorData = await res.json();
            alert("❌ Error: " + (errorData.error || "No tienes permisos"));
        }
    } catch (error) {
        console.error(error);
        alert("❌ Error de conexión al servidor");
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

// Si el interruptor de seguridad se activó, mostramos esta pantalla en lugar de la normal
    if (accesoDenegado) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', marginTop: '50px' }}>
                <h1 style={{ color: '#d9534f', fontSize: '3rem' }}>🚫</h1>
                <h2>Acceso Restringido</h2>
                <p>Tu rol actual no tiene permisos para ver o modificar el registro de empresas.</p>
            </div>
        );
    }



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