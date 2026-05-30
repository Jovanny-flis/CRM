import { useState, useEffect } from 'react';
import { auth } from '../firebase'; // Importamos tu configuración de Firebase
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import api from '../api';
import {
  CLAVE_USUARIO,
  consumirMensajeLogin,
  MENSAJES_LOGIN,
} from '../lib/sesion';

function LoginView({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState(''); 
  const [cargando, setCargando] = useState(false);
  const [cargandoRecuperacion, setCargandoRecuperacion] = useState(false);
  const [avisoSesion, setAvisoSesion] = useState('');

  useEffect(() => {
    const tipo = consumirMensajeLogin();
    if (tipo && MENSAJES_LOGIN[tipo]) {
      setAvisoSesion(MENSAJES_LOGIN[tipo]);
    }
  }, []);

const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMensajeExito('');
    setCargando(true);

    try {
      // 1. Iniciamos sesión con Firebase (El guardia de seguridad)
      const credenciales = await signInWithEmailAndPassword(auth, email, password);
      const usuarioFirebase = credenciales.user;

      // 2. Cruzamos el puente hacia MySQL (Buscamos tu perfil real)
      const respuestaBD = await api.post('/login/firebase', {
        uid: usuarioFirebase.uid,
        email: usuarioFirebase.email
      });

      // 3. Obtenemos tus datos oficiales (Rol, Empresa, Nombre, etc.)
      const usuarioOficial = respuestaBD.data.usuario;

      // 4. Guardamos sesión y te dejamos entrar al CRM
      localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuarioOficial));
      if (onLogin) onLogin(usuarioOficial);

    } catch (err) {
      console.error(err);
      
      // Manejo de errores combinados (Firebase o Nuestro Servidor)
      if (err.response?.status === 403) {
        setError(err.response.data.error); // Error si no existe en MySQL
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Correo o contraseña incorrectos.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Demasiados intentos. Intenta más tarde.');
      } else {
        setError('Error al conectar con el servidor.');
      }
    } finally {
      setCargando(false);
    }
  };

  // Función actualizada para usar el sistema de correos de Firebase
  const handleOlvidePassword = async () => {
    if (!email) {
      setError('Por favor, ingresa tu correo electrónico arriba para enviarte el enlace de recuperación.');
      setMensajeExito('');
      return;
    }

    setError('');
    setMensajeExito('');
    setCargandoRecuperacion(true);

    try {
      // Firebase envía el correo automáticamente
      await sendPasswordResetEmail(auth, email);
      setMensajeExito('¡Listo! Te hemos enviado un correo con el enlace para restablecer tu contraseña. (Revisa también tu bandeja de SPAM)');
    } catch (err) {
      console.error("Error de recuperación:", err.code);
      if (err.code === 'auth/user-not-found') {
        setError('No existe ninguna cuenta registrada con este correo.');
      } else if (err.code === 'auth/invalid-email') {
        setError('El formato del correo no es válido.');
      } else {
        setError("Error al solicitar la recuperación. Intenta más tarde.");
      }
    } finally {
      setCargandoRecuperacion(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white max-w-md w-full rounded-3xl shadow-xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in duration-500">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-blue-200">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"></path></svg>
            </div>
            <h2 className="text-2xl font-extrabold text-slate-800">Bienvenido al CRM</h2>
            <p className="text-slate-500 mt-2 text-sm">Ingresa tus credenciales para continuar</p>
          </div>

          {avisoSesion && (
            <div className="bg-amber-50 text-amber-800 p-4 rounded-xl text-sm mb-6 border border-amber-100 flex items-center gap-2 animate-in slide-in-from-top-2">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              <span className="font-medium">{avisoSesion}</span>
            </div>
          )}

          {/* Alerta de Error */}
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm mb-6 border border-red-100 flex items-center gap-2 animate-in slide-in-from-top-2">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* Alerta de Éxito para el correo enviado */}
          {mensajeExito && (
            <div className="bg-green-50 text-green-700 p-4 rounded-xl text-sm mb-6 border border-green-100 flex items-center gap-2 animate-in slide-in-from-top-2">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              <span className="font-medium">{mensajeExito}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Correo Electrónico</label>
              <input 
                type="email" 
                required 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" 
                placeholder="tu@correo.com" 
              />
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Contraseña</label>
                {/* Botón de Olvidé mi contraseña */}
                <button
                  type="button"
                  onClick={handleOlvidePassword}
                  disabled={cargandoRecuperacion}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50"
                >
                  {cargandoRecuperacion ? 'Enviando...' : '¿Olvidaste tu contraseña?'}
                </button>
              </div>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" 
                placeholder="••••••••" 
              />
            </div>
            
            <button 
              type="submit" 
              disabled={cargando}
              className="w-full mt-6 px-4 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {cargando ? 'Verificando...' : 'Iniciar Sesión'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default LoginView;