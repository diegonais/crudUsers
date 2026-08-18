# Fase 6.5 - Integracion y pulido del CRUD administrativo

## Idea central

Esta fase no agrega nuevas Cloud Functions ni cambia el modelo de datos.

El objetivo fue integrar de forma coherente en Flutter las operaciones
administrativas ya implementadas en Fase 6:

```text
CREATE
READ
UPDATE
CHANGE ROLE
ENABLE / DISABLE
DELETE
```

La UI queda como una experiencia administrativa unica, pero la seguridad real
sigue viviendo en:

```text
Cloud Functions
Firestore Security Rules
Firebase Authentication
Custom Claims
```

Flutter ayuda a la experiencia de uso, no reemplaza las validaciones servidor.

## Commit de referencia

La fase quedo registrada en:

```text
c0f97c1 feat(usuarios): pulir integracion del CRUD administrativo
```

Resumen del commit:

- reorganiza la administracion de usuarios desde una sola pantalla;
- oculta acciones sensibles sobre la cuenta actual;
- mejora navegacion, estados visuales y confirmaciones;
- agrega pruebas de widget;
- agrega un runner local de Emulator Suite para el flujo CRUD completo.

## Pantalla administrativa

La entrada principal para administradores ahora es:

```text
Administracion de usuarios
```

Desde esa pantalla se puede:

```text
Crear usuario
Editar
Cambiar rol
Deshabilitar / Habilitar
Eliminar
```

La pantalla muestra informacion legible:

```text
name
email
role
active
```

El `uid` no se muestra en la lista principal para no saturar visualmente la UI.

## Realtime como fuente principal

La lista administrativa usa:

```text
UserService.watchProfiles()
     |
     v
user_profiles.snapshots()
```

Despues de crear, editar, cambiar rol, deshabilitar, habilitar o eliminar, la
UI no hace un refresh manual de toda la lista.

El flujo esperado es:

```text
Flutter
  |
  v
Callable Function
  |
  v
Admin SDK actualiza Auth / Firestore
  |
  v
Firestore snapshots()
  |
  v
Flutter reconstruye el listado
```

Esto mantiene el patron educativo del proyecto: Firestore realtime es la fuente
de actualizacion visual, no un boton manual de recarga.

## CREATE

La creacion se integra desde la pantalla administrativa.

Formulario:

```text
name
email
password inicial
role
```

Rol por defecto:

```text
user
```

Al guardar:

```text
FunctionsService.createUser()
     |
     v
createUser Callable
```

Despues de exito:

- se limpian los campos del formulario;
- se muestra `Usuario creado correctamente.`;
- se vuelve al listado administrativo;
- el listado espera el cambio por `snapshots()`.

La password solo existe temporalmente en el formulario de creacion. No se guarda
en Firestore, no aparece en listados y no se imprime en la UI.

## READ

La lectura administrativa sigue usando Firestore:

```text
user_profiles
```

La lectura normal de directorio sigue usando:

```text
user_directory
```

La vista normal de usuarios no muestra emails ni estado interno. Mantiene la
separacion definida en fases anteriores:

```text
user_profiles   -> datos completos para admin/perfil
user_directory  -> datos limitados para directorio
```

## UPDATE

La edicion permite modificar solamente:

```text
name
email
```

No permite editar desde esa pantalla:

```text
role
active
password
```

Al guardar:

```text
FunctionsService.updateUser()
     |
     v
updateUser Callable
```

Despues de exito:

- se muestra `Usuario actualizado.`;
- se vuelve al listado;
- realtime actualiza la informacion visible.

Si el usuario desaparece mientras la pantalla de edicion esta abierta, la UI
muestra:

```text
El usuario ya no existe.
```

y ofrece volver al listado.

## CHANGE ROLE

La pantalla de rol muestra:

```text
Usuario
Email
Rol actual
Nuevo rol
```

Roles disponibles:

```text
user
admin
```

Al guardar:

```text
FunctionsService.setUserRole()
     |
     v
setUserRole Callable
```

Cuando el cambio entrega privilegios administrativos:

```text
user -> admin
```

la UI pide confirmacion.

Cuando el cambio retira privilegios administrativos:

```text
admin -> user
```

tambien se pide confirmacion.

La Function sigue siendo quien valida realmente la autorizacion y el estado
consistente de los roles.

## Self role change

Si el usuario objetivo es la cuenta actual:

```text
targetUid == currentUser.uid
```

la UI no muestra la accion:

```text
Cambiar rol
```

Esto es una restriccion de UX para evitar errores accidentales.

La seguridad real sigue estando en la Callable Function, que tambien rechaza la
operacion si alguien intenta forzarla.

```dart
// UI restriction = UX
// Function validation = seguridad
```

## ENABLE / DISABLE

La accion visible depende de:

```text
active == true  -> Deshabilitar
active == false -> Habilitar
```

Al ejecutar:

```text
FunctionsService.setUserDisabledStatus()
     |
     v
setUserDisabledStatus Callable
```

Antes de deshabilitar se muestra una confirmacion que explica que:

```text
deshabilitar es reversible
conserva cuenta y datos
```

Antes de habilitar se confirma que:

```text
la cuenta recuperara el acceso
sus datos se mantienen conservados
```

La lista muestra siempre texto, no solo color:

```text
Activo
Deshabilitado
```

## Self disable

Si el usuario objetivo es la cuenta actual, la UI oculta:

```text
Deshabilitar
Habilitar
```

La Function mantiene la validacion de seguridad y rechaza la operacion si se
intenta llamar manualmente.

## DELETE

Eliminar se mantiene como la accion visualmente mas destructiva.

La confirmacion explica que se eliminan:

```text
la cuenta de Authentication
su perfil
su entrada del directorio
```

Tambien diferencia claramente:

```text
Deshabilitar -> reversible, conserva datos
Eliminar     -> destructivo, borra cuenta y datos
```

Al confirmar:

```text
FunctionsService.deleteUser()
     |
     v
deleteUser Callable
```

Despues de exito:

- se muestra `Usuario eliminado.`;
- el documento desaparece del snapshot;
- la lista se actualiza por realtime.

## Self delete

Si el usuario objetivo es la cuenta actual, la UI no muestra:

```text
Eliminar
```

Igual que en los casos anteriores, la proteccion real se mantiene tambien en la
Function.

## Estados visuales

La pantalla administrativa distingue:

```text
loading
empty
error
data
```

Estados principales:

- loading inicial: `CircularProgressIndicator`;
- empty: `No hay usuarios disponibles.`;
- error Firestore: mensaje legible desde `UserService.readableFirestoreError`;
- data: lista con nombre, email, rol y estado.

Durante operaciones por usuario se usa un estado ocupado por `uid`:

```text
_busyUid
```

Esto evita multiples submits sobre la misma accion sin bloquear toda la app.

## Navegacion

Antes existian entradas separadas para:

```text
Crear usuario
Admin Profiles
```

En esta fase la navegacion queda mas natural:

```text
Home admin
   |
   v
Administracion de usuarios
   |
   +-- Crear usuario
   +-- Editar usuario
   +-- Cambiar rol
   +-- Acciones de estado
   +-- Eliminar
```

El usuario normal no ve esta entrada administrativa.

## Admin vs user

Un usuario con rol:

```text
admin
```

ve:

```text
Mi perfil
Directorio de usuarios
Administracion de usuarios
Refrescar token
Cerrar sesion
```

Un usuario con rol:

```text
user
```

ve solamente la estructura normal:

```text
Mi perfil
Directorio de usuarios
Refrescar token
Cerrar sesion
```

No ve controles administrativos.

Aunque un `user` no vea botones, las Functions siguen rechazando operaciones
administrativas con:

```text
permission-denied
```

## Cuenta deshabilitada

Se mantiene el flujo:

```text
Authenticated
     |
     v
AccountStatusGate
     |
     v
RoleGate
```

Cuando:

```text
user_profiles/{uid}.active == false
```

la app muestra una pantalla de cuenta deshabilitada y no deja visible la UI
administrativa ni la normal debajo.

## RoleGate

La autorizacion visual sigue basada en Custom Claims:

```text
request.auth.token.role
ID Token de Firebase Authentication
```

No se decide si alguien es admin usando:

```text
user_profiles.role
```

Ese campo existe para representar datos de perfil y listados, pero la fuente de
autorizacion sigue siendo el Custom Claim.

## Widgets y helpers reutilizados

Se extrajo:

```text
AdminProfilesList
```

Ese widget permite probar la lista administrativa sin depender de Firebase real.

Tambien se agrego:

```text
AdminProfileActionSelection
AdminProfileAction
```

para representar acciones seleccionadas desde el menu contextual.

El menu por usuario evita llenar cada fila con muchos botones, pero mantiene
acciones claras:

```text
Editar
Cambiar rol
Deshabilitar / Habilitar
Eliminar
```

## Archivos modificados

Pantallas Flutter:

```text
lib/screens/admin_profiles_screen.dart
lib/screens/change_user_role_screen.dart
lib/screens/create_user_screen.dart
lib/screens/edit_user_screen.dart
lib/screens/home_screen.dart
```

Pruebas agregadas:

```text
test/admin_profiles_screen_test.dart
tools/emulator/test-admin-crud-flow.js
```

No se modificaron Cloud Functions en esta fase.

## Pruebas automatizadas agregadas

Widget tests:

```text
test/admin_profiles_screen_test.dart
```

Cubren:

- estado vacio;
- boton `Crear usuario`;
- texto visible para rol y estado;
- ocultar acciones destructivas sobre la cuenta actual;
- mostrar `Deshabilitar` o `Habilitar` segun `active`.

Runner completo Emulator Suite:

```text
tools/emulator/test-admin-crud-flow.js
```

Ejecuta:

```text
create
update
role user -> admin
role admin -> user
disable
enable
delete
```

y verifica:

```text
Authentication
Custom Claims
user_profiles
user_directory
```

## Comandos usados

Build de Functions:

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

Iniciar Emulator Suite:

```powershell
firebase emulators:start --only auth,firestore,functions
```

Sembrar usuarios:

```powershell
$env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
$env:FUNCTIONS_EMULATOR_HOST="127.0.0.1:5001"
node tools\emulator\seed-emulator-admin.js
```

Runner CRUD completo:

```powershell
node tools\emulator\test-admin-crud-flow.js
```

Integration tests Android:

```powershell
flutter test integration_test -d emulator-5554 --dart-define=USE_FIREBASE_EMULATORS=true
```

## Resultado de verificacion

Durante la fase se valido:

```text
npm run build
npm run lint
flutter analyze
flutter test
tools/emulator/test-create-user.js
tools/emulator/test-update-user.js
tools/emulator/test-set-user-role.js
tools/emulator/test-set-user-disabled-status.js
tools/emulator/test-delete-user.js
tools/emulator/test-admin-crud-flow.js
flutter test integration_test -d emulator-5554 --dart-define=USE_FIREBASE_EMULATORS=true
```

Resultado:

```text
CREATE              OK
READ realtime       OK
UPDATE              OK
CHANGE ROLE         OK
DISABLE             OK
ENABLE              OK
DELETE              OK
SELF PROTECTION UI  OK
EMULATOR SUITE      OK
```

## Limite de esta fase

La Fase 6.5 se detiene en la integracion y pulido final del CRUD
administrativo dentro de Flutter.

No incluye:

- nuevas Cloud Functions;
- busqueda avanzada;
- paginacion;
- cambio o reset de password;
- auditoria general de seguridad;
- despliegue a produccion;
- cambios en datos reales.

La siguiente fase puede enfocarse en una revision especifica de seguridad del
sistema completo.
