import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../screens/login_screen.dart';
import '../services/auth_service.dart';
import 'role_gate.dart';

class AuthGate extends StatelessWidget {
  const AuthGate({super.key, AuthService? authService})
    : _authService = authService;

  final AuthService? _authService;

  @override
  Widget build(BuildContext context) {
    final authService = _authService ?? AuthService();

    // Usamos un Stream porque la sesion puede cambiar mientras la app esta
    // abierta: login, logout o restauracion automatica al reiniciar la app.
    return StreamBuilder<User?>(
      stream: authService.authStateChanges,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        final user = snapshot.data;

        // User? puede ser null porque Firebase Auth todavia no tiene una
        // cuenta autenticada. Firebase debe ser la fuente de verdad de la
        // sesion; la interfaz se decide desde este estado, no desde una
        // variable manual como bool isLoggedIn.
        if (user == null) {
          return LoginScreen(authService: authService);
        }

        return RoleGate(user: user, authService: authService);
      },
    );
  }
}
