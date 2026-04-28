import Sidebar from '../components/Sidebar';

const DashboardLayout = ({ children }) => {
  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* El menú lateral fijo */}
      <Sidebar />
      
      {/* El área de contenido (se desplaza a la derecha del sidebar) */}
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;