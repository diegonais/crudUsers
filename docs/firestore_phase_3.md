# Fase 3 - Cloud Firestore y usuarios

## Authentication vs Firestore

Firebase Authentication guarda la identidad de la cuenta:

- uid
- email
- provider
- estado de autenticacion

Cloud Firestore guarda informacion propia de la aplicacion:

- nombre
- email de perfil
- rol
- estado
- fechas

No guardamos contrasenas en Firestore. Un usuario creado en Authentication no crea automaticamente un documento en Firestore; por eso en esta fase el primer perfil se crea manualmente para observar la diferencia.

```text
Firebase Authentication
        |
        | identidad
        v
       UID
        |
        v
Cloud Firestore
        |
        +-- informacion de la aplicacion
```

## Perfil manual

1. Abre Firebase Console.
2. Ve a Authentication -> Usuarios.
3. Copia el UID exacto del usuario de prueba.
4. Ve a Firestore Database -> Datos -> Iniciar coleccion.
5. Crea la coleccion `user_profiles`.
6. Usa como Document ID el UID exacto del usuario.
7. Agrega estos campos:

```text
uid: string con el UID exacto
name: string, por ejemplo "Usuario Prueba"
email: string con el email del usuario
role: string, por ejemplo "user"
active: boolean true
createdAt: timestamp
updatedAt: timestamp
```

El UID como Document ID permite relacionar directamente la cuenta autenticada con su perfil:

```text
FirebaseAuth.currentUser.uid -> user_profiles/{uid}
```

## Directorio manual

Crea tambien la coleccion `user_directory` con un documento cuyo Document ID sea el mismo UID:

```text
uid: string con el UID exacto
name: string, por ejemplo "Usuario Prueba"
role: string, por ejemplo "user"
```

`user_profiles` contiene informacion completa o interna. `user_directory` contiene solo informacion limitada para listados. No conviene descargar todos los datos y ocultar campos en Flutter, porque el cliente ya habria recibido esa informacion.

## Lecturas

`get()` hace una lectura unica: pide el dato una vez y termina.

`snapshots()` mantiene un listener en tiempo real: emite el estado actual y vuelve a emitir cuando Firestore detecta cambios.

`DocumentSnapshot` representa un documento. `snapshot.exists` indica si existe, y `snapshot.data()` devuelve sus campos.

`QuerySnapshot` representa el resultado de consultar varios documentos. `snapshot.docs` contiene los documentos encontrados.

## Security Rules

Antes de llegar a Firestore, cada lectura pasa por reglas:

```text
Flutter
   |
   v
Firestore Security Rules
   |-- permitida -> Firestore
   +-- rechazada -> PERMISSION_DENIED
```

Las reglas locales estan en `firestore.rules`:

- `user_profiles/{userId}`: un usuario autenticado puede leer solo su propio perfil.
- `user_directory/{userId}`: cualquier usuario autenticado puede leer el directorio.
- usuarios sin autenticacion no pueden leer.
- Flutter no puede escribir en estas colecciones en esta fase.

El deploy de reglas, cuando quieras aplicarlas al proyecto existente, es:

```bash
firebase deploy --only firestore:rules
```

Ese comando despliega solamente las Security Rules de Firestore configuradas en `firebase.json`. No despliega hosting, funciones ni otros recursos.

## Pruebas manuales

1. Login -> copiar UID -> verificar que se lea `user_profiles/{uid}`.
2. Login con usuario sin perfil -> debe aparecer "No se encontro un perfil asociado a esta cuenta."
3. App abierta -> cambiar `name` en `user_profiles` desde Firebase Console -> la Home debe actualizarse.
4. App -> Ver usuarios -> deben aparecer documentos de `user_directory`.
5. Firebase Console -> cambiar `name` en `user_directory` -> la lista debe actualizarse.
6. Reglas: autenticado lee su perfil y directorio; no autenticado no lee nada; perfil de otro UID debe fallar.
