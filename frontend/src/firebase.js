import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Tus claves secretas de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAFJeLMNxApJcdPLXnGDZx6Zcj9KDxCXbg",
  authDomain: "crm-flising.firebaseapp.com",
  projectId: "crm-flising",
  storageBucket: "crm-flising.firebasestorage.app",
  messagingSenderId: "242858564964",
  appId: "1:242858564964:web:382e57ac51c16a7db52e71"
};

// Inicializamos Firebase
const app = initializeApp(firebaseConfig);

// Exportamos el servicio de Autenticación para usarlo en el Login
export const auth = getAuth(app);