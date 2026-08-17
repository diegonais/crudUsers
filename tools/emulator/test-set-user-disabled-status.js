#!/usr/bin/env node

const assert = require('assert/strict');
const path = require('path');
const {
  admin,
  assertCallableEmulatorEnv,
  callCreateUser,
  callSetUserDisabledStatus,
  deleteLocalUserByEmail,
  ensureLocalUser,
  initializeAdminApp,
  projectId,
  signInWithPassword,
  users,
} = require('./emulator-common');

const testUsers = {
  admin2: {
    email: 'disabled-admin2@test.local',
    password: 'DisabledAdmin2123!',
    displayName: 'Disabled Admin Dos',
    role: 'admin',
  },
  noOp: {
    email: 'disabled-noop@test.local',
    password: 'DisabledNoop123!',
    displayName: 'Disabled Noop',
    role: 'user',
  },
  inconsistent: {
    email: 'disabled-inconsistent@test.local',
    password: 'DisabledInconsistent123!',
    displayName: 'Disabled Inconsistent',
    role: 'user',
  },
  disableRollback: {
    email: 'disable-rollback@test.local',
    password: 'DisableRollback123!',
    displayName: 'Disable Rollback',
    role: 'user',
  },
  enableRollback: {
    email: 'enable-rollback@test.local',
    password: 'EnableRollback123!',
    displayName: 'Enable Rollback',
    role: 'user',
  },
  forbiddenCreate: {
    name: 'Disabled Admin Created',
    email: 'disabled-admin-created@test.local',
    password: 'DisabledAdminCreated123!',
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
  const admin2Token = await signInWithPassword(
    testUsers.admin2.email,
    testUsers.admin2.password,
  );
  const normalRecord = await admin.auth().getUserByEmail(users.normal.email);

  await testDisableUser(adminToken, normalRecord.uid);
  await testDisabledLoginBlocked();
  await testPreviousSessionRulesForDisabledUser(oldNormalToken, normalRecord.uid);
  await testDisabledAdminCannotCallFunctions(
    adminToken,
    admin2Token,
    records.admin2.uid,
  );
  await testEnableUserAndLogin(adminToken, normalRecord.uid);
  await testRolePreservedWhenReenabled(adminToken, records.admin2.uid);
  await testActiveRules(adminToken, normalRecord.uid);
  await testUserIsPermissionDenied(records.admin2.uid);
  await testUnauthenticatedCallFails(records.noOp.uid);
  await testMissingUidFails(adminToken);
  await testSelfDisableFails(adminToken);
  await testInvalidPayloadFails(adminToken, records.noOp.uid);
  await testNoOps(adminToken, records.noOp.uid);
  await testPreviousInconsistencyFails(adminToken, records.inconsistent.uid);
  await testDisableCompensationRestoresFirestore(records.disableRollback.uid);
  await testEnableCompensationRestoresAuth(records.enableRollback.uid);

  await ensureLocalUser(users.normal);
  await ensureLocalUser(testUsers.admin2);
  console.log('Todas las pruebas locales de setUserDisabledStatus pasaron.');
}

async function cleanupTestUsers() {
  const emails = [
    ...Object.values(testUsers)
      .filter((user) => user.email)
      .map((user) => user.email),
    testUsers.forbiddenCreate.email,
  ];

  await Promise.all(emails.map((email) => deleteLocalUserByEmail(email)));
}

async function seedTestUsers() {
  const userEntries = Object.entries(testUsers).filter(
    ([, user]) => user.displayName,
  );
  const entries = await Promise.all(
    userEntries.map(async ([key, user]) => {
      const record = await ensureLocalUser(user);
      return [key, record];
    }),
  );

  return Object.fromEntries(entries);
}

async function testDisableUser(adminToken, uid) {
  const result = await callSetUserDisabledStatus(
    {uid, disabled: true},
    adminToken,
  );

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  assert.equal(result.disabled, true);
  assert.equal(result.active, false);
  await assertStatusState(uid, {disabled: true, active: false});
  await assertDirectoryHasNoActive(uid);

  console.log('OK deshabilitar usuario sincroniza Auth.disabled y profile.active.');
}

async function testDisabledLoginBlocked() {
  const response = await signInWithPasswordResponse(
    users.normal.email,
    users.normal.password,
  );

  assert.notEqual(response.status, 200);
  assert.match(JSON.stringify(response.body), /USER_DISABLED|user-disabled/i);
  console.log('OK login nuevo de cuenta deshabilitada es rechazado.');
}

async function testPreviousSessionRulesForDisabledUser(idToken, uid) {
  const ownProfile = await fetchProfile(uid, idToken);
  assert.equal(ownProfile.status, 200);

  const directory = await fetchDirectory(idToken);
  assert.equal(directory.status, 403);

  console.log('OK token previo lee perfil propio pero no directorio.');
}

async function testDisabledAdminCannotCallFunctions(
  adminToken,
  disabledAdminToken,
  disabledAdminUid,
) {
  await callSetUserDisabledStatus(
    {uid: disabledAdminUid, disabled: true},
    adminToken,
  );
  await assertStatusState(disabledAdminUid, {disabled: true, active: false});

  await expectCallableCode(
    () => callCreateUser(testUsers.forbiddenCreate, disabledAdminToken),
    'permission-denied',
  );
  await expectNoAuthUser(testUsers.forbiddenCreate.email);

  const adminProfiles = await fetchAdminProfiles(disabledAdminToken);
  assert.equal(adminProfiles.status, 403);

  console.log('OK admin deshabilitado con token viejo no ejecuta Callable admin.');
}

async function testEnableUserAndLogin(adminToken, uid) {
  const result = await callSetUserDisabledStatus(
    {uid, disabled: false},
    adminToken,
  );

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  await assertStatusState(uid, {disabled: false, active: true});

  const token = await signInWithPassword(users.normal.email, users.normal.password);
  assert.ok(token);

  const userRecord = await admin.auth().getUser(uid);
  assert.equal(userRecord.email, users.normal.email);
  assert.equal(userRecord.displayName, users.normal.displayName);
  assert.equal(userRecord.customClaims.role, users.normal.role);

  console.log('OK habilitar usuario permite login y conserva datos.');
}

async function testRolePreservedWhenReenabled(adminToken, uid) {
  await callSetUserDisabledStatus({uid, disabled: false}, adminToken);
  await assertStatusState(uid, {disabled: false, active: true});

  const state = await readUserState(uid);
  assert.equal(state.auth.customClaims.role, 'admin');
  assert.equal(state.profile.role, 'admin');
  assert.equal(state.directory.role, 'admin');

  console.log('OK deshabilitar/habilitar preserva rol y claims.');
}

async function testActiveRules(adminToken, normalUid) {
  const normalToken = await signInWithPassword(
    users.normal.email,
    users.normal.password,
  );
  assert.equal((await fetchProfile(normalUid, normalToken)).status, 200);
  assert.equal((await fetchDirectory(normalToken)).status, 200);
  assert.equal((await fetchAdminProfiles(adminToken)).status, 200);

  console.log('OK Rules permiten recursos esperados a usuarios activos.');
}

async function testUserIsPermissionDenied(targetUid) {
  const normalToken = await signInWithPassword(
    users.normal.email,
    users.normal.password,
  );
  const before = await readUserState(targetUid);

  await expectCallableCode(
    () => callSetUserDisabledStatus(
      {uid: targetUid, disabled: true},
      normalToken,
    ),
    'permission-denied',
  );

  await assertUserState(targetUid, before);
  console.log('OK usuario normal no puede cambiar estado de otro usuario.');
}

async function testUnauthenticatedCallFails(targetUid) {
  const before = await readUserState(targetUid);

  await expectCallableCode(
    () => callSetUserDisabledStatus({uid: targetUid, disabled: true}),
    'unauthenticated',
  );

  await assertUserState(targetUid, before);
  console.log('OK llamada sin sesion recibe unauthenticated.');
}

async function testMissingUidFails(adminToken) {
  const missingUid = 'missing-disabled-status-uid';

  await expectCallableCode(
    () => callSetUserDisabledStatus(
      {uid: missingUid, disabled: true},
      adminToken,
    ),
    'not-found',
  );

  const profile = await admin
    .firestore()
    .collection('user_profiles')
    .doc(missingUid)
    .get();
  assert.equal(profile.exists, false);

  console.log('OK UID inexistente recibe not-found sin crear documentos.');
}

async function testSelfDisableFails(adminToken) {
  const adminRecord = await admin.auth().getUserByEmail(users.admin.email);
  const before = await readUserState(adminRecord.uid);

  await expectCallableCode(
    () => callSetUserDisabledStatus(
      {uid: adminRecord.uid, disabled: true},
      adminToken,
    ),
    'failed-precondition',
  );

  await assertUserState(adminRecord.uid, before);
  console.log('OK self-disable recibe failed-precondition sin cambios.');
}

async function testInvalidPayloadFails(adminToken, targetUid) {
  await expectCallableCode(
    () => callSetUserDisabledStatus(
      {uid: targetUid, disabled: 'true'},
      adminToken,
    ),
    'invalid-argument',
  );

  await expectCallableCode(
    () => callSetUserDisabledStatus(
      {uid: targetUid, disabled: true, role: 'user'},
      adminToken,
    ),
    'invalid-argument',
  );

  console.log('OK payload invalido recibe invalid-argument.');
}

async function testNoOps(adminToken, uid) {
  const activeBefore = await readUserState(uid);
  const activeResult = await callSetUserDisabledStatus(
    {uid, disabled: false},
    adminToken,
  );

  assert.equal(activeResult.changed, false);
  await assertUserState(uid, activeBefore);

  await callSetUserDisabledStatus({uid, disabled: true}, adminToken);
  const disabledBefore = await readUserState(uid);
  const disabledResult = await callSetUserDisabledStatus(
    {uid, disabled: true},
    adminToken,
  );

  assert.equal(disabledResult.changed, false);
  await assertUserState(uid, disabledBefore);

  await callSetUserDisabledStatus({uid, disabled: false}, adminToken);
  console.log('OK no-op activo e inactivo no realizan cambios observables.');
}

async function testPreviousInconsistencyFails(adminToken, uid) {
  await admin.auth().updateUser(uid, {disabled: true});
  await admin
    .firestore()
    .collection('user_profiles')
    .doc(uid)
    .update({active: true});
  const before = await readUserState(uid);

  await expectCallableCode(
    () => callSetUserDisabledStatus({uid, disabled: false}, adminToken),
    'failed-precondition',
  );

  await assertUserState(uid, before);
  await ensureLocalUser(testUsers.inconsistent);
  console.log('OK inconsistencia previa disabled/active es rechazada.');
}

async function testDisableCompensationRestoresFirestore(uid) {
  const modulePath = path.resolve(
    __dirname,
    '../../functions/lib/users/set-user-disabled-status.js',
  );
  const {setUserDisabledStatusCore} = require(modulePath);
  const realAuth = admin.auth();
  const before = await readUserState(uid);

  await expectCallableCode(
    () => setUserDisabledStatusCore(
      {uid, disabled: true},
      {
        auth: {
          getUser: (targetUid) => realAuth.getUser(targetUid),
          updateUser: async () => {
            throw new Error('Forced Auth disable failure.');
          },
        },
        firestore: admin.firestore(),
      },
    ),
    'internal',
  );

  await assertUserState(uid, before);
  console.log('OK fallo al deshabilitar restaura Firestore active=true.');
}

async function testEnableCompensationRestoresAuth(uid) {
  await admin.auth().updateUser(uid, {disabled: true});
  await admin
    .firestore()
    .collection('user_profiles')
    .doc(uid)
    .update({active: false});
  const before = await readUserState(uid);

  const modulePath = path.resolve(
    __dirname,
    '../../functions/lib/users/set-user-disabled-status.js',
  );
  const {setUserDisabledStatusCore} = require(modulePath);

  await expectCallableCode(
    () => setUserDisabledStatusCore(
      {uid, disabled: false},
      {
        auth: admin.auth(),
        firestore: admin.firestore(),
        commitFirestoreActiveUpdate: async () => {
          throw new Error('Forced Firestore enable failure.');
        },
      },
    ),
    'internal',
  );

  await assertUserState(uid, before);
  await ensureLocalUser(testUsers.enableRollback);
  console.log('OK fallo al habilitar restaura Auth.disabled=true.');
}

async function assertStatusState(uid, expected) {
  const state = await readUserState(uid);

  assert.equal(state.auth.disabled, expected.disabled);
  assert.equal(state.profile.active, expected.active);
}

async function assertDirectoryHasNoActive(uid) {
  const snapshot = await admin
    .firestore()
    .collection('user_directory')
    .doc(uid)
    .get();
  const directory = snapshot.data();

  assert.equal(Object.prototype.hasOwnProperty.call(directory, 'active'), false);
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

async function fetchProfile(uid, idToken) {
  return fetchFirestoreDocument(`user_profiles/${uid}`, idToken);
}

async function fetchDirectory(idToken) {
  return fetchFirestoreDocument('user_directory', idToken);
}

async function fetchAdminProfiles(idToken) {
  return fetchFirestoreDocument('user_profiles', idToken);
}

async function fetchFirestoreDocument(pathSuffix, idToken) {
  const firestoreHost = requireEnv('FIRESTORE_EMULATOR_HOST');
  const url =
    `http://${firestoreHost}/v1/projects/${projectId}` +
    `/databases/(default)/documents/${pathSuffix}`;

  return fetch(url, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
}

async function signInWithPasswordResponse(email, password) {
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

  return {
    status: response.status,
    body,
  };
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
