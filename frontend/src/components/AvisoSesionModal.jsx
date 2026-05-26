function AvisoSesionModal({ segundosRestantes, onExtender }) {
  const minutos = Math.floor(segundosRestantes / 60);
  const segundos = segundosRestantes % 60;
  const tiempoTexto =
    minutos > 0
      ? `${minutos}:${String(segundos).padStart(2, '0')}`
      : String(segundos);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
      role="alertdialog"
      aria-labelledby="aviso-sesion-titulo"
      aria-describedby="aviso-sesion-desc"
    >
      <div className="max-w-md w-full rounded-2xl bg-white shadow-xl border border-slate-200 p-6">
        <h2
          id="aviso-sesion-titulo"
          className="text-lg font-bold text-slate-800"
        >
          Tu sesión está por expirar
        </h2>
        <p id="aviso-sesion-desc" className="mt-2 text-sm text-slate-600">
          Por inactividad, cerraremos tu sesión en{' '}
          <span className="font-semibold text-slate-800">{tiempoTexto}</span>.
          ¿Deseas continuar trabajando?
        </p>
        <button
          type="button"
          onClick={onExtender}
          className="mt-6 w-full px-4 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors"
        >
          Seguir conectado
        </button>
      </div>
    </div>
  );
}

export default AvisoSesionModal;
