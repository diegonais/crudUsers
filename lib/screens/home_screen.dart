import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../services/auth_service.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.user, AuthService? authService})
    : _authService = authService;

  final User user;
  final AuthService? _authService;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _isSigningOut = false;
  String? _errorMessage;

  AuthService get _authService => widget._authService ?? AuthService();

  Future<void> _signOut() async {
    setState(() {
      _isSigningOut = true;
      _errorMessage = null;
    });

    try {
      await _authService.signOut();
      // No navegamos manualmente a Login. signOut() hace que Firebase Auth
      // emita User = null, y AuthGate reconstruye la interfaz desde ese estado.
    } on FirebaseAuthException catch (exception, stackTrace) {
      debugPrint('FirebaseAuthException al cerrar sesion: ${exception.code}');
      debugPrintStack(stackTrace: stackTrace);

      if (!mounted) return;
      setState(() {
        _errorMessage = 'No se pudo cerrar sesion. Intenta nuevamente.';
      });
    } catch (exception, stackTrace) {
      debugPrint('Error no esperado al cerrar sesion: $exception');
      debugPrintStack(stackTrace: stackTrace);

      if (!mounted) return;
      setState(() {
        _errorMessage = 'Ocurrio un error inesperado. Intenta nuevamente.';
      });
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
    final email = widget.user.email ?? 'Sin email disponible';

    return Scaffold(
      appBar: AppBar(title: const Text('Home temporal')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Sesion iniciada',
                    style: Theme.of(context).textTheme.headlineMedium,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  _InfoTile(label: 'Email', value: email),
                  const SizedBox(height: 12),
                  _InfoTile(label: 'UID', value: widget.user.uid),
                  const SizedBox(height: 16),
                  Text(
                    // uid es el identificador unico que Firebase
                    // Authentication asigna a esta cuenta. Mas adelante
                    // podremos utilizar exactamente este UID como ID del
                    // documento correspondiente en Firestore.
                    'Este UID viene de Firebase Authentication. En una fase posterior podra relacionarse con un documento de usuario en Firestore, pero aqui todavia no creamos ningun perfil.',
                    style: Theme.of(context).textTheme.bodyMedium,
                    textAlign: TextAlign.center,
                  ),
                  if (_errorMessage != null) ...[
                    const SizedBox(height: 16),
                    Text(
                      _errorMessage!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                  const SizedBox(height: 24),
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

class _InfoTile extends StatelessWidget {
  const _InfoTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 6),
            SelectableText(value),
          ],
        ),
      ),
    );
  }
}
