import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:crudusers/services/auth_service.dart';

void main() {
  group('AuthService.readableAuthError', () {
    test('uses a friendly message for invalid credentials', () {
      final message = AuthService.readableAuthError(
        FirebaseAuthException(code: 'invalid-credential'),
      );

      expect(message, 'El email o la contrasena no son correctos.');
    });

    test('uses a friendly message for network errors', () {
      final message = AuthService.readableAuthError(
        FirebaseAuthException(code: 'network-request-failed'),
      );

      expect(
        message,
        'No se pudo conectar con Firebase. Revisa tu conexion a internet.',
      );
    });

    test('uses a friendly message for disabled accounts', () {
      final message = AuthService.readableAuthError(
        FirebaseAuthException(code: 'user-disabled'),
      );

      expect(message, 'Esta cuenta se encuentra deshabilitada.');
    });
  });
}
