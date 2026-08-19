# Revision arquitectonica final

## 1. Objetivo del proyecto

Este proyecto educativo construyo un CRUD de usuarios con Flutter y Firebase
para entender una arquitectura completa, no solo una pantalla conectada a una
base de datos.

El alcance real revisado en el repositorio incluye:

- Flutter Web y Android.
- Firebase initialization en `lib/main.dart`.
- Firebase Authentication con Email/Password.
- Persistencia de sesion mediante `authStateChanges()`.
- `AuthGate`, `AccountStatusGate` y `RoleGate`.
- Interfaces diferenciadas para `admin` y `user`.
- Lecturas Firestore con listeners realtime.
- CRUD administrativo mediante Callable Functions.
- Custom Claims `role=admin` y `role=user`.
- Firestore Security Rules restrictivas.
- Emulator Suite para Auth, Firestore, Functions y UI.
- Pruebas unitarias, integracion, scripts locales y regresion documentada.

No se agregan funcionalidades en esta fase. La fase cierra el experimento con
revision arquitectonica, conclusiones y aprendizaje transferible.

## 2. Inspeccion final del repositorio

Se revisaron los elementos pedidos:

- `lib/`: servicios, modelos, pantallas, gates y configuracion de emuladores.
- `functions/`: Callable Functions TypeScript, validaciones, Admin SDK y
  compensaciones.
- `firestore.rules`: reglas de acceso directo desde Flutter Client SDK.
- `firebase.json`: configuracion de Firestore, Functions y emuladores.
- `.firebaserc`: proyecto `crudusers-4dba6`.
- `tools/`: scripts locales de seed, pruebas de emulador y herramienta Admin
  para Custom Claims.
- `test/`: pruebas unitarias de servicios/configuracion/UI.
- `integration_test/`: pruebas de flujos con emuladores.
- `docs/`: fases anteriores, auditoria de seguridad y regresion final.
- `README.md`: guia practica del proyecto.
- `pubspec.yaml`: dependencias FlutterFire.
- `functions/package.json`: dependencias y scripts de Functions.

No encontre una diferencia critica entre el prompt y el codigo actual. Un matiz:
`deleteUser` en el codigo borra primero documentos Firestore y despues borra
Authentication; si falla el borrado en Auth, intenta restaurar Firestore. Esa
secuencia coincide con la parte final del prompt y es importante porque la
contrasena original no puede restaurarse.

## 3. Arquitectura final

```text
                                  FLUTTER
                                     |
                     +---------------+----------------+
                     |               |                |
                     v               v                v
              AuthService       UserService      FunctionsService
                     |               |                |
                     v               v                v
          Firebase Authentication  Firestore   Callable Functions
                     |               |                |
                     |          Security Rules        |
                     |               |                v
                     |               |            Admin SDK
                     |               |           /        \
                     |               |          v          v
                     |               |    Authentication  Firestore
                     |               |
                     +-------+-------+
                             |
                             v
          AuthGate -> AccountStatusGate -> RoleGate -> UI por rol
                             |
                             v
                    ID Token + Custom Claims
```

La misma arquitectura tiene una variante local:

```text
Flutter con USE_FIREBASE_EMULATORS=true
  |
  +-- Auth Emulator      9099
  +-- Firestore Emulator 8080
  +-- Functions Emulator 5001
  `-- Emulator UI        4000
```

La region de Functions usada en el codigo es `southamerica-west1`.

## 4. Responsabilidad de cada componente

### Flutter

Flutter es presentacion e interaccion:

- muestra formularios de login, creacion, edicion, cambio de rol y acciones de
  estado;
- administra estados visuales como loading, errores, dialogos y SnackBars;
- valida campos para UX, por ejemplo nombre vacio, email basico y password
  minima;
- decide navegacion con `AuthGate`, `AccountStatusGate` y `RoleGate`;
- escucha Firestore con `snapshots()`;
- llama a Callable Functions mediante `FunctionsService`.

Flutter no es fuente de seguridad. El repositorio repite esta idea en pantallas,
servicios y docs: ocultar botones o rutas ayuda al usuario, pero no autoriza.

### Firebase Authentication

Authentication administra identidad:

- login Email/Password en `AuthService.signIn`;
- logout y sesion local en `AuthService.signOut`;
- `User.uid` como identificador comun;
- email;
- `displayName`;
- `disabled`;
- ID Tokens;
- Custom Claims como `role`.

La contrasena vive en Authentication. El proyecto no guarda hashes ni passwords
en Firestore.

### Cloud Firestore

Firestore persiste datos de aplicacion:

```text
user_profiles/{uid}
  uid
  name
  email
  role
  active
  createdAt
  updatedAt

user_directory/{uid}
  uid
  name
  role
```

`UserService.watchUserById()` escucha el perfil propio o un perfil concreto.
`UserService.watchUsers()` escucha `user_directory`.
`UserService.watchProfiles()` escucha `user_profiles` para la vista admin.

### Security Rules

Security Rules autorizan acceso directo del Client SDK a Firestore:

- el usuario autenticado puede leer su propio `user_profiles/{uid}`;
- un admin activo puede leer perfiles de otros;
- un usuario activo puede leer `user_directory`;
- una cuenta inactiva puede leer su propio perfil para que la UI detecte
  `active=false`;
- todas las escrituras directas desde cliente estan denegadas.

Authentication responde "quien eres". Security Rules responden "puedes hacer
esta operacion sobre este dato".

### Cloud Functions

Callable Functions ejecutan operaciones sensibles:

```text
createUser
updateUser
setUserRole
setUserDisabledStatus
deleteUser
```

Cada Function valida `request.auth`, rol, estado activo del caller y payload
antes de usar Admin SDK. La autorizacion administrativa vive aqui, no en los
botones de Flutter.

### Admin SDK

Admin SDK opera en entorno privilegiado:

- crea y borra usuarios de Authentication;
- actualiza `displayName`, `email` y `disabled`;
- asigna Custom Claims;
- escribe y borra documentos Firestore ignorando Security Rules de cliente.

Como Admin SDK no esta limitado por Security Rules, las Functions deben validar
antes de usarlo.

### Emulator Suite

Emulator Suite permite desarrollo y pruebas sin tocar produccion:

- datos descartables;
- pruebas destructivas;
- ciclos rapidos;
- seguridad contra errores operativos;
- reproducibilidad de regresiones;
- sin depender de facturacion ni despliegues reales.

Los scripts de `tools/emulator` abortan si no detectan variables de emulador.

## 5. Donde quedo la logica de negocio

La logica esta repartida por responsabilidad, no duplicada al azar.

### Flutter: UX

Ejemplos reales:

- validar que el email parezca email antes de enviar;
- bloquear el boton mientras `_isSubmitting`;
- mostrar dialogos antes de deshabilitar o eliminar;
- ocultar acciones destructivas sobre el usuario actual;
- mostrar `Cuenta deshabilitada` cuando el snapshot trae `active=false`;
- mostrar Admin UI solo si `RoleGate` lee `role=admin`.

Esto no es seguridad fuerte. Es UX y navegacion.

### Cloud Functions: negocio y autorizacion servidor

Ejemplos reales:

- solo un admin puede ejecutar CRUD administrativo;
- el admin caller no puede estar deshabilitado;
- `role` solo puede ser `admin` o `user`;
- no se permiten payloads con campos extra;
- un admin no puede cambiar su propio rol, deshabilitarse ni eliminarse;
- `createUser` crea Auth, claim, perfil y directorio;
- `updateUser` sincroniza Auth, perfil y directorio;
- `setUserRole` sincroniza Custom Claim, perfil y directorio;
- `setUserDisabledStatus` sincroniza `Auth.disabled` con `profile.active`;
- `deleteUser` borra Firestore y luego Auth con restauracion parcial si falla.

Esta capa es la frontera principal para operaciones administrativas.

### Security Rules: control de acceso a datos

Ejemplos reales:

- un `user` no puede leer perfiles ajenos;
- un cliente no puede escribir `role=admin` en `user_profiles`;
- una cuenta inactiva no puede leer `user_directory`;
- ningun cliente, ni siquiera admin, escribe directo `user_profiles` o
  `user_directory`.

Estas tres capas no son intercambiables. Flutter no puede proteger porque vive
en el dispositivo del usuario. Functions no reemplazan Rules cuando el cliente
lee Firestore directamente. Rules no protegen Admin SDK.

## 6. Authentication vs Firestore

Hay datos de usuario en varios lugares porque cumplen propositos distintos:

```text
Authentication
  uid
  email
  displayName
  disabled
  customClaims.role

user_profiles
  uid
  name
  email
  role
  active
  createdAt
  updatedAt

user_directory
  uid
  name
  role
```

Esto no significa automaticamente mal diseno. Authentication administra la
cuenta e identidad. Firestore guarda datos de aplicacion. `user_directory` es
una vista limitada preparada para lecturas por usuarios normales.

El coste es que debemos mantener consistencia cuando un cambio toca varios
lugares. Por eso las Functions centralizan esas escrituras.

## 7. Fuente de verdad por dato

| Dato | Autoridad principal | Representaciones sincronizadas | Nota |
| --- | --- | --- | --- |
| UID | Authentication | ID de documento en `user_profiles` y `user_directory` | Une cuenta y documentos. |
| Password | Authentication | Ninguna | No se lee ni se guarda. |
| Login | Authentication | `authStateChanges()` en Flutter | Flutter reacciona al estado Auth. |
| Email de cuenta | Authentication | `user_profiles.email` | `updateUser` lo sincroniza. |
| Nombre visible | Firestore/Auth compartido | `displayName`, `profile.name`, `directory.name` | Es desnormalizado. |
| Rol para autorizacion | Custom Claim en ID Token | `profile.role`, `directory.role` | Firestore role no reemplaza el claim. |
| Estado de acceso | `Authentication.disabled` | `user_profiles.active` | `active = !disabled`. |
| Directorio publico interno | `user_directory` | Ninguna | No contiene email ni active. |
| Timestamps | Firestore | `createdAt`, `updatedAt` | Usan `serverTimestamp()`. |

## 8. Password

La contrasena:

- Flutter la recibe temporalmente en formularios de login o creacion;
- se envia a Firebase Authentication o a la Function `createUser`;
- Firebase Authentication la administra;
- no conocemos el hash;
- no se almacena en Firestore;
- no aparece en `user_profiles`;
- no aparece en `user_directory`;
- Admin SDK no permite leerla.

Esto es positivo porque reduce superficie de riesgo. El proyecto no implementa
hashing, almacenamiento ni recuperacion de passwords. Esa responsabilidad queda
en un servicio especializado.

## 9. Custom Claims

En este proyecto los Custom Claims transportan:

```text
role = admin
role = user
```

Viven en Firebase Authentication asociados al usuario. Llegan al cliente dentro
del ID Token emitido por Authentication. Flutter los lee con
`getIdTokenResult()`, y `RoleService` convierte el valor a `AppRole`.

Estan dentro del ID Token porque el token es firmado por Firebase. Una Function
o una Security Rule puede confiar en `request.auth.token.role` como dato
emitido por Authentication, no como string inventado por Flutter.

`user_profiles.role` no reemplaza el claim porque es un dato de aplicacion en
Firestore. Sirve para mostrar listados y estado realtime, pero la autorizacion
administrativa depende del claim y de validaciones server-side.

El token puede quedar temporalmente desactualizado. El test
`set_user_role_emulator_test.dart` lo demuestra: Firestore refleja el nuevo rol,
pero el token viejo del usuario sigue mostrando el claim anterior hasta forzar
refresh. Por eso existe el boton `Refrescar token` y se usa
`getIdTokenResult(true)` cuando necesitamos leer claims actualizados de forma
inmediata.

## 10. RoleGate

`RoleGate` es una decision de navegacion/UI:

- lee el claim `role` desde el ID Token;
- muestra `AdminHome` para `admin`;
- muestra `UserHome` para `user`;
- muestra una pantalla de rol no configurado para claims ausentes o
  desconocidos.

`RoleGate != seguridad`.

Si alguien eliminara `RoleGate` y mostrara la pantalla admin a todos, las
Functions seguirian rechazando llamadas sin `role=admin`, y Security Rules
seguirian bloqueando lecturas/escrituras no permitidas.

## 11. AccountStatusGate

`AccountStatusGate` tambien es principalmente UX/navegacion:

- escucha `user_profiles/{uid}`;
- si `active=false`, muestra `Cuenta deshabilitada`;
- permite cerrar sesion;
- mantiene una reaccion realtime cuando el admin cambia el estado.

La verdadera barrera se reparte entre:

- `Authentication.disabled`, que impide login normal;
- `assertActiveAdmin`, que consulta Auth para bloquear admins deshabilitados con
  token viejo;
- Security Rules, que bloquean directory y perfiles ajenos cuando
  `active=false`.

## 12. Por que Firestore necesita Security Rules

Authentication sabe quien eres. No decide por si sola si puedes leer cualquier
documento.

Ejemplo:

```text
Usuario normal autenticado
  |
  v
GET user_profiles/otro_uid
  |
  v
Security Rules revisan request.auth.uid y request.auth.token.role
  |
  v
DENIED
```

Otro ejemplo:

```text
Admin activo
  |
  v
GET user_profiles/otro_uid
  |
  v
Rules verifican active=true y role=admin
  |
  v
ALLOWED
```

Sin Rules, usar Firestore Client SDK seria confiar demasiado en el cliente.

## 13. Admin SDK y Security Rules

La frontera es:

```text
Flutter Client SDK -> Security Rules
Admin SDK          -> entorno privilegiado
```

Admin SDK no se protege con Rules. Por eso una Function hace:

```text
request.auth existe?
role == admin?
caller no esta disabled?
payload cumple contrato?
entonces usar Admin SDK
```

Invertir este orden seria peligroso: Admin SDK puede escribir aunque Rules
digan `allow write: if false`.

## 14. Callable Functions

Se eligieron Callable Functions porque encajan con FlutterFire y Firebase Auth:

- reciben contexto Authentication en `request.auth`;
- corren en backend administrado;
- pueden usar Admin SDK;
- centralizan operaciones sensibles;
- devuelven errores Firebase conocidos;
- funcionan con Emulator Suite.

Limitaciones:

- no son una REST API generica;
- acoplan el cliente a Firebase Functions y al protocolo callable;
- requieren cuidado con region, cold starts, errores y payloads;
- no eliminan validacion ni diseno backend.

## 15. Por que no hicimos CRUD directo desde Flutter

Un cliente manipulado podria intentar escribir:

```text
role = admin
active = true
email = otro@test.local
```

Si permitieramos escrituras administrativas directas a Firestore, la seguridad
dependeria de que todas las reglas cubran cada caso y de que Auth tambien quede
sincronizado. En este proyecto las operaciones sensibles siguen el camino:

```text
Flutter
  |
  v
Callable Function
  |
  v
validacion servidor
  |
  v
Admin SDK
  |
  v
Authentication + Firestore
```

Esto centraliza la regla de negocio y evita que el cliente decida campos
privilegiados.

## 16. Firestore como NoSQL

Firestore organiza datos como:

```text
collection -> document -> fields
```

En este proyecto:

```text
user_profiles -> {uid} -> name/email/role/active/...
user_directory -> {uid} -> name/role
```

Una analogia relacional aproximada seria:

```text
table -> row -> column
```

Pero no son equivalentes exactos. Firestore no esta centrado en joins, claves
foraneas y SQL arbitrario; esta centrado en documentos, colecciones, queries
indexadas y estructuras preparadas para patrones de lectura.

## 17. Desnormalizacion

El proyecto repite `name` en:

```text
Authentication.displayName
user_profiles.name
user_directory.name
```

Tambien repite `role` en:

```text
Custom Claim
user_profiles.role
user_directory.role
```

Beneficio:

- lecturas simples;
- UI realtime directa;
- `user_directory` listo para usuarios normales;
- no hace falta consultar Auth para pintar cada listado.

Coste:

- consistencia en escrituras;
- necesidad de compensaciones;
- tests para verificar invariantes.

## 18. user_profiles vs user_directory

No usamos solo `user_profiles` y ocultamos el email en Flutter porque un dato
descargado al cliente ya dejo de ser privado para ese cliente. Aunque la UI no
dibuje el email, el usuario podria inspeccionar trafico, memoria, logs o
modificar la app.

Por eso:

```text
user_profiles
  perfil completo, legible por su dueno y admins activos

user_directory
  vista limitada, legible por usuarios activos
```

`user_directory` no contiene `email` ni `active`. Esto es una decision correcta
para separar datos que otros usuarios pueden recibir de datos internos.

## 19. Realtime

El flujo realtime es:

```text
Cloud Function
  |
  v
Firestore
  |
  v
snapshot
  |
  v
Flutter
```

Despues de `createUser`, `updateUser`, `setUserRole`,
`setUserDisabledStatus` o `deleteUser`, no hace falta llamar a un
`refreshUsers()` manual para actualizar listados principales. Los streams de
`watchUsers()`, `watchProfiles()` y `watchUserById()` reciben cambios.

Ventajas:

- UI reactiva;
- menos codigo manual de refresco;
- buen encaje para estados compartidos;
- pruebas pueden esperar a snapshots.

Consideraciones:

- listeners amplios pueden costar lecturas;
- colecciones grandes requieren `limit`, filtros o paginacion;
- hay que manejar loading, error y documentos inconsistentes.

## 20. Consistencia Auth + Firestore

Authentication y Firestore no participan en una sola transaccion distribuida.

Puede ocurrir:

```text
Auth update OK
Firestore update FAIL
```

O al reves:

```text
Firestore update OK
Auth update FAIL
```

Firestore `WriteBatch` ayuda dentro de Firestore, por ejemplo actualizar
`user_profiles` y `user_directory` juntos. Pero no cubre Authentication.

## 21. Compensaciones

El patron usado es:

```text
operacion A
  |
  v
operacion B falla
  |
  v
intentar revertir A
```

Ejemplos reales:

- `createUser`: si Auth crea la cuenta pero falla Firestore, intenta borrar la
  cuenta Auth creada.
- `updateUser`: si Auth cambia email/name pero falla Firestore, intenta volver
  a los valores anteriores de Auth.
- `setUserRole`: si cambia el Custom Claim pero falla Firestore, intenta
  restaurar los claims anteriores completos.
- `setUserDisabledStatus`: al deshabilitar cierra Firestore primero; si falla
  Auth, restaura `active=true`. Al habilitar abre acceso al final; si falla
  Firestore, vuelve a `disabled=true`.
- `deleteUser`: si borra Firestore pero falla borrar Auth, restaura documentos
  Firestore.

Compensacion no es transaccion ACID. Es una estrategia practica de recuperacion
ante fallos, con posibilidad residual de inconsistencia si tambien falla el
rollback.

## 22. Delete y reversibilidad

`deleteUser` es especial porque Firestore y Auth no son igual de reversibles.

Firestore:

```text
leer documentos
borrar documentos
si falla Auth, recrear documentos desde snapshots
```

Authentication:

```text
delete user
password original no recuperable
```

Admin SDK no permite leer la contrasena. Por eso no existe rollback perfecto si
la identidad Auth ya fue destruida y luego hubiera que reconstruirla exactamente.

## 23. Disabled vs delete

Disable:

- reversible;
- conserva datos;
- conserva identidad;
- mantiene UID;
- sirve para suspender acceso.

Delete:

- destructivo;
- elimina identidad;
- elimina documentos;
- no recupera contrasena original;
- sirve para baja definitiva o limpieza.

En un sistema real, `disable` suele ser preferible cuando existe duda, auditoria
o necesidad de recuperacion. `delete` requiere mas certeza y politicas claras.

## 24. Token viejo

Problema estudiado:

```text
admin obtiene token con role=admin
admin es deshabilitado
token antiguo aun puede existir temporalmente
```

Por eso `assertActiveAdmin` no se queda solo con
`request.auth.token.role == "admin"`. Tambien llama `getUser(callerUid)` con
Admin SDK y rechaza si `callerRecord.disabled == true`.

## 25. Cliente no confiable

Flutter es no confiable aunque lo programemos nosotros porque:

- vive en el dispositivo del usuario;
- puede inspeccionarse;
- puede modificarse;
- puede saltarse UI;
- puede construir requests propios;
- puede llamar Firestore o Functions directamente.

La seguridad sensible debe vivir en servidor y Rules.

## 26. Modelo de seguridad final

```text
Firebase Authentication -> identidad
Custom Claims           -> privilegio firmado
Cloud Functions         -> autorizacion y logica administrativa
Admin SDK               -> operacion privilegiada
Security Rules          -> acceso directo a datos
Flutter Gates           -> UX y navegacion
```

Colaboran asi: Auth identifica, claims expresan rol, gates ordenan la UI,
Functions validan operaciones administrativas, Admin SDK ejecuta cambios
privilegiados, y Rules protegen lecturas/escrituras directas de Firestore.

## 27. Emulator Suite

Desarrollar directamente contra Firebase real habria elevado riesgos:

- datos reales alterados por pruebas;
- operaciones destructivas irreversibles;
- costos accidentales;
- dependencia de red/estado externo;
- miedo a probar ataques.

Con Emulator Suite:

- Auth, Firestore y Functions corren localmente;
- las pruebas pueden crear, deshabilitar y borrar usuarios;
- los datos son descartables;
- los scripts pueden validar matrices de permisos;
- se evita despliegue durante aprendizaje.

## 28. 127.0.0.1 vs 10.0.2.2

La configuracion real esta en `FirebaseEmulatorConfig`.

```text
Chrome / Windows -> 127.0.0.1
Android Emulator -> 10.0.2.2
```

En Android Emulator, `127.0.0.1` apunta al propio dispositivo virtual. El alias
`10.0.2.2` permite alcanzar el localhost de Windows donde corren los
emuladores.

## 29. Serverless

La arquitectura puede considerarse serverless en el sentido operativo:

- no administramos maquinas;
- no configuramos reverse proxy;
- no mantenemos sistema operativo;
- Cloud Functions corre en infraestructura administrada por Google.

Pero "serverless" no significa que no haya servidores. Significa que el equipo
no administra directamente esa infraestructura.

## 30. Firebase y backend

Firebase no elimina todas las responsabilidades de backend.

En este proyecto:

```text
Cloud Functions + Admin SDK = backend administrado para operaciones sensibles
```

Firebase reduce infraestructura propia, pero no elimina:

- logica backend;
- autorizacion;
- validacion;
- diseno de datos;
- seguridad;
- pruebas;
- decisiones de consistencia.

## 31. Firebase vs NestJS + PostgreSQL

Comparacion educativa:

| Aspecto | Firebase usado aqui | NestJS + PostgreSQL aproximado |
| --- | --- | --- |
| Authentication | Servicio administrado con Email/Password, UID, disabled y tokens | Implementar usuarios, hashing, sesiones/JWT, refresh, recuperacion |
| Database | Firestore NoSQL documentos/colecciones | PostgreSQL relacional tablas, constraints, joins |
| Backend | Callable Functions para operaciones sensibles | API NestJS con controllers/services/modules |
| Authorization | Claims, Rules y validacion en Functions | Guards, middleware, RBAC, policies |
| Realtime | `snapshots()` directo desde cliente | WebSockets/SSE/polling o triggers propios |
| Deployment | Firebase Functions/Hosting opcional | Servidor/API, DB, TLS, proxy, deploy pipeline |
| Scaling | Administrado por Firebase con limites/configuracion | Controlado por infraestructura propia/cloud |
| Transactions | Batch/transactions Firestore, sin transaccion con Auth | Transacciones SQL fuertes dentro de DB |
| Schema | Flexible, validado por codigo/reglas/tests | Esquema explicito, constraints, migrations |
| Queries | Queries indexadas, sin joins SQL tradicionales | SQL expresivo, joins, agregaciones complejas |
| Testing | Emulator Suite | Testcontainers, DB local, mocks, entornos staging |
| Infrastructure | Menor operacion propia | Mas control y mas responsabilidad |

No hay ganador absoluto. Son modelos distintos.

## 32. Authentication comparada

Firebase nos ahorro implementar:

- almacenamiento de passwords;
- hashing;
- validacion de credenciales;
- emision de tokens;
- persistencia de sesion cliente;
- disabled accounts;
- Custom Claims integrados al token;
- SDK Flutter para login/logout.

En NestJS tradicional, muchas de esas piezas deben disenarse, implementarse,
probarse y mantenerse.

## 33. Base de datos comparada

Firestore:

- documentos flexibles;
- lecturas realtime;
- buen encaje con apps cliente;
- estructura orientada a casos de lectura;
- sin joins SQL tradicionales.

PostgreSQL:

- modelo relacional;
- constraints;
- foreign keys;
- joins;
- transacciones fuertes;
- SQL muy expresivo para reportes y relaciones.

Firestore no es "peor SQL"; es otro modelo.

## 34. Relaciones

Firestore puede sentirse menos comodo si el dominio tiene muchas relaciones:

```text
usuarios
pedidos
productos
detalle_pedido
facturas
pagos
```

En un dominio asi, PostgreSQL puede ser mas natural por joins, constraints,
normalizacion y transacciones multi-tabla.

## 35. Queries

SQL permite consultas flexibles:

```text
SELECT ...
JOIN ...
GROUP BY ...
HAVING ...
```

Firestore queries son mas acotadas y suelen requerir indices y datos preparados.
Eso no es automaticamente un defecto: obliga a modelar segun patrones de acceso
y puede funcionar muy bien para apps realtime o moviles.

## 36. Transactions

PostgreSQL:

- transacciones ACID dentro de la base;
- rollback fuerte para cambios relacionados;
- constraints para preservar invariantes.

Firestore:

- batch/transactions dentro de Firestore;
- no cubre Authentication;
- no ofrece una transaccion unica Firestore + Auth.

Este proyecto mostro justo esa frontera: `profile` y `directory` pueden ir en
batch, pero Auth requiere compensaciones.

## 37. Escalabilidad operativa

Firebase ayuda a no administrar:

```text
API server
DB server tradicional
reverse proxy
TLS
scaling manual inicial
infraestructura de Auth
```

Pero menos infraestructura propia no significa cero decisiones tecnicas. Hay que
disenar reglas, datos, indices, Functions, costos, observabilidad y limites.

## 38. Costos

Conceptualmente Firebase cobra por dimensiones como:

- lecturas;
- escrituras;
- almacenamiento;
- ejecuciones de Functions;
- red;
- servicios de Authentication segun el caso.

No se calculan precios en este documento. La conclusion importante es:

```text
gratis durante desarrollo != gratis sin limites
```

Listeners amplios, listados sin paginacion y operaciones frecuentes pueden
impactar costos al crecer.

## 39. Vendor lock-in

El proyecto queda acoplado a Firebase en:

- `FirebaseAuth`;
- Firestore Client SDK;
- Security Rules;
- Callable Functions;
- Custom Claims;
- FlutterFire;
- Admin SDK;
- Emulator Suite.

Lock-in significa que migrar requiere reescritura de piezas especificas del
proveedor. No siempre es malo: puede ser aceptable si acelera el producto,
reduce operacion y encaja con el problema. Preocupa mas cuando se exige
portabilidad estricta, dominio complejo o control profundo de infraestructura.

## 40. Portabilidad a NestJS + PostgreSQL

Reutilizable conceptualmente:

- gran parte de la UI Flutter;
- idea de roles `admin`/`user`;
- principio de cliente no confiable;
- separacion publico/privado;
- validacion cliente + servidor;
- flujos CRUD;
- pruebas de amenaza como criterio.

Reescritura probable:

- codigo `FirebaseAuth`;
- `UserService` basado en Firestore;
- `FunctionsService` callable;
- Cloud Functions como endpoints/services NestJS;
- Security Rules como guards/policies backend;
- Custom Claims como JWT claims/sesiones propias;
- modelo Firestore como tablas y relaciones.

## 41. Seguridad comparada

Firebase:

```text
Authentication
Custom Claims
Security Rules
Functions
Admin SDK
```

Backend tradicional:

```text
JWT/sessions
middleware
guards
services
RBAC/policies
database permissions
constraints
```

Ambos requieren diseno de seguridad. Firebase no absuelve de pensar permisos;
NestJS/PostgreSQL tampoco los da automaticamente.

## 42. DDD y microservicios

Usar varios servicios Firebase no convierte el proyecto en microservicios.

Cloud Functions tampoco significan automaticamente arquitectura de
microservicios por dominio. Aqui son funciones backend administradas para un
modulo pequeno de usuarios.

## 43. Cuando elegir Firebase

Firebase puede ser conveniente para:

- MVPs;
- apps moviles;
- prototipos;
- equipos pequenos;
- realtime;
- chat;
- experiencias colaborativas;
- Auth estandar;
- backend relativamente sencillo;
- necesidad de reducir operacion inicial.

No es regla absoluta. Depende de dominio, equipo, escala, costos y necesidades
de consulta.

## 44. Cuando considerar backend tradicional

NestJS + PostgreSQL u otra arquitectura tradicional puede convenir en:

- dominio complejo;
- muchas relaciones;
- SQL intensivo;
- reportes avanzados;
- transacciones empresariales;
- integraciones backend numerosas;
- control profundo de infraestructura;
- portabilidad estricta;
- auditoria y observabilidad muy personalizadas.

## 45. Firebase + backend propio

Firebase y backend tradicional no son mutuamente excluyentes.

Una arquitectura hibrida posible:

```text
Flutter
  |
  v
Firebase Authentication
  |
  v
NestJS API
  |
  v
PostgreSQL
```

Tambien podria conservar servicios Firebase como Cloud Messaging, Storage,
Analytics o Remote Config mientras el dominio principal vive en NestJS y
PostgreSQL.

## 46. Que Firebase podria conservarse con NestJS

Podria conservarse:

- Firebase Authentication para identidad;
- Firebase Cloud Messaging para notificaciones;
- Cloud Storage para archivos;
- Analytics para eventos;
- Remote Config para configuraciones cliente;
- App Check como hardening cliente, si encaja.

El dominio transaccional principal podria pasar a NestJS + PostgreSQL. No se
implementa aqui; solo es una posibilidad conceptual.

## 47. Que hicimos bien

Basado en el repositorio real:

- separacion entre `user_profiles` y `user_directory`;
- no descargar emails de otros usuarios normales;
- no guardar passwords;
- usar Custom Claims para privilegio;
- validar admin activo en Functions;
- bloquear escrituras directas desde cliente;
- usar Admin SDK solo en backend/tools confiables;
- configurar Emulator Suite;
- proteger scripts locales contra ejecucion sin emulador;
- probar token viejo y disabled admin;
- probar payloads con campos extra;
- documentar regresion, seguridad y arquitectura;
- no desplegar ni tocar produccion durante pruebas.

## 48. Que podria mejorarse

Pertinente para un proyecto real:

| Mejora | Clasificacion | Comentario |
| --- | --- | --- |
| Paginacion/listeners limitados | Recomendable al crecer | `watchUsers()` y `watchProfiles()` escuchan colecciones completas. |
| Audit log | Recomendable | Ayudaria a saber quien cambio roles, estados o elimino usuarios. |
| App Check | Hardening futuro | Reduce abuso desde clientes no legitimos, no reemplaza Rules/Functions. |
| Rate limiting | Hardening futuro | Especialmente para create/delete y ataques con credenciales validas. |
| Observabilidad | Recomendable | Logs existen, pero faltan dashboards/alertas. |
| CI/CD | Recomendable | Automatizaria analyze, tests, lint y build. |
| Concurrencia multi-admin | Futuro | Podria requerir locks, versiones o politicas de conflicto. |
| Dependencias npm audit | Futuro controlado | Fase 8 documento vulnerabilidades transitivas moderadas con fix breaking. |

Esto no significa que el sistema educativo sea inseguro. Son niveles de madurez
para produccion.

## 49. Deuda tecnica vs vulnerabilidad

No tener App Check no significa automaticamente "vulnerable critico". En este
proyecto:

- necesario: Authentication, claims, Functions, Rules, validacion servidor;
- recomendable: logs de auditoria, paginacion, CI;
- hardening: App Check, rate limiting, alertas;
- futuro/opcional: FCM, Storage, Analytics, Remote Config.

La auditoria ya cubre que un cliente manipulado no pueda saltarse permisos
admin ni escribir Firestore directo.

## 50. Escalabilidad del diseno de usuarios

Con 10 usuarios:

- listeners de coleccion completa son razonables;
- costo y volumen son bajos;
- simplicidad educativa gana.

Con 100 usuarios:

- sigue siendo manejable para demo o app pequena;
- conviene empezar a ordenar, buscar o filtrar.

Con 10.000 usuarios:

- `watchUsers()` completo puede ser caro o pesado;
- `watchProfiles()` admin completo puede ser incomodo;
- hacen falta `limit`, paginacion, filtros e indices;
- posiblemente busqueda dedicada.

Con 100.000 usuarios:

- escuchar colecciones completas no seria el diseno esperado;
- habria que disenar queries por pagina, roles, estado, busqueda y permisos;
- habria que medir costos y latencia.

No hay benchmark en el repo, asi que no se afirma capacidad numerica garantizada.

## 51. Listener global

`UserService.watchUsers()` escucha toda la coleccion `user_directory`.
`UserService.watchProfiles()` escucha toda `user_profiles` para admin.

Para proyecto educativo y pocos usuarios es razonable. A mayor escala:

```text
limit
orderBy
where
pagination
search
indexes
```

serian candidatos naturales. No se implementan en esta fase.

## 52. Arquitectura cliente-servidor

La aplicacion sigue siendo cliente-servidor:

```text
Flutter = cliente
Firebase services / Functions = backend y servicios remotos
```

No administrar un servidor tradicional no elimina la separacion cliente/servidor.

## 53. API

Si, hay una API en sentido amplio: las Callable Functions son una interfaz
remota para operaciones administrativas.

No son exactamente REST ni GraphQL. Son endpoints callable integrados con
Firebase SDK, Authentication y errores Firebase.

## 54. Firestore Client SDK

Algunas lecturas van directo:

```text
Flutter -> Firestore Client SDK -> Security Rules -> documents
```

Esto es central en Firebase. No todo pasa por una Function. Para lecturas
simples, realtime y autorizables por Rules, el cliente puede hablar directo con
Firestore.

## 55. Cuando una lectura deberia pasar por backend

Podria preferirse:

```text
Flutter -> Function/API -> DB
```

cuando hay:

- logica compleja;
- agregaciones;
- combinacion de multiples fuentes;
- datos que el cliente no debe consultar directamente;
- autorizacion dificil de expresar en Rules;
- transformaciones server-side;
- reporting avanzado.

## 56. Validacion duplicada

Flutter validation y Function validation no son duplicacion inutil.

Flutter:

- UX;
- feedback inmediato;
- menos errores simples;
- botones deshabilitados;
- mensajes amigables.

Function:

- seguridad;
- contrato real;
- autorizacion;
- rechazo de payloads manipulados;
- defensa ante clientes no oficiales.

## 57. Datos derivados

`active = !disabled` es dato duplicado/derivado.

Beneficio:

- Firestore Rules pueden consultar `active`;
- Flutter puede reaccionar con snapshots;
- listados/admin UI ven estado de aplicacion.

Riesgo:

- Auth y Firestore pueden desincronizarse.

Por eso `setUserDisabledStatus` valida consistencia previa, aplica orden
cuidadoso y prueba compensaciones.

## 58. Decisiones educativas que podrian variar

Algunas politicas fueron elegidas para aprender:

- rechazar inconsistencias previas en vez de repararlas automaticamente;
- mantener `profile` y `directory` separados;
- bloquear self-role-change, self-disable y self-delete;
- exponer pantalla admin como prueba clara de claims/rules;
- usar scripts ofensivos locales para demostrar amenazas.

Un sistema real podria tomar decisiones diferentes segun producto, soporte y
operacion.

## 59. Lo que no aprendimos todavia

Este proyecto no convierte automaticamente en expertos en:

- Firestore avanzado;
- Cloud Storage;
- Firebase Cloud Messaging;
- App Check implementado;
- Analytics;
- Remote Config;
- MFA;
- Firebase enterprise;
- optimizacion profunda de costos;
- arquitectura de altisima escala;
- busqueda avanzada.

Si deja fundamentos solidos en Auth, Firestore, Rules, Functions, Admin SDK,
Custom Claims, Emulator Suite, testing y fronteras de confianza.

## 60. Mapa de conocimientos adquiridos

```text
Firebase Core                 OK
Authentication                OK fundamentos importantes
Email/Password                OK
Sesion persistente            OK
UID                           OK
Custom Claims                 OK
ID Tokens                     OK fundamentos + token refresh
Firestore                     OK fundamentos
Security Rules                OK fundamentos importantes
Callable Functions            OK
Admin SDK                     OK uso backend confiable
Emulator Suite                OK
Testing Firebase              OK fundamentos con emuladores
Compensating transactions     OK concepto aplicado
FlutterFire                   OK Auth/Firestore/Functions
Storage                       NO trabajado
FCM                           NO trabajado
Analytics                     NO trabajado
Remote Config                 NO trabajado
App Check                     ANALIZADO, no implementado
MFA                           NO trabajado
CI/CD                         DOCUMENTADO como futuro
```

## 61. Flujo CREATE completo

```text
Admin UI
  |
  v
FunctionsService.createUser()
  |
  v
createUser Callable
  |
  v
request.auth
  |
  v
assertActiveAdmin()
  |
  v
parseCreateUserPayload()
  |
  v
Admin SDK
  |-- create Auth account
  |-- set Custom Claim role
  `-- Firestore batch:
        user_profiles/{uid}
        user_directory/{uid}
  |
  v
Firestore snapshot
  |
  v
Flutter listado realtime
```

Si Firestore falla despues de crear Auth, intenta borrar la cuenta creada como
compensacion.

## 62. Flujo READ

```text
Flutter
  |
  v
UserService
  |
  v
Firestore Client SDK
  |
  v
Security Rules
  |
  v
documents
  |
  v
snapshots()
  |
  v
Flutter
```

Ejemplos:

- perfil propio: `watchUserById(uid)`;
- directorio limitado: `watchUsers()`;
- perfiles admin: `watchProfiles()`.

## 63. Flujo UPDATE

```text
Admin UI
  |
  v
FunctionsService.updateUser()
  |
  v
updateUser Callable
  |
  v
validar admin activo + payload
  |
  v
leer Auth, profile y directory
  |
  v
Auth.updateUser(displayName/email)
  |
  v
Firestore batch:
  profile.name/email/updatedAt
  directory.name
```

Si Auth cambia y Firestore falla, intenta restaurar Auth al displayName/email
anteriores.

## 64. Flujo ROLE

```text
Admin UI
  |
  v
FunctionsService.setUserRole()
  |
  v
setUserRole Callable
  |
  v
validar admin activo, no self-change, role valido
  |
  v
leer Auth customClaims + Firestore roles
  |
  v
setCustomUserClaims({...claims, role})
  |
  v
Firestore batch:
  profile.role/updatedAt
  directory.role
  |
  v
usuario afectado usa getIdTokenResult(true) para ver claim nuevo
```

El rol en Firestore cambia para listados realtime, pero el claim nuevo no llega
al cliente afectado hasta refrescar token o renovar sesion.

## 65. Flujo DISABLE

```text
Admin UI
  |
  v
setUserDisabledStatus(disabled=true)
  |
  v
validar admin activo y no self-disable
  |
  v
validar Auth.disabled == !profile.active
  |
  v
Firestore profile.active=false
  |
  v
Auth.disabled=true
  |
  v
AccountStatusGate muestra cuenta deshabilitada
  |
  v
Rules bloquean directory/perfiles ajenos
```

Al habilitar, el orden se invierte para abrir acceso al final:

```text
Auth.disabled=false
Firestore profile.active=true
```

## 66. Flujo DELETE

```text
Admin UI
  |
  v
FunctionsService.deleteUser()
  |
  v
deleteUser Callable
  |
  v
validar admin activo y no self-delete
  |
  v
leer Auth, profile y directory
  |
  v
Firestore batch delete:
  user_profiles/{uid}
  user_directory/{uid}
  |
  v
Auth.deleteUser(uid)
```

Si falla Auth.deleteUser, intenta restaurar Firestore. No hay rollback perfecto
de Auth porque la contrasena original no puede leerse.

## 67. Flujo de ataque: Function admin

```text
USER modifica Flutter
  |
  v
muestra boton "Eliminar"
  |
  v
llama deleteUser
  |
  v
Function lee request.auth
  |
  v
request.auth.token.role != admin
  |
  v
permission-denied
```

Esto demuestra que ocultar botones no era la seguridad real.

## 68. Flujo de ataque: Firestore directo

```text
USER intenta escribir:
role = admin
  |
  v
Firestore Client SDK
  |
  v
Security Rules
  |
  v
allow write: if false
  |
  v
DENIED
```

El script `test-security-audit.js` valida esta familia de ataques.

## 69. Admin deshabilitado con token viejo

```text
token antiguo:
role=admin

Auth user:
disabled=true

Function:
assertActiveAdmin()
  |
  v
getUser(callerUid)
  |
  v
disabled=true
  |
  v
permission-denied
```

Este caso es clave porque muestra que los claims son potentes, pero no bastan
para todas las decisiones temporales.

## 70. README y docs

`README.md` ya cumple un rol practico: instalacion, ejecucion, emuladores,
pruebas, estructura y limitaciones. No se modifica en esta fase para evitar
convertirlo en ensayo largo.

Este documento concentra la reflexion final de arquitectura y aprendizaje.

## 71. Decision arquitectonica resumida

| Necesidad | Firebase | Backend tradicional |
| --- | --- | --- |
| MVP rapido | Fuerte | Posible, mas setup |
| App movil con Auth estandar | Fuerte | Posible, mas implementacion |
| Realtime sencillo | Fuerte | Requiere WebSockets/SSE/polling |
| CRUD sensible pequeno | Fuerte con Functions/Rules | Fuerte con API/guards |
| SQL complejo | Limitado | Fuerte |
| Joins intensivos | Limitado | Fuerte |
| Transacciones relacionales | Limitado fuera de Firestore | Fuerte |
| Control infraestructura | Menor | Fuerte |
| Operacion minima servidor | Fuerte | Menos fuerte |
| Dominio empresarial complejo | Depende | Suele ser fuerte |
| Portabilidad estricta | Menos fuerte | Suele ser fuerte |
| Costos predecibles por servidor | Depende del uso | Mas controlable por infraestructura |

## 72. Decisiones que conservaria

Volveria a conservar:

- Emulator Suite desde temprano;
- Functions para operaciones administrativas;
- Custom Claims para rol autorizado;
- Rules restrictivas para Firestore directo;
- separacion `user_profiles`/`user_directory`;
- no guardar passwords;
- no confiar en Flutter para seguridad;
- tests ofensivos locales;
- documentacion de invariantes y limites.

## 73. Decisiones que reconsideraria en un proyecto real

Revisaria:

- paginacion y filtros antes de crecer usuarios;
- estrategia de busqueda;
- auditoria de acciones admin;
- rate limiting;
- App Check;
- observabilidad y alertas;
- CI/CD;
- politica de delete vs soft delete;
- estrategia ante inconsistencias;
- concurrencia multi-admin;
- actualizacion controlada de dependencias npm.

## 74. Aprendizaje transferible

Lo aprendido sirve fuera de Firebase:

- el cliente no es confiable;
- la autorizacion sensible debe validarse server-side;
- RBAC requiere fuente de verdad clara;
- menor privilegio reduce exposicion de datos;
- ocultar UI no protege;
- datos publicos y privados deben separarse antes de enviarlos;
- las transacciones tienen fronteras;
- las compensaciones reducen dano, pero no son ACID;
- los tests de seguridad deben simular atacantes;
- emuladores/entornos locales permiten pruebas destructivas;
- documentar invariantes ayuda a mantener sistemas.

## 75. Preguntas de autoevaluacion

1. Por que un Custom Claim es mejor que leer `role` desde Firestore para autorizar una Function?
2. Por que `RoleGate` no es seguridad?
3. Que protege Security Rules y que no protege?
4. Por que Admin SDK no debe vivir en Flutter?
5. Por que un usuario normal no deberia recibir emails de otros aunque Flutter no los muestre?
6. Que ocurre si Auth cambia correctamente pero Firestore falla?
7. Por que una compensacion no es una transaccion ACID?
8. Por que `deleteUser` no tiene rollback perfecto?
9. En que se diferencian `disabled` y `active`?
10. Por que un admin deshabilitado con token viejo debe ser rechazado por la Function?
11. Cuando usamos `getIdTokenResult(true)`?
12. Por que `user_directory` existe si ya tenemos `user_profiles`?
13. Por que 10.0.2.2 se usa en Android Emulator?
14. Que ventaja da Emulator Suite frente a pruebas contra produccion?
15. Que significa que Firestore sea NoSQL en este proyecto?
16. Cuando una lectura puede ir directo desde Flutter a Firestore?
17. Cuando una lectura deberia pasar por backend?
18. Que responsabilidades reemplaza Firebase Authentication frente a un backend tradicional?
19. Que partes migrarias si el proyecto pasara a NestJS + PostgreSQL?
20. Cuando elegirias Firebase y cuando PostgreSQL?
21. Que diferencia hay entre validacion UX y validacion servidor?
22. Por que `allow write: if false` no bloquea al Admin SDK?
23. Que riesgo aparece con listeners sobre colecciones completas?
24. Que decisiones fueron educativas y podrian variar en produccion?

## 76. Mini retos futuros opcionales

Estos no forman una Fase 10 obligatoria. Son ejercicios sueltos si se desea
seguir aprendiendo otro dia.

| Reto | Concepto que permitiria aprender |
| --- | --- |
| Password recovery | Flujos administrados de recuperacion de cuenta. |
| App Check | Hardening contra abuso desde clientes no legitimos. |
| Pagination | Costos, queries, indices y UX con volumen. |
| Audit log | Trazabilidad de acciones administrativas. |
| CI | Regresion automatizada en cada cambio. |
| Firebase Storage | Reglas de archivos y uploads desde cliente. |
| FCM | Notificaciones push y tokens de dispositivo. |

## 77. Conclusiones principales

### Que es realmente Firebase despues de este proyecto

Firebase no es solamente una base de datos. En este proyecto fue una plataforma
backend administrada compuesta por servicios coordinados:

```text
Authentication -> identidad, sesion, password, disabled, ID Tokens
Firestore      -> datos de aplicacion y realtime
Functions      -> backend serverless para operaciones sensibles
Admin SDK      -> privilegios administrativos en entorno confiable
Security Rules -> autorizacion de acceso directo a datos
Emulators      -> desarrollo y pruebas locales
```

El aprendizaje central es separar identidad, autorizacion, datos, UX y entorno
confiable.

### Firebase reemplaza a un backend tradicional?

Respuesta matizada: reemplaza parte de la infraestructura y varias
responsabilidades comunes, pero no elimina el backend como concepto.

En este proyecto, Cloud Functions y Admin SDK fueron backend. Lo que Firebase
elimino fue la necesidad de administrar servidores tradicionales para Auth,
realtime y Functions. No elimino logica de negocio, autorizacion, validacion,
consistencia ni diseno de datos.

### Cuando elegiria Firebase despues de esta experiencia

Lo elegiria para una app movil/web con Auth estandar, equipo pequeno, necesidad
de realtime, CRUD sensible moderado y deseo de avanzar rapido con poca
infraestructura propia.

### Cuando elegiria NestJS + PostgreSQL

Lo elegiria cuando el centro del problema sea un dominio relacional complejo,
SQL intensivo, reportes, joins, transacciones empresariales, integraciones
backend numerosas o control estricto de infraestructura y portabilidad.

### Que combinacion hibrida podria ser util

Una combinacion razonable podria ser:

```text
Flutter
  |
  v
Firebase Authentication
  |
  v
NestJS
  |
  v
PostgreSQL
```

Tambien se podrian sumar Storage, FCM o Analytics segun necesidades. Firebase y
backend tradicional pueden complementarse.

## 78. Estado final

```text
CRUD                 OK
Security             OK
Emulator Suite       OK
Testing              OK
Documentation        OK
Architecture review  OK
```

Por tanto:

```text
PROYECTO EDUCATIVO COMPLETADO
```

No queda una Fase 10 obligatoria. Las mejoras futuras son opcionales y no
cambian el cierre del experimento.
