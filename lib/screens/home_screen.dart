import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../models/app_user.dart';
import '../services/auth_service.dart';
import '../services/user_service.dart';
import 'user_directory_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.user,
    AuthService? authService,
    UserService? userService,
  }) : _authService = authService,
       _userService = userService;

  final User user;
  final AuthService? _authService;
  final UserService? _userService;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _isSigningOut = false;
  String? _errorMessage;

  AuthService get _authService => widget._authService ?? AuthService();
  UserService get _userService => widget._userService ?? UserService();

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

  void _openDirectory() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => UserDirectoryScreen(userService: _userService),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final authEmail = widget.user.email ?? 'Sin email disponible';

    return Scaffold(
      appBar: AppBar(title: const Text('Mi perfil')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 620),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Datos de Authentication',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 12),
                  _InfoTile(label: 'UID', value: widget.user.uid),
                  const SizedBox(height: 12),
                  _InfoTile(label: 'Email', value: authEmail),
                  const SizedBox(height: 28),
                  Text(
                    'Datos de Firestore',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 12),
                  StreamBuilder<AppUser?>(
                    stream: _userService.watchUserById(widget.user.uid),
                    builder: (context, snapshot) {
                      if (snapshot.connectionState == ConnectionState.waiting) {
                        return const Center(child: CircularProgressIndicator());
                      }

                      if (snapshot.hasError) {
                        return _MessageBox(
                          message: UserService.readableFirestoreError(
                            snapshot.error!,
                          ),
                          isError: true,
                        );
                      }

                      final profile = snapshot.data;

                      if (profile == null) {
                        return const _MessageBox(
                          message:
                              'No se encontro un perfil asociado a esta cuenta.',
                        );
                      }

                      return _ProfileDetails(profile: profile);
                    },
                  ),
                  const SizedBox(height: 24),
                  OutlinedButton(
                    onPressed: _openDirectory,
                    child: const Text('Ver usuarios'),
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: _isSigningOut ? null : _signOut,
                    child: _isSigningOut
                        ? const SizedBox.square(
                            dimension: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Cerrar sesion'),
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
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ProfileDetails extends StatelessWidget {
  const _ProfileDetails({required this.profile});

  final AppUser profile;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _InfoTile(label: 'Nombre', value: profile.name),
        const SizedBox(height: 12),
        _InfoTile(label: 'Email', value: profile.email),
        const SizedBox(height: 12),
        _InfoTile(label: 'UID', value: profile.uid),
        const SizedBox(height: 12),
        _InfoTile(label: 'Rol', value: profile.role),
        const SizedBox(height: 12),
        _InfoTile(
          label: 'Estado',
          value: profile.active ? 'Activo' : 'Inactivo',
        ),
        const SizedBox(height: 12),
        _MessageBox(
          message:
              'El perfil viene de user_profiles/${profile.uid}. Si cambias este documento en Firebase Console, snapshots() emitira otro DocumentSnapshot y esta vista se actualizara.',
        ),
      ],
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

class _MessageBox extends StatelessWidget {
  const _MessageBox({required this.message, this.isError = false});

  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(
          color: isError
              ? Theme.of(context).colorScheme.error
              : Theme.of(context).colorScheme.outlineVariant,
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Text(
          message,
          style: TextStyle(
            color: isError ? Theme.of(context).colorScheme.error : null,
          ),
        ),
      ),
    );
  }
}
