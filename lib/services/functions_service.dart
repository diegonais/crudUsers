import 'package:cloud_functions/cloud_functions.dart';
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

class FunctionsService {
  FunctionsService({FirebaseFunctions? functions})
    : _functions = functions ?? configuredFirebaseFunctions();

  // firebase_auth -> identidad y sesion del usuario actual.
  // cloud_firestore -> datos leidos en realtime.
  // cloud_functions -> ejecuta logica backend que no debe vivir en Flutter.
  final FirebaseFunctions _functions;

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
}
