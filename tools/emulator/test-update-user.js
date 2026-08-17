#!/usr/bin/env node

const assert = require('assert/strict');
const path = require('path');
const {
  admin,
  assertCallableEmulatorEnv,
  callUpdateUser,
  deleteLocalUserByEmail,
  ensureLocalUser,
  initializeAdminApp,
  signInWithPassword,
  users,
} = require('./emulator-common');

const testUsers = {
  pedro: {
    email: 'pedro@test.local',
    password: 'PedroLocal123!',
    displayName: 'Pedro Local',
    role: 'user',
  },
  emailOnly: {
    email: 'email-only@test.local',
    password: 'EmailOnly123!',
    displayName: 'Email Only Local',
    role: 'user',
  },
  both: {
    email: 'both@test.local',
    password: 'BothLocal123!',
    displayName: 'Both Local',
    role: 'user',
  },
  duplicateA: {
    email: 'duplicate-a@test.local',
    password: 'DuplicateA123!',
    displayName: 'Duplicate A',
    role: 'user',
  },
  duplicateB: {
    email: 'duplicate-b@test.local',
    password: 'DuplicateB123!',
    displayName: 'Duplicate B',
    role: 'user',
  },
  missingDocs: {
    email: 'missing-docs@test.local',
    password: 'MissingDocs123!',
    displayName: 'Missing Docs Local',
    role: 'user',
  },
  compensation: {
    email: 'compensation@test.local',
    password: 'Compensation123!',
    displayName: 'Compensation Local',
    role: 'user',
  },
};

const updatedEmails = [
  'email-only-updated@test.local',
  'both-updated@test.local',
  'compensation-updated@test.local',
];

async function main() {
  assertCallableEmulatorEnv();
  initializeAdminApp();

  await ensureLocalUser(users.admin);
  await ensureLocalUser(users.normal);
  await cleanupTestUsers();
  const records = await seedTestUsers();

  const adminToken = await signInWithPassword(
    users.admin.email,
    users.admin.password,
  );
  const normalToken = await signInWithPassword(
    users.normal.email,
    users.normal.password,
  );

  await testAdminUpdatesName(adminToken, records.pedro.uid);
  await testAdminUpdatesEmail(adminToken, records.emailOnly.uid);
  await testAdminUpdatesNameAndEmail(adminToken, records.both.uid);
  await testUserIsPermissionDenied(normalToken, records.pedro.uid);
  await testUnauthenticatedCallFails(records.pedro.uid);
  await testMissingUidFails(adminToken);
  await testDuplicateEmailFails(
    adminToken,
    records.duplicateA.uid,
    testUsers.duplicateB.email,
  );
  await testInvalidNameFails(adminToken, records.pedro.uid);
  await testInvalidEmailFails(adminToken, records.pedro.uid);
  await testUnexpectedFieldFails(adminToken, records.pedro.uid);
  await testMissingFirestoreDocumentFailsBeforeAuth(
    adminToken,
    records.missingDocs.uid,
  );
  await testCompensationRestoresOnlyTargetUser(records.compensation.uid);

  console.log('Todas las pruebas locales de updateUser pasaron.');
}

async function cleanupTestUsers() {
  const emails = [
    ...Object.values(testUsers).map((user) => user.email),
    ...updatedEmails,
  ];

  await Promise.all(emails.map((email) => deleteLocalUserByEmail(email)));
}

async function seedTestUsers() {
  const entries = await Promise.all(
    Object.entries(testUsers).map(async ([key, user]) => {
      const record = await ensureLocalUser(user);
      return [key, record];
    }),
  );

  return Object.fromEntries(entries);
}

async function testAdminUpdatesName(adminToken, uid) {
  const result = await callUpdateUser(
    {
      uid,
      name: 'Pedro Actualizado',
      email: testUsers.pedro.email,
    },
    adminToken,
  );

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  await assertConsistentUser(uid, {
    name: 'Pedro Actualizado',
    email: testUsers.pedro.email,
  });

  console.log('OK admin modifica nombre en Auth, profile y directory.');
}

async function testAdminUpdatesEmail(adminToken, uid) {
  const newEmail = 'email-only-updated@test.local';
  const result = await callUpdateUser(
    {
      uid,
      name: testUsers.emailOnly.displayName,
      email: newEmail,
    },
    adminToken,
  );

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  await assertConsistentUser(uid, {
    name: testUsers.emailOnly.displayName,
    email: newEmail,
  });
  await assertDirectoryHasNoEmail(uid);

  console.log('OK admin modifica email sin agregar email al directorio.');
}

async function testAdminUpdatesNameAndEmail(adminToken, uid) {
  const newEmail = 'both-updated@test.local';
  const newName = 'Both Local Actualizado';
  const result = await callUpdateUser(
    {
      uid,
      name: newName,
      email: newEmail,
    },
    adminToken,
  );

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  await assertConsistentUser(uid, {name: newName, email: newEmail});

  console.log('OK admin modifica nombre y email en una llamada.');
}

async function testUserIsPermissionDenied(normalToken, uid) {
  const before = await readUserState(uid);

  await expectCallableCode(
    () => callUpdateUser({
      uid,
      name: 'Intento Normal',
      email: testUsers.pedro.email,
    }, normalToken),
    'permission-denied',
  );

  await assertUserState(uid, before);
  console.log('OK usuario normal recibe permission-denied sin cambios.');
}

async function testUnauthenticatedCallFails(uid) {
  const before = await readUserState(uid);

  await expectCallableCode(
    () => callUpdateUser({
      uid,
      name: 'Intento Sin Sesion',
      email: testUsers.pedro.email,
    }),
    'unauthenticated',
  );

  await assertUserState(uid, before);
  console.log('OK llamada sin sesion recibe unauthenticated sin cambios.');
}

async function testMissingUidFails(adminToken) {
  const missingUid = 'missing-local-uid';

  await expectCallableCode(
    () => callUpdateUser({
      uid: missingUid,
      name: 'No Existe',
      email: 'no-existe@test.local',
    }, adminToken),
    'not-found',
  );

  const profileSnapshot = await admin
    .firestore()
    .collection('user_profiles')
    .doc(missingUid)
    .get();
  assert.equal(profileSnapshot.exists, false);

  console.log('OK UID inexistente recibe not-found y no crea documentos.');
}

async function testDuplicateEmailFails(adminToken, uid, duplicateEmail) {
  const before = await readUserState(uid);

  await expectCallableCode(
    () => callUpdateUser({
      uid,
      name: before.auth.displayName,
      email: duplicateEmail,
    }, adminToken),
    'already-exists',
  );

  await assertUserState(uid, before);
  console.log('OK email duplicado falla y Firestore conserva datos previos.');
}

async function testInvalidNameFails(adminToken, uid) {
  await expectCallableCode(
    () => callUpdateUser({
      uid,
      name: '   ',
      email: testUsers.pedro.email,
    }, adminToken),
    'invalid-argument',
  );

  console.log('OK nombre vacio recibe invalid-argument.');
}

async function testInvalidEmailFails(adminToken, uid) {
  await expectCallableCode(
    () => callUpdateUser({
      uid,
      name: 'Pedro Actualizado',
      email: 'correo-invalido',
    }, adminToken),
    'invalid-argument',
  );

  console.log('OK email invalido recibe invalid-argument.');
}

async function testUnexpectedFieldFails(adminToken, uid) {
  await expectCallableCode(
    () => callUpdateUser({
      uid,
      name: 'Pedro Actualizado',
      email: testUsers.pedro.email,
      role: 'admin',
    }, adminToken),
    'invalid-argument',
  );

  console.log('OK campos fuera de alcance son rechazados.');
}

async function testMissingFirestoreDocumentFailsBeforeAuth(adminToken, uid) {
  const before = await readUserState(uid);

  await admin.firestore().collection('user_directory').doc(uid).delete();

  await expectCallableCode(
    () => callUpdateUser({
      uid,
      name: 'No Debe Cambiar Auth',
      email: testUsers.missingDocs.email,
    }, adminToken),
    'failed-precondition',
  );

  const authAfter = await admin.auth().getUser(uid);
  assert.equal(authAfter.displayName, before.auth.displayName);
  assert.equal(authAfter.email, before.auth.email);

  await ensureLocalUser(testUsers.missingDocs);
  console.log('OK documento faltante se detecta antes de modificar Auth.');
}

async function testCompensationRestoresOnlyTargetUser(uid) {
  const updateUserModulePath = path.resolve(
    __dirname,
    '../../functions/lib/users/update-user.js',
  );
  const {updateUserCore} = require(updateUserModulePath);
  const pedroBefore = await admin.auth().getUserByEmail(testUsers.pedro.email);
  const targetBefore = await readUserState(uid);

  await expectCallableCode(
    () => updateUserCore(
      {
        uid,
        name: 'Compensation Should Roll Back',
        email: 'compensation-updated@test.local',
      },
      {
        auth: admin.auth(),
        firestore: admin.firestore(),
        commitFirestoreUserUpdate: async () => {
          throw new Error('Forced internal Firestore failure.');
        },
      },
    ),
    'internal',
  );

  await assertUserState(uid, targetBefore);

  const pedroAfter = await admin.auth().getUserByEmail(testUsers.pedro.email);
  assert.equal(pedroAfter.uid, pedroBefore.uid);
  assert.equal(pedroAfter.displayName, pedroBefore.displayName);

  console.log('OK compensacion restaura solo el usuario objetivo.');
}

async function assertConsistentUser(uid, expected) {
  const state = await readUserState(uid);

  assert.equal(state.auth.displayName, expected.name);
  assert.equal(state.auth.email, expected.email);
  assert.equal(state.profile.name, expected.name);
  assert.equal(state.profile.email, expected.email);
  assert.equal(state.directory.name, expected.name);
}

async function assertDirectoryHasNoEmail(uid) {
  const snapshot = await admin
    .firestore()
    .collection('user_directory')
    .doc(uid)
    .get();
  const directory = snapshot.data();

  assert.equal(Object.prototype.hasOwnProperty.call(directory, 'email'), false);
}

async function readUserState(uid) {
  const [auth, profileSnapshot, directorySnapshot] = await Promise.all([
    admin.auth().getUser(uid),
    admin.firestore().collection('user_profiles').doc(uid).get(),
    admin.firestore().collection('user_directory').doc(uid).get(),
  ]);

  return {
    auth: {
      uid: auth.uid,
      displayName: auth.displayName,
      email: auth.email,
      customClaims: auth.customClaims,
      disabled: auth.disabled,
    },
    profile: profileSnapshot.exists ? profileSnapshot.data() : null,
    directory: directorySnapshot.exists ? directorySnapshot.data() : null,
  };
}

async function assertUserState(uid, expected) {
  const actual = await readUserState(uid);

  assert.equal(actual.auth.uid, expected.auth.uid);
  assert.equal(actual.auth.displayName, expected.auth.displayName);
  assert.equal(actual.auth.email, expected.auth.email);
  assert.deepEqual(actual.auth.customClaims, expected.auth.customClaims);
  assert.equal(actual.auth.disabled, expected.auth.disabled);
  assert.deepEqual(stripTimestamps(actual.profile), stripTimestamps(expected.profile));
  assert.deepEqual(actual.directory, expected.directory);
}

function stripTimestamps(value) {
  if (!value) return value;

  const copy = {...value};
  delete copy.createdAt;
  delete copy.updatedAt;
  return copy;
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
