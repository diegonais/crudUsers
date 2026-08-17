#!/usr/bin/env node

const assert = require('assert/strict');
const path = require('path');
const {
  admin,
  assertCallableEmulatorEnv,
  callSetUserRole,
  deleteLocalUserByEmail,
  ensureLocalUser,
  initializeAdminApp,
  projectId,
  signInWithPassword,
  users,
} = require('./emulator-common');

const testUsers = {
  admin2: {
    email: 'admin2@test.local',
    password: 'Admin2Local123!',
    displayName: 'Admin Dos Local',
    role: 'admin',
  },
  forbiddenCaller: {
    email: 'role-forbidden@test.local',
    password: 'RoleForbidden123!',
    displayName: 'Role Forbidden Local',
    role: 'user',
  },
  noOp: {
    email: 'role-noop@test.local',
    password: 'RoleNoop123!',
    displayName: 'Role Noop Local',
    role: 'user',
  },
  missingDocs: {
    email: 'role-missing-docs@test.local',
    password: 'RoleMissingDocs123!',
    displayName: 'Role Missing Docs Local',
    role: 'user',
  },
  inconsistent: {
    email: 'role-inconsistent@test.local',
    password: 'RoleInconsistent123!',
    displayName: 'Role Inconsistent Local',
    role: 'user',
  },
  compensation: {
    email: 'role-compensation@test.local',
    password: 'RoleCompensation123!',
    displayName: 'Role Compensation Local',
    role: 'user',
  },
  preserveClaims: {
    email: 'role-preserve@test.local',
    password: 'RolePreserve123!',
    displayName: 'Role Preserve Local',
    role: 'user',
  },
};

async function main() {
  assertCallableEmulatorEnv();
  initializeAdminApp();

  await cleanupTestUsers();
  await ensureLocalUser(users.admin);
  await ensureLocalUser(users.normal);
  const records = await seedTestUsers();

  const adminToken = await signInWithPassword(
    users.admin.email,
    users.admin.password,
  );
  const oldNormalToken = await signInWithPassword(
    users.normal.email,
    users.normal.password,
  );
  const forbiddenToken = await signInWithPassword(
    testUsers.forbiddenCaller.email,
    testUsers.forbiddenCaller.password,
  );

  await testUserToAdminAndTokenPropagation(adminToken, oldNormalToken);
  await testAdminToUser(adminToken, records.admin2.uid);
  await testUserIsPermissionDenied(
    forbiddenToken,
    records.preserveClaims.uid,
  );
  await testUnauthenticatedCallFails(records.preserveClaims.uid);
  await testMissingUidFails(adminToken);
  await testInvalidRoleFails(adminToken, records.preserveClaims.uid);
  await testUnexpectedFieldFails(adminToken, records.preserveClaims.uid);
  await testSelfRoleChangeFails(adminToken);
  await testNoOp(adminToken, records.noOp.uid);
  await testMissingFirestoreDocumentFailsBeforeClaims(
    adminToken,
    records.missingDocs.uid,
  );
  await testPreviousInconsistencyFails(adminToken, records.inconsistent.uid);
  await testCompensationRestoresOldClaims(records.compensation.uid);
  await testPreservesExistingClaims(adminToken, records.preserveClaims.uid);

  await ensureLocalUser(users.normal);
  await ensureLocalUser(testUsers.admin2);
  console.log('Todas las pruebas locales de setUserRole pasaron.');
}

async function cleanupTestUsers() {
  await Promise.all(
    Object.values(testUsers).map((user) => deleteLocalUserByEmail(user.email)),
  );
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

async function testUserToAdminAndTokenPropagation(adminToken, oldNormalToken) {
  const normalRecord = await admin.auth().getUserByEmail(users.normal.email);
  const before = await readUserState(normalRecord.uid);
  assert.equal(before.auth.customClaims.role, 'user');

  await expectAdminProfilesDenied(oldNormalToken);

  const result = await callSetUserRole(
    {uid: normalRecord.uid, role: 'admin'},
    adminToken,
  );

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  await assertRoleState(normalRecord.uid, 'admin');

  await expectAdminProfilesDenied(oldNormalToken);

  const refreshedNormalToken = await signInWithPassword(
    users.normal.email,
    users.normal.password,
  );
  await expectAdminProfilesAllowed(refreshedNormalToken);

  console.log(
    'OK user -> admin actualiza claims/Firestore y token viejo sigue sin permisos.',
  );
}

async function testAdminToUser(adminToken, uid) {
  const result = await callSetUserRole({uid, role: 'user'}, adminToken);

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  await assertRoleState(uid, 'user');

  console.log('OK admin -> user sincroniza claim, profile y directory.');
}

async function testUserIsPermissionDenied(userToken, targetUid) {
  const before = await readUserState(targetUid);

  await expectCallableCode(
    () => callSetUserRole({uid: targetUid, role: 'admin'}, userToken),
    'permission-denied',
  );

  await assertUserState(targetUid, before);
  console.log('OK usuario normal recibe permission-denied sin cambios.');
}

async function testUnauthenticatedCallFails(targetUid) {
  const before = await readUserState(targetUid);

  await expectCallableCode(
    () => callSetUserRole({uid: targetUid, role: 'admin'}),
    'unauthenticated',
  );

  await assertUserState(targetUid, before);
  console.log('OK llamada sin sesion recibe unauthenticated.');
}

async function testMissingUidFails(adminToken) {
  const missingUid = 'missing-role-local-uid';

  await expectCallableCode(
    () => callSetUserRole({uid: missingUid, role: 'user'}, adminToken),
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

async function testInvalidRoleFails(adminToken, targetUid) {
  await expectCallableCode(
    () => callSetUserRole({uid: targetUid, role: 'superadmin'}, adminToken),
    'invalid-argument',
  );

  console.log('OK rol invalido recibe invalid-argument.');
}

async function testUnexpectedFieldFails(adminToken, targetUid) {
  await expectCallableCode(
    () => callSetUserRole({
      uid: targetUid,
      role: 'admin',
      callerRole: 'admin',
    }, adminToken),
    'invalid-argument',
  );

  console.log('OK campos fuera del contrato son rechazados.');
}

async function testSelfRoleChangeFails(adminToken) {
  const adminRecord = await admin.auth().getUserByEmail(users.admin.email);
  const before = await readUserState(adminRecord.uid);

  await expectCallableCode(
    () => callSetUserRole({uid: adminRecord.uid, role: 'admin'}, adminToken),
    'failed-precondition',
  );

  await assertUserState(adminRecord.uid, before);
  console.log('OK self role change recibe failed-precondition sin cambios.');
}

async function testNoOp(adminToken, uid) {
  const before = await readUserState(uid);
  const result = await callSetUserRole({uid, role: 'user'}, adminToken);

  assert.equal(result.success, true);
  assert.equal(result.changed, false);
  await assertUserState(uid, before);

  console.log('OK no-op user -> user no realiza cambios observables.');
}

async function testMissingFirestoreDocumentFailsBeforeClaims(adminToken, uid) {
  const before = await readUserState(uid);

  await admin.firestore().collection('user_directory').doc(uid).delete();

  await expectCallableCode(
    () => callSetUserRole({uid, role: 'admin'}, adminToken),
    'failed-precondition',
  );

  const authAfter = await admin.auth().getUser(uid);
  assert.deepEqual(authAfter.customClaims, before.auth.customClaims);

  await ensureLocalUser(testUsers.missingDocs);
  console.log('OK documento faltante se detecta antes de cambiar claims.');
}

async function testPreviousInconsistencyFails(adminToken, uid) {
  await admin
    .firestore()
    .collection('user_profiles')
    .doc(uid)
    .update({role: 'admin'});
  const before = await readUserState(uid);

  await expectCallableCode(
    () => callSetUserRole({uid, role: 'admin'}, adminToken),
    'failed-precondition',
  );

  await assertUserState(uid, before);
  await ensureLocalUser(testUsers.inconsistent);
  console.log('OK inconsistencia previa de rol es rechazada.');
}

async function testCompensationRestoresOldClaims(uid) {
  const setUserRoleModulePath = path.resolve(
    __dirname,
    '../../functions/lib/users/set-user-role.js',
  );
  const {setUserRoleCore} = require(setUserRoleModulePath);
  await admin.auth().setCustomUserClaims(uid, {
    role: 'user',
    exampleFlag: true,
  });
  const before = await readUserState(uid);

  await expectCallableCode(
    () => setUserRoleCore(
      {uid, role: 'admin'},
      {
        auth: admin.auth(),
        firestore: admin.firestore(),
        commitFirestoreRoleUpdate: async () => {
          throw new Error('Forced internal Firestore role failure.');
        },
      },
    ),
    'internal',
  );

  await assertUserState(uid, before);
  console.log('OK compensacion restaura oldCustomClaims completo.');
}

async function testPreservesExistingClaims(adminToken, uid) {
  await admin.auth().setCustomUserClaims(uid, {
    role: 'user',
    exampleFlag: true,
  });

  const result = await callSetUserRole({uid, role: 'admin'}, adminToken);
  assert.equal(result.changed, true);

  const after = await admin.auth().getUser(uid);
  assert.deepEqual(after.customClaims, {
    role: 'admin',
    exampleFlag: true,
  });
  await assertRoleState(uid, 'admin');

  console.log('OK setCustomUserClaims preserva claims no relacionados.');
}

async function assertRoleState(uid, expectedRole) {
  const state = await readUserState(uid);

  assert.equal(state.auth.customClaims.role, expectedRole);
  assert.equal(state.profile.role, expectedRole);
  assert.equal(state.directory.role, expectedRole);
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
      email: auth.email,
      displayName: auth.displayName,
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
  assert.equal(actual.auth.email, expected.auth.email);
  assert.equal(actual.auth.displayName, expected.auth.displayName);
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

async function expectAdminProfilesDenied(idToken) {
  const response = await fetchAdminProfiles(idToken);
  assert.equal(response.status, 403);
}

async function expectAdminProfilesAllowed(idToken) {
  const response = await fetchAdminProfiles(idToken);
  assert.equal(response.status, 200);
}

async function fetchAdminProfiles(idToken) {
  const firestoreHost = requireEnv('FIRESTORE_EMULATOR_HOST');
  const url =
    `http://${firestoreHost}/v1/projects/${projectId}` +
    '/databases/(default)/documents/user_profiles';

  return fetch(url, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
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
