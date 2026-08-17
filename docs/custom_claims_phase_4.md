# Fase 4 - Roles con Firebase Authentication Custom Claims

## Idea central

Firebase Authentication emite un ID Token despues de iniciar sesion:

```text
Login correcto
     |
     v
Firebase Authentication
     |
     v
ID Token
     |-- uid
     |-- informacion estandar
     +-- custom claims
           +-- role
```

El rol autorizado vive en el token:

```json
{
  "role": "admin"
}
```

o:

```json
{
  "role": "user"
}
```

Flutter usa ese claim para decidir interfaz. Firestore Security Rules usa el mismo claim para decidir permisos reales mediante `request.auth.token.role`.

## Firestore role vs Authentication role

`user_profiles/{uid}.role` puede seguir existiendo como dato de perfil y sirve para mostrar informacion.

Ese campo no es la fuente principal de autorizacion. La autorizacion real de esta fase usa:

```text
request.auth.token.role
```

Si alguien modifica Flutter para mostrar una pantalla admin, Firestore no mira esa variable local: vuelve a evaluar el ID Token firmado por Firebase Authentication.

## Firebase Client SDK vs Firebase Admin SDK

```text
Flutter
Firebase Client SDK
--------------------
permisos del usuario
Security Rules aplican

Servidor / herramienta confiable
Firebase Admin SDK
--------------------
privilegios administrativos
NO debe llegar al cliente
```

Flutter no puede tener una funcion `setMyRole("admin")` porque el cliente no es confiable. Los Custom Claims se asignan desde Firebase Admin SDK en un entorno confiable.

## Herramienta local

La herramienta educativa esta separada de Flutter:

```text
tools/firebase_admin/
|-- package.json
|-- package-lock.json
+-- set-role.js
```

Antes de instalar se verifico:

```text
node --version -> v24.12.0
npm view firebase-admin version engines --json -> firebase-admin 14.2.0 requiere node >=22
```

La version local de Node es compatible.

## Service Account

No copies claves privadas al codigo ni al proyecto Flutter.

Obtencion:

```text
Firebase Console
-> Configuracion del proyecto
-> Cuentas de servicio
-> Firebase Admin SDK
-> Generar nueva clave privada
```

Guarda el JSON fuera del repositorio.

PowerShell:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\ruta\segura\service-account.json"
```

CMD:

```cmd
set GOOGLE_APPLICATION_CREDENTIALS=C:\ruta\segura\service-account.json
```

## Asignar roles

Desde `tools/firebase_admin`:

```bash
node set-role.js UID admin
node set-role.js UID user
```

Tambien acepta email:

```bash
node set-role.js admin@test.com admin
node set-role.js user@test.com user
```

El script solo permite `admin` y `user`. Lee los Custom Claims actuales y actualiza solamente `role`, porque `setCustomUserClaims()` reemplaza el objeto completo de claims.

## Primer admin y segundo usuario

Primer admin:

1. Firebase Console -> Authentication -> Usuarios.
2. Copia el UID del usuario de prueba.
3. Ejecuta `node set-role.js UID admin`.

Segundo usuario:

1. Firebase Console -> Authentication -> Usuarios -> Agregar usuario.
2. Crea `user@test.com`.
3. Ejecuta `node set-role.js UID user`.
4. Si quieres mantener el modelo de Fase 3, crea manualmente:

```text
user_profiles/{uid}
uid: string
name: string
email: string
role: string
active: boolean
createdAt: timestamp
updatedAt: timestamp

user_directory/{uid}
uid: string
name: string
role: string
```

## Refresco de token

`getIdTokenResult()` lee el ID Token actual y expone sus claims.

`getIdTokenResult(true)` fuerza la renovacion del token. Esto es util para comprobar inmediatamente un cambio de Custom Claims hecho desde Admin SDK. No se refresca constantemente porque Firebase Authentication ya renueva tokens durante el ciclo normal de sesion.

## Security Rules de Fase 4

```javascript
function isAuthenticated() {
  return request.auth != null;
}

function isAdmin() {
  return isAuthenticated()
      && request.auth.token.role == "admin";
}
```

`user_directory`:

```text
autenticado -> read
no autenticado -> rechazado
write -> rechazado
```

`user_profiles/{userId}`:

```text
propio usuario -> read
admin -> read
otro user -> rechazado
write -> rechazado para todos los clientes
```

## Pruebas

Admin:

```text
admin@test.com
role claim = admin
resultado = AdminHome
lee su perfil, user_directory y Admin Profiles
```

User:

```text
user@test.com
role claim = user
resultado = UserHome
lee su perfil y user_directory
no puede leer perfiles de otros usuarios
```

Sin claim:

```text
role = null
resultado = estado seguro: rol no configurado
```

Actualizacion de rol:

```text
1. iniciar sesion como user
2. comprobar role = user
3. ejecutar set-role.js UID admin
4. la app puede conservar el token anterior temporalmente
5. tocar Refrescar token
6. comprobar role = admin
```
