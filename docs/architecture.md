# Arquitectura

Este proyecto mantiene una arquitectura sencilla para que sea facil estudiar
Firebase sin introducir capas innecesarias.

## Responsabilidades

```text
AuthService
  login
  logout
  auth state
  current user

UserService
  user_profiles/{uid}
  user_directory/{uid}
  admin profile listing
  snapshots()

FunctionsService
  createUser
  updateUser
  setUserRole
  setUserDisabledStatus
  deleteUser

UI
  pantallas
  formularios
  dialogos
  estados loading/error/empty/data
```

## Flujo Login

```text
Flutter
v
Firebase Authentication
v
User
v
AccountStatusGate
v
RoleGate
v
Admin UI / User UI
```

`AuthGate` escucha `authStateChanges()`. No hay navegacion manual obligatoria
despues de login/logout: el estado de Firebase Auth decide que arbol de UI se
muestra.

## Flujo Lectura

```text
Flutter
v
Firestore Client SDK
v
Security Rules
v
user_profiles / user_directory
v
snapshots()
```

Los usuarios normales leen su propio perfil y el directorio limitado. Los
admins activos pueden leer perfiles administrativos. Las escrituras directas
desde cliente estan denegadas.

## Flujo Escritura Administrativa

```text
Flutter
v
Callable Function
v
request.auth
v
validacion admin activo
v
validacion payload
v
Admin SDK
v
Auth / Firestore
```

Las operaciones administrativas no dependen de botones ocultos ni de campos
enviados por Flutter para probar permisos. Las Functions vuelven a validar
identidad, rol, estado activo y contrato de datos.

## Invariantes

```text
Auth.uid == profile document id == directory document id
Auth.displayName == profile.name == directory.name
Auth.email == profile.email
Auth customClaims.role == profile.role == directory.role
Auth.disabled == !profile.active
```

Las pruebas locales de emulador verifican estas relaciones en create, update,
role, disable, enable y delete.
