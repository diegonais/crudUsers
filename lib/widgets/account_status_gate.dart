import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../models/app_user.dart';
import '../services/auth_service.dart';
import '../services/user_service.dart';
import 'role_gate.dart';

class AccountStatusGate extends StatelessWidget {
  const AccountStatusGate({
    super.key,
    required this.user,
    required this.authService,
    UserService? userService,
  }) : _userService = userService;

  final User user;
  final AuthService authService;
  final UserService? _userService;

  UserService get _resolvedUserService => _userService ?? UserService();

  @override
  Widget build(BuildContext context) {
    // AccountStatusGate es UX: permite observar active=false por snapshots().
    // La seguridad real sigue estando en Authentication, Cloud Functions y
    // Firestore Security Rules.
    return StreamBuilder<AppUser?>(
      stream: _resolvedUserService.watchUserById(user.uid),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        if (snapshot.hasError) {
          return _StatusMessageScreen(
            title: 'No se pudo leer la cuenta',
            message: UserService.readableFirestoreError(snapshot.error!),
            authService: authService,
            isError: true,
          );
        }

        final profile = snapshot.data;
        if (profile == null) {
          return _StatusMessageScreen(
            title: 'Perfil no encontrado',
            message: 'No se encontro un perfil asociado a esta cuenta.',
            authService: authService,
          );
        }

        if (!profile.active) {
          return _StatusMessageScreen(
            title: 'Cuenta deshabilitada',
            message:
                'Tu cuenta se encuentra deshabilitada. Contacta con un administrador si necesitas recuperar el acceso.',
            authService: authService,
          );
        }

        return RoleGate(user: user, authService: authService);
      },
    );
  }
}

class _StatusMessageScreen extends StatefulWidget {
  const _StatusMessageScreen({
    required this.title,
    required this.message,
    required this.authService,
    this.isError = false,
  });

  final String title;
  final String message;
  final AuthService authService;
  final bool isError;

  @override
  State<_StatusMessageScreen> createState() => _StatusMessageScreenState();
}

class _StatusMessageScreenState extends State<_StatusMessageScreen> {
  bool _isSigningOut = false;

  Future<void> _signOut() async {
    setState(() {
      _isSigningOut = true;
    });

    try {
      await widget.authService.signOut();
    } finally {
      if (mounted) {
        setState(() {
          _isSigningOut = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  DecoratedBox(
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: widget.isError
                            ? Theme.of(context).colorScheme.error
                            : Theme.of(context).colorScheme.outlineVariant,
                      ),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        widget.message,
                        style: TextStyle(
                          color: widget.isError
                              ? Theme.of(context).colorScheme.error
                              : null,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _isSigningOut ? null : _signOut,
                    child: _isSigningOut
                        ? const SizedBox.square(
                            dimension: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Cerrar sesion'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
