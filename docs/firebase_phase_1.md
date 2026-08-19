# Fase 1 - Flutter + Firebase Core

## Objetivo

Esta fase conecta una app Flutter con un proyecto Firebase existente. Todavia no inicia sesion, no lee Firestore y no implementa roles. Su trabajo es dejar lista la base para que los servicios de Firebase sepan a que proyecto conectarse.

El flujo base es:

```text
Proyecto Flutter
      |
      v
FlutterFire CLI
      |
      v
firebase_options.dart
      |
      v
Firebase.initializeApp()
      |
      v
Servicios Firebase listos para usarse
```

## Que es Firebase Core

`firebase_core` es el paquete base de Firebase para Flutter.

No autentica usuarios por si solo, no guarda documentos y no crea reglas de seguridad. Su responsabilidad es inicializar Firebase dentro de la app para que otros paquetes, como `firebase_auth` o `cloud_firestore`, puedan funcionar.

```text
firebase_core
      |
      v
Firebase.initializeApp()
      |
      +-- firebase_auth
      +-- cloud_firestore
      +-- otros servicios Firebase
```

## Proyecto Firebase

El proyecto Firebase usado por cada clon debe ser propio:

```text
your-firebase-project-id
```

Ese `projectId` aparece en:

- `lib/firebase_options.dart`
- `firebase.json`
- `android/app/google-services.json`

Esto permite verificar que Flutter, Android y Web apuntan al mismo proyecto Firebase.

## FlutterFire CLI

FlutterFire CLI genera la configuracion necesaria para conectar Flutter con Firebase.

El comando conceptual usado en esta fase es:

```bash
flutterfire configure
```

Ese comando selecciona el proyecto Firebase y las plataformas que quieres configurar. En este proyecto ya quedaron configuradas, entre otras:

- Android
- Web
- iOS
- macOS
- Windows

Linux no esta configurado en `firebase_options.dart`; si algun dia se necesita, se puede volver a ejecutar FlutterFire CLI para incluir esa plataforma.

## firebase_options.dart

`lib/firebase_options.dart` fue generado por FlutterFire CLI.

Contiene una clase llamada `DefaultFirebaseOptions` con configuracion por plataforma:

```text
DefaultFirebaseOptions.currentPlatform
      |
      |-- Web     -> FirebaseOptions web
      |-- Android -> FirebaseOptions android
      |-- iOS     -> FirebaseOptions ios
      |-- macOS   -> FirebaseOptions macos
      +-- Windows -> FirebaseOptions windows
```

La app usa:

```dart
Firebase.initializeApp(
  options: DefaultFirebaseOptions.currentPlatform,
);
```

Eso significa: "inicializa Firebase usando la configuracion correcta para la plataforma actual".

## Claves cliente

Los valores como `apiKey`, `appId`, `projectId` y `messagingSenderId` son configuracion cliente.

No son claves de administrador y no permiten acceder al proyecto ignorando reglas. La seguridad real depende de cada servicio:

- Firebase Authentication valida identidad y credenciales.
- Firestore Security Rules deciden si una lectura o escritura esta permitida.
- Firebase Admin SDK, que no se usa en Flutter cliente, es otra categoria completamente distinta.

## google-services.json

`android/app/google-services.json` es el archivo de configuracion que Android necesita para conectarse al proyecto Firebase.

Contiene datos como:

- `project_number`
- `project_id`
- `mobilesdk_app_id`
- `package_name`

En este proyecto, el package name Android configurado es:

```text
com.example.crudusers
```

Si en el futuro se cambia el package name de Android, tambien habra que actualizar la app Android registrada en Firebase.

## firebase.json

`firebase.json` guarda configuracion local relacionada con Firebase CLI y FlutterFire.

En este proyecto contiene:

- informacion generada por FlutterFire sobre plataformas y apps Firebase;
- la ruta local de reglas Firestore agregada en la Fase 3:

```json
{
  "firestore": {
    "rules": "firestore.rules"
  }
}
```

En Fase 1, la parte importante era que el proyecto quedara vinculado correctamente. En fases posteriores este archivo puede crecer para hosting, Firestore, Functions u otros recursos.

## main.dart

La inicializacion ocurre antes de `runApp()`:

```text
main()
  |
  v
WidgetsFlutterBinding.ensureInitialized()
  |
  v
Firebase.initializeApp(...)
  |
  v
runApp()
```

`WidgetsFlutterBinding.ensureInitialized()` prepara Flutter para ejecutar codigo asincrono y usar plugins antes de construir la interfaz.

`Firebase.initializeApp()` conecta la app al proyecto Firebase.

`runApp()` arranca la interfaz cuando Firebase ya esta listo.

## Por que inicializar antes de usar Auth o Firestore

Servicios como Authentication y Firestore necesitan saber:

- a que proyecto Firebase conectarse;
- que app Firebase corresponde a la plataforma actual;
- que identificadores cliente usar;
- que configuracion corresponde a Android, Web, iOS, etc.

Por eso esta fase va antes de Authentication y Firestore.

```text
Sin Firebase.initializeApp()
        |
        v
FirebaseAuth.instance no tiene app Firebase lista
Cloud Firestore no tiene proyecto Firebase listo
```

## Que no hace esta fase

Esta fase no implementa:

- login;
- logout;
- registro;
- persistencia de sesion;
- Firestore;
- colecciones;
- documentos;
- roles;
- Security Rules;
- CRUD de usuarios.

Solo deja conectada la app Flutter con Firebase.

## Pruebas manuales

1. Ejecutar la app en Web o Android.
2. Verificar que no aparezcan errores de inicializacion Firebase.
3. Revisar que `lib/firebase_options.dart` tenga el `projectId` correcto.
4. Revisar que `android/app/google-services.json` exista para Android.
5. Confirmar que `Firebase.initializeApp()` se ejecuta antes de `runApp()`.

## Archivos principales

- `pubspec.yaml`: contiene la dependencia `firebase_core`.
- `lib/main.dart`: inicializa Firebase antes de arrancar la app.
- `lib/firebase_options.dart`: configuracion generada por FlutterFire CLI.
- `firebase.json`: configuracion local de Firebase CLI y FlutterFire.
- `android/app/google-services.json`: configuracion Firebase para Android.

## Resumen

La Fase 1 responde a la pregunta: "mi app Flutter sabe a que proyecto Firebase conectarse?"

Si la respuesta es si, entonces las siguientes fases pueden usar servicios concretos:

```text
Fase 1
Flutter + Firebase Core
      |
      v
Fase 2
Firebase Authentication
      |
      v
Fase 3
Cloud Firestore
```
