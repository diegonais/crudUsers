# Fase 2 - Firebase Authentication

## Objetivo

Esta fase conecta Flutter con Firebase Authentication para iniciar sesion con Email/Password, mantener la sesion automaticamente y cerrar sesion sin manejar estados manuales como `isLoggedIn`.

El flujo actual es:

```text
Flutter
   |
   v
Firebase.initializeApp()
   |
   v
Firebase Authentication
   |
   v
authStateChanges()
   |
   |-- User? null -> LoginScreen
   +-- User      -> HomeScreen
```

## Paquetes usados

`firebase_core` permite inicializar Firebase desde Flutter. Sin esta inicializacion, los demas servicios no saben a que proyecto Firebase conectarse.

`firebase_auth` permite usar Firebase Authentication desde Flutter: iniciar sesion, leer el usuario actual, observar cambios de sesion y cerrar sesion.

```text
firebase_core
      |
      v
Firebase.initializeApp()
      |
      v
firebase_auth
      |
      v
FirebaseAuth.instance
```

## Inicializacion

La app inicializa Firebase en `lib/main.dart`:

```text
WidgetsFlutterBinding.ensureInitialized()
        |
        v
Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)
        |
        v
runApp()
```

`firebase_options.dart` contiene la configuracion generada para cada plataforma. No es una clave secreta de administrador; es la configuracion cliente que permite que la app encuentre el proyecto Firebase correcto.

## FirebaseAuth.instance

`FirebaseAuth.instance` es el punto de entrada al servicio de Authentication del proyecto Firebase ya inicializado.

No crea usuarios por si solo, no crea una base de datos y no guarda perfiles de aplicacion. Su responsabilidad en esta fase es autenticar cuentas y mantener el estado de sesion.

```text
FirebaseAuth.instance
        |
        v
Authentication
        |
        +-- signInWithEmailAndPassword()
        +-- authStateChanges()
        +-- currentUser
        +-- signOut()
```

## AuthService

`AuthService` encapsula el acceso a `FirebaseAuth.instance` para evitar que las pantallas llamen directamente a Firebase por todos lados.

Esto ayuda a que la app tenga un lugar claro para:

- iniciar sesion;
- cerrar sesion;
- leer el usuario actual;
- observar cambios de sesion;
- convertir errores tecnicos en mensajes comprensibles.

```text
Pantallas
   |
   v
AuthService
   |
   v
FirebaseAuth.instance
```

## User y UserCredential

`UserCredential` es el resultado de una autenticacion exitosa. Dentro contiene un `User`.

`User` representa la cuenta autenticada que Firebase devolvio:

- `uid`
- `email`
- provider
- metadata de la cuenta

El `uid` es muy importante porque identifica de forma unica la cuenta dentro de Firebase Authentication. En la Fase 3 se usa ese mismo UID para relacionar Authentication con Firestore.

## Login con Email/Password

El login ocurre con:

```text
email + password
      |
      v
signInWithEmailAndPassword()
      |
      |-- credenciales validas -> UserCredential
      +-- credenciales invalidas -> FirebaseAuthException
```

La validacion del formulario en Flutter mejora la experiencia, pero no reemplaza a Firebase. Aunque Flutter revise que el email parezca valido o que la contrasena no este vacia, Firebase Authentication sigue siendo quien valida realmente la cuenta, la contrasena y el estado del usuario.

No se guardan contrasenas en Flutter ni en Firestore. La contrasena se envia al servicio de Authentication para que Firebase la valide.

## authStateChanges()

`authStateChanges()` devuelve un `Stream<User?>`.

Un Stream es una secuencia de valores que puede cambiar con el tiempo. En este caso, Firebase emite:

```text
null -> no hay sesion
User -> hay sesion activa
null -> el usuario cerro sesion
```

Por eso no hace falta navegar manualmente despues del login. Si Firebase acepta las credenciales, `authStateChanges()` emite un `User` y `AuthGate` reconstruye la interfaz.

```text
Login correcto
      |
      v
Firebase guarda la sesion
      |
      v
authStateChanges() emite User
      |
      v
AuthGate muestra HomeScreen
```

## AuthGate

`AuthGate` decide que pantalla mostrar segun el estado real de Firebase Authentication.

```text
StreamBuilder<User?>
      |
      |-- esperando -> CircularProgressIndicator
      |-- User null -> LoginScreen
      +-- User      -> HomeScreen
```

Esto evita depender de una variable local como `bool isLoggedIn`. La fuente de verdad es Firebase Authentication.

## Persistencia automatica

Firebase Authentication mantiene la sesion localmente. Si cierras y vuelves a abrir la app, Firebase intenta restaurar la sesion y `authStateChanges()` vuelve a emitir el estado actual.

Por eso el flujo inicial puede mostrar un loader mientras Firebase revisa si ya existe una sesion guardada.

```text
Abrir app
   |
   v
Firebase revisa sesion local
   |
   |-- existe -> User
   +-- no existe -> null
```

## Logout

`signOut()` borra la sesion local administrada por Firebase Auth.

No hace falta navegar manualmente al login. Cuando `signOut()` termina, `authStateChanges()` emite `null` y `AuthGate` muestra `LoginScreen`.

```text
Cerrar sesion
      |
      v
FirebaseAuth.signOut()
      |
      v
authStateChanges() emite null
      |
      v
AuthGate muestra LoginScreen
```

## Manejo de errores

Firebase puede lanzar `FirebaseAuthException`. El campo mas util para la interfaz es `code`, por ejemplo:

- `invalid-credential`
- `user-not-found`
- `wrong-password`
- `invalid-email`
- `user-disabled`
- `too-many-requests`
- `network-request-failed`
- `operation-not-allowed`

La app registra detalles utiles durante desarrollo con `debugPrint`, pero al usuario le muestra mensajes simples. No conviene mostrar stack traces ni textos tecnicos en pantalla.

## Crear el usuario de prueba

En esta fase no hay registro publico desde Flutter. El usuario de prueba se crea manualmente:

1. Abre Firebase Console.
2. Ve a Authentication.
3. Entra a Usuarios.
4. Usa Agregar usuario.
5. Escribe email y contrasena.
6. Guarda.
7. Usa esas credenciales en la pantalla de login de Flutter.

Tambien debe estar habilitado el proveedor Email/Password:

```text
Firebase Console
-> Authentication
-> Metodo de acceso
-> Email/Password
-> Habilitar
```

## Que no hace esta fase

Esta fase no implementa:

- registro publico;
- recuperacion de contrasena;
- roles;
- Firestore;
- perfiles de usuario;
- Security Rules;
- Custom Claims;
- creacion de usuarios por admin;
- autorizacion administrativa.

Solo autentica una cuenta existente y muestra la pantalla correcta segun la sesion.

## Pruebas manuales

1. Abrir la app sin sesion -> debe aparecer `LoginScreen`.
2. Ingresar email invalido -> Flutter debe mostrar validacion.
3. Ingresar credenciales incorrectas -> debe aparecer un mensaje amigable.
4. Ingresar credenciales correctas -> Firebase debe emitir `User` y se muestra `HomeScreen`.
5. Cerrar y abrir la app con sesion activa -> Firebase debe restaurar la sesion automaticamente.
6. Cerrar sesion -> `AuthGate` debe volver a `LoginScreen`.
7. Deshabilitar temporalmente la red -> debe aparecer mensaje de conexion si Firebase no responde.

## Archivos principales

- `lib/main.dart`: inicializa Firebase.
- `lib/firebase_options.dart`: contiene la configuracion cliente del proyecto Firebase.
- `lib/services/auth_service.dart`: encapsula Firebase Authentication.
- `lib/widgets/auth_gate.dart`: decide si mostrar login o home segun `authStateChanges()`.
- `lib/screens/login_screen.dart`: formulario de Email/Password.
- `lib/screens/home_screen.dart`: pantalla mostrada cuando existe un `User` autenticado.
- `test/auth_service_test.dart`: prueba mensajes amigables para errores de Authentication.

## Resumen

Authentication responde a la pregunta: "quien eres y tienes una sesion valida?"

Firestore responde a otra pregunta: "que datos de aplicacion estan asociados a este usuario?"

En esta fase solo usamos Authentication:

```text
Email/Password
      |
      v
Firebase Authentication
      |
      v
User(uid, email)
      |
      v
authStateChanges()
      |
      v
LoginScreen o HomeScreen
```
