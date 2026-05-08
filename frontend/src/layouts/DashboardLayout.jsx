import Sidebar from '../components/Sidebar';

const DashboardLayout = ({ children }) => {
  return (
    <div className="flex min-h-screen bg-slate-50 min-w-0">
      {/* El menú lateral fijo */}
      <Sidebar />
      
      {/* El área de contenido (se desplaza a la derecha del sidebar). min-w-0 evita que el kanban ensanche el layout y fuerce scroll en el body. */}
      <main className="relative z-0 min-w-0 flex-1 ml-64 p-8">
        <div className="w-full min-w-0">
          {children}
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;