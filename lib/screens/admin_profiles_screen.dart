import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../models/app_user.dart';
import '../services/functions_service.dart';
import '../services/user_service.dart';
import 'change_user_role_screen.dart';
import 'edit_user_screen.dart';

class AdminProfilesScreen extends StatefulWidget {
  const AdminProfilesScreen({
    super.key,
    UserService? userService,
    FunctionsService? functionsService,
  }) : _userService = userService,
       _functionsService = functionsService;

  final UserService? _userService;
  final FunctionsService? _functionsService;

  @override
  State<AdminProfilesScreen> createState() => _AdminProfilesScreenState();
}

class _AdminProfilesScreenState extends State<AdminProfilesScreen> {
  String? _busyUid;

  UserService get _userService => widget._userService ?? UserService();
  FunctionsService get _functionsService {
    return widget._functionsService ?? FunctionsService();
  }

  @override
  Widget build(BuildContext context) {
    final currentUid = FirebaseAuth.instance.currentUser?.uid;

    return Scaffold(
      appBar: AppBar(title: const Text('Admin Profiles')),
      body: SafeArea(
        child: StreamBuilder<List<AppUser>>(
          stream: _userService.watchProfiles(),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }

            if (snapshot.hasError) {
              return _Message(
                text: UserService.readableFirestoreError(snapshot.error!),
                isError: true,
              );
            }

            final profiles = snapshot.data ?? const <AppUser>[];

            if (profiles.isEmpty) {
              return const _Message(
                text: 'Todavia no hay documentos en user_profiles.',
              );
            }

            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: profiles.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final profile = profiles[index];
                final isCurrentUser = profile.uid == currentUid;
                final isBusy = _busyUid == profile.uid;

                return ListTile(
                  title: Text(profile.name),
                  subtitle: Text(
                    '${profile.email}\nrole: ${profile.role} | Estado: ${profile.active ? 'Activo' : 'Deshabilitado'}',
                  ),
                  isThreeLine: true,
                  trailing: isBusy
                      ? const SizedBox.square(
                          dimension: 24,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : PopupMenuButton<_AdminProfileAction>(
                          onSelected: (action) {
                            switch (action) {
                              case _AdminProfileAction.edit:
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        EditUserScreen(profile: profile),
                                  ),
                                );
                              case _AdminProfileAction.changeRole:
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => ChangeUserRoleScreen(
                                      profile: profile,
                                      isCurrentUser: isCurrentUser,
                                    ),
                                  ),
                                );
                              case _AdminProfileAction.toggleDisabled:
                                _confirmAndSetDisabled(profile);
                              case _AdminProfileAction.delete:
                                _confirmAndDelete(profile);
                            }
                          },
                          itemBuilder: (context) => [
                            const PopupMenuItem(
                              value: _AdminProfileAction.edit,
                              child: ListTile(
                                leading: Icon(Icons.edit),
                                title: Text('Editar'),
                              ),
                            ),
                            PopupMenuItem(
                              value: _AdminProfileAction.changeRole,
                              enabled: !isCurrentUser,
                              child: const ListTile(
                                leading: Icon(Icons.verified_user),
                                title: Text('Cambiar rol'),
                              ),
                            ),
                            PopupMenuItem(
                              value: _AdminProfileAction.toggleDisabled,
                              enabled: !isCurrentUser,
                              child: ListTile(
                                leading: Icon(
                                  profile.active
                                      ? Icons.block
                                      : Icons.check_circle_outline,
                                ),
                                title: Text(
                                  profile.active ? 'Deshabilitar' : 'Habilitar',
                                ),
                              ),
                            ),
                            PopupMenuItem(
                              value: _AdminProfileAction.delete,
                              enabled: !isCurrentUser,
                              child: const ListTile(
                                leading: Icon(Icons.delete_forever),
                                title: Text('Eliminar usuario'),
                              ),
                            ),
                          ],
                        ),
                );
              },
            );
          },
        ),
      ),
    );
  }

  Future<void> _confirmAndSetDisabled(AppUser profile) async {
    final disabled = profile.active;
    final message = disabled
        ? 'El usuario no podra iniciar nuevas sesiones ni acceder normalmente a la aplicacion.'
        : 'La cuenta podra iniciar sesion y acceder normalmente nuevamente.';

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text(disabled ? 'Deshabilitar cuenta' : 'Habilitar cuenta'),
          content: Text('$message\n\nDeseas continuar?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Continuar'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) {
      return;
    }

    setState(() {
      _busyUid = profile.uid;
    });

    try {
      final result = await _functionsService.setUserDisabledStatus(
        uid: profile.uid,
        disabled: disabled,
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result.changed
                ? (result.disabled
                      ? 'Cuenta deshabilitada.'
                      : 'Cuenta habilitada.')
                : 'No habia cambios de estado para guardar.',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            FunctionsService.readableSetUserDisabledStatusError(error),
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _busyUid = null;
        });
      }
    }
  }

  Future<void> _confirmAndDelete(AppUser profile) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Eliminar usuario'),
          content: const Text(
            'Esta accion eliminara permanentemente:\n\n'
            '- la cuenta de Authentication;\n'
            '- su perfil;\n'
            '- su entrada del directorio.\n\n'
            'Deshabilitar conserva cuenta y datos. Eliminar borra cuenta y datos.\n\n'
            'Esta operacion no se puede deshacer completamente.\n\n'
            'Deseas continuar?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Eliminar'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) {
      return;
    }

    setState(() {
      _busyUid = profile.uid;
    });

    try {
      await _functionsService.deleteUser(uid: profile.uid);

      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Usuario eliminado.')));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(FunctionsService.readableDeleteUserError(error)),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _busyUid = null;
        });
      }
    }
  }
}

enum _AdminProfileAction { edit, changeRole, toggleDisabled, delete }

class _Message extends StatelessWidget {
  const _Message({required this.text, this.isError = false});

  final String text;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          text,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: isError ? Theme.of(context).colorScheme.error : null,
          ),
        ),
      ),
    );
  }
}
