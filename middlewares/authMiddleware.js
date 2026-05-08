const admin = require('../firebase');
const pool = require('../db');

// --- PRIMER CADENERO: Verifica el gafete (Firebase ID token) ---
// Verifica la firma del idToken con Firebase y, en la misma ronda,
// carga el perfil CRM (id, rol, empresa_id) del usuario en req.usuarioCRM.
// Una sola consulta a BD por request, reutilizable por los siguientes middlewares.
const verificarToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ mensaje: 'Acceso denegado: No enviaste un token.' });
  }

  const token = authHeader.split(' ')[1];

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(token);
  } catch (error) {
    return res.status(403).json({ mensaje: 'Token inválido o expirado.', error });
  }

  req.user = decodedToken;

  pool.query(
    'SELECT id, rol, empresa_id FROM usuarios WHERE firebase_uid = ? LIMIT 1',
    [decodedToken.uid],
    (err, resultados) => {
      if (err) {
        return res.status(500).json({ mensaje: 'Error al cargar el perfil del usuario.' });
      }
      if (resultados.length === 0) {
        return res.status(403).json({ mensaje: 'Usuario autenticado pero sin perfil CRM.' });
      }

      req.usuarioCRM = {
        id: resultados[0].id,
        rol: resultados[0].rol,
        empresa_id: resultados[0].empresa_id,
      };
      next();
    }
  );
};

// --- SEGUNDO CADENERO: Verifica el rol (lista permitida) ---
// El perfil ya está en req.usuarioCRM gracias a verificarToken.
const revisarRol = (rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.usuarioCRM) {
      return res.status(500).json({ mensaje: 'revisarRol requiere verificarToken antes.' });
    }
    if (rolesPermitidos.includes(req.usuarioCRM.rol)) {
      return next();
    }
    return res.status(403).json({ mensaje: 'No tienes permisos suficientes para ver esto.' });
  };
};

// --- TERCER CADENERO: Aislamiento por empresa (URL param) ---
// Para rutas con :empresa_id en la URL. super_admin pasa siempre.
// Para el resto, el :empresa_id de la URL debe coincidir con el del perfil.
const validarEmpresaParam = (paramName = 'empresa_id') => {
  return (req, res, next) => {
    if (!req.usuarioCRM) {
      return res.status(500).json({ mensaje: 'validarEmpresaParam requiere verificarToken antes.' });
    }
    if (req.usuarioCRM.rol === 'super_admin') return next();

    const empresaParam = req.params[paramName];
    if (empresaParam === undefined || empresaParam === null || empresaParam === '') {
      return res.status(400).json({ mensaje: `Falta ${paramName} en la ruta.` });
    }
    if (req.usuarioCRM.empresa_id === null || req.usuarioCRM.empresa_id === undefined) {
      return res.status(403).json({ mensaje: 'Tu perfil no tiene empresa asignada.' });
    }
    if (Number(empresaParam) !== Number(req.usuarioCRM.empresa_id)) {
      return res.status(403).json({ mensaje: 'No tienes acceso a los recursos de esa empresa.' });
    }
    next();
  };
};

// --- CUARTO CADENERO: Pertenencia de un recurso a la empresa del usuario ---
// Para rutas con :id donde hay que ir a buscar el empresa_id real del recurso.
// `sql` debe devolver una fila con la columna `empresa_id`.
// `paramName` es el nombre del parámetro de ruta a usar como argumento de la query (default 'id').
const validarRecursoEmpresa = (sql, paramName = 'id') => {
  return (req, res, next) => {
    if (!req.usuarioCRM) {
      return res.status(500).json({ mensaje: 'validarRecursoEmpresa requiere verificarToken antes.' });
    }
    if (req.usuarioCRM.rol === 'super_admin') return next();

    const recursoId = req.params[paramName];
    if (!recursoId) {
      return res.status(400).json({ mensaje: `Falta ${paramName} en la ruta.` });
    }

    pool.query(sql, [recursoId], (err, rows) => {
      if (err) {
        return res.status(500).json({ mensaje: 'Error verificando pertenencia del recurso.' });
      }
      if (!rows || rows.length === 0) {
        return res.status(404).json({ mensaje: 'Recurso no encontrado.' });
      }
      const empresaRecurso = rows[0].empresa_id;
      if (empresaRecurso === null || empresaRecurso === undefined) {
        return res.status(403).json({ mensaje: 'El recurso no tiene empresa asociada.' });
      }
      if (Number(empresaRecurso) !== Number(req.usuarioCRM.empresa_id)) {
        return res.status(403).json({ mensaje: 'No tienes acceso a este recurso.' });
      }
      next();
    });
  };
};

module.exports = {
  verificarToken,
  revisarRol,
  validarEmpresaParam,
  validarRecursoEmpresa,
};
