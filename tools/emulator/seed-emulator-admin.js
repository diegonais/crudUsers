#!/usr/bin/env node

const {
  assertAdminEmulatorEnv,
  ensureLocalUser,
  initializeAdminApp,
  users,
} = require('./emulator-common');

async function main() {
  assertAdminEmulatorEnv();
  initializeAdminApp();

  const userRecord = await ensureLocalUser(users.admin);

  console.log('Admin local listo en Firebase Emulator Suite.');
  console.log(`UID: ${userRecord.uid}`);
  console.log(`Email: ${users.admin.email}`);
  console.log(`Display name: ${users.admin.displayName}`);
  console.log(`Custom Claim role: ${users.admin.role}`);
  console.log('Password de prueba: AdminLocal123!');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
