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
  signInWithPassword,
  users,
} = require('./emulator-common');

const flowUser = {
  name: 'Flujo Admin',
  email: 'flujo-admin@test.local',
  password: 'FlujoAdmin123!',
  role: 'user',
};

const updatedUser = {
  name: 'Flujo Admin Editado',
  email: 'flujo-admin-editado@test.local',
};

async function main() {
  assertCallableEmulatorEnv();
  initializeAdminApp();

  await ensureLocalUser(users.admin);
  await cleanupFlowUser();

  const adminToken = await signInWithPassword(
    users.admin.email,
    users.admin.password,
  );

  const created = await testCreate(adminToken);
  await testUpdate(adminToken, created.uid);
  await testRoleChange(adminToken, created.uid, 'admin');
  await testRoleChange(adminToken, created.uid, 'user');
  await testDisable(adminToken, created.uid);
  await testEnable(adminToken, created.uid);
  await testDelete(adminToken, created.uid);

  console.log('Flujo CRUD administrativo completo paso en Emulator Suite.');
}

async function cleanupFlowUser() {
  await Promise.all([
    deleteLocalUserByEmail(flowUser.email),
    deleteLocalUserByEmail(updatedUser.email),
  ]);
}

async function testCreate(adminToken) {
  const result = await callCreateUser(flowUser, adminToken);

  assert.equal(result.success, true);
  assert.equal(result.email, flowUser.email);
  assert.ok(result.uid);

  await assertAuthState(result.uid, {
    email: flowUser.email,
    displayName: flowUser.name,
    role: 'user',
    disabled: false,
  });
  await assertProfile(result.uid, {
    name: flowUser.name,
    email: flowUser.email,
    role: 'user',
    active: true,
  });
  await assertDirectory(result.uid, {
    name: flowUser.name,
    role: 'user',
  });

  console.log('OK CREATE crea Auth, claim, profile y directory.');
  return result;
}

async function testUpdate(adminToken, uid) {
  const result = await callUpdateUser(
    {
      uid,
      name: updatedUser.name,
      email: updatedUser.email,
    },
    adminToken,
  );

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  await assertAuthState(uid, {
    email: updatedUser.email,
    displayName: updatedUser.name,
    role: 'user',
    disabled: false,
  });
  await assertProfile(uid, {
    name: updatedUser.name,
    email: updatedUser.email,
    role: 'user',
    active: true,
  });
  await assertDirectory(uid, {
    name: updatedUser.name,
    role: 'user',
  });

  console.log('OK UPDATE sincroniza Auth, profile y directory.');
}

async function testRoleChange(adminToken, uid, role) {
  const result = await callSetUserRole({uid, role}, adminToken);

  assert.equal(result.success, true);
  assert.equal(result.role, role);
  await assertAuthState(uid, {
    email: updatedUser.email,
    displayName: updatedUser.name,
    role,
    disabled: false,
  });
  await assertProfile(uid, {
    name: updatedUser.name,
    email: updatedUser.email,
    role,
    active: true,
  });
  await assertDirectory(uid, {
    name: updatedUser.name,
    role,
  });

  console.log(`OK CHANGE ROLE sincroniza rol ${role}.`);
}

async function testDisable(adminToken, uid) {
  const result = await callSetUserDisabledStatus(
    {uid, disabled: true},
    adminToken,
  );

  assert.equal(result.success, true);
  assert.equal(result.disabled, true);
  assert.equal(result.active, false);
  await assertAuthState(uid, {
    email: updatedUser.email,
    displayName: updatedUser.name,
    role: 'user',
    disabled: true,
  });
  await assertProfile(uid, {
    name: updatedUser.name,
    email: updatedUser.email,
    role: 'user',
    active: false,
  });

  console.log('OK DISABLE cierra Auth.disabled y profile.active.');
}

async function testEnable(adminToken, uid) {
  const result = await callSetUserDisabledStatus(
    {uid, disabled: false},
    adminToken,
  );

  assert.equal(result.success, true);
  assert.equal(result.disabled, false);
  assert.equal(result.active, true);
  await assertAuthState(uid, {
    email: updatedUser.email,
    displayName: updatedUser.name,
    role: 'user',
    disabled: false,
  });
  await assertProfile(uid, {
    name: updatedUser.name,
    email: updatedUser.email,
    role: 'user',
    active: true,
  });

  console.log('OK ENABLE restaura Auth.disabled y profile.active.');
}

async function testDelete(adminToken, uid) {
  const result = await callDeleteUser({uid}, adminToken);

  assert.equal(result.success, true);
  assert.equal(result.uid, uid);
  await assertMissingAuthUser(uid);
  await assertMissingDocument('user_profiles', uid);
  await assertMissingDocument('user_directory', uid);

  console.log('OK DELETE elimina Auth, profile y directory.');
}

async function assertAuthState(uid, expected) {
  const userRecord = await admin.auth().getUser(uid);

  assert.equal(userRecord.email, expected.email);
  assert.equal(userRecord.displayName, expected.displayName);
  assert.equal(userRecord.customClaims.role, expected.role);
  assert.equal(userRecord.disabled, expected.disabled);
}

async function assertProfile(uid, expected) {
  const snapshot = await admin
    .firestore()
    .collection('user_profiles')
    .doc(uid)
    .get();
  const profile = snapshot.data();

  assert.equal(snapshot.exists, true);
  assert.equal(profile.uid, uid);
  assert.equal(profile.name, expected.name);
  assert.equal(profile.email, expected.email);
  assert.equal(profile.role, expected.role);
  assert.equal(profile.active, expected.active);
  assert.ok(profile.createdAt);
  assert.ok(profile.updatedAt);
}

async function assertDirectory(uid, expected) {
  const snapshot = await admin
    .firestore()
    .collection('user_directory')
    .doc(uid)
    .get();
  const directory = snapshot.data();

  assert.equal(snapshot.exists, true);
  assert.deepEqual(Object.keys(directory).sort(), ['name', 'role', 'uid']);
  assert.equal(directory.uid, uid);
  assert.equal(directory.name, expected.name);
  assert.equal(directory.role, expected.role);
}

async function assertMissingAuthUser(uid) {
  try {
    await admin.auth().getUser(uid);
  } catch (error) {
    if (error && error.code === 'auth/user-not-found') {
      return;
    }

    throw error;
  }

  assert.fail(`No debia existir usuario Auth ${uid}.`);
}

async function assertMissingDocument(collection, uid) {
  const snapshot = await admin.firestore().collection(collection).doc(uid).get();

  assert.equal(snapshot.exists, false);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
