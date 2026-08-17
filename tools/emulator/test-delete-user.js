#!/usr/bin/env node

const assert = require('assert/strict');
const path = require('path');
const {
  admin,
  assertCallableEmulatorEnv,
  callCreateUser,
  callDeleteUser,
  callSetUserDisabledStatus,
  deleteLocalUserByEmail,
  ensureLocalUser,
  initializeAdminApp,
  signInWithPassword,
  users,
} = require('./emulator-common');

const testUsers = {
  active: {
    email: 'delete.active@test.local',
    password: 'DeleteActive123!',
    displayName: 'Delete Active',
    role: 'user',
  },
  disabled: {
    email: 'delete.disabled@test.local',
    password: 'DeleteDisabled123!',
    displayName: 'Delete Disabled',
    role: 'user',
  },
  admin2: {
    email: 'delete-admin2@test.local',
    password: 'DeleteAdmin2123!',
    displayName: 'Delete Admin Dos',
    role: 'admin',
  },
  missingProfile: {
    email: 'delete-missing-profile@test.local',
    password: 'DeleteMissingProfile123!',
    displayName: 'Delete Missing Profile',
    role: 'user',
  },
  missingDirectory: {
    email: 'delete-missing-directory@test.local',
    password: 'DeleteMissingDirectory123!',
    displayName: 'Delete Missing Directory',
    role: 'user',
  },
  authFailure: {
    email: 'delete-auth-failure@test.local',
    password: 'DeleteAuthFailure123!',
    displayName: 'Delete Auth Failure',
    role: 'user',
  },
  restoreFailure: {
    email: 'delete-restore-failure@test.local',
    password: 'DeleteRestoreFailure123!',
    displayName: 'Delete Restore Failure',
    role: 'user',
  },
  userA: {
    email: 'delete-user-a@test.local',
    password: 'DeleteUserA123!',
    displayName: 'Delete User A',
    role: 'user',
  },
  userB: {
    email: 'delete-user-b@test.local',
    password: 'DeleteUserB123!',
    displayName: 'Delete User B',
    role: 'user',
  },
  claims: {
    email: 'delete-claims@test.local',
    password: 'DeleteClaims123!',
    displayName: 'Delete Claims',
    role: 'user',
  },
  forbiddenCreate: {
    name: 'Disabled Delete Admin Created',
    email: 'disabled-delete-admin-created@test.local',
    password: 'DisabledDeleteAdminCreated123!',
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
  const normalToken = await signInWithPassword(
    users.normal.email,
    users.normal.password,
  );
  const admin2Token = await signInWithPassword(
    testUsers.admin2.email,
    testUsers.admin2.password,
  );

  await testDeleteActiveUser(adminToken, records.active.uid);
  await testDeleteDisabledUser(adminToken, records.disabled.uid);
  await testUserIsPermissionDenied(normalToken, records.userB.uid);
  await testDisabledAdminIsPermissionDenied(
    adminToken,
    admin2Token,
    records.admin2.uid,
  );
  await testUnauthenticatedCallFails(records.userB.uid);
  await testMissingUidFails(adminToken);
  await testSelfDeleteFails(adminToken);
  await testUnexpectedFieldFails(adminToken, records.userB.uid);
  await testMissingProfileFails(adminToken, records.missingProfile.uid);
  await testMissingDirectoryFails(adminToken, records.missingDirectory.uid);
  await testAuthFailureRestoresFirestore(records.authFailure.uid);
  await testRestoreFailureReturnsInternal(records.restoreFailure.uid);
  await testDoesNotAffectOtherUsers(adminToken, records.userA.uid, records.userB.uid);
  await testCustomClaimsIrrelevant(adminToken, records.claims.uid);

  await ensureLocalUser(users.normal);
  await ensureLocalUser(testUsers.admin2);
  console.log('Todas las pruebas locales de deleteUser pasaron.');
}

async function cleanupTestUsers() {
  const emails = [
    ...Object.values(testUsers).map((user) => user.email),
    testUsers.forbiddenCreate.email,
  ];

  await Promise.all(emails.map((email) => deleteLocalUserByEmail(email)));
}

async function seedTestUsers() {
  const entries = await Promise.all(
    Object.entries(testUsers)
      .filter(([, user]) => user.displayName)
      .map(async ([key, user]) => {
        const record = await ensureLocalUser(user);
        return [key, record];
      }),
  );

  return Object.fromEntries(entries);
}

async function testDeleteActiveUser(adminToken, uid) {
  await assertUserExistsEverywhere(uid);

  const result = await callDeleteUser({uid}, adminToken);
  assert.equal(result.success, true);
  assert.equal(result.uid, uid);

  await assertUserMissingEverywhere(uid);
  console.log('OK elimina usuario activo en Auth, profile y directory.');
}

async function testDeleteDisabledUser(adminToken, uid) {
  await callSetUserDisabledStatus({uid, disabled: true}, adminToken);
  await assertUserExistsEverywhere(uid);

  await callDeleteUser({uid}, adminToken);

  await assertUserMissingEverywhere(uid);
  console.log('OK elimina usuario deshabilitado.');
}

async function testUserIsPermissionDenied(normalToken, targetUid) {
  const before = await readUserState(targetUid);

  await expectCallableCode(
    () => callDeleteUser({uid: targetUid}, normalToken),
    'permission-denied',
  );

  await assertUserState(targetUid, before);
  console.log('OK usuario normal no puede eliminar usuarios.');
}

async function testDisabledAdminIsPermissionDenied(
  adminToken,
  disabledAdminToken,
  disabledAdminUid,
) {
  await callSetUserDisabledStatus(
    {uid: disabledAdminUid, disabled: true},
    adminToken,
  );

  await expectCallableCode(
    () => callDeleteUser({uid: disabledAdminUid}, disabledAdminToken),
    'permission-denied',
  );
  await expectCallableCode(
    () => callCreateUser(testUsers.forbiddenCreate, disabledAdminToken),
    'permission-denied',
  );
  await expectNoAuthUserByEmail(testUsers.forbiddenCreate.email);

  await callSetUserDisabledStatus(
    {uid: disabledAdminUid, disabled: false},
    adminToken,
  );
  console.log('OK admin deshabilitado con token viejo no puede eliminar.');
}

async function testUnauthenticatedCallFails(targetUid) {
  const before = await readUserState(targetUid);

  await expectCallableCode(
    () => callDeleteUser({uid: targetUid}),
    'unauthenticated',
  );

  await assertUserState(targetUid, before);
  console.log('OK llamada sin sesion recibe unauthenticated.');
}

async function testMissingUidFails(adminToken) {
  await expectCallableCode(
    () => callDeleteUser({uid: 'missing-delete-user-uid'}, adminToken),
    'not-found',
  );

  console.log('OK UID inexistente recibe not-found.');
}

async function testSelfDeleteFails(adminToken) {
  const adminRecord = await admin.auth().getUserByEmail(users.admin.email);
  const before = await readUserState(adminRecord.uid);

  await expectCallableCode(
    () => callDeleteUser({uid: adminRecord.uid}, adminToken),
    'failed-precondition',
  );

  await assertUserState(adminRecord.uid, before);
  console.log('OK self-delete recibe failed-precondition.');
}

async function testUnexpectedFieldFails(adminToken, targetUid) {
  await expectCallableCode(
    () => callDeleteUser({uid: targetUid, role: 'user'}, adminToken),
    'invalid-argument',
  );

  console.log('OK payload adicional recibe invalid-argument.');
}

async function testMissingProfileFails(adminToken, uid) {
  const before = await readUserState(uid);
  await admin.firestore().collection('user_profiles').doc(uid).delete();

  await expectCallableCode(
    () => callDeleteUser({uid}, adminToken),
    'failed-precondition',
  );

  const authAfter = await admin.auth().getUser(uid);
  assert.equal(authAfter.uid, before.auth.uid);
  await ensureLocalUser(testUsers.missingProfile);
  console.log('OK user_profiles faltante se detecta antes de eliminar Auth.');
}

async function testMissingDirectoryFails(adminToken, uid) {
  const before = await readUserState(uid);
  await admin.firestore().collection('user_directory').doc(uid).delete();

  await expectCallableCode(
    () => callDeleteUser({uid}, adminToken),
    'failed-precondition',
  );

  const authAfter = await admin.auth().getUser(uid);
  assert.equal(authAfter.uid, before.auth.uid);
  await ensureLocalUser(testUsers.missingDirectory);
  console.log('OK user_directory faltante se detecta antes de eliminar Auth.');
}

async function testAuthFailureRestoresFirestore(uid) {
  const modulePath = path.resolve(
    __dirname,
    '../../functions/lib/users/delete-user.js',
  );
  const {deleteUserCore} = require(modulePath);
  const before = await readUserState(uid);

  await expectCallableCode(
    () => deleteUserCore(
      {uid},
      {
        auth: {
          getUser: (targetUid) => admin.auth().getUser(targetUid),
          deleteUser: async () => {
            throw new Error('Forced Auth delete failure.');
          },
        },
        firestore: admin.firestore(),
      },
    ),
    'internal',
  );

  await assertUserState(uid, before);
  console.log('OK fallo Auth despues de Firestore restaura documentos.');
}

async function testRestoreFailureReturnsInternal(uid) {
  const modulePath = path.resolve(
    __dirname,
    '../../functions/lib/users/delete-user.js',
  );
  const {deleteUserCore} = require(modulePath);

  await expectCallableCode(
    () => deleteUserCore(
      {uid},
      {
        auth: {
          getUser: (targetUid) => admin.auth().getUser(targetUid),
          deleteUser: async () => {
            throw new Error('Forced Auth delete failure.');
          },
        },
        firestore: admin.firestore(),
        commitFirestoreRestore: async () => {
          throw new Error('Forced Firestore restore failure.');
        },
      },
    ),
    'internal',
  );

  await ensureLocalUser(testUsers.restoreFailure);
  console.log('OK restauracion fallida devuelve internal.');
}

async function testDoesNotAffectOtherUsers(adminToken, userAUid, userBUid) {
  const userBBefore = await readUserState(userBUid);

  await callDeleteUser({uid: userAUid}, adminToken);

  await assertUserMissingEverywhere(userAUid);
  await assertUserState(userBUid, userBBefore);
  console.log('OK eliminar userA no afecta a userB.');
}

async function testCustomClaimsIrrelevant(adminToken, uid) {
  await admin.auth().setCustomUserClaims(uid, {
    role: 'user',
    exampleFlag: true,
  });

  await callDeleteUser({uid}, adminToken);

  await assertUserMissingEverywhere(uid);
  console.log('OK usuario con claims extra se elimina sin limpiar claims manuales.');
}

async function assertUserExistsEverywhere(uid) {
  const state = await readUserState(uid);

  assert.equal(state.auth.uid, uid);
  assert.notEqual(state.profile, null);
  assert.notEqual(state.directory, null);
}

async function assertUserMissingEverywhere(uid) {
  await expectNoAuthUserByUid(uid);

  const [profile, directory] = await Promise.all([
    admin.firestore().collection('user_profiles').doc(uid).get(),
    admin.firestore().collection('user_directory').doc(uid).get(),
  ]);

  assert.equal(profile.exists, false);
  assert.equal(directory.exists, false);
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
      emailVerified: auth.emailVerified,
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
  assert.equal(actual.auth.emailVerified, expected.auth.emailVerified);
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

async function expectNoAuthUserByUid(uid) {
  try {
    await admin.auth().getUser(uid);
  } catch (error) {
    if (error && error.code === 'auth/user-not-found') {
      return;
    }

    throw error;
  }

  assert.fail(`No debia existir usuario Auth para ${uid}.`);
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
