import { useState, useEffect } from 'react';
import api from '../api';
import AdminEstatusLeads from '../components/AdminEstatusLeads';

const PipelinesView = () => {
  const [pipelines, setPipelines] = useState([]);
  const [pipelineSeleccionado, setPipelineSeleccionado] = useState(null);
  const [etapas, setEtapas] = useState([]);
  const [cargando, setCargando] = useState(true);
  
  // Modos de la vista
  const [modoCreador, setModoCreador] = useState(false);
  const [editandoPipeline, setEditandoPipeline] = useState(false);
  const [etapaEditando, setEtapaEditando] = useState(null);
  const [nombreEdicion, setNombreEdicion] = useState("");

  // Estados para formularios
  const [borrador, setBorrador] = useState({ 
    nombre: '', 
    clave: '', 
    etapas: [] 
  });
  
  const [formEditPipe, setFormEditPipe] = useState({ 
    nombre: '', 
    clave: '' 
  });
  
  const [nuevaEtapa, setNuevaEtapa] = useState({ 
    nombre_etapa: '', 
    color_hex: '#3b82f6' 
  });

  const usuarioActual = JSON.parse(localStorage.getItem('usuarioCRM') || '{}');
  const empresaId = usuarioActual.empresa_id;

  // ==========================================
  // CARGA INICIAL
  // ==========================================
  useEffect(() => {
    if (empresaId) {
      cargarPipelines();
    } else {
      setCargando(false);
    }
  }, [empresaId]);

  const cargarPipelines = async () => {
    try {
      const resPipes = await api.get(`/pipelines/${empresaId}`);
      setPipelines(resPipes.data);
      
      if (resPipes.data.length > 0) {
        const actual = pipelineSeleccionado 
          ? resPipes.data.find(p => p.id === pipelineSeleccionado.id) 
          : resPipes.data[0];
        seleccionarPipeline(actual || resPipes.data[0]);
      } else {
        setModoCreador(true);
      }
      setCargando(false);
    } catch (error) {
      console.error("Error:", error);
      setCargando(false);
    }
  };

  const seleccionarPipeline = async (pipe) => {
    setPipelineSeleccionado(pipe);
    setFormEditPipe({ nombre: pipe.nombre, clave: pipe.clave });
    setModoCreador(false);
    setEditandoPipeline(false);
    try {
      const resEtapas = await api.get(`/etapas/${pipe.id}`);
      setEtapas(resEtapas.data);
    } catch (error) {
      console.error("Error cargando etapas:", error);
    }
  };

  const guardarCambiosPipeline = async () => {
    try {
      await api.put(`/pipelines/${pipelineSeleccionado.id}`, formEditPipe);
      setEditandoPipeline(false);
      cargarPipelines(); 
    } catch (error) {
      alert("Error al actualizar: " + error.message);
    }
  };

  // ==========================================
  // LÓGICA MODO BORRADOR (NUEVO EMBUDO)
  // ==========================================
  const agregarEtapaBorrador = (e) => {
    e.preventDefault();
    if (!nuevaEtapa.nombre_etapa) return;
    
    setBorrador({
      ...borrador, 
      etapas: [...borrador.etapas, { ...nuevaEtapa, id: Date.now() }] 
    });
    setNuevaEtapa({ nombre_etapa: '', color_hex: '#3b82f6' });
  };

  const quitarEtapaBorrador = (idTemporal) => {
    setBorrador({
      ...borrador, 
      etapas: borrador.etapas.filter(et => et.id !== idTemporal)
    });
  };

  const guardarEmbudoCompleto = async () => {
    if (!borrador.nombre || !borrador.clave || borrador.etapas.length === 0) {
      return alert("Completa todos los datos y agrega al menos una etapa.");
    }
    
    setCargando(true);
    try {
      const resPipe = await api.post('/pipelines', { 
        empresa_id: empresaId, 
        nombre: borrador.nombre, 
        clave: borrador.clave 
      });
      const nuevoPipeId = resPipe.data.id;
      
      await Promise.all(borrador.etapas.map((et, index) => 
        api.post('/etapas', { 
          pipeline_id: nuevoPipeId, 
          nombre_etapa: et.nombre_etapa, 
          orden: index + 1, 
          color_hex: et.color_hex 
        })
      ));
      
      setBorrador({ nombre: '', clave: '', etapas: [] });
      cargarPipelines();
    } catch (error) {
      alert("Error: " + error.message);
      setCargando(false);
    }
  };

  // ==========================================
  // LÓGICA MODO EDICIÓN ETAPAS (EMBUDO EXISTENTE)
  // ==========================================
  const agregarEtapaBd = async (e) => {
    e.preventDefault();
    try {
      await api.post('/etapas', { 
        pipeline_id: pipelineSeleccionado.id, 
        nombre_etapa: nuevaEtapa.nombre_etapa, 
        orden: etapas.length + 1, 
        color_hex: nuevaEtapa.color_hex 
      });
      setNuevaEtapa({ nombre_etapa: '', color_hex: '#3b82f6' });
      seleccionarPipeline(pipelineSeleccionado);
    } catch (error) {
      alert("Error: " + error.message);
    }
  };

  const guardarEdicionEtapa = async (etapa) => {
    if (!nombreEdicion.trim()) return setEtapaEditando(null);
    try {
      await api.put(`/etapas/${etapa.id}`, { 
        nombre_etapa: nombreEdicion, 
        color_hex: etapa.color_hex 
      });
      setEtapaEditando(null);
      seleccionarPipeline(pipelineSeleccionado);
    } catch (error) {
      alert("Error: " + error.message);
    }
  };

  // ==========================================
  // RENDER DE LA PANTALLA
  // ==========================================
  if (cargando) return <div className="p-10 text-slate-500 font-medium text-center">Cargando configuración...</div>;

  return (
    <div className="font-sans animate-in fade-in duration-500 max-w-5xl pb-20 mx-auto p-4">
      
      {/* CABECERA DINÁMICA */}
      <header className="mb-8 flex flex-col md:flex-row md:items-start justify-between gap-6 border-b border-slate-100 pb-6">
        <div className="flex-1">
          {editandoPipeline ? (
            <div className="flex flex-col gap-3 animate-in slide-in-from-top-2">
              <div className="flex gap-2">
                <input 
                  className="text-2xl font-bold text-slate-800 border-b-2 border-blue-500 outline-none bg-transparent"
                  value={formEditPipe.nombre} 
                  onChange={e => setFormEditPipe({...formEditPipe, nombre: e.target.value})} 
                />
                <input 
                  className="text-sm font-bold text-slate-400 border-b-2 border-slate-300 outline-none w-24 uppercase"
                  value={formEditPipe.clave} 
                  onChange={e => setFormEditPipe({...formEditPipe, clave: e.target.value.toUpperCase()})} 
                />
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={guardarCambiosPipeline} 
                  className="bg-green-600 text-white px-3 py-1 rounded-lg text-xs font-bold shadow-sm"
                >
                  Guardar Cambios
                </button>
                <button 
                  onClick={() => setEditandoPipeline(false)} 
                  className="bg-slate-200 text-slate-600 px-3 py-1 rounded-lg text-xs font-bold"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="group">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">
                  {modoCreador ? "Nuevo Embudo" : pipelineSeleccionado?.nombre}
                </h1>
                {!modoCreador && (
                  <button 
                    onClick={() => setEditandoPipeline(true)} 
                    className="text-slate-300 hover:text-blue-500 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                    </svg>
                  </button>
                )}
              </div>
              <p className="text-slate-500 mt-1">
                {modoCreador ? "Diseña un nuevo proceso desde cero." : `ID Clave: ${pipelineSeleccionado?.clave}`}
              </p>
            </div>
          )}
        </div>
        
        {!modoCreador && (
          <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-100">
            <select 
              className="bg-white border border-slate-200 text-slate-700 font-bold rounded-xl px-4 py-2 outline-none focus:border-blue-500 shadow-sm"
              value={pipelineSeleccionado?.id || ''}
              onChange={(e) => seleccionarPipeline(pipelines.find(p => p.id === e.target.value))}
            >
              {pipelines.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            <button 
              onClick={() => setModoCreador(true)}
              className="bg-slate-800 text-white px-4 py-2 rounded-xl font-bold hover:bg-black transition-all flex items-center gap-2 shadow-lg"
            >
              <span>+ Nuevo</span>
            </button>
          </div>
        )}
      </header>

      {/* ========================================================= */}
      {/* VISTA A: MODO BORRADOR (CREANDO NUEVO EMBUDO) */}
      {/* ========================================================= */}
      {modoCreador && (
        <div className="space-y-6 animate-in fade-in zoom-in-95">
          {pipelines.length > 0 && (
            <button 
              onClick={() => setModoCreador(false)} 
              className="text-blue-500 font-bold text-sm hover:underline"
            >
              &larr; Volver a mis embudos
            </button>
          )}
          
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
             
             {/* Datos del Embudo */}
             <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="col-span-2">
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">Nombre del Embudo</label>
                  <input 
                    type="text" 
                    value={borrador.nombre} 
                    onChange={e => setBorrador({...borrador, nombre: e.target.value})} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 outline-none focus:bg-white focus:ring-2 ring-blue-100" 
                    placeholder="Ej. Inmobiliaria, Software..." 
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">Clave</label>
                  <input 
                    type="text" 
                    value={borrador.clave} 
                    onChange={e => setBorrador({...borrador, clave: e.target.value.toUpperCase()})} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 outline-none uppercase font-bold" 
                    placeholder="Ej. INM" 
                  />
                </div>
             </div>
             
             {/* Formulario para agregar etapas al borrador */}
             <h3 className="font-black text-slate-800 mb-4">Columnas del borrador</h3>
             <form onSubmit={agregarEtapaBorrador} className="flex gap-3 mb-6">
                <input 
                  type="text" 
                  value={nuevaEtapa.nombre_etapa} 
                  onChange={e => setNuevaEtapa({...nuevaEtapa, nombre_etapa: e.target.value})} 
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 outline-none" 
                  placeholder="Nombre etapa..." 
                />
                <input 
                  type="color" 
                  value={nuevaEtapa.color_hex} 
                  onChange={e => setNuevaEtapa({...nuevaEtapa, color_hex: e.target.value})} 
                  className="w-16 h-12 rounded-xl cursor-pointer" 
                />
                <button type="submit" className="bg-blue-600 text-white px-6 rounded-2xl font-bold">
                  Agregar
                </button>
             </form>
             
             {/* Vista previa del borrador */}
             <div className="flex gap-4 overflow-x-auto pb-4">
                {borrador.etapas.map(et => (
                  <div key={et.id} className="w-44 h-24 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center relative">
                    <div className="absolute top-0 left-0 w-full h-1" style={{backgroundColor: et.color_hex}}></div>
                    <span className="font-bold text-slate-600 text-sm">{et.nombre_etapa}</span>
                    <button 
                      onClick={() => quitarEtapaBorrador(et.id)} 
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M6 18L18 6M6 6l12 12" strokeWidth="3"></path>
                      </svg>
                    </button>
                  </div>
                ))}
             </div>
             
             <button 
               onClick={guardarEmbudoCompleto} 
               className="w-full mt-6 bg-green-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-green-100 hover:scale-[1.01] transition-transform"
             >
               GUARDAR EMBUDO COMPLETO
             </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* VISTA B: MODO LECTURA/EDICIÓN (EMBUDO YA GUARDADO) */}
      {/* ========================================================= */}
      {!modoCreador && pipelineSeleccionado && (
        <div className="space-y-6">
          
          {/* Formulario para agregar etapa nueva a un embudo existente */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-4">Añadir columna rápida</h3>
            <form onSubmit={agregarEtapaBd} className="flex gap-3">
              <input 
                type="text" 
                value={nuevaEtapa.nombre_etapa} 
                onChange={e => setNuevaEtapa({...nuevaEtapa, nombre_etapa: e.target.value})} 
                className="flex-1 bg-slate-50 border-slate-200 rounded-2xl px-4 py-3 outline-none" 
                placeholder="Ej. Post-Venta..." 
              />
              <input 
                type="color" 
                value={nuevaEtapa.color_hex} 
                onChange={e => setNuevaEtapa({...nuevaEtapa, color_hex: e.target.value})} 
                className="w-16 h-12 rounded-xl cursor-pointer" 
              />
              <button type="submit" className="bg-blue-600 text-white px-6 rounded-2xl font-bold">
                Agregar
              </button>
            </form>
          </div>

          {/* Tarjetas de las etapas guardadas */}
          <div className="flex gap-4 overflow-x-auto pb-6">
            {etapas.map((etapa, index) => (
              <div key={etapa.id} className="min-w-[220px] bg-white border border-slate-200 rounded-3xl p-5 shadow-sm relative group hover:shadow-md transition-shadow">
                <div className="absolute top-0 left-0 w-full h-1.5" style={{backgroundColor: etapa.color_hex}}></div>
                
                <div className="flex justify-between items-start mb-4">
                  <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center text-[10px] font-black text-slate-400">
                    {index + 1}
                  </div>
                  
                  {etapaEditando !== etapa.id && (
                    <button 
                      onClick={() => { setEtapaEditando(etapa.id); setNombreEdicion(etapa.nombre_etapa); }} 
                      className="text-slate-300 hover:text-blue-500"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                      </svg>
                    </button>
                  )}
                </div>
                
                {etapaEditando === etapa.id ? (
                  <div className="flex flex-col gap-2">
                    <input 
                      autoFocus 
                      className="text-sm font-bold border-b-2 border-blue-500 outline-none pb-1" 
                      value={nombreEdicion} 
                      onChange={e => setNombreEdicion(e.target.value)} 
                    />
                    <button 
                      onClick={() => guardarEdicionEtapa(etapa)} 
                      className="text-[10px] bg-blue-600 text-white py-1 rounded-lg font-bold"
                    >
                      Hecho
                    </button>
                  </div>
                ) : (
                  <h4 className="font-bold text-slate-800">{etapa.nombre_etapa}</h4>
                )}
              </div>
            ))}
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 mt-8">
            <AdminEstatusLeads empresaId={empresaId} />
          </div>
        </div>
      )}
    </div>
  );
};

export default PipelinesView;