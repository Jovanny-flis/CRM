import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

/** Tiempo sin actividad antes de cerrar sesión (fijo: 20 min). */
export const TIEMPO_INACTIVIDAD_MS = 20 * 60 * 1000;

/** Aviso previo al cierre (fijo: 2 min). */
export const AVISO_PREVIO_MS = 2 * 60 * 1000;

export const CLAVE_USUARIO = 'usuarioCRM';
export const CLAVE_PESTANA_ACTIVA = 'crm_pestana_activa';
export const CLAVE_TAB_ID = 'crm_tab_id';
export const CLAVE_MENSAJE_LOGIN = 'crm_mensaje_login';

/** Si el latido de otra pestaña supera este umbral, el bloqueo se considera libre. */
const LATIDO_OBSOLETO_MS = 5000;
const INTERVALO_LATIDO_MS = 2000;

export function obtenerTabId() {
  let tabId = sessionStorage.getItem(CLAVE_TAB_ID);
  if (!tabId) {
    tabId = crypto.randomUUID();
    sessionStorage.setItem(CLAVE_TAB_ID, tabId);
  }
  return tabId;
}

export function leerBloqueoPestana() {
  try {
    const raw = localStorage.getItem(CLAVE_PESTANA_ACTIVA);
    if (!raw) return null;
    const datos = JSON.parse(raw);
    if (!datos?.tabId || typeof datos.ultimoLatido !== 'number') return null;
    return datos;
  } catch {
    return null;
  }
}

export function bloqueoPestanaVigente(bloqueo) {
  if (!bloqueo) return false;
  return Date.now() - bloqueo.ultimoLatido < LATIDO_OBSOLETO_MS;
}

export function esDuenoDePestana(tabId) {
  const bloqueo = leerBloqueoPestana();
  return bloqueo?.tabId === tabId && bloqueoPestanaVigente(bloqueo);
}

export function reclamarPestana(tabId) {
  localStorage.setItem(
    CLAVE_PESTANA_ACTIVA,
    JSON.stringify({ tabId, ultimoLatido: Date.now() })
  );
}

export function liberarPestana(tabId) {
  const bloqueo = leerBloqueoPestana();
  if (bloqueo?.tabId === tabId) {
    localStorage.removeItem(CLAVE_PESTANA_ACTIVA);
  }
}

export function registrarMensajeLogin(tipo) {
  sessionStorage.setItem(CLAVE_MENSAJE_LOGIN, tipo);
}

export function consumirMensajeLogin() {
  const tipo = sessionStorage.getItem(CLAVE_MENSAJE_LOGIN);
  if (tipo) sessionStorage.removeItem(CLAVE_MENSAJE_LOGIN);
  return tipo;
}

export const MENSAJES_LOGIN = {
  inactividad:
    'Tu sesión expiró por inactividad (20 minutos). Vuelve a iniciar sesión.',
  otra_pestana:
    'Se abrió el CRM en otra ventana o pestaña. Esta sesión se cerró; solo puede haber una pestaña activa.',
};

/**
 * Cierra Firebase, limpia perfil CRM y libera el bloqueo de pestaña si corresponde.
 * @param {{ razon?: 'inactividad' | 'otra_pestana' | 'manual', tabId?: string }} opciones
 */
export async function cerrarSesion(opciones = {}) {
  const { razon, tabId } = opciones;

  if (razon === 'inactividad') registrarMensajeLogin('inactividad');
  if (razon === 'otra_pestana') registrarMensajeLogin('otra_pestana');

  if (tabId) liberarPestana(tabId);

  try {
    await signOut(auth);
  } catch (err) {
    console.error('Error al cerrar sesión en Firebase:', err);
  }

  localStorage.removeItem(CLAVE_USUARIO);
}

export function iniciarLatidoPestana(tabId) {
  const latido = () => {
    if (esDuenoDePestana(tabId)) {
      reclamarPestana(tabId);
    }
  };
  latido();
  return window.setInterval(latido, INTERVALO_LATIDO_MS);
}
