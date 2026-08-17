#!/usr/bin/env node

const assert = require('assert/strict');
const {
  admin,
  assertCallableEmulatorEnv,
  callCreateUser,
  deleteLocalUserByEmail,
  ensureLocalUser,
  initializeAdminApp,
  signInWithPassword,
  users,
} = require('./emulator-common');

const testUsers = {
  pedro: {
    name: 'Pedro Local',
    email: 'pedro@test.local',
    password: 'PedroLocal123!',
    role: 'user',
  },
  forbidden: {
    name: 'No Admin Created',
    email: 'no-admin-created@test.local',
    password: 'NoAdmin123!',
    role: 'user',
  },
  anonymous: {
    name: 'Anonymous Created',
    email: 'anonymous-created@test.local',
    password: 'Anonymous123!',
    role: 'user',
  },
  invalidRole: {
    name: 'Invalid Role',
    email: 'invalid-role@test.local',
    password: 'InvalidRole123!',
    role: 'superadmin',
  },
  invalidPassword: {
    name: 'Invalid Password',
    email: 'invalid-password@test.local',
    password: '123',
    role: 'user',
  },
  rollback: {
    name: 'Rollback Local',
    email: 'rollback@test.local',
    password: 'Rollback123!',
    role: 'user',
    __testForceFirestoreFailure: true,
  },
};

async function main() {
  assertCallableEmulatorEnv();
  initializeAdminApp();

  await ensureLocalUser(users.admin);
  await ensureLocalUser(users.normal);
  await cleanupTestUsers();

  const adminToken = await signInWithPassword(
    users.admin.email,
    users.admin.password,
  );
  const normalToken = await signInWithPassword(
    users.normal.email,
    users.normal.password,
  );

  await testAdminCreatesUser(adminToken);
  await testUserIsPermissionDenied(normalToken);
  await testUnauthenticatedCallFails();
  await testDuplicateEmailFails(adminToken);
  await testInvalidRoleFails(adminToken);
  await testInvalidPasswordFails(adminToken);
  await testRollbackDeletesOnlyNewUser(adminToken);

  console.log('Todas las pruebas locales de createUser pasaron.');
}

async function cleanupTestUsers() {
  await Promise.all(
    Object.values(testUsers).map((user) => deleteLocalUserByEmail(user.email)),
  );
}

async function testAdminCreatesUser(adminToken) {
  const result = await callCreateUser(testUsers.pedro, adminToken);

  assert.equal(result.email, testUsers.pedro.email);
  assert.ok(result.uid);

  const userRecord = await admin.auth().getUserByEmail(testUsers.pedro.email);
  assert.equal(userRecord.uid, result.uid);
  assert.equal(userRecord.customClaims.role, 'user');

  const profileSnapshot = await admin
    .firestore()
    .collection('user_profiles')
    .doc(userRecord.uid)
    .get();
  const directorySnapshot = await admin
    .firestore()
    .collection('user_directory')
    .doc(userRecord.uid)
    .get();

  assert.equal(profileSnapshot.exists, true);
  assert.equal(directorySnapshot.exists, true);

  const profile = profileSnapshot.data();
  assert.equal(profile.uid, userRecord.uid);
  assert.equal(profile.name, testUsers.pedro.name);
  assert.equal(profile.email, testUsers.pedro.email);
  assert.equal(profile.role, 'user');
  assert.equal(profile.active, true);
  assert.ok(profile.createdAt);
  assert.ok(profile.updatedAt);

  const directory = directorySnapshot.data();
  assert.deepEqual(Object.keys(directory).sort(), ['name', 'role', 'uid']);
  assert.deepEqual(directory, {
    uid: userRecord.uid,
    name: testUsers.pedro.name,
    role: 'user',
  });

  console.log('OK admin crea Pedro Local con claim y documentos Firestore.');
}

async function testUserIsPermissionDenied(normalToken) {
  await expectCallableCode(
    () => callCreateUser(testUsers.forbidden, normalToken),
    'permission-denied',
  );
  await expectNoAuthUser(testUsers.forbidden.email);
  console.log('OK usuario normal recibe permission-denied.');
}

async function testUnauthenticatedCallFails() {
  await expectCallableCode(
    () => callCreateUser(testUsers.anonymous),
    'unauthenticated',
  );
  await expectNoAuthUser(testUsers.anonymous.email);
  console.log('OK llamada sin sesion recibe unauthenticated.');
}

async function testDuplicateEmailFails(adminToken) {
  await expectCallableCode(
    () => callCreateUser(testUsers.pedro, adminToken),
    'already-exists',
  );

  const userRecord = await admin.auth().getUserByEmail(testUsers.pedro.email);
  const profileSnapshot = await admin
    .firestore()
    .collection('user_profiles')
    .doc(userRecord.uid)
    .get();

  assert.equal(profileSnapshot.exists, true);
  console.log('OK email duplicado falla sin documentos duplicados.');
}

async function testInvalidRoleFails(adminToken) {
  await expectCallableCode(
    () => callCreateUser(testUsers.invalidRole, adminToken),
    'invalid-argument',
  );
  await expectNoAuthUser(testUsers.invalidRole.email);
  console.log('OK rol invalido recibe invalid-argument.');
}

async function testInvalidPasswordFails(adminToken) {
  await expectCallableCode(
    () => callCreateUser(testUsers.invalidPassword, adminToken),
    'invalid-argument',
  );
  await expectNoAuthUser(testUsers.invalidPassword.email);
  console.log('OK password invalida falla sin perfil Firestore.');
}

async function testRollbackDeletesOnlyNewUser(adminToken) {
  const pedroBefore = await admin.auth().getUserByEmail(testUsers.pedro.email);

  await expectCallableCode(
    () => callCreateUser(testUsers.rollback, adminToken),
    'internal',
  );
  await expectNoAuthUser(testUsers.rollback.email);

  const pedroAfter = await admin.auth().getUserByEmail(testUsers.pedro.email);
  assert.equal(pedroAfter.uid, pedroBefore.uid);
  console.log('OK rollback elimina solo el usuario recien creado.');
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

async function expectNoAuthUser(email) {
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
