const {createRequire} = require('module');
const path = require('path');

const requireFromFunctions = createRequire(
  path.resolve(__dirname, '../../functions/package.json'),
);
const admin = requireFromFunctions('firebase-admin');

const projectId = 'crudusers-4dba6';
const functionsRegion = 'southamerica-west1';

const users = {
  admin: {
    email: 'admin@test.local',
    password: 'AdminLocal123!',
    displayName: 'Admin Local',
    role: 'admin',
  },
  normal: {
    email: 'normal@test.local',
    password: 'NormalLocal123!',
    displayName: 'Usuario Local',
    role: 'user',
  },
};

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `No se detecto ${name}. Aborto para evitar tocar Firebase real.`,
    );
  }

  return value;
}

function assertAdminEmulatorEnv() {
  requireEnv('FIREBASE_AUTH_EMULATOR_HOST');
  requireEnv('FIRESTORE_EMULATOR_HOST');
}

function assertCallableEmulatorEnv() {
  assertAdminEmulatorEnv();
  requireEnv('FUNCTIONS_EMULATOR_HOST');
}

function initializeAdminApp() {
  assertAdminEmulatorEnv();

  if (!admin.apps.length) {
    admin.initializeApp({projectId});
  }

  return admin;
}

async function ensureLocalUser(userConfig) {
  const appAdmin = initializeAdminApp();
  const auth = appAdmin.auth();
  const firestore = appAdmin.firestore();
  let userRecord;

  try {
    userRecord = await auth.getUserByEmail(userConfig.email);
    userRecord = await auth.updateUser(userRecord.uid, {
      displayName: userConfig.displayName,
      password: userConfig.password,
    });
  } catch (error) {
    if (!isFirebaseError(error, 'auth/user-not-found')) {
      throw error;
    }

    userRecord = await auth.createUser({
      email: userConfig.email,
      password: userConfig.password,
      displayName: userConfig.displayName,
    });
  }

  await auth.setCustomUserClaims(userRecord.uid, {role: userConfig.role});
  await writeUserDocuments(firestore, {
    uid: userRecord.uid,
    name: userConfig.displayName,
    email: userConfig.email,
    role: userConfig.role,
  });

  return userRecord;
}

async function writeUserDocuments(firestore, user) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = firestore.batch();

  batch.set(firestore.collection('user_profiles').doc(user.uid), {
    uid: user.uid,
    name: user.name,
    email: user.email,
    role: user.role,
    active: true,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(firestore.collection('user_directory').doc(user.uid), {
    uid: user.uid,
    name: user.name,
    role: user.role,
  });

  await batch.commit();
}

async function deleteLocalUserByEmail(email) {
  const appAdmin = initializeAdminApp();
  const auth = appAdmin.auth();
  const firestore = appAdmin.firestore();

  try {
    const userRecord = await auth.getUserByEmail(email);
    await Promise.all([
      firestore.collection('user_profiles').doc(userRecord.uid).delete(),
      firestore.collection('user_directory').doc(userRecord.uid).delete(),
      auth.deleteUser(userRecord.uid),
    ]);
  } catch (error) {
    if (!isFirebaseError(error, 'auth/user-not-found')) {
      throw error;
    }
  }
}

async function signInWithPassword(email, password) {
  const authHost = requireEnv('FIREBASE_AUTH_EMULATOR_HOST');
  const url = `http://${authHost}/identitytoolkit.googleapis.com/v1/` +
    'accounts:signInWithPassword?key=local-emulator';
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      `Auth Emulator rechazo login para ${email}: ${JSON.stringify(body)}`,
    );
  }

  return body.idToken;
}

async function callCreateUser(data, idToken) {
  const functionsHost = requireEnv('FUNCTIONS_EMULATOR_HOST');
  const url = `http://${functionsHost}/${projectId}/${functionsRegion}/` +
    'createUser';
  const headers = {'Content-Type': 'application/json'};

  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({data}),
  });
  const body = await response.json();

  if (body.error) {
    const error = new Error(body.error.message || 'Callable error');
    error.code = callableStatusToCode(body.error.status);
    error.status = body.error.status;
    error.httpStatus = response.status;
    throw error;
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  }

  return body.result;
}

function callableStatusToCode(status) {
  const statusMap = {
    ALREADY_EXISTS: 'already-exists',
    INVALID_ARGUMENT: 'invalid-argument',
    PERMISSION_DENIED: 'permission-denied',
    UNAUTHENTICATED: 'unauthenticated',
    INTERNAL: 'internal',
  };

  return statusMap[status] || String(status || 'unknown').toLowerCase();
}

function isFirebaseError(error, code) {
  return error && error.code === code;
}

module.exports = {
  admin,
  assertAdminEmulatorEnv,
  assertCallableEmulatorEnv,
  callCreateUser,
  deleteLocalUserByEmail,
  ensureLocalUser,
  initializeAdminApp,
  projectId,
  signInWithPassword,
  users,
};
