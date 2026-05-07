const admin = require('../firebase'); 
const pool = require('../db'); 

const verificarToken = async (req, res, next) => {
  console.log('--- REVISANDO GAFETE (PRIMER CADENERO) ---');
  
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('❌ RECHAZADO: El usuario no traía token.'); // CHISMOSO NUEVO
    return res.status(401).json({ mensaje: 'Acceso denegado: No enviaste un token.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log('✅ PASE VIP VÁLIDO. UID:', decodedToken.uid); // CHISMOSO NUEVO
    req.user = decodedToken; 
    next(); 
  } catch (error) {
    console.log('❌ RECHAZADO: Token falso o expirado.'); // CHISMOSO NUEVO
    return res.status(403).json({ mensaje: 'Token inválido o expirado.', error });
  }
};

// --- SEGUNDO CADENERO: Verifica el puesto (Rol VIP) ---
const revisarRol = (rolesPermitidos) => {
  return (req, res, next) => {
    // Aquí sí existe el firebaseUid, lo sacamos del gafete anterior
    const firebaseUid = req.user.uid;
    const query = 'SELECT rol FROM usuarios WHERE firebase_uid = ?';

    pool.query(query, [firebaseUid], (err, resultados) => {
      if (err) {
        return res.status(500).json({ mensaje: 'Error al verificar permisos de base de datos.' });
      }

      if (resultados.length === 0) {
        return res.status(404).json({ mensaje: 'Usuario no encontrado en la base de datos.' });
      }

      const rolUsuario = resultados[0].rol;

      // LOS CHISMOSOS EN EL LUGAR CORRECTO
      console.log('--- INTENTO DE ACCESO ---');
      console.log('1. UID del usuario en Firebase:', firebaseUid);
      console.log('2. Rol que la Base de Datos devolvió:', rolUsuario);

      // Verificamos si el rol del usuario está en la lista de permitidos
      if (rolesPermitidos.includes(rolUsuario)) {
        next(); 
      } else {
        res.status(403).json({ mensaje: 'No tienes permisos suficientes para ver esto.' });
      }
    });
  };
};

module.exports = { verificarToken, revisarRol };
