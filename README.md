# CRUD Users - Flutter + Firebase

## Objetivo

CRUD Users es un proyecto educativo para aprender como integrar Flutter con
Firebase en un flujo completo de administracion de usuarios. No pretende ser un
sistema empresarial listo para produccion.

El proyecto practica:

- Firebase Authentication con Email/Password.
- UID como identificador comun entre Auth y Firestore.
- ID Tokens y Custom Claims.
- Cloud Firestore con listeners realtime.
- Cloud Functions 2nd gen con Callable Functions.
- Firebase Admin SDK en backend confiable.
- Firestore Security Rules.
- Firebase Emulator Suite.
- FlutterFire para Web y Android.

## Tecnologias

Probado en este entorno con:

```text
Flutter 3.41.6
Dart 3.11.4
Node 22.23.1
npm 10.9.8
Java 21.0.10
Firebase CLI 15.27.0
```

Tambien se usa FlutterFire CLI cuando se necesita regenerar configuracion de
Firebase para otro proyecto.

## Arquitectura

La arquitectura es deliberadamente sencilla:

```text
Flutter
  |
  +-- Firebase Authentication
  |
  +-- Firestore reads
  |      |
  |      v
  |   Security Rules
  |
  +-- Callable Functions
          |
          v
      Admin SDK
       /      \
      v        v
   Auth      Firestore
```

Responsabilidades principales:

```text
AuthService      -> login, logout, sesion y usuario actual.
UserService      -> lecturas Firestore y snapshots().
FunctionsService -> operaciones administrativas por Callable Functions.
UI               -> presentacion, formularios y navegacion.
```

## Servicios Firebase

Authentication administra cuentas, UID, Email/Password, `displayName`,
`disabled`, ID Tokens y Custom Claims.

Firestore guarda datos de aplicacion en dos colecciones:

```text
user_profiles/{uid}
|- uid
|- name
|- email
|- role
|- active
|- createdAt
`- updatedAt

user_directory/{uid}
|- uid
|- name
`- role
```

`user_profiles` es el perfil completo. `user_directory` es una vista limitada
para listar usuarios desde Flutter sin exponer `email` ni `active`. Ocultar el
email del directorio no es una proteccion criptografica; la proteccion real
viene de Security Rules y de no poner ese dato en la coleccion legible por
usuarios normales.

## Roles

Existen dos roles:

```text
admin
user
```

El `role` de Firestore describe el perfil y alimenta la UI realtime. El rol que
autoriza realmente es el Custom Claim `role` dentro del ID Token o la validacion
server-side hecha por Functions con Admin SDK.

## Cloud Functions

Las operaciones sensibles no escriben directo desde Flutter. El flujo es:

```text
Flutter
v
Callable Function
v
validacion de request.auth, role, active y payload
v
Admin SDK
v
Authentication / Firestore
```

Funciones disponibles en `southamerica-west1`:

```text
createUser                crea Auth, claim role, profile y directory.
updateUser                sincroniza displayName/email/profile/directory.
setUserRole               cambia Custom Claim y roles Firestore.
setUserDisabledStatus     sincroniza Auth.disabled con profile.active.
deleteUser                elimina Auth, profile y directory.
```

Authentication y Firestore son servicios distintos. No hay una transaccion
distribuida unica entre ambos, por eso las Functions usan compensaciones cuando
una operacion multi-servicio falla a mitad del camino.

## Seguridad

Flutter es cliente no confiable. Ocultar botones mejora UX, pero no protege
datos ni permisos por si solo.

Firestore Security Rules protegen el acceso directo del Client SDK a
Firestore. No reemplazan las validaciones de Cloud Functions y no limitan al
Admin SDK, que corre en backend confiable.

Regla resumida:

```text
                    NO AUTH   USER   ADMIN   INACTIVE
Own profile            NO      YES     YES      YES*
Other profiles         NO      NO      YES      NO
Directory              NO      YES     YES      NO
Direct profile write   NO      NO      NO       NO
Direct directory write NO      NO      NO       NO
```

`YES*` permite que una cuenta inactiva lea su propio perfil para que Flutter
detecte `active=false` y muestre el estado correcto.

Mas detalles en `docs/security.md` y en el reporte conservado
`docs/security_audit_phase_7.md`.

## Emulator Suite

Puertos configurados:

```text
Authentication  9099
Firestore       8080
Functions       5001
Emulator UI     4000
```

Iniciar emuladores:

```bash
firebase emulators:start --only auth,firestore,functions
```

UI:

```text
http://127.0.0.1:4000
```

Seed local:

```bash
node tools/emulator/seed-emulator-admin.js
```

El seed aborta si no detecta variables de Emulator Suite, para evitar tocar
Firebase real por accidente. Si lo ejecutas en una terminal separada, define:

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FUNCTIONS_EMULATOR_HOST=127.0.0.1:5001
```

## Instalacion

```bash
flutter pub get
cd functions
npm install
```

`lib/firebase_options.dart` y `android/app/google-services.json` estan
versionados como configuracion cliente normal. Vuelve a ejecutar
`flutterfire configure` solo si cambias de proyecto Firebase o agregas nuevas
apps/plataformas.

## Ejecucion local

Web con emuladores:

```bash
flutter run -d chrome --dart-define=USE_FIREBASE_EMULATORS=true
```

Android con emuladores:

```bash
flutter run --dart-define=USE_FIREBASE_EMULATORS=true
```

Sin `USE_FIREBASE_EMULATORS=true`, Flutter usa la configuracion normal de
Firebase. No ejecutes seeds ni pruebas destructivas contra produccion.

## Pruebas

Flutter:

```bash
flutter analyze
flutter test
flutter test integration_test --dart-define=USE_FIREBASE_EMULATORS=true
```

Functions:

```bash
cd functions
npm run lint
npm run build
npm outdated
npm audit
```

Scripts locales con emuladores:

```bash
node tools/emulator/test-create-user.js
node tools/emulator/test-update-user.js
node tools/emulator/test-set-user-role.js
node tools/emulator/test-set-user-disabled-status.js
node tools/emulator/test-delete-user.js
node tools/emulator/test-admin-crud-flow.js
node tools/emulator/test-security-audit.js
```

## Estructura

```text
lib/
|- models/
|- screens/
|- services/
|- widgets/
`- firebase_emulator_config.dart

functions/
`- src/
   |- index.ts
   `- users/

test/
integration_test/

tools/
|- emulator/
`- firebase_admin/

docs/
|- architecture.md
|- security.md
|- firebase_emulators_phase_5_1.md
`- security_audit_phase_7.md
```

## Limitaciones / Mejoras futuras

- App Check como hardening futuro.
- Rate limiting para operaciones administrativas sensibles.
- Audit logs centralizados.
- Paginacion en listados si el volumen crece.
- Estrategia mas fuerte para concurrencia multi-admin.
- Automatizacion CI.
- Password recovery.
- Deploy production controlado.

## Aprendizajes

La idea central del proyecto es separar identidad, datos y autorizacion:
Authentication identifica, Custom Claims transportan rol firmado, Security
Rules protegen Firestore desde cliente, y Cloud Functions ejecutan cambios
administrativos con Admin SDK.
