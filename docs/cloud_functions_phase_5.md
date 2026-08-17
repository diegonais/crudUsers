# Fase 5 - Cloud Functions y creacion segura de usuarios

## Idea central

En esta fase la creacion de usuarios deja de ser un proceso manual y pasa a un
backend confiable:

```text
Flutter Admin
     |
     | name, email, password inicial, role
     v
Callable Cloud Function createUser
     |
     |-- verifica request.auth
     |-- verifica request.auth.token.role == "admin"
     |-- valida datos
     v
Firebase Admin SDK
     |
     |-- Authentication.createUser()
     |-- setCustomUserClaims()
     +-- Firestore batch
           |-- user_profiles/{uid}
           +-- user_directory/{uid}
```

Flutter no crea usuarios directamente porque el cliente no es una frontera de
confianza. Una app modificada podria mostrar botones ocultos, enviar campos
falsos o intentar llamar operaciones internas. Por eso la autorizacion real se
repite en servidor.

## Cloud Functions como backend

Cloud Functions for Firebase ejecuta codigo backend administrado por Firebase y
Google Cloud. En este proyecto se usa Functions 2nd gen con TypeScript.

La funcion vive en:

```text
functions/src/users/create-user.ts
```

Y se exporta desde:

```text
functions/src/index.ts
```

La region esta fijada en:

```text
southamerica-west1
```

Esto mantiene la Function cerca de Firestore, que tambien esta en Santiago.

## Callable Function

`createUser` es una Callable Function. Flutter la llama con el SDK oficial
`cloud_functions`, no con una peticion HTTP manual.

Desde Flutter:

```text
FunctionsService
     |
     v
FirebaseFunctions.instanceFor(region: "southamerica-west1")
     |
     v
httpsCallable("createUser")
```

Al usar Callable Functions, Firebase puede adjuntar la sesion de Authentication
del usuario actual. Flutter no envia manualmente:

```text
uid del administrador
rol del administrador
ID Token completo
```

La Function recibe esa informacion verificada en `request.auth`.

## request.auth y Custom Claims

`request.auth` representa la identidad autenticada que Firebase verifico para la
llamada callable.

El rol autorizado se lee desde:

```text
request.auth.token.role
```

La Function rechaza:

```text
sin sesion -> unauthenticated
no admin   -> permission-denied
```

No se confia en un campo enviado desde Flutter como:

```json
{
  "currentUserRole": "admin"
}
```

El cliente puede mentir. El ID Token firmado por Firebase Authentication es la
fuente de autorizacion para esta operacion.

## Firebase Admin SDK

La Function usa Firebase Admin SDK dentro de `functions/`:

```typescript
initializeApp();
getAuth();
getFirestore();
```

No se usa Service Account JSON dentro de Cloud Functions desplegadas.

Cuando la Function corre en Firebase, el entorno servidor proporciona la
identidad necesaria para Admin SDK. Esa credencial no se copia a Flutter ni al
repositorio.

```text
Flutter Client SDK
------------------
permisos del usuario
Security Rules aplican

Cloud Functions + Admin SDK
---------------------------
entorno servidor confiable
operaciones administrativas
no expone credenciales al cliente
```

## Datos de entrada

La Function recibe solo:

```json
{
  "name": "Juan Perez",
  "email": "juan@email.com",
  "password": "passwordInicial",
  "role": "user"
}
```

Validaciones en servidor:

- `name`: requerido, trim, no vacio.
- `email`: requerido, trim, lower-case, formato razonable.
- `password`: requerida, no se registra en logs, minimo 6 caracteres.
- `role`: solo `admin` o `user`.

Aunque Flutter tambien valida el formulario, la validacion importante se repite
en servidor porque Flutter mejora UX, pero no protege reglas de negocio.

## Crear usuario en Authentication

La Function llama:

```typescript
getAuth().createUser({
  email,
  password,
  displayName: name,
});
```

`createUser()` devuelve un `UserRecord`.

`UserRecord` es el registro administrativo de la cuenta creada en Firebase
Authentication. Contiene, entre otros datos, el `uid` generado por Firebase.

Ese `uid` se usa como Document ID en Firestore:

```text
Authentication uid -> user_profiles/{uid}
Authentication uid -> user_directory/{uid}
```

La respuesta exitosa devuelve solo:

```json
{
  "success": true,
  "uid": "...",
  "email": "usuario@email.com"
}
```

No devuelve password, tokens, Custom Token ni credenciales administrativas.

## Custom Claim role

Despues de crear la cuenta:

```typescript
setCustomUserClaims(uid, { role });
```

El servidor construye ese objeto. No acepta claims arbitrarios desde Flutter.

Roles permitidos:

```text
admin
user
```

## Documentos Firestore

La Function crea:

```text
user_profiles/{uid}
```

con:

```text
uid
name
email
role
active: true
createdAt
updatedAt
```

Y crea:

```text
user_directory/{uid}
```

con:

```text
uid
name
role
```

`user_directory` no incluye email, password ni informacion administrativa
innecesaria. Mantiene la separacion de datos introducida en Fase 3.

## WriteBatch

Los dos documentos Firestore se escriben con `WriteBatch`:

```text
batch.set(user_profiles/{uid})
batch.set(user_directory/{uid})
batch.commit()
```

Dentro de Firestore, el batch confirma ambos documentos juntos:

```text
ambos escritos
o
ninguno escrito
```

Esto evita que exista perfil sin directorio o directorio sin perfil dentro de
Firestore.

## Authentication y Firestore no son una sola transaccion

Firebase Authentication y Cloud Firestore son servicios distintos.

No existe una unica transaccion ACID que incluya:

```text
Authentication
+
Firestore
```

Por eso puede ocurrir:

```text
Authentication.createUser() OK
setCustomUserClaims() OK
Firestore batch FALLA
```

Para reducir inconsistencias, la Function implementa una operacion
compensatoria:

```text
1. Crear usuario en Authentication.
2. Asignar Custom Claim.
3. Escribir documentos Firestore.
4. Si falla un paso posterior, intentar auth.deleteUser(uid).
```

Esto no convierte el flujo en una transaccion distribuida real. Solo intenta
limpiar la cuenta creada por esta misma operacion.

Si tambien falla el rollback, la Function registra un error seguro en logs y
devuelve `internal`, indicando que puede existir inconsistencia.

## Errores callable

La Function usa `HttpsError` para devolver errores esperados al cliente:

```text
sin sesion        -> unauthenticated
no admin          -> permission-denied
datos invalidos   -> invalid-argument
email repetido    -> already-exists
error inesperado  -> internal
```

No se devuelven stack traces, password, tokens, Service Account ni objetos
internos sensibles.

## Integracion Flutter

Se agrego:

```text
lib/services/functions_service.dart
```

Ese servicio centraliza las llamadas a Cloud Functions.

No conviene llamar `FirebaseFunctions.instance` desde muchas pantallas, porque
la region, el emulador y el manejo de errores quedarian duplicados.

Tambien se agrego:

```text
lib/screens/create_user_screen.dart
```

El formulario administrativo tiene:

```text
Nombre
Email
Contrasena inicial
Rol: user/admin
Crear
```

Por defecto el rol seleccionado es:

```text
user
```

Despues de llamar `createUser`, el campo de password se limpia. La password no
se muestra en listados, no se guarda en Firestore y no se imprime.

## Realtime

Cuando la Function crea:

```text
user_directory/{uid}
```

el listener existente de Flutter detecta el cambio:

```text
Cloud Function
     |
     v
user_directory/{uid}
     |
     v
snapshots()
     |
     v
lista de usuarios actualizada
```

No hace falta un refresh manual del listado si el `StreamBuilder` ya escucha
`user_directory`.

## Security Rules

Las reglas de Firestore no se debilitaron.

Siguen bloqueando escrituras directas desde Flutter:

```text
allow write: if false;
```

La operacion administrativa correcta es:

```text
Flutter cliente
     |
     v
Cloud Function
     |
     v
Admin SDK
```

No:

```text
Flutter cliente
     |
     v
Firestore write directo
```

Admin SDK en un entorno servidor confiable no depende de las Security Rules de
cliente de la misma manera que Flutter.

## Emulador

Para probar Functions localmente:

```bash
firebase emulators:start --only functions
```

Flutter puede apuntar temporalmente al emulador con:

```bash
flutter run --dart-define=USE_FUNCTIONS_EMULATOR=true
```

Opcionalmente:

```bash
flutter run \
  --dart-define=USE_FUNCTIONS_EMULATOR=true \
  --dart-define=FUNCTIONS_EMULATOR_HOST=localhost \
  --dart-define=FUNCTIONS_EMULATOR_PORT=5001
```

En Chrome se usa `localhost`.

En Android Emulator, el plugin `cloud_functions` puede mapear `localhost` a
`10.0.2.2` automaticamente.

Importante: si solo se emula Functions y no Auth/Firestore, las llamadas desde
la Function a Authentication y Firestore pueden afectar el proyecto real.

## Despliegue y plan Blaze

Cloud Functions puede requerir el plan Blaze.

No se debe activar facturacion automaticamente ni agregar metodos de pago desde
esta fase.

Cuando el proyecto permita desplegar Functions, el comando sera:

```bash
firebase deploy --only functions
```

El `predeploy` ejecuta:

```text
npm --prefix "$RESOURCE_DIR" run lint
npm --prefix "$RESOURCE_DIR" run build
```

Eso valida el codigo TypeScript antes de desplegar.

## Comandos usados en esta fase

Verificacion de entorno:

```bash
node --version
npm --version
firebase --version
```

Inicializacion:

```bash
firebase init functions
```

Dependencias Functions:

```bash
npm install --save-dev typescript @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

Dependencia Flutter:

```bash
flutter pub add cloud_functions
```

Validacion:

```bash
npm --prefix functions run lint
npm --prefix functions run build
flutter analyze
flutter test
```

Smoke test del emulador:

```bash
firebase emulators:exec --only functions "node -e \"console.log('functions emulator smoke ok')\""
```

## Pruebas manuales recomendadas

Admin crea user:

```text
Admin login
     |
     v
Crear usuario
     |
     v
createUser
     |
     |-- Authentication OK
     |-- Custom Claim OK
     |-- user_profiles OK
     +-- user_directory OK
```

User intenta llamar `createUser`:

```text
role = user -> permission-denied
```

Sin Authentication:

```text
request.auth = null -> unauthenticated
```

Email repetido:

```text
segundo intento -> already-exists
```

Rol invalido:

```text
role = superadmin -> invalid-argument
```

Realtime:

```text
crear usuario
     |
     v
user_directory cambia
     |
     v
lista se actualiza por snapshots()
```

## Limite de esta fase

Esta fase implementa solamente:

```text
createUser
```

No implementa todavia:

- editar usuarios;
- eliminar usuarios;
- deshabilitar usuarios;
- reactivar usuarios;
- cambiar roles de usuarios existentes;
- cambiar contrasenas;
- CRUD administrativo completo.
