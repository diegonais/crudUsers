#!/usr/bin/env node

const assert = require('assert/strict');
const {
  admin,
  assertCallableEmulatorEnv,
  callCreateUser,
  callDeleteUser,
  callSetUserDisabledStatus,
  callSetUserRole,
  callUpdateUser,
  deleteLocalUserByEmail,
  ensureLocalUser,
  initializeAdminApp,
  projectId,
  signInWithPassword,
  users,
} = require('./emulator-common');

const auditUsers = {
  target: {
    email: 'audit-target@test.local',
    password: 'AuditTarget123!',
    displayName: 'Audit Target',
    role: 'user',
  },
  other: {
    email: 'audit-other@test.local',
    password: 'AuditOther123!',
    displayName: 'Audit Other',
    role: 'user',
  },
  inactiveUser: {
    email: 'audit-inactive-user@test.local',
    password: 'AuditInactiveUser123!',
    displayName: 'Audit Inactive User',
    role: 'user',
  },
  inactiveAdmin: {
    email: 'audit-inactive-admin@test.local',
    password: 'AuditInactiveAdmin123!',
    displayName: 'Audit Inactive Admin',
    role: 'admin',
  },
  forbiddenCreate: {
    name: 'Audit Forbidden Create',
    email: 'audit-forbidden-create@test.local',
    password: 'AuditForbiddenCreate123!',
    role: 'user',
  },
  extraCreate: {
    name: 'Audit Extra Create',
    email: 'audit-extra-create@test.local',
    password: 'AuditExtraCreate123!',
    role: 'user',
  },
};

async function main() {
  assertCallableEmulatorEnv();
  initializeAdminApp();

  await cleanupAuditUsers();
  await ensureLocalUser(users.admin);
  await ensureLocalUser(users.normal);
  const records = await seedAuditUsers();

  const adminToken = await signInWithPassword(
    users.admin.email,
    users.admin.password,
  );
  const normalToken = await signInWithPassword(
    users.normal.email,
    users.normal.password,
  );
  const inactiveUserToken = await signInWithPassword(
    auditUsers.inactiveUser.email,
    auditUsers.inactiveUser.password,
  );
  const inactiveAdminToken = await signInWithPassword(
    auditUsers.inactiveAdmin.email,
    auditUsers.inactiveAdmin.password,
  );

  await makeInactive(records.inactiveUser.uid);
  await makeInactive(records.inactiveAdmin.uid);

  await testNoAuth(adminToken, records.target.uid);
  await testManipulatedFlutterCannotCallAdmin(
    normalToken,
    records.target.uid,
  );
  await testAdminSelfProtection(adminToken);
  await testDisabledAdminOldTokenDenied(
    inactiveAdminToken,
    records.target.uid,
  );
  await testExtraPayloadsRejected(adminToken, records.target.uid);
  await testFirestoreRulesMatrix({
    adminToken,
    normalToken,
    inactiveUserToken,
    inactiveAdminToken,
    normalUid: (await admin.auth().getUserByEmail(users.normal.email)).uid,
    targetUid: records.target.uid,
    otherUid: records.other.uid,
    inactiveUserUid: records.inactiveUser.uid,
    inactiveAdminUid: records.inactiveAdmin.uid,
  });

  await ensureLocalUser(auditUsers.inactiveUser);
  await ensureLocalUser(auditUsers.inactiveAdmin);
  console.log('Auditoria ofensiva local de seguridad paso en Emulator Suite.');
}

async function cleanupAuditUsers() {
  const emails = [
    ...Object.values(auditUsers)
      .filter((user) => user.email)
      .map((user) => user.email),
    auditUsers.forbiddenCreate.email,
    auditUsers.extraCreate.email,
  ];

  await Promise.all(emails.map((email) => deleteLocalUserByEmail(email)));
}

async function seedAuditUsers() {
  const entries = await Promise.all(
    Object.entries(auditUsers)
      .filter(([, user]) => user.displayName)
      .map(async ([key, user]) => {
        const record = await ensureLocalUser(user);
        return [key, record];
      }),
  );

  return Object.fromEntries(entries);
}

async function makeInactive(uid) {
  await Promise.all([
    admin.auth().updateUser(uid, {disabled: true}),
    admin
      .firestore()
      .collection('user_profiles')
      .doc(uid)
      .update({active: false}),
  ]);
}

async function testNoAuth(adminToken, targetUid) {
  await expectCallableCode(
    () => callCreateUser(auditUsers.forbiddenCreate),
    'unauthenticated',
  );
  await expectCallableCode(
    () => callUpdateUser({
      uid: targetUid,
      name: 'No Auth Update',
      email: auditUsers.target.email,
    }),
    'unauthenticated',
  );
  await expectCallableCode(
    () => callSetUserRole({uid: targetUid, role: 'admin'}),
    'unauthenticated',
  );
  await expectCallableCode(
    () => callSetUserDisabledStatus({uid: targetUid, disabled: true}),
    'unauthenticated',
  );
  await expectCallableCode(
    () => callDeleteUser({uid: targetUid}),
    'unauthenticated',
  );

  assert.equal((await readDoc(`user_profiles/${targetUid}`)).status, 403);
  assert.equal((await readDoc('user_directory')).status, 403);
  await expectNoAuthUserByEmail(auditUsers.forbiddenCreate.email);

  await callSetUserDisabledStatus({uid: targetUid, disabled: false}, adminToken);
  console.log('OK no autenticado no lee Firestore ni llama Functions admin.');
}

async function testManipulatedFlutterCannotCallAdmin(normalToken, targetUid) {
  await expectCallableCode(
    () => callCreateUser(auditUsers.forbiddenCreate, normalToken),
    'permission-denied',
  );
  await expectCallableCode(
    () => callUpdateUser({
      uid: targetUid,
      name: 'Normal Attack',
      email: auditUsers.target.email,
    }, normalToken),
    'permission-denied',
  );
  await expectCallableCode(
    () => callSetUserRole({uid: targetUid, role: 'admin'}, normalToken),
    'permission-denied',
  );
  await expectCallableCode(
    () => callSetUserDisabledStatus(
      {uid: targetUid, disabled: true},
      normalToken,
    ),
    'permission-denied',
  );
  await expectCallableCode(
    () => callDeleteUser({uid: targetUid}, normalToken),
    'permission-denied',
  );

  await expectNoAuthUserByEmail(auditUsers.forbiddenCreate.email);
  console.log('OK cliente Flutter manipulado no obtiene permisos admin.');
}

async function testAdminSelfProtection(adminToken) {
  const adminRecord = await admin.auth().getUserByEmail(users.admin.email);

  await expectCallableCode(
    () => callSetUserRole({uid: adminRecord.uid, role: 'user'}, adminToken),
    'failed-precondition',
  );
  await expectCallableCode(
    () => callSetUserDisabledStatus(
      {uid: adminRecord.uid, disabled: true},
      adminToken,
    ),
    'failed-precondition',
  );
  await expectCallableCode(
    () => callDeleteUser({uid: adminRecord.uid}, adminToken),
    'failed-precondition',
  );

  console.log('OK admin activo no puede degradarse, deshabilitarse o borrarse.');
}

async function testDisabledAdminOldTokenDenied(disabledAdminToken, targetUid) {
  await expectCallableCode(
    () => callCreateUser(auditUsers.forbiddenCreate, disabledAdminToken),
    'permission-denied',
  );
  await expectCallableCode(
    () => callUpdateUser({
      uid: targetUid,
      name: 'Disabled Admin Attack',
      email: auditUsers.target.email,
    }, disabledAdminToken),
    'permission-denied',
  );
  await expectCallableCode(
    () => callSetUserRole({uid: targetUid, role: 'admin'}, disabledAdminToken),
    'permission-denied',
  );
  await expectCallableCode(
    () => callSetUserDisabledStatus(
      {uid: targetUid, disabled: true},
      disabledAdminToken,
    ),
    'permission-denied',
  );
  await expectCallableCode(
    () => callDeleteUser({uid: targetUid}, disabledAdminToken),
    'permission-denied',
  );

  await expectNoAuthUserByEmail(auditUsers.forbiddenCreate.email);
  console.log('OK admin deshabilitado con token viejo no ejecuta ninguna admin.');
}

async function testExtraPayloadsRejected(adminToken, targetUid) {
  await expectCallableCode(
    () => callCreateUser({
      ...auditUsers.extraCreate,
      callerRole: 'admin',
    }, adminToken),
    'invalid-argument',
  );
  await expectCallableCode(
    () => callUpdateUser({
      uid: targetUid,
      name: auditUsers.target.displayName,
      email: auditUsers.target.email,
      role: 'admin',
    }, adminToken),
    'invalid-argument',
  );
  await expectCallableCode(
    () => callSetUserRole({
      uid: targetUid,
      role: 'admin',
      customClaims: {role: 'admin'},
    }, adminToken),
    'invalid-argument',
  );
  await expectCallableCode(
    () => callSetUserDisabledStatus({
      uid: targetUid,
      disabled: true,
      active: true,
    }, adminToken),
    'invalid-argument',
  );
  await expectCallableCode(
    () => callDeleteUser({
      uid: targetUid,
      emailVerified: true,
    }, adminToken),
    'invalid-argument',
  );

  await expectNoAuthUserByEmail(auditUsers.extraCreate.email);
  console.log('OK payloads con campos adicionales son rechazados.');
}

async function testFirestoreRulesMatrix(context) {
  const {
    adminToken,
    normalToken,
    inactiveUserToken,
    inactiveAdminToken,
    normalUid,
    targetUid,
    otherUid,
    inactiveUserUid,
    inactiveAdminUid,
  } = context;

  assert.equal((await readDoc(`user_profiles/${normalUid}`, normalToken)).status, 200);
  assert.equal((await readDoc(`user_profiles/${otherUid}`, normalToken)).status, 403);
  assert.equal((await readDoc('user_directory', normalToken)).status, 200);

  assert.equal((await readDoc(`user_profiles/${normalUid}`, adminToken)).status, 200);
  assert.equal((await readDoc(`user_profiles/${otherUid}`, adminToken)).status, 200);
  assert.equal((await readDoc('user_directory', adminToken)).status, 200);

  assert.equal(
    (await readDoc(`user_profiles/${inactiveUserUid}`, inactiveUserToken)).status,
    200,
  );
  assert.equal(
    (await readDoc(`user_profiles/${otherUid}`, inactiveUserToken)).status,
    403,
  );
  assert.equal((await readDoc('user_directory', inactiveUserToken)).status, 403);

  assert.equal(
    (await readDoc(`user_profiles/${inactiveAdminUid}`, inactiveAdminToken)).status,
    200,
  );
  assert.equal(
    (await readDoc(`user_profiles/${otherUid}`, inactiveAdminToken)).status,
    403,
  );
  assert.equal((await readDoc('user_directory', inactiveAdminToken)).status, 403);

  for (const token of [normalToken, adminToken, inactiveUserToken, inactiveAdminToken]) {
    assert.equal(
      (await patchDoc(`user_profiles/${targetUid}`, token, {
        role: {stringValue: 'admin'},
      })).status,
      403,
    );
    assert.equal(
      (await patchDoc(`user_directory/${targetUid}`, token, {
        role: {stringValue: 'admin'},
      })).status,
      403,
    );
    assert.equal(
      (await patchDoc(`user_profiles/new-${Date.now()}`, token, {
        uid: {stringValue: 'new'},
        name: {stringValue: 'New'},
        role: {stringValue: 'admin'},
      })).status,
      403,
    );
    assert.equal((await deleteDoc(`user_profiles/${targetUid}`, token)).status, 403);
    assert.equal((await deleteDoc(`user_directory/${targetUid}`, token)).status, 403);
  }

  assert.equal((await patchDoc(`user_profiles/${targetUid}`, undefined, {
    active: {booleanValue: true},
  })).status, 403);
  assert.equal((await deleteDoc(`user_directory/${targetUid}`)).status, 403);

  console.log('OK matriz de Firestore Rules y escrituras directas validada.');
}

async function readDoc(pathSuffix, idToken) {
  return firestoreFetch(pathSuffix, {method: 'GET', idToken});
}

async function patchDoc(pathSuffix, idToken, fields) {
  return firestoreFetch(pathSuffix, {
    method: 'PATCH',
    idToken,
    body: {fields},
  });
}

async function deleteDoc(pathSuffix, idToken) {
  return firestoreFetch(pathSuffix, {method: 'DELETE', idToken});
}

async function firestoreFetch(pathSuffix, options) {
  const firestoreHost = requireEnv('FIRESTORE_EMULATOR_HOST');
  const url =
    `http://${firestoreHost}/v1/projects/${projectId}` +
    `/databases/(default)/documents/${pathSuffix}`;
  const headers = {};

  if (options.idToken) {
    headers.Authorization = `Bearer ${options.idToken}`;
  }

  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(url, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

async function expectCallableCode(action, expectedCode) {
  try {
    await action();
  } catch (error) {
    assert.equal(error.code, expectedCode);
    return;
  }

  assert.fail(`Se esperaba Firebase Functions code ${expectedCode}.`);
}

async function expectNoAuthUserByEmail(email) {
  try {
    await admin.auth().getUserByEmail(email);
  } catch (error) {
    if (error && error.code === 'auth/user-not-found') {
      return;
    }

    throw error;
  }

  assert.fail(`No debia existir usuario Auth para ${email}.`);
}

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `No se detecto ${name}. Aborto para evitar tocar Firebase real.`,
    );
  }

  return value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
