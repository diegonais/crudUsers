import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

import '../firebase_emulator_config.dart';
import '../models/app_role.dart';

class CreateUserResult {
  const CreateUserResult({required this.uid, required this.email});

  final String uid;
  final String email;

  factory CreateUserResult.fromCallableData(Object? data) {
    if (data is! Map) {
      throw const FormatException('La Function respondio con datos invalidos.');
    }

    final uid = data['uid'];
    final email = data['email'];

    if (uid is! String || uid.trim().isEmpty) {
      throw const FormatException('La respuesta no incluye uid valido.');
    }

    if (email is! String || email.trim().isEmpty) {
      throw const FormatException('La respuesta no incluye email valido.');
    }

    return CreateUserResult(uid: uid, email: email);
  }
}

class UpdateUserResult {
  const UpdateUserResult({
    required this.uid,
    required this.name,
    required this.email,
    required this.changed,
  });

  final String uid;
  final String name;
  final String email;
  final bool changed;

  factory UpdateUserResult.fromCallableData(Object? data) {
    if (data is! Map) {
      throw const FormatException('La Function respondio con datos invalidos.');
    }

    final uid = data['uid'];
    final name = data['name'];
    final email = data['email'];
    final changed = data['changed'];

    if (uid is! String || uid.trim().isEmpty) {
      throw const FormatException('La respuesta no incluye uid valido.');
    }

    if (name is! String || name.trim().isEmpty) {
      throw const FormatException('La respuesta no incluye nombre valido.');
    }

    if (email is! String || email.trim().isEmpty) {
      throw const FormatException('La respuesta no incluye email valido.');
    }

    if (changed is! bool) {
      throw const FormatException('La respuesta no incluye changed valido.');
    }

    return UpdateUserResult(
      uid: uid,
      name: name,
      email: email,
      changed: changed,
    );
  }
}

class SetUserRoleResult {
  const SetUserRoleResult({
    required this.uid,
    required this.role,
    required this.changed,
  });

  final String uid;
  final AppRole role;
  final bool changed;

  factory SetUserRoleResult.fromCallableData(Object? data) {
    if (data is! Map) {
      throw const FormatException('La Function respondio con datos invalidos.');
    }

    final uid = data['uid'];
    final role = data['role'];
    final changed = data['changed'];

    if (uid is! String || uid.trim().isEmpty) {
      throw const FormatException('La respuesta no incluye uid valido.');
    }

    if (role is! String) {
      throw const FormatException('La respuesta no incluye rol valido.');
    }

    final parsedRole = appRoleFromClaim(role);
    if (parsedRole == AppRole.unknown) {
      throw const FormatException('La respuesta incluye un rol desconocido.');
    }

    if (changed is! bool) {
      throw const FormatException('La respuesta no incluye changed valido.');
    }

    return SetUserRoleResult(uid: uid, role: parsedRole, changed: changed);
  }
}

class SetUserDisabledStatusResult {
  const SetUserDisabledStatusResult({
    required this.uid,
    required this.disabled,
    required this.active,
    required this.changed,
  });

  final String uid;
  final bool disabled;
  final bool active;
  final bool changed;

  factory SetUserDisabledStatusResult.fromCallableData(Object? data) {
    if (data is! Map) {
      throw const FormatException('La Function respondio con datos invalidos.');
    }

    final uid = data['uid'];
    final disabled = data['disabled'];
    final active = data['active'];
    final changed = data['changed'];

    if (uid is! String || uid.trim().isEmpty) {
      throw const FormatException('La respuesta no incluye uid valido.');
    }

    if (disabled is! bool || active is! bool || changed is! bool) {
      throw const FormatException('La respuesta no incluye estado valido.');
    }

    return SetUserDisabledStatusResult(
      uid: uid,
      disabled: disabled,
      active: active,
      changed: changed,
    );
  }
}

class DeleteUserResult {
  const DeleteUserResult({required this.uid});

  final String uid;

  factory DeleteUserResult.fromCallableData(Object? data) {
    if (data is! Map) {
      throw const FormatException('La Function respondio con datos invalidos.');
    }

    final uid = data['uid'];
    if (uid is! String || uid.trim().isEmpty) {
      throw const FormatException('La respuesta no incluye uid valido.');
    }

    return DeleteUserResult(uid: uid);
  }
}

class FunctionsService {
  FunctionsService({FirebaseFunctions? functions, FirebaseAuth? auth})
    : _functions = functions ?? configuredFirebaseFunctions(),
      _auth = auth ?? FirebaseAuth.instance;

  // firebase_auth -> identidad y sesion del usuario actual.
  // cloud_firestore -> datos leidos en realtime.
  // cloud_functions -> ejecuta logica backend que no debe vivir en Flutter.
  final FirebaseFunctions _functions;
  final FirebaseAuth _auth;

  Future<CreateUserResult> createUser({
    required String name,
    required String email,
    required String password,
    required AppRole role,
  }) async {
    final callable = _functions.httpsCallable('createUser');

    // Al usar Callable Functions, el SDK oficial puede adjuntar la sesion de
    // Firebase Authentication. Flutter no envia manualmente el uid del admin,
    // el rol del admin ni el ID Token completo como campos de negocio.
    final result = await callable.call<Map<String, dynamic>>({
      'name': name,
      'email': email,
      'password': password,
      'role': role.value,
    });

    return CreateUserResult.fromCallableData(result.data);
  }

  Future<UpdateUserResult> updateUser({
    required String uid,
    required String name,
    required String email,
  }) async {
    final callable = _functions.httpsCallable('updateUser');

    final result = await callable.call<Map<String, dynamic>>({
      'uid': uid,
      'name': name,
      'email': email,
    });
    final parsed = UpdateUserResult.fromCallableData(result.data);

    if (_auth.currentUser?.uid == parsed.uid) {
      // La validacion Flutter ayuda a la UX; la Function es la frontera real
      // de negocio. reload() evita mostrar email/displayName antiguo si el
      // admin edita su propio usuario.
      await _auth.currentUser?.reload();
    }

    return parsed;
  }

  Future<SetUserRoleResult> setUserRole({
    required String uid,
    required AppRole role,
  }) async {
    final callable = _functions.httpsCallable('setUserRole');

    final result = await callable.call<Map<String, dynamic>>({
      'uid': uid,
      'role': role.value,
    });

    return SetUserRoleResult.fromCallableData(result.data);
  }

  Future<SetUserDisabledStatusResult> setUserDisabledStatus({
    required String uid,
    required bool disabled,
  }) async {
    final callable = _functions.httpsCallable('setUserDisabledStatus');

    final result = await callable.call<Map<String, dynamic>>({
      'uid': uid,
      'disabled': disabled,
    });

    return SetUserDisabledStatusResult.fromCallableData(result.data);
  }

  Future<DeleteUserResult> deleteUser({required String uid}) async {
    final callable = _functions.httpsCallable('deleteUser');

    final result = await callable.call<Map<String, dynamic>>({'uid': uid});

    return DeleteUserResult.fromCallableData(result.data);
  }

  static String readableFunctionsError(Object error) {
    if (error is FirebaseFunctionsException) {
      debugPrint('FirebaseFunctionsException: ${error.code}');

      switch (error.code) {
        case 'already-exists':
          return 'Ya existe una cuenta con ese email.';
        case 'invalid-argument':
          return error.message ?? 'Revisa los datos ingresados.';
        case 'permission-denied':
          return 'No tienes permisos para crear usuarios.';
        case 'unauthenticated':
          return 'Debes iniciar sesion para crear usuarios.';
        case 'unavailable':
          return 'No se pudo conectar con Cloud Functions.';
        default:
          return 'Cloud Functions no pudo completar la operacion.';
      }
    }

    if (error is FormatException) {
      debugPrint('Respuesta inesperada de Cloud Functions: ${error.message}');
      return 'La respuesta del servidor tuvo un formato inesperado.';
    }

    debugPrint('Error no esperado en FunctionsService: $error');
    return 'Ocurrio un error al crear el usuario.';
  }

  static String readableUpdateUserError(Object error) {
    if (error is FirebaseFunctionsException) {
      debugPrint('FirebaseFunctionsException updateUser: ${error.code}');

      switch (error.code) {
        case 'already-exists':
          return 'Ese correo ya pertenece a otra cuenta.';
        case 'failed-precondition':
          return 'Los datos del usuario estan incompletos o inconsistentes.';
        case 'invalid-argument':
          return error.message ?? 'Revisa los datos ingresados.';
        case 'not-found':
          return 'El usuario no existe.';
        case 'permission-denied':
          return 'No tienes permisos para editar usuarios.';
        case 'unauthenticated':
          return 'Debes iniciar sesion para editar usuarios.';
        case 'unavailable':
          return 'No se pudo conectar con Cloud Functions.';
        default:
          return 'Cloud Functions no pudo completar la edicion.';
      }
    }

    if (error is FormatException) {
      debugPrint('Respuesta inesperada de updateUser: ${error.message}');
      return 'La respuesta del servidor tuvo un formato inesperado.';
    }

    debugPrint('Error no esperado en updateUser: $error');
    return 'Ocurrio un error al editar el usuario.';
  }

  static String readableSetUserRoleError(Object error) {
    if (error is FirebaseFunctionsException) {
      debugPrint('FirebaseFunctionsException setUserRole: ${error.code}');

      switch (error.code) {
        case 'failed-precondition':
          return 'El usuario no puede modificarse en su estado actual.';
        case 'invalid-argument':
          return error.message ?? 'El rol seleccionado no es valido.';
        case 'not-found':
          return 'El usuario no existe.';
        case 'permission-denied':
          return 'No tienes permisos para cambiar roles.';
        case 'unauthenticated':
          return 'Debes iniciar sesion.';
        case 'unavailable':
          return 'No se pudo conectar con Cloud Functions.';
        default:
          return 'Cloud Functions no pudo completar el cambio de rol.';
      }
    }

    if (error is FormatException) {
      debugPrint('Respuesta inesperada de setUserRole: ${error.message}');
      return 'La respuesta del servidor tuvo un formato inesperado.';
    }

    debugPrint('Error no esperado en setUserRole: $error');
    return 'Ocurrio un error al cambiar el rol.';
  }

  static String readableSetUserDisabledStatusError(Object error) {
    if (error is FirebaseFunctionsException) {
      debugPrint(
        'FirebaseFunctionsException setUserDisabledStatus: ${error.code}',
      );

      switch (error.code) {
        case 'failed-precondition':
          return 'El estado actual del usuario es inconsistente o la operacion no esta permitida.';
        case 'invalid-argument':
          return error.message ?? 'Los datos enviados no son validos.';
        case 'not-found':
          return 'El usuario no existe.';
        case 'permission-denied':
          return 'No tienes permisos para cambiar el estado de usuarios.';
        case 'unauthenticated':
          return 'Debes iniciar sesion.';
        case 'unavailable':
          return 'No se pudo conectar con Cloud Functions.';
        default:
          return 'Cloud Functions no pudo completar el cambio de estado.';
      }
    }

    if (error is FormatException) {
      debugPrint(
        'Respuesta inesperada de setUserDisabledStatus: ${error.message}',
      );
      return 'La respuesta del servidor tuvo un formato inesperado.';
    }

    debugPrint('Error no esperado en setUserDisabledStatus: $error');
    return 'Ocurrio un error al cambiar el estado del usuario.';
  }

  static String readableDeleteUserError(Object error) {
    if (error is FirebaseFunctionsException) {
      debugPrint('FirebaseFunctionsException deleteUser: ${error.code}');

      switch (error.code) {
        case 'failed-precondition':
          return 'El usuario no puede eliminarse porque sus datos estan incompletos o inconsistentes.';
        case 'invalid-argument':
          return error.message ?? 'Los datos enviados no son validos.';
        case 'internal':
          return 'No se pudo completar la eliminacion.';
        case 'not-found':
          return 'El usuario no existe.';
        case 'permission-denied':
          return 'No tienes permisos para eliminar usuarios.';
        case 'unauthenticated':
          return 'Debes iniciar sesion.';
        case 'unavailable':
          return 'No se pudo conectar con Cloud Functions.';
        default:
          return 'Cloud Functions no pudo completar la eliminacion.';
      }
    }

    if (error is FormatException) {
      debugPrint('Respuesta inesperada de deleteUser: ${error.message}');
      return 'La respuesta del servidor tuvo un formato inesperado.';
    }

    debugPrint('Error no esperado en deleteUser: $error');
    return 'Ocurrio un error al eliminar el usuario.';
  }
}
