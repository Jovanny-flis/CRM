import axios from 'axios';
// ⚠️ Asegúrate de que esta línea apunte a tu archivo donde configuraste Firebase
import { auth } from './firebase'; 

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL 
});

// Este es el "Interceptor": Detiene cada petición un milisegundo antes de salir
api.interceptors.request.use(async (config) => {
    try {
        // 1. Esperamos a que Firebase nos confirme quién es el usuario
        const usuarioActual = await new Promise((resolve) => {
            const unsubscribe = auth.onAuthStateChanged((user) => {
                unsubscribe();
                resolve(user);
            });
        });

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