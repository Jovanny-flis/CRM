import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AVISO_PREVIO_MS,
  CLAVE_PESTANA_ACTIVA,
  TIEMPO_INACTIVIDAD_MS,
  bloqueoPestanaVigente,
  cerrarSesion,
  iniciarLatidoPestana,
  leerBloqueoPestana,
  liberarPestana,
  obtenerTabId,
  reclamarPestana,
} from '../lib/sesion';

const EVENTOS_ACTIVIDAD = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
  'click',
];

const THROTTLE_ACTIVIDAD_MS = 1000;

/**
 * Control de inactividad (20 min + aviso 2 min antes) y una sola pestaña activa.
 */
export function useGestionSesion(activo, onSesionCerrada) {
  const [mostrarAviso, setMostrarAviso] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(
    Math.floor(AVISO_PREVIO_MS / 1000)
  );

  const tabIdRef = useRef(null);
  const ultimaActividadRef = useRef(Date.now());
  const ultimoThrottleRef = useRef(0);
  const timerAvisoRef = useRef(null);
  const timerCierreRef = useRef(null);
  const intervaloCuentaRef = useRef(null);
  const cerrandoRef = useRef(false);

  const limpiarTimers = useCallback(() => {
    if (timerAvisoRef.current) clearTimeout(timerAvisoRef.current);
    if (timerCierreRef.current) clearTimeout(timerCierreRef.current);
    if (intervaloCuentaRef.current) clearInterval(intervaloCuentaRef.current);
    timerAvisoRef.current = null;
    timerCierreRef.current = null;
    intervaloCuentaRef.current = null;
  }, []);

  const ejecutarCierre = useCallback(
    async (razon) => {
      if (cerrandoRef.current) return;
      cerrandoRef.current = true;
      limpiarTimers();
      setMostrarAviso(false);
      const tabId = tabIdRef.current;
      await cerrarSesion({ razon, tabId });
      onSesionCerrada();
    },
    [limpiarTimers, onSesionCerrada]
  );

  const iniciarCuentaRegresiva = useCallback(() => {
    if (intervaloCuentaRef.current) clearInterval(intervaloCuentaRef.current);
    const fin = Date.now() + AVISO_PREVIO_MS;
    setSegundosRestantes(Math.ceil(AVISO_PREVIO_MS / 1000));

    intervaloCuentaRef.current = setInterval(() => {
      const restante = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
      setSegundosRestantes(restante);
      if (restante <= 0 && intervaloCuentaRef.current) {
        clearInterval(intervaloCuentaRef.current);
        intervaloCuentaRef.current = null;
      }
    }, 250);
  }, []);

  const programarTimers = useCallback(() => {
    limpiarTimers();
    const ahora = Date.now();
    const msDesdeActividad = ahora - ultimaActividadRef.current;
    const msHastaAviso = TIEMPO_INACTIVIDAD_MS - AVISO_PREVIO_MS - msDesdeActividad;
    const msHastaCierre = TIEMPO_INACTIVIDAD_MS - msDesdeActividad;

    if (msHastaCierre <= 0) {
      ejecutarCierre('inactividad');
      return;
    }

    if (msHastaAviso <= 0) {
      setMostrarAviso(true);
      iniciarCuentaRegresiva();
      timerCierreRef.current = setTimeout(
        () => ejecutarCierre('inactividad'),
        msHastaCierre
      );
      return;
    }

    timerAvisoRef.current = setTimeout(() => {
      setMostrarAviso(true);
      iniciarCuentaRegresiva();
      timerCierreRef.current = setTimeout(
        () => ejecutarCierre('inactividad'),
        AVISO_PREVIO_MS
      );
    }, msHastaAviso);
  }, [ejecutarCierre, iniciarCuentaRegresiva, limpiarTimers]);

  const registrarActividad = useCallback(() => {
    const ahora = Date.now();
    if (ahora - ultimoThrottleRef.current < THROTTLE_ACTIVIDAD_MS) return;
    ultimoThrottleRef.current = ahora;
    ultimaActividadRef.current = ahora;
    setMostrarAviso(false);
    programarTimers();
  }, [programarTimers]);

  const extenderSesion = useCallback(() => {
    ultimaActividadRef.current = Date.now();
    setMostrarAviso(false);
    programarTimers();
  }, [programarTimers]);

  useEffect(() => {
    if (!activo) return undefined;

    cerrandoRef.current = false;
    const tabId = obtenerTabId();
    tabIdRef.current = tabId;
    ultimaActividadRef.current = Date.now();

    // La pestaña que carga o se enfoca toma el control; las demás reciben el evento storage.
    reclamarPestana(tabId);
    const latidoId = iniciarLatidoPestana(tabId);
    programarTimers();

    const onActividad = () => registrarActividad();
    EVENTOS_ACTIVIDAD.forEach((ev) =>
      window.addEventListener(ev, onActividad, { passive: true })
    );

    const onStorage = (e) => {
      if (e.key !== CLAVE_PESTANA_ACTIVA && e.key !== null) return;
      const actual = leerBloqueoPestana();
      if (
        bloqueoPestanaVigente(actual) &&
        actual.tabId !== tabId &&
        !cerrandoRef.current
      ) {
        ejecutarCierre('otra_pestana');
      }
    };
    window.addEventListener('storage', onStorage);

    const onFocus = () => {
      if (!cerrandoRef.current) reclamarPestana(tabId);
    };
    window.addEventListener('focus', onFocus);

    const onAntesDeCerrar = () => liberarPestana(tabId);
    window.addEventListener('beforeunload', onAntesDeCerrar);

    return () => {
      limpiarTimers();
      clearInterval(latidoId);
      EVENTOS_ACTIVIDAD.forEach((ev) =>
        window.removeEventListener(ev, onActividad)
      );
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('beforeunload', onAntesDeCerrar);
      liberarPestana(tabId);
    };
  }, [
    activo,
    ejecutarCierre,
    limpiarTimers,
    programarTimers,
    registrarActividad,
  ]);

  return { mostrarAviso, segundosRestantes, extenderSesion };
}
