const admin = require('firebase-admin');

// Al estar en la misma carpeta, solo usamos ./
const serviceAccount = require('./firebase-key.json'); 

if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
}

module.exports = admin;