# Seguridad

Este documento resume el modelo actual. El reporte completo de Fase 7 se
conserva en `docs/security_audit_phase_7.md`.

## Fronteras de confianza

```text
Flutter
  Cliente no confiable. Mejora UX, pero no autoriza por si solo.

Firebase Authentication
  Verifica identidad y emite ID Tokens.

Custom Claims
  Transportan role firmado en el token.

Firestore Security Rules
  Protegen lecturas/escrituras hechas con Client SDK.

Callable Functions
  Validan operaciones administrativas antes de usar Admin SDK.

Admin SDK
  Backend confiable. No esta limitado por Security Rules de cliente.
```

## Roles y cuentas activas

Los roles validos son `admin` y `user`. Para operaciones administrativas no
basta con que el token diga `role=admin`: la Function tambien consulta el
estado vivo del caller en Authentication y rechaza si esta deshabilitado.

Las cuentas inactivas pueden leer su propio perfil para que la UI detecte
`active=false`, pero no pueden leer el directorio ni ejecutar CRUD admin.

## Firestore Rules

```text
user_profiles/{uid}
  read own profile: usuario autenticado dueno del documento
  read other profiles: admin activo
  write: false

user_directory/{uid}
  read: usuario autenticado activo
  write: false
```

## Payloads

Las Functions usan allowlists de campos. Los payloads con datos adicionales se
rechazan con `invalid-argument` para evitar que un cliente manipulado intente
inyectar `role`, `active`, `disabled`, claims u otros campos fuera del contrato.

## Auto-proteccion Admin

Un admin activo no puede desde la UI/Function:

```text
cambiar su propio rol
deshabilitarse a si mismo
eliminarse a si mismo
```

Esto reduce errores durante demos y pruebas educativas.

## Disabled Accounts

`setUserDisabledStatus` mantiene:

```text
Authentication.disabled == !user_profiles.active
```

Al deshabilitar se cierra primero el acceso a Firestore (`active=false`) y luego
se deshabilita Auth. Al habilitar se habilita Auth primero y despues se abre
Firestore (`active=true`). Las pruebas cubren compensaciones ante fallos.

## Futuro Hardening

No se configuro en Fase 8, pero queda como mantenimiento futuro:

```text
App Check
rate limiting
audit logs
CI
revision periodica de dependencias
monitoreo de consistencia
```
