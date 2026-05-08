import axios from 'axios';
// ⚠️ Asegúrate de que esta línea apunte a tu archivo donde configuraste Firebase
import { auth } from './firebase';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL
});

// Espera a que Firebase inicialice y devuelve el usuario actual
const getUsuarioActual = () => {
    return new Promise((resolve) => {
        // Si ya está inicializado, responde inmediatamente
        if (auth.currentUser !== null) {
            return resolve(auth.currentUser);
        }
        // Si no, espera el primer evento de auth
        const unsubscribe = auth.onAuthStateChanged((user) => {
            unsubscribe();
            resolve(user);
        });
    });
};

// Este es el "Interceptor": Detiene cada petición un milisegundo antes de salir
api.interceptors.request.use(async (config) => {
    try {
        // 1. Esperamos a que Firebase confirme sesión (rápido si ya hay currentUser, o el primer onAuthStateChanged)
        const usuarioActual = await getUsuarioActual();

        // 2. Si el usuario existe, generamos su gafete (token)
        if (usuarioActual) {
            const token = await usuarioActual.getIdToken();

            // 3. Pegamos el gafete en el "sobre" de la petición
            config.headers.Authorization = `Bearer ${token}`;
        }
    } catch (error) {
        console.error("Error obteniendo el token de Firebase:", error);
    }

    return config; // Dejamos que la petición continúe su viaje al backend
}, (error) => {
    return Promise.reject(error);
});

export default api;
