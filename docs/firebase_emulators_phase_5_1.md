# Fase 5.1 - Firebase Emulator Suite

Esta fase prueba `createUser` de forma local con Authentication Emulator,
Firestore Emulator, Functions Emulator y Emulator UI. No despliega Functions ni
crea usuarios reales.

## Iniciar emuladores

```powershell
$env:PATH="C:\Users\USUARIO\AppData\Local\nvm\v22.23.1;$env:PATH"
firebase emulators:start --only auth,firestore,functions
```

Puertos configurados:

```text
Authentication  127.0.0.1:9099
Firestore       127.0.0.1:8080
Functions       127.0.0.1:5001
Emulator UI     http://127.0.0.1:4000
```

Firebase CLI inyecta variables como `FIREBASE_AUTH_EMULATOR_HOST` y
`FIRESTORE_EMULATOR_HOST` dentro del proceso local de Functions. Por eso el
Admin SDK usado por `createUser` habla con los emuladores cuando Auth,
Firestore y Functions se ejecutan juntos.

## Seed admin local

El seed aborta si no detecta `FIREBASE_AUTH_EMULATOR_HOST` y
`FIRESTORE_EMULATOR_HOST`.

PowerShell:

```powershell
$env:PATH="C:\Users\USUARIO\AppData\Local\nvm\v22.23.1;$env:PATH"
$env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
$env:GCLOUD_PROJECT="crudusers-4dba6"
node tools\emulator\seed-emulator-admin.js
```

CMD:

```bat
set PATH=C:\Users\USUARIO\AppData\Local\nvm\v22.23.1;%PATH%
set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
set GCLOUD_PROJECT=crudusers-4dba6
node tools\emulator\seed-emulator-admin.js
```

Credencial de prueba local:

```text
email: admin@test.local
password: AdminLocal123!
displayName: Admin Local
claim: { role: "admin" }
```

El script es idempotente: si el usuario ya existe, actualiza displayName,
password de prueba, Custom Claim y documentos locales.

## Pruebas de integracion

Con los emuladores corriendo:

```powershell
$env:PATH="C:\Users\USUARIO\AppData\Local\nvm\v22.23.1;$env:PATH"
$env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
$env:FUNCTIONS_EMULATOR_HOST="127.0.0.1:5001"
$env:GCLOUD_PROJECT="crudusers-4dba6"
node tools\emulator\test-create-user.js
```

El runner verifica:

- admin crea `Pedro Local`;
- `role=user` queda en Custom Claims;
- `user_profiles/{uid}` contiene `uid`, `name`, `email`, `role`, `active`,
  `createdAt`, `updatedAt`;
- `user_directory/{uid}` contiene solo `uid`, `name`, `role`;
- usuario normal recibe `permission-denied`;
- llamada sin sesion recibe `unauthenticated`;
- email duplicado recibe `already-exists`;
- rol invalido recibe `invalid-argument`;
- password invalida falla sin crear perfil;
- rollback local elimina solo el usuario recien creado.

## Prueba Flutter de integracion

Con los emuladores corriendo y el admin sembrado:

```powershell
flutter test integration_test\create_user_emulator_test.dart -d emulator-5554 --dart-define=USE_FIREBASE_EMULATORS=true
```

Esta prueba inicializa Firebase desde Flutter, conecta Auth/Firestore/Functions
a los emuladores, inicia sesion con `admin@test.local`, llama
`FunctionsService.createUser` y espera que `UserService.watchUsers()` reciba el
nuevo usuario por `snapshots()`.

En Android debug se habilita `android:usesCleartextTraffic="true"` porque los
emuladores locales usan HTTP. El manifiesto principal/release no se modifica.

## Flutter local vs produccion

Firebase real:

```powershell
flutter run
```

Firebase Emulator Suite:

```powershell
flutter run -d chrome --dart-define=USE_FIREBASE_EMULATORS=true
```

Web usa `127.0.0.1`. Android Emulator usa `10.0.2.2` porque `127.0.0.1`
dentro del emulador Android apunta al propio dispositivo virtual; `10.0.2.2`
es el alias para llegar al localhost de Windows.

En modo emulador, Firestore desactiva persistencia local para evitar que datos
cacheados de corridas anteriores confundan pruebas con el Emulator Suite vacio.

## Emulator UI

Abrir:

```text
http://127.0.0.1:4000
```

Comprobar:

- Authentication: `admin@test.local`, `normal@test.local`, `pedro@test.local`;
- Firestore: `user_profiles` y `user_directory`;
- Functions: invocaciones y logs de `southamerica-west1-createUser`.

## Datos al reiniciar

Opcion A, siempre vacio:

```text
firebase emulators:start --only auth,firestore,functions
node tools\emulator\seed-emulator-admin.js
```

Opcion B, importar/exportar estado local:

```powershell
firebase emulators:start --only auth,firestore,functions --import=.\emulator-data --export-on-exit=.\emulator-data
```

`emulator-data/` queda ignorado en Git porque es estado volatil de pruebas. No
guardar ahi datos sensibles reales.
