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
  const normalRecord = await ensureLocalUser(users.normal);

  console.log('Admin local listo en Firebase Emulator Suite.');
  console.log(`UID: ${userRecord.uid}`);
  console.log(`Email: ${users.admin.email}`);
  console.log(`Display name: ${users.admin.displayName}`);
  console.log(`Custom Claim role: ${users.admin.role}`);
  console.log('Password de prueba: AdminLocal123!');
  console.log('Usuario normal local listo en Firebase Emulator Suite.');
  console.log(`UID: ${normalRecord.uid}`);
  console.log(`Email: ${users.normal.email}`);
  console.log(`Display name: ${users.normal.displayName}`);
  console.log(`Custom Claim role: ${users.normal.role}`);
  console.log('Password de prueba: NormalLocal123!');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
