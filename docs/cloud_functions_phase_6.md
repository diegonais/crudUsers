# Fase 6 - CRUD administrativo completo de usuarios

## Idea central

En esta fase el modulo administrativo deja de limitarse a crear usuarios y pasa
a cubrir el ciclo completo de gestion:

```text
crear usuario
editar nombre/email
cambiar rol
deshabilitar/reactivar
eliminar usuario
```

La regla principal se mantiene igual que en Fase 5: Flutter no ejecuta
operaciones administrativas directas contra Authentication ni escribe datos de
perfil en Firestore. El cliente llama Callable Functions y el servidor decide si
la operacion esta permitida.

```text
Flutter Admin
     |
     | uid, datos de cambio
     v
Callable Cloud Function
     |
     |-- verifica request.auth
     |-- verifica role=admin en Custom Claims
     |-- verifica que el admin siga activo
     |-- valida payload
     v
Firebase Admin SDK
     |
     |-- Authentication
     +-- Firestore
```

## Functions agregadas

Se agregaron cuatro operaciones administrativas nuevas:

```text
functions/src/users/update-user.ts
functions/src/users/set-user-role.ts
functions/src/users/set-user-disabled-status.ts
functions/src/users/delete-user.ts
```

Y se exportan desde:

```text
functions/src/index.ts
```

Todas usan la misma region:

```text
southamerica-west1
```

## Autorizacion comun

La autorizacion se centralizo en:

```text
functions/src/users/assert-active-admin.ts
```

Ese helper valida tres condiciones:

```text
request.auth existe
request.auth.token.role == "admin"
la cuenta del caller no esta disabled en Authentication
```

La tercera validacion es importante porque un ID Token viejo puede seguir
conteniendo `role=admin` por un tiempo. Para operaciones sensibles no basta con
leer solo el token: la Function vuelve a consultar Authentication con Admin SDK
y rechaza al administrador si su cuenta ya fue deshabilitada.

## updateUser

`updateUser` edita los datos basicos de una cuenta existente.

Entrada:

```json
{
  "uid": "...",
  "name": "Nuevo Nombre",
  "email": "nuevo@email.com"
}
```

Validaciones:

- solo acepta los campos `uid`, `name` y `email`;
- `uid`, `name` y `email` son obligatorios;
- `name` se recorta con `trim` y tiene limite de longitud;
- `email` se normaliza a lowercase y se valida con formato razonable;
- el usuario debe existir en Authentication;
- deben existir `user_profiles/{uid}` y `user_directory/{uid}`.

Sincronizacion:

```text
Authentication.displayName
Authentication.email
user_profiles.name
user_profiles.email
user_profiles.updatedAt
user_directory.name
```

Si todos los valores ya coinciden, la Function devuelve:

```json
{
  "success": true,
  "changed": false
}
```

Si Authentication se actualiza pero Firestore falla, la Function intenta una
compensacion para regresar `displayName` y `email` al valor anterior. Esto no es
una transaccion distribuida real entre Auth y Firestore; es una estrategia para
reducir inconsistencias.

## setUserRole

`setUserRole` cambia el rol de una cuenta existente.

Entrada:

```json
{
  "uid": "...",
  "role": "admin"
}
```

Roles permitidos:

```text
admin
user
```

La Function rechaza que el admin cambie su propio rol desde esta pantalla. Es
una regla de seguridad y UX para evitar que durante pruebas el administrador se
quite permisos accidentalmente.

Antes de escribir, la Function comprueba que el rol este consistente en:

```text
Authentication customClaims.role
user_profiles.role
user_directory.role
```

`setCustomUserClaims()` reemplaza todo el objeto de claims. Por eso se clonan y
preservan los claims existentes, cambiando solamente `role`.

Sincronizacion:

```text
Authentication customClaims.role
user_profiles.role
user_profiles.updatedAt
user_directory.role
```

Despues de cambiar el rol, el usuario afectado necesita un ID Token nuevo para
que Flutter vea el nuevo claim. En el cliente se refresca el token cuando
corresponde, pero la fuente real de autorizacion sigue siendo el token firmado
por Firebase.

## setUserDisabledStatus

`setUserDisabledStatus` deshabilita o reactiva una cuenta.

Entrada:

```json
{
  "uid": "...",
  "disabled": true
}
```

El estado se representa en dos lugares:

```text
Authentication.disabled
user_profiles.active
```

Son valores inversos:

```text
disabled=true  -> active=false
disabled=false -> active=true
```

La Function valida que esos dos estados ya esten sincronizados antes de aplicar
un cambio. Si Authentication dice una cosa y Firestore otra, devuelve
`failed-precondition` para no construir encima de un estado ambiguo.

Orden de escritura al deshabilitar:

```text
1. Firestore active=false
2. Authentication disabled=true
```

Esto aplica la idea "deny first": se cierra primero el acceso a datos y al final
se deshabilita la identidad.

Orden de escritura al reactivar:

```text
1. Authentication disabled=false
2. Firestore active=true
```

Esto aplica la idea "grant last": se habilita la identidad primero, pero el
acceso a datos se abre al final.

La Function tambien evita que un admin cambie el estado de su propia cuenta
desde esta pantalla.

## deleteUser

`deleteUser` elimina una cuenta de forma permanente en el entorno administrado.

Entrada:

```json
{
  "uid": "..."
}
```

La Function rechaza que el admin elimine su propia cuenta.

Antes de borrar, lee snapshots de:

```text
Authentication user record
user_profiles/{uid}
user_directory/{uid}
```

Luego elimina con este orden:

```text
1. Borrar user_profiles y user_directory en un WriteBatch
2. Borrar la cuenta en Authentication
```

Si Firestore falla, no se toca Authentication.

Si Authentication falla despues de borrar Firestore, la Function intenta
restaurar los documentos leidos antes del borrado. No intenta recrear
Authentication porque Firebase no permite recuperar la contrasena original de
una cuenta.

## Firestore Rules

Las reglas siguen bloqueando escrituras directas desde Flutter:

```text
allow write: if false;
```

La novedad es `isActiveCaller()`:

```text
request.auth != null
user_profiles/{request.auth.uid}.active == true
```

Esto permite bloquear lecturas de recursos comunes cuando el perfil del usuario
esta inactivo, incluso si el cliente conserva temporalmente un token antiguo.

El propio perfil sigue legible para su dueno. Esto permite que Flutter detecte
`active=false` y muestre una pantalla de cuenta deshabilitada en vez de fallar
sin contexto.

## Integracion Flutter

`FunctionsService` ahora centraliza las cinco operaciones:

```text
createUser
updateUser
setUserRole
setUserDisabledStatus
deleteUser
```

Tambien parsea respuestas tipadas y convierte errores callable en mensajes
legibles para la UI.

Pantallas agregadas:

```text
lib/screens/edit_user_screen.dart
lib/screens/change_user_role_screen.dart
```

Pantalla actualizada:

```text
lib/screens/admin_profiles_screen.dart
```

Desde la lista administrativa ahora se puede:

```text
editar usuario
cambiar rol
deshabilitar/reactivar
eliminar
```

Las acciones destructivas usan confirmacion visual. La UI mejora la experiencia,
pero la autorizacion real se mantiene en Cloud Functions.

## Cuenta deshabilitada en Flutter

Se agrego:

```text
lib/widgets/account_status_gate.dart
```

Este widget escucha el perfil del usuario autenticado y, si `active=false`,
muestra el estado de cuenta deshabilitada. `AuthGate` lo incorpora para que el
control exista en el flujo normal de autenticacion.

## Usuarios de prueba locales

El seed del Emulator Suite ahora crea dos usuarios:

```text
admin@test.local   / AdminLocal123!   role=admin
normal@test.local  / NormalLocal123!  role=user
```

El script vive en:

```text
tools/emulator/seed-emulator-admin.js
```

Y es idempotente: si los usuarios ya existen, actualiza password de prueba,
displayName, estado activo, Custom Claim y documentos locales.

## Pruebas de emulador

Se agregaron runners JavaScript para probar Functions contra Firebase Emulator
Suite:

```text
tools/emulator/test-update-user.js
tools/emulator/test-set-user-role.js
tools/emulator/test-set-user-disabled-status.js
tools/emulator/test-delete-user.js
```

Tambien se agregaron pruebas Flutter de integracion:

```text
integration_test/update_user_emulator_test.dart
integration_test/set_user_role_emulator_test.dart
integration_test/set_user_disabled_status_emulator_test.dart
integration_test/delete_user_emulator_test.dart
```

## Comandos usados en esta fase

Compilar Functions:

```powershell
cd functions
npm run build
```

Lint de Functions:

```powershell
cd functions
npm run lint
```

Analisis Flutter:

```powershell
flutter analyze
```

Tests Flutter:

```powershell
flutter test
```

Iniciar emuladores:

```powershell
firebase emulators:start --only auth,firestore,functions
```

Sembrar usuarios locales:

```powershell
$env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
node tools\emulator\seed-emulator-admin.js
```

Ejecutar la app contra emuladores:

```powershell
flutter run --dart-define=USE_FIREBASE_EMULATORS=true
```

## Pruebas manuales recomendadas

Admin edita usuario:

```text
login admin
editar nombre/email
ver Authentication actualizado
ver user_profiles actualizado
ver user_directory actualizado
```

Admin cambia rol:

```text
login admin
cambiar role user/admin
ver Custom Claim actualizado
ver Firestore actualizado
forzar refresh de token del usuario afectado
```

Admin deshabilita usuario:

```text
login admin
deshabilitar normal@test.local
login normal@test.local
ver pantalla de cuenta deshabilitada
```

Admin reactiva usuario:

```text
login admin
reactivar normal@test.local
login normal@test.local
ver acceso restaurado
```

Admin elimina usuario:

```text
login admin
eliminar usuario de prueba
ver que desaparece de Authentication
ver que desaparece de user_profiles y user_directory
```

Casos de seguridad:

```text
usuario normal llama Functions administrativas -> permission-denied
llamada sin sesion -> unauthenticated
admin intenta eliminarse a si mismo -> failed-precondition
admin intenta deshabilitarse a si mismo -> failed-precondition
admin intenta cambiar su propio rol -> failed-precondition
```

## Limite de esta fase

Esta fase completa el CRUD administrativo basico de usuarios.

No implementa todavia:

- cambio de contrasena por parte del administrador;
- envio de emails reales de invitacion o recuperacion;
- auditoria historica de cambios administrativos;
- soft delete con papelera;
- paginacion avanzada de usuarios desde backend.
