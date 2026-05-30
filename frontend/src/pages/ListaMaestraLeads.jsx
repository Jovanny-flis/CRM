import React, { useState, useEffect } from 'react';
import api from '../api'; // Conector Axios
import { CLAVE_USUARIO } from '../lib/sesion'; // Ajusta la ruta si es necesario

const ListaMaestraLeads = () => {
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // Obtenemos los datos del Backend al cargar la pantalla
  useEffect(() => {
    const obtenerDatos = async () => {
      try {
// 1. Recuperamos los datos REALES usando la clave oficial de tu sistema
     let empresaId = 0;
     let usuarioId = 0;
     let role = '';

     const usuarioGuardado = localStorage.getItem(CLAVE_USUARIO); // Usamos tu clave oficial
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

        // 2. Usamos 'api.get' en lugar de 'fetch'
        const respuesta = await api.get(`/reportes/maestro-leads?empresa_id=${empresaId}&usuario_id=${usuarioId}&role=${role}`);
        
        // 3. Axios guarda la información dentro de ".data"
        if (respuesta.data && respuesta.data.success) {
          setDatos(respuesta.data.data);
        } else {
          throw new Error(respuesta.data.message || 'Error al obtener los datos');
        }
      } catch (err) {
        // Capturamos cualquier error de red o de base de datos
        console.error(err);
        setError(err.response?.data?.message || err.message || 'Error de conexión');
      } finally {
        setCargando(false);
      }
    };

    obtenerDatos();
  }, []);

  // Función para formatear dinero
  const formatoMoneda = (cantidad) => {
    if (cantidad == null) return '-';
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cantidad);
  };

  // Función para formatear fechas
  const formatoFecha = (fechaString) => {
    if (!fechaString) return '-';
    const fecha = new Date(fechaString);
    return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Directorio Maestro de Leads y Cotizaciones</h1>
        <p className="text-slate-500 text-sm">Vista general de todos los prospectos y su estatus financiero cruzado con el cotizador.</p>
      </div>

      {cargando ? (
        <div className="flex justify-center items-center py-20 text-slate-500 font-medium">
          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Cargando información...
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 flex items-center gap-3">
          <span>⚠️</span>
          <span className="font-medium">{error}</span>
        </div>
      ) : (
        <div className="bg-white overflow-x-auto border border-slate-200 rounded-xl shadow-sm">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase text-xs tracking-wider">
              <tr>
                <th className="px-4 py-4">Fecha</th>
                <th className="px-4 py-4">Prospecto</th>
                <th className="px-4 py-4">Medio</th>
                <th className="px-4 py-4">Agente</th>
                <th className="px-4 py-4">Estatus</th>
                <th className="px-4 py-4">Folio Cot.</th>
                <th className="px-4 py-4">Activo</th>
                <th className="px-4 py-4 text-right">Renta Mensual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {datos.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-12 text-center text-slate-500 font-medium">
                    No hay registros disponibles para mostrar.
                  </td>
                </tr>
              ) : (
                datos.map((fila, index) => (
                  <tr key={index} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatoFecha(fila.lead_fecha_creacion)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {fila.lead_nombre} <br/>
                      <span className="text-xs font-normal text-slate-400">{fila.lead_tipo_persona || 'N/A'}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{fila.lead_medio || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                          {(fila.agente_asignado || 'U')[0].toUpperCase()}
                        </div>
                        {fila.agente_asignado || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium border border-emerald-200">
                        {fila.lead_estatus || 'Nuevo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                      {fila.cotizacion_folio ? <span className="bg-slate-100 px-2 py-1 rounded">FL-{fila.cotizacion_folio}</span> : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate" title={fila.cotizacion_activo}>
                      {fila.cotizacion_activo || '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800">
                      {formatoMoneda(fila.cotizacion_renta_total)}
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