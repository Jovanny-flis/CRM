import React, { useState, useEffect } from 'react';
import api from '../api'; 
import { CLAVE_USUARIO } from '../lib/sesion'; 

const ListaMaestraLeads = () => {
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const obtenerDatos = async () => {
      try {
        let empresaId = 0;
        let usuarioId = 0;
        let role = '';

        const usuarioGuardado = localStorage.getItem(CLAVE_USUARIO); 
        if (usuarioGuardado) {
          try {
            const userObj = JSON.parse(usuarioGuardado);
            empresaId = userObj.empresa_id || 0;
            usuarioId = userObj.id || 0;
            role = userObj.rol || userObj.role || '';
          } catch (e) {
            console.warn("Error leyendo sesión", e);
          }
        }

        const respuesta = await api.get(`/reportes/maestro-leads?empresa_id=${empresaId}&usuario_id=${usuarioId}&role=${role}`);
        
        if (respuesta.data && respuesta.data.success) {
          setDatos(respuesta.data.data);
        } else {
          throw new Error(respuesta.data.message || 'Error al obtener los datos');
        }
      } catch (err) {
        console.error(err);
        setError(err.response?.data?.message || err.message || 'Error de conexión');
      } finally {
        setCargando(false);
      }
    };

    obtenerDatos();
  }, []);

  const formatoMoneda = (cantidad) => {
    if (cantidad == null) return '-';
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cantidad);
  };

  const formatoFecha = (fechaString) => {
    if (!fechaString) return '-';
    const fecha = new Date(fechaString);
    return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="mb-8">
        {/* Aquí cambiamos text-slate-800 por text-primary para el color dinámico */}
        <h1 className="text-2xl font-extrabold text-primary tracking-tight">Directorio Maestro de Leads y Cotizaciones</h1>
        <p className="text-slate-500 text-sm mt-1">Vista general de todos los prospectos y su estatus financiero cruzado con el cotizador.</p>
      </div>

      {cargando ? (
        <div className="flex justify-center items-center py-20 text-slate-500 font-medium">
          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Cargando información...
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 flex items-center gap-3 shadow-sm">
          <span>⚠️</span>
          <span className="font-medium">{error}</span>
        </div>
      ) : (
        <div className="bg-white overflow-x-auto border border-slate-100 rounded-2xl shadow-sm">
          <table className="w-full min-w-max text-sm text-left">
            <thead className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-100 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-6 py-4 rounded-tl-2xl whitespace-nowrap">Fecha</th>
                <th className="px-6 py-4">Prospecto</th>
                <th className="px-6 py-4 whitespace-nowrap">Medio</th>
                <th className="px-6 py-4 whitespace-nowrap">Agente</th>
                <th className="px-6 py-4 whitespace-nowrap">Estatus</th>
                <th className="px-6 py-4 whitespace-nowrap">Folio Cot.</th>
                <th className="px-6 py-4">Activo</th>
                <th className="px-6 py-4 text-right rounded-tr-2xl whitespace-nowrap">Renta Mensual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {datos.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-12 text-center text-slate-400 font-medium bg-slate-50/50">
                    No hay registros disponibles para mostrar.
                  </td>
                </tr>
              ) : (
                datos.map((fila, index) => (
                  <tr key={index} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4 text-slate-500 whitespace-nowrap text-xs">
                      {formatoFecha(fila.lead_fecha_creacion)}
                    </td>
                    
                    {/* AQUÍ ESTÁ LA MAGIA DEL TEXTO: max-w-[300px] + whitespace-normal + break-words */}
                    <td className="px-6 py-4 min-w-[200px] max-w-[300px] whitespace-normal break-words">
                      {/* leading-tight hace que el espacio entre las líneas del texto largo se vea más estético */}
                      <div className="font-bold text-slate-800 leading-tight">{fila.lead_nombre}</div>
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-1">
                        {fila.lead_tipo_persona || 'N/A'}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-md font-medium border border-slate-200/60 inline-block">
                        {fila.lead_medio || '-'}
                      </span>
                    </td>
                    
                    <td className="px-6 py-4 text-slate-600 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold border border-primary/20 shrink-0">
                          {(fila.agente_asignado || 'U')[0].toUpperCase()}
                        </div>
                        <span className="text-sm">{fila.agente_asignado || '-'}</span>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-bold uppercase tracking-wider border border-slate-200 group-hover:border-slate-300 transition-colors inline-block">
                        {fila.lead_estatus || 'Nuevo'}
                      </span>
                    </td>
                    
                    <td className="px-6 py-4 font-mono text-xs font-medium whitespace-nowrap">
                      {fila.cotizacion_folio ? (
                        <span className="text-primary bg-primary/5 border border-primary/10 px-2 py-1.5 rounded-md shadow-sm inline-block">
                          FL-{fila.cotizacion_folio}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    
                    <td className="px-6 py-4 text-slate-600 text-xs font-medium max-w-[250px] truncate" title={fila.cotizacion_activo}>
                      {fila.cotizacion_activo || '-'}
                    </td>
                    
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <span className="font-extrabold text-slate-800 text-sm">
                        {formatoMoneda(fila.cotizacion_renta_total)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ListaMaestraLeads;