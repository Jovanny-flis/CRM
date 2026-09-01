import {
  BarChart3,
  Building2,
  CircleDot,
  FileDown,
  Handshake,
  MapPin,
  Package,
  Send,
  Shield,
  User,
} from 'lucide-react';
import { construirFilasDetalleProspectoGrouer } from '../lib/prospectoGrouerDetalleVista';

const ICONO_GRUPO = {
  contacto: User,
  identidad: Building2,
  domicilio: MapPin,
  semaforos: Shield,
  activo: Package,
  deal: Handshake,
  viabilidad: BarChart3,
};

const CLASE_SEMAFORO = {
  ok: 'border-emerald-400/35 bg-emerald-500/10',
  rojo: 'border-red-400/40 bg-red-500/10',
  sin_dato: 'border-white/10 bg-black/30',
};

const PUNTO_SEMAFORO = {
  ok: 'bg-emerald-400',
  rojo: 'bg-red-500',
  sin_dato: 'bg-slate-500',
};

function CeldaDato({ etiqueta, valor, ancho = 'half', destacado = false, estado = null, neutro = false }) {
  const esFull = ancho === 'full';
  const claseSemaforo = estado ? (CLASE_SEMAFORO[estado] || CLASE_SEMAFORO.sin_dato) : null;
  const claseBase = destacado
    ? 'border-[#ea5533]/30 bg-[#ea5533]/10 col-span-2'
    : claseSemaforo || 'border-white/10 bg-black/30';

  return (
    <div className={`rounded-xl border p-3 ${claseBase} ${esFull ? 'col-span-2' : ''}`}>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
        {estado && (
          <span
            className={`inline-block w-2 h-2 rounded-full shrink-0 ${PUNTO_SEMAFORO[estado] || PUNTO_SEMAFORO.sin_dato}`}
            aria-hidden
          />
        )}
        {etiqueta}
      </p>
      <p
        className={`text-sm font-bold leading-snug tabular-nums ${
          destacado ? 'text-[#ffb89a]' : neutro ? 'text-slate-100' : 'text-slate-100'
        }`}
        title={typeof valor === 'string' ? valor : undefined}
      >
        {valor}
      </p>
    </div>
  );
}

function PanelDetalleProspectoGrouer({
  snapshot,
  pdfDisponible = false,
  onDescargarPdf,
  descargandoPdf = false,
  errorPdf = '',
  onEnviarFlising,
  enviandoFlising = false,
  yaEnviado = false,
  agenteFlisingNombre = '',
  errorEnvio = '',
}) {
  const { grupos } = construirFilasDetalleProspectoGrouer(snapshot);
  const puedePdf = Boolean(pdfDisponible) && typeof onDescargarPdf === 'function';
  const puedeEnviar = typeof onEnviarFlising === 'function' && !yaEnviado;

  return (
    <div className="bg-[#141414] text-white rounded-2xl shadow-xl border border-slate-800 relative overflow-hidden flex flex-col min-h-0 flex-1 max-h-[75vh]">
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#ea5533]/20 via-[#ea5533]/5 to-transparent pointer-events-none" />

      <div className="relative px-5 pt-5 pb-3 border-b border-white/10 shrink-0">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-[#ea5533]/20 border border-[#ea5533]/40 flex items-center justify-center">
            <CircleDot size={18} className="text-[#ea5533]" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-[#ea5533] uppercase tracking-[0.2em]">
              Lead de plataforma GROUER
            </span>
            <p className="text-lg font-black tracking-tight text-white leading-tight mt-0.5">
              Prospecto GROUER
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Solo lectura. El buró vive en el PDF, no en este panel.
            </p>
          </div>
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto px-5 py-4 space-y-5 min-h-0">
        {grupos.map((grupo) => {
          const Icono = ICONO_GRUPO[grupo.id] || Package;
          const esViabilidad = grupo.tipo === 'viabilidad';
          const esSemaforos = grupo.tipo === 'semaforos';
          return (
            <section key={grupo.id}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                  <Icono size={14} className="text-slate-400" />
                </div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {grupo.titulo}
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {grupo.filas.map((fila) => (
                  <CeldaDato
                    key={`${grupo.id}-${fila.etiqueta}`}
                    etiqueta={fila.etiqueta}
                    valor={fila.valor}
                    ancho={fila.ancho}
                    destacado={!esViabilidad && fila.destacado}
                    estado={esSemaforos ? fila.estado : null}
                    neutro={esViabilidad}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="relative px-5 py-4 border-t border-white/10 bg-black/40 shrink-0 space-y-3">
        {errorPdf && (
          <p className="text-xs font-medium text-red-300 bg-red-950/40 border border-red-900/40 rounded-lg px-3 py-2">
            {errorPdf}
          </p>
        )}
        {errorEnvio && (
          <p className="text-xs font-medium text-red-300 bg-red-950/40 border border-red-900/40 rounded-lg px-3 py-2">
            {errorEnvio}
          </p>
        )}
        {yaEnviado && (
          <p className="text-xs font-medium text-sky-200 bg-sky-950/40 border border-sky-800/40 rounded-lg px-3 py-2">
            Enviado a Flising{agenteFlisingNombre ? ` · ${agenteFlisingNombre}` : ''}. El prospecto permanece en esta columna.
          </p>
        )}
        {typeof onEnviarFlising === 'function' && (
          <button
            type="button"
            onClick={puedeEnviar && !enviandoFlising ? onEnviarFlising : undefined}
            disabled={!puedeEnviar || enviandoFlising}
            className={`w-full py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              puedeEnviar && !enviandoFlising
                ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/30'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            <Send size={18} />
            {enviandoFlising
              ? 'Enviando…'
              : yaEnviado
                ? 'Enviado a Flising'
                : 'Enviar a Flising'}
          </button>
        )}
        <button
          type="button"
          onClick={puedePdf && !descargandoPdf ? onDescargarPdf : undefined}
          disabled={!puedePdf || descargandoPdf}
          title={
            !pdfDisponible
              ? 'El informe no está disponible (el análisis no generó reporte).'
              : undefined
          }
          className={`w-full py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
            puedePdf && !descargandoPdf
              ? 'bg-[#ea5533] hover:opacity-90 text-white shadow-lg shadow-[#ea5533]/30'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
          }`}
        >
          <FileDown size={18} />
          {descargandoPdf ? 'Descargando PDF…' : 'Descargar informe GROUER'}
        </button>
      </div>
    </div>
  );
}

export default PanelDetalleProspectoGrouer;
