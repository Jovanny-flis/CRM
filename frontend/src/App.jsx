import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import DashboardLayout from './layouts/DashboardLayout';
import LeadsView from './pages/LeadsView'; 
import AgentesView from './pages/AgentesView';
import LoginView from './pages/LoginView'; 
import EmpresasView from './pages/EmpresasView';
import PipelinesView from './pages/PipelinesView'; 
import CotizadorView from './pages/CotizadorView';
import DashboardView from './pages/DashboardView';

// 🛡️ NUEVO: ESTE ES NUESTRO CADENERO DEL FRONTEND
const RutaProtegida = ({ rolesPermitidos, rolActual, children }) => {
  // Si el rol del usuario no está en la lista VIP, mostramos el mensaje de bloqueo
  if (!rolesPermitidos.includes(rolActual)) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', marginTop: '100px' }}>
        <h1 style={{ fontSize: '4rem', marginBottom: '10px' }}>🚫</h1>
        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#333' }}>Acceso Restringido</h2>
        <p style={{ color: '#666', marginTop: '10px' }}>
          No tienes los permisos necesarios para navegar a esta sección.
        </p>
      </div>
    );
  }
  // Si sí tiene permiso, dibujamos la pantalla normal
  return children;
};

function App() {
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    const usuarioGuardado = localStorage.getItem('usuarioCRM');
    if (usuarioGuardado) {
      setUsuario(JSON.parse(usuarioGuardado));
    }
  }, []);

  if (!usuario) {
    return (
      <Router>
        <Routes>
          <Route path="*" element={<LoginView onLogin={(datosUsuario) => setUsuario(datosUsuario)} />} />
        </Routes>
      </Router>
    );
  }

  return (
    <Router>
      <DashboardLayout>
        <Routes>
          {/* Rutas para TODOS (Super admin, admin, supervisor, agente) */}
          <Route path="/" element={<DashboardView />} />
          <Route path="/leads" element={<LeadsView />} />
          <Route path="/cotizador" element={<CotizadorView />} />
          
          {/* 🛡️ Rutas PROTEGIDAS (Ejemplo: Solo admins ven Empresas y Agentes) */}
          <Route path="/empresas" element={
            <RutaProtegida rolesPermitidos={['super_admin']} rolActual={usuario.rol}>
              <EmpresasView />
            </RutaProtegida>
          } />

          <Route path="/agentes" element={
            <RutaProtegida rolesPermitidos={['super_admin', 'admin_empresa', 'supervisor']} rolActual={usuario.rol}>
              <AgentesView />
            </RutaProtegida>
          } />

          {/* Ajusta esta lista según quién quieras que modifique los pipelines */}
          <Route path="/pipelines" element={
            <RutaProtegida rolesPermitidos={['super_admin', 'admin_empresa']} rolActual={usuario.rol}>
              <PipelinesView />
            </RutaProtegida>
          } />

        </Routes>
      </DashboardLayout>
    </Router>
  );
}

export default App;