# Fase 7 - Auditoria integral de seguridad

## Idea central

La parte funcional del CRUD administrativo ya estaba completa. En esta fase no
se agregaron funcionalidades de producto ni se hizo deploy; el trabajo se
centro en validar que un cliente Flutter manipulado no pueda saltarse las
restricciones.

La arquitectura validada es:

```text
                    CLIENTE NO CONFIABLE
                           Flutter
                              |
                              v
                 +-------------------------+
                 | Firebase Authentication |
                 | identidad + ID Token    |
                 +------------+------------+
                              |
                +-------------+-------------+
                v                           v
      Firestore Security Rules      Callable Functions
                |                           |
       acceso directo datos          auth + role + active
                |                           |
                v                           v
            Firestore                  Admin SDK
                                          |
                                  +-------+-------+
                                  v               v
                               Auth           Firestore
```

La regla principal se mantiene: ninguna operacion administrativa depende
unicamente de Flutter.

## Modelo de amenazas

Flutter se considera un cliente no confiable. Un atacante podria modificar el
codigo, mostrar botones ocultos, cambiar variables locales, llamar directamente
a Callable Functions, alterar payloads, reutilizar tokens antiguos o llamar
Firestore directamente.

Por eso no asumimos que "si el boton no aparece, la operacion es segura". La
seguridad debe estar en Authentication, Custom Claims, Cloud Functions, Admin SDK
y Firestore Security Rules.

## Fronteras de confianza

```text
Flutter
  No confiable. Solo mejora UX y navegacion.

Firebase Authentication
  Verifica identidad y administra sesion.

ID Token / Custom Claims
  Transporta identidad y role firmados por Firebase.

Callable Functions
  Frontera backend para operaciones administrativas.

Firebase Admin SDK
  Entorno privilegiado para modificar Auth y Firestore desde backend.

Firestore Security Rules
  Protegen el acceso directo del cliente a Firestore.
```

## Hallazgos

| ID | Severidad | Componente | Problema | Correccion | Estado |
| --- | --- | --- | --- | --- | --- |
| SEC-01 | MEDIO | Cloud Functions `createUser` | Aceptaba campos adicionales y exponia un hook de prueba `__testForceFirestoreFailure` en el payload publico del emulator. | Se agrego allowlist estricta `name/email/password/role` y el hook de rollback se movio a una dependencia interna de test. | CORREGIDO |
| SEC-02 | INFORMATIVO | Dependencias npm | `npm audit` reporta vulnerabilidades moderadas transitivas en `uuid` y `ts-deepmerge`; las correcciones sugeridas implican cambios mayores o breaking changes. | No se aplico `npm audit fix --force`; queda para revision futura controlada. | ACEPTADO / FUTURO |
| SEC-03 | INFORMATIVO | Hardening | App Check, rate limiting, locking distribuido y auditoria empresarial podrian aportar defensa adicional en una app real. | Documentado como hardening futuro; no se habilito ni configuro en esta fase. | ACEPTADO / FUTURO |

No se encontraron Service Account JSON, claves privadas, `.env`, `.pem`, `.key`
ni credenciales administrativas dentro de `lib/`, `android/`, `web/`,
`functions/` o `tools/`.

## Correccion aplicada

`createUser` ahora valida su payload con allowlist estricta:

```text
name
email
password
role
```

Cualquier campo adicional como:

```text
callerRole
isAdmin
claims
active
disabled
emailVerified
customClaims
```

se rechaza con `invalid-argument`.

El caso de rollback de `createUser` sigue probado, pero ya no se activa desde un
campo enviado por el cliente. La prueba llama a `createUserCore` y fuerza el
fallo mediante una dependencia interna del script local.

## Matriz final de permisos

```text
                    NO AUTH   USER ACTIVO   ADMIN ACTIVO   INACTIVE*
Login                   -          OK            OK            NO
Own profile             NO         OK            OK            OK
Directory               NO         OK            OK            NO
Read other profiles     NO         NO            OK            NO
Create user             NO         NO            OK            NO
Update user             NO         NO            OK            NO
Change role             NO         NO            OK            NO
Disable/enable          NO         NO            OK            NO
Delete                  NO         NO            OK            NO
Direct Firestore write  NO         NO            NO            NO
```

`INACTIVE*` significa usuario con sesion o token previo. Puede leer solo su
propio perfil para detectar `active=false`, pero no puede seguir usando
directory, privilegios admin ni escrituras directas.

## Firestore Security Rules

Resumen de `firestore.rules`:

```text
user_profiles/{uid}
  read own profile:
    usuario autenticado dueño del documento, incluso si active=false

  read other profiles:
    solo admin activo

  write:
    siempre denegado desde cliente

user_directory/{uid}
  read:
    cualquier usuario activo autenticado

  write:
    siempre denegado desde cliente
```

`user_directory` debe contener solo:

```text
uid
name
role
```

No debe contener:

```text
email
active
password
tokens
datos administrativos privados
```

## Custom Claims y tokens antiguos

El rol real para autorizacion viene de:

```text
request.auth.token.role
```

No viene de:

```text
payload.roleDelCaller
user_profiles.role
variables de Flutter
botones visibles
```

`setUserRole` conserva claims legitimos existentes. Por ejemplo, si el usuario
tiene:

```json
{
  "role": "user",
  "exampleFlag": true
}
```

despues de cambiarlo a admin queda:

```json
{
  "role": "admin",
  "exampleFlag": true
}
```

Los tokens antiguos son un riesgo natural de Custom Claims. Si un admin es
degradado o deshabilitado, un ID Token viejo puede seguir conteniendo
`role=admin` temporalmente. Por eso las Functions administrativas consultan el
estado vivo del caller en Authentication con Admin SDK y rechazan si
`disabled=true`.

## Validacion ofensiva agregada

Se agrego:

```text
tools/emulator/test-security-audit.js
```

Esta suite local prueba:

```text
no autenticado no lee Firestore ni llama Functions admin
usuario normal no ejecuta operaciones admin aunque manipule Flutter
admin no puede cambiar su propio rol
admin no puede deshabilitarse a si mismo
admin no puede eliminarse a si mismo
admin deshabilitado con token viejo no ejecuta Functions admin
payloads con campos adicionales son rechazados
usuario activo lee su perfil y directory
usuario activo no lee perfiles ajenos
admin activo lee otros perfiles
usuario inactivo lee solo su perfil
admin inactivo no lee otros perfiles
ningun cliente escribe directamente user_profiles
ningun cliente escribe directamente user_directory
ningun cliente crea documentos directos
ningun cliente elimina documentos directos
```

## Logs y errores

Los logs de Functions usan datos operativos como:

```text
caller uid
target uid
operacion
estado
resultado de rollback
```

No se registran passwords, tokens completos, Service Account, private keys ni
payloads completos sensibles desde las Functions.

Los errores al cliente se mantienen con codigos Firebase esperados:

```text
unauthenticated
permission-denied
invalid-argument
not-found
already-exists
failed-precondition
internal
```

Flutter traduce codigos conocidos a mensajes amigables y no muestra stack traces
al usuario.

## Configuracion y credenciales

`firebase_options.dart` y `android/app/google-services.json` contienen
configuracion cliente normal de Firebase:

```text
apiKey
projectId
appId
messagingSenderId
storageBucket
authDomain
```

Estos valores no son Service Account secrets. Firebase los necesita en el
cliente para ubicar el proyecto y los servicios. La seguridad real se define con
Authentication, Security Rules, Cloud Functions y Admin SDK.

Las credenciales administrativas reales deben vivir fuera del repositorio. El
script local de `tools/firebase_admin/set-role.js` usa:

```text
GOOGLE_APPLICATION_CREDENTIALS
```

y no incluye claves privadas dentro del codigo.

## Emulator Suite

Los scripts locales abortan si no detectan:

```text
FIREBASE_AUTH_EMULATOR_HOST
FIRESTORE_EMULATOR_HOST
FUNCTIONS_EMULATOR_HOST
```

Esto evita ejecutar seeds o pruebas locales contra Firebase real por accidente.

Puertos esperados:

```text
Authentication  9099
Firestore       8080
Functions       5001
Emulator UI     4000
```

No se ejecuto `firebase deploy`.

## Pruebas ejecutadas

```text
cd functions
npm run lint
npm run build
npm audit
npm outdated

cd tools/firebase_admin
npm audit
npm outdated

cd ..
flutter analyze
flutter test
flutter pub outdated
```

Pruebas con Emulator Suite:

```text
node tools/emulator/test-security-audit.js
node tools/emulator/test-create-user.js
node tools/emulator/test-update-user.js
node tools/emulator/test-set-user-role.js
node tools/emulator/test-set-user-disabled-status.js
node tools/emulator/test-delete-user.js
node tools/emulator/test-admin-crud-flow.js
```

Resultado: las pruebas relevantes pasaron.

## Riesgos aceptados y hardening futuro

Para una aplicacion real se podria evaluar:

```text
Firebase App Check
rate limiting para createUser/deleteUser
alertas y auditoria centralizada
revision periodica de dependencias
locking o control de concurrencia mas estricto
monitoreo de consistencia entre Auth y Firestore
```

App Check ayuda a reducir abuso desde clientes no legitimos, pero no reemplaza
Authentication, Custom Claims, Security Rules ni autorizacion en Functions.

Rate limiting podria ayudar a limitar abuso administrativo o errores operativos,
pero no sustituye la validacion de permisos.

## Commit asociado

```text
9ec332c fix(functions): endurecer auditoria de createUser
```

## Cierre

La auditoria valida que:

```text
Flutter es UX, no frontera de seguridad.
Authentication prueba identidad.
Custom Claims transportan role firmado.
Functions autorizan operaciones administrativas.
Admin SDK ejecuta cambios privilegiados.
Security Rules bloquean acceso directo a datos.
Firestore no acepta escrituras directas desde cliente.
```

La siguiente fase prevista es:

```text
Fase 8 - regresion final, limpieza tecnica y documentacion del proyecto
```
