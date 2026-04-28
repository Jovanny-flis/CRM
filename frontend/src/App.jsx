import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import DashboardLayout from './layouts/DashboardLayout';
import LeadsView from './pages/LeadsView'; 
import AgentesView from './pages/AgentesView';
import LoginView from './pages/LoginView'; 
import ResetPasswordView from "./pages/ResetPasswordView";
import EmpresasView from './pages/EmpresasView';
import PipelinesView from './pages/PipelinesView'; 
import CotizadorView from './pages/CotizadorView';
// Componentes temporales para las otras páginas
const Placeholder = ({ title }) => (
  <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
    <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
    <p className="text-slate-500 mt-2">Próximamente: Gestión de {title.toLowerCase()}.</p>
  </div>
);

function App() {
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    const usuarioGuardado = localStorage.getItem('usuarioCRM');
    if (usuarioGuardado) {
      setUsuario(JSON.parse(usuarioGuardado));
    }
  }, []);

  // Si NO hay usuario, solo permitimos Login y Reset Password
  if (!usuario) {
    return (
      <Router>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordView />} />
          <Route path="*" element={<LoginView onLogin={(datosUsuario) => setUsuario(datosUsuario)} />} />
        </Routes>
      </Router>
    );
  }

  // Si SÍ hay usuario, cargamos el CRM completo
  return (
    <Router>
      <DashboardLayout>
        <Routes>
          <Route path="/" element={<Placeholder title="Dashboard" />} />
          <Route path="/leads" element={<LeadsView />} />
          <Route path="/agentes" element={<AgentesView />} />
          <Route path="/reset-password" element={<ResetPasswordView />} />
          <Route path="/empresas" element={<EmpresasView />} />
           <Route path="/cotizador" element={<CotizadorView />} />
          {/* Aquí está la única y verdadera ruta de pipelines */}
          <Route path="/pipelines" element={<PipelinesView />} />
         
        </Routes>
      </DashboardLayout>
    </Router>
  );
}

export default App;