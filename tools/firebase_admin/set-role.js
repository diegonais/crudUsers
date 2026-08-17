#!/usr/bin/env node

const admin = require('firebase-admin');

const allowedRoles = new Set(['admin', 'user']);

function showUsage(exitCode = 1) {
  const output = exitCode === 0 ? console.log : console.error;

  output(`
Uso:
  node set-role.js UID admin
  node set-role.js UID user
  node set-role.js email@test.com admin

Credenciales:
  Configura GOOGLE_APPLICATION_CREDENTIALS con la ruta del JSON de Service Account.

PowerShell:
  $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\ruta\\segura\\service-account.json"

CMD:
  set GOOGLE_APPLICATION_CREDENTIALS=C:\\ruta\\segura\\service-account.json
`.trim());

  process.exit(exitCode);
}

function validateArguments(identifier, role) {
  if (!identifier || !role) {
    console.error('Faltan argumentos.');
    showUsage(1);
  }

  if (!allowedRoles.has(role)) {
    console.error(`Rol no permitido: "${role}". Usa solamente admin o user.`);
    showUsage(1);
  }
}

function initializeFirebaseAdmin() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      'No se encontro GOOGLE_APPLICATION_CREDENTIALS. No pongas la clave privada dentro del codigo.',
    );
    showUsage(1);
  }

  // Firebase Admin SDK corre en un entorno confiable del desarrollador o
  // servidor. Usa Application Default Credentials desde la Service Account y
  // tiene privilegios administrativos; por eso nunca debe incluirse en Flutter.
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

function looksLikeEmail(identifier) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(identifier);
}

async function getUser(identifier) {
  if (looksLikeEmail(identifier)) {
    return admin.auth().getUserByEmail(identifier);
  }

  return admin.auth().getUser(identifier);
}

async function main() {
  const [identifier, role] = process.argv.slice(2);

  if (identifier === '--help' || identifier === '-h') {
    showUsage(0);
  }

  validateArguments(identifier, role);
  initializeFirebaseAdmin();

  try {
    const userRecord = await getUser(identifier);

    // setCustomUserClaims reemplaza el objeto completo de claims.
    // Por eso leemos los claims actuales y solo actualizamos role, conservando
    // otros Custom Claims futuros que pudieran existir.
    const currentClaims = userRecord.customClaims || {};
    const nextClaims = {
      ...currentClaims,
      role,
    };

    await admin.auth().setCustomUserClaims(userRecord.uid, nextClaims);

    console.log('Custom Claim actualizado correctamente.');
    console.log(`UID: ${userRecord.uid}`);
    console.log(`Email: ${userRecord.email || '(sin email)'}`);
    console.log(`role: ${role}`);
    console.log(
      'Cierra sesion o usa getIdTokenResult(true) en Flutter para ver el cambio inmediatamente.',
    );
  } catch (error) {
    if (error && error.code === 'auth/user-not-found') {
      console.error('No existe un usuario con ese UID o email.');
      process.exit(1);
    }

    if (error && error.code) {
      console.error(`Firebase Admin SDK rechazo la operacion: ${error.code}`);
      console.error(error.message);
      process.exit(1);
    }

    console.error('Error inesperado al asignar el rol.');
    console.error(error);
    process.exit(1);
  }
}

main();
