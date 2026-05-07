import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const ResetPasswordView = () => {
    const [searchParams] = useSearchParams();
    const [nuevaPassword, setNuevaPassword] = useState('');
    const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
    const navigate = useNavigate();
    const token = searchParams.get('token');

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const respuesta = await fetch('http://localhost:3000/api/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, nuevaPassword })
            });
            const datos = await respuesta.json();

            if (respuesta.ok) {
                setMensaje({ texto: "✅ ¡Contraseña actualizada! Redirigiendo...", tipo: 'success' });
                setTimeout(() => navigate('/'), 3000);
            } else {
                setMensaje({ texto: datos.error, tipo: 'error' });
            }
        } catch  {
            setMensaje({ texto: "Error de conexión con el servidor", tipo: 'error' });
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
                <h2 className="text-2xl font-bold text-center mb-6">Nueva Contraseña</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Escribe tu nueva contraseña</label>
                        <input 
                            type="password" 
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                            value={nuevaPassword}
                            onChange={(e) => setNuevaPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition">
                        Actualizar Contraseña
                    </button>
                </form>
                {mensaje.texto && (
                    <p className={`mt-4 text-center text-sm ${mensaje.tipo === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                        {mensaje.texto}
                    </p>
                )}
            </div>
        </div>
    );
};

export default ResetPasswordView;