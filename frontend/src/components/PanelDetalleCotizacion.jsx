import {
  AlertTriangle,
  Calendar,
  Car,
  DollarSign,
  FileText,
  Layers,
  Package,
  SlidersHorizontal,
  User,
  UserX,
} from 'lucide-react';
import {
  construirFilasDetalleCotizacion,
  folioEtiqueta,
} from '../lib/cotizacionDetalleVista';

const ACENTO_KPI = {
  blue: 'from-blue-500/25 to-blue-600/5 border-blue-400/30 text-blue-300',
  emerald: 'from-emerald-500/25 to-emerald-600/5 border-emerald-400/30 text-emerald-300',
  slate: 'from-slate-500/20 to-slate-600/5 border-slate-400/25 text-slate-200',
};

const TEMA_TOTAL = {
  naranja: {
    borde: 'border-[#ea5533]/40',
    fondo: 'bg-gradient-to-br from-[#ea5533]/15 to-transparent',
    total: 'bg-[#ea5533] shadow-[#ea5533]/25',
  },
  azul: {
    borde: 'border-blue-500/35',
    fondo: 'bg-gradient-to-br from-blue-500/15 to-transparent',
    total: 'bg-slate-900 border border-slate-700',
    valorTotal: 'text-blue-400',
  },
  slate: {
    borde: 'border-slate-500/35',
    fondo: 'bg-gradient-to-br from-slate-500/10 to-transparent',
    total: 'bg-black/50 border border-white/10',
  },
};

const ICONO_GRUPO = {
  activo: Package,
  condiciones: SlidersHorizontal,
  extras: Layers,
};

function CeldaParametro({ etiqueta, valor, ancho = 'half', destacado = false }) {
  const esFull = ancho === 'full';
  return (
    <div
      className={`rounded-xl border p-3 ${
        destacado
          ? 'border-[#ea5533]/30 bg-[#ea5533]/10 col-span-2'
          : 'border-white/10 bg-black/30'
      } ${esFull ? 'col-span-2' : ''}`}
    >
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
        {etiqueta}
      </p>
      <p
        className={`text-sm font-bold leading-snug ${
          destacado ? 'text-[#ffb89a]' : 'text-slate-100'
        } ${esFull ? '' : 'truncate'}`}
        title={typeof valor === 'string' ? valor : undefined}
      >
        {valor}
      </p>
    </div>
  );
}

function TarjetaTotal({ grupo }) {
  const tema = TEMA_TOTAL[grupo.tema] || TEMA_TOTAL.slate;
  const filaDestacada = grupo.filas.find((f) => f.destacado);
  const filasDetalle = grupo.filas.filter((f) => !f.destacado);

  return (
    <div
      className={`rounded-2xl border p-4 flex flex-col ${tema.borde} ${tema.fondo}`}
    >
      <div className="mb-3">
        <h4 className="text-sm font-bold text-white">{grupo.grupo}</h4>
        {grupo.subtitulo && (
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">
            {grupo.subtitulo}
          </p>
        )}
      </div>

      <div className="space-y-2 flex-1 text-sm">
        {filasDetalle.map((fila) => (
          <div key={fila.etiqueta} className="flex justify-between gap-2 text-slate-400">
            <span className="shrink-0">{fila.etiqueta}</span>
            <span className="text-slate-200 font-medium text-right tabular-nums">{fila.valor}</span>
          </div>
        ))}
      </div>

      {filaDestacada && (
        <div
          className={`mt-3 p-3 rounded-xl flex justify-between items-center gap-2 ${tema.total}`}
        >
          <span className="text-xs font-bold text-white/90">{filaDestacada.etiqueta}</span>
          <span
            className={`font-black text-lg tabular-nums ${
              tema.valorTotal || 'text-white'
            }`}
          >
            {filaDestacada.valor}
          </span>
        </div>
      )}
    </div>
  );
}

function BloqueProspecto({ tieneProspecto, nombre, agenteNombre }) {
  if (tieneProspecto) {
    return (
      <div className="rounded-2xl border border-blue-500/35 bg-gradient-to-r from-blue-500/15 via-blue-600/5 to-transparent p-4 flex gap-4 items-start">
        <div className="shrink-0 w-11 h-11 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
          <User size={22} className="text-blue-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold text-blue-400/90 uppercase tracking-widest mb-1">
            Prospecto vinculado
          </p>
          <p className="text-base font-bold text-white truncate">{nombre}</p>
          {agenteNombre && (
            <p className="text-xs text-slate-400 mt-1">
              Agente: <span className="text-slate-200">{agenteNombre}</span>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="rounded-2xl border-2 border-amber-500/60 bg-gradient-to-br from-amber-500/25 via-amber-600/10 to-amber-900/20 p-5 flex gap-4 items-start shadow-lg shadow-amber-900/20"
    >
      <div className="shrink-0 w-12 h-12 rounded-xl bg-amber-500/30 border-2 border-amber-400/50 flex items-center justify-center">
        <UserX size={24} className="text-amber-200" strokeWidth={2.5} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/40 border border-amber-400/50 text-[10px] font-black uppercase tracking-wider text-amber-950">
            <AlertTriangle size={12} />
            Sin prospecto
          </span>
        </div>
        <p className="text-base font-black text-amber-50 leading-snug">
          Cotización no asignada a ningún prospecto
        </p>
        <p className="text-sm text-amber-100/85 mt-2 leading-relaxed">
          Vincula esta cotización a un lead desde el historial para poder generar el PDF y
          dar seguimiento comercial.
        </p>
      </div>
    </div>
  );
}

function PanelDetalleCotizacion({
  cotizacion,
  prospectoNombre,
  agenteNombre,
  onGenerarPdf,
  generandoPdf = false,
  mostrarAcciones = true,
}) {
  if (!cotizacion) return null;

  const {
    parametrosGrupos,
    totales,
    kpis,
    plazo,
    folio,
    productoResumen,
    automotriz,
  } = construirFilasDetalleCotizacion(cotizacion);

  const tieneProspecto = Boolean(cotizacion.lead_id);
  const puedePdf = tieneProspecto && typeof onGenerarPdf === 'function';
  const nombreProspecto = prospectoNombre || cotizacion.lead_nombre || 'Prospecto vinculado';

  return (
    <div className="bg-[#141414] text-white rounded-2xl shadow-2xl border border-slate-800 relative overflow-hidden flex flex-col max-h-[85vh]">
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#ea5533]/20 via-[#ea5533]/5 to-transparent pointer-events-none" />
      <div className="absolute top-0 right-0 w-40 h-40 bg-[#ea5533]/8 rounded-bl-[100%] pointer-events-none" />

      {/* Encabezado */}
      <div className="relative px-6 pt-6 pb-4 border-b border-white/10">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 w-12 h-12 rounded-2xl bg-[#ea5533]/20 border border-[#ea5533]/40 flex items-center justify-center">
              <FileText size={22} className="text-[#ea5533]" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-[#ea5533] uppercase tracking-[0.2em]">
                Cotización
              </span>
              <div className="text-3xl font-black tracking-tight">{folioEtiqueta(folio)}</div>
              {productoResumen && productoResumen !== '—' && (
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 max-w-[280px] truncate">
                  {automotriz ? <Car size={14} className="shrink-0" /> : <Package size={14} className="shrink-0" />}
                  <span className="truncate">{productoResumen}</span>
                </p>
              )}
            </div>
          </div>
          {plazo != null && (
            <span className="inline-flex items-center gap-1.5 bg-white/10 px-4 py-2 rounded-full text-sm font-bold border border-white/15">
              <Calendar size={16} className="text-[#ea5533]" />
              {plazo} meses
            </span>
          )}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2 mt-5">
          {kpis.map((kpi) => (
            <div
              key={kpi.id}
              className={`rounded-xl border bg-gradient-to-br p-3 ${ACENTO_KPI[kpi.acento] || ACENTO_KPI.slate}`}
            >
              <p className="text-[9px] font-bold uppercase tracking-wider opacity-80 mb-1">
                {kpi.etiqueta}
              </p>
              <p className="text-sm font-black tabular-nums leading-tight">{kpi.valor}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto px-6 py-5 space-y-5">
        <BloqueProspecto
          tieneProspecto={tieneProspecto}
          nombre={nombreProspecto}
          agenteNombre={agenteNombre ?? cotizacion.agente_nombre}
        />

        {/* Parámetros por grupo */}
        {parametrosGrupos.map((grupo) => {
          const Icono = ICONO_GRUPO[grupo.id] || Package;
          return (
            <section key={grupo.id}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                  <Icono size={16} className="text-slate-400" />
                </div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {grupo.titulo}
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {grupo.filas.map((fila) => (
                  <CeldaParametro
                    key={`${grupo.id}-${fila.etiqueta}`}
                    etiqueta={fila.etiqueta}
                    valor={fila.valor}
                    ancho={fila.ancho}
                    destacado={fila.destacado}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {/* Totales en tarjetas */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
              <DollarSign size={16} className="text-slate-400" />
            </div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Resumen financiero
            </h3>
          </div>
          <div className="flex flex-col gap-3">
            {totales.map((grupo) => (
              <TarjetaTotal key={grupo.id} grupo={grupo} />
            ))}
          </div>
        </section>
      </div>

      {mostrarAcciones && (
        <div className="relative px-6 py-4 border-t border-white/10 bg-black/40">
          <button
            type="button"
            onClick={puedePdf ? onGenerarPdf : undefined}
            disabled={!puedePdf || generandoPdf}
            title={
              !tieneProspecto
                ? 'Vincula la cotización a un prospecto para generar el PDF'
                : !onGenerarPdf
                  ? 'Generación de PDF en actualización'
                  : undefined
            }
            className={`w-full py-3.5 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              puedePdf && !generandoPdf
                ? 'bg-[#ea5533] hover:opacity-90 text-white shadow-lg shadow-[#ea5533]/30'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            <FileText size={18} />
            {generandoPdf ? 'Generando PDF…' : 'Generar PDF'}
            {!tieneProspecto && (
              <span className="text-[10px] font-normal opacity-80 ml-1">(requiere prospecto)</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default PanelDetalleCotizacion;
