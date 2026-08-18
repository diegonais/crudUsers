import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../models/app_user.dart';
import '../services/auth_service.dart';
import '../services/functions_service.dart';
import '../services/user_service.dart';
import 'change_user_role_screen.dart';
import 'create_user_screen.dart';
import 'edit_user_screen.dart';

class AdminProfilesScreen extends StatefulWidget {
  const AdminProfilesScreen({
    super.key,
    UserService? userService,
    FunctionsService? functionsService,
    AuthService? authService,
    String? currentUid,
  }) : _userService = userService,
       _functionsService = functionsService,
       _authService = authService,
       _currentUid = currentUid;

  final UserService? _userService;
  final FunctionsService? _functionsService;
  final AuthService? _authService;
  final String? _currentUid;

  @override
  State<AdminProfilesScreen> createState() => _AdminProfilesScreenState();
}

class _AdminProfilesScreenState extends State<AdminProfilesScreen> {
  String? _busyUid;
  bool _isSigningOut = false;

  UserService get _userService => widget._userService ?? UserService();
  FunctionsService get _functionsService {
    return widget._functionsService ?? FunctionsService();
  }

  AuthService get _authService => widget._authService ?? AuthService();

  @override
  Widget build(BuildContext context) {
    final currentUid =
        widget._currentUid ?? FirebaseAuth.instance.currentUser?.uid;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Administracion de usuarios'),
        actions: [
          IconButton(
            tooltip: 'Cerrar sesion',
            onPressed: _isSigningOut ? null : _signOut,
            icon: _isSigningOut
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.logout),
          ),
        ],
      ),
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

            final profiles = [...snapshot.data ?? const <AppUser>[]]
              ..sort(
                (a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()),
              );

            return AdminProfilesList(
              profiles: profiles,
              currentUid: currentUid,
              busyUid: _busyUid,
              onCreateUser: _openCreateUser,
              onActionSelected: _handleProfileAction,
            );
          },
        ),
      ),
    );
  }

  Future<void> _signOut() async {
    setState(() {
      _isSigningOut = true;
    });

    try {
      await _authService.signOut();
    } finally {
      if (mounted) {
        setState(() {
          _isSigningOut = false;
        });
      }
    }
  }

  Future<void> _openCreateUser() async {
    await Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const CreateUserScreen()));
    // No refrescamos manualmente el listado: watchProfiles() usa snapshots()
    // y recibira el cambio escrito por Cloud Functions.
  }

  void _handleProfileAction(AdminProfileActionSelection selection) {
    final action = selection.action;
    final profile = selection.profile;
    final isCurrentUser =
        profile.uid ==
        (widget._currentUid ?? FirebaseAuth.instance.currentUser?.uid);

    switch (action) {
      case AdminProfileAction.edit:
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => EditUserScreen(profile: profile)),
        );
      case AdminProfileAction.changeRole:
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ChangeUserRoleScreen(
              profile: profile,
              isCurrentUser: isCurrentUser,
            ),
          ),
        );
      case AdminProfileAction.toggleDisabled:
        _confirmAndSetDisabled(profile);
      case AdminProfileAction.delete:
        _confirmAndDelete(profile);
    }
  }

  Future<void> _confirmAndSetDisabled(AppUser profile) async {
    final disabled = profile.active;
    final message = disabled
        ? 'Esta cuenta dejara de poder utilizar normalmente la aplicacion. Deshabilitar es reversible y conserva sus datos.'
        : 'La cuenta recuperara el acceso. Sus datos se mantienen conservados.';

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
              child: Text(disabled ? 'Deshabilitar' : 'Habilitar'),
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
                      ? 'Usuario deshabilitado.'
                      : 'Usuario habilitado.')
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

enum AdminProfileAction { edit, changeRole, toggleDisabled, delete }

class AdminProfileActionSelection {
  const AdminProfileActionSelection({
    required this.action,
    required this.profile,
  });

  final AdminProfileAction action;
  final AppUser profile;
}

class AdminProfilesList extends StatelessWidget {
  const AdminProfilesList({
    super.key,
    required this.profiles,
    required this.currentUid,
    required this.busyUid,
    required this.onCreateUser,
    required this.onActionSelected,
  });

  final List<AppUser> profiles;
  final String? currentUid;
  final String? busyUid;
  final VoidCallback onCreateUser;
  final ValueChanged<AdminProfileActionSelection> onActionSelected;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: FilledButton.icon(
            onPressed: onCreateUser,
            icon: const Icon(Icons.person_add),
            label: const Text('Crear usuario'),
          ),
        ),
        Expanded(
          child: profiles.isEmpty
              ? const _Message(text: 'No hay usuarios disponibles.')
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  itemCount: profiles.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final profile = profiles[index];

                    return _AdminProfileTile(
                      profile: profile,
                      isCurrentUser: profile.uid == currentUid,
                      isBusy: busyUid == profile.uid,
                      onSelected: (action) {
                        onActionSelected(
                          AdminProfileActionSelection(
                            action: action,
                            profile: profile,
                          ),
                        );
                      },
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _AdminProfileTile extends StatelessWidget {
  const _AdminProfileTile({
    required this.profile,
    required this.isCurrentUser,
    required this.isBusy,
    required this.onSelected,
  });

  final AppUser profile;
  final bool isCurrentUser;
  final bool isBusy;
  final ValueChanged<AdminProfileAction> onSelected;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 0, vertical: 8),
      title: Text(profile.name),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(profile.email),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _InfoChip(
                  icon: Icons.verified_user_outlined,
                  label: _roleLabel(profile.role),
                ),
                _InfoChip(
                  icon: profile.active
                      ? Icons.check_circle_outline
                      : Icons.block,
                  label: profile.active ? 'Activo' : 'Deshabilitado',
                ),
              ],
            ),
          ],
        ),
      ),
      trailing: isBusy
          ? const SizedBox.square(
              dimension: 24,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : PopupMenuButton<AdminProfileAction>(
              tooltip: 'Acciones de usuario',
              onSelected: onSelected,
              itemBuilder: (context) => _menuItems(context),
            ),
    );
  }

  List<PopupMenuEntry<AdminProfileAction>> _menuItems(BuildContext context) {
    final deleteColor = Theme.of(context).colorScheme.error;

    final items = <PopupMenuEntry<AdminProfileAction>>[
      const PopupMenuItem(
        value: AdminProfileAction.edit,
        child: _MenuAction(icon: Icons.edit, label: 'Editar'),
      ),
    ];

    // Ocultamos acciones sobre la cuenta actual por UX, pero la seguridad real
    // sigue viviendo en las Cloud Functions, que vuelven a rechazar esos casos.
    if (!isCurrentUser) {
      items
        ..add(
          const PopupMenuItem(
            value: AdminProfileAction.changeRole,
            child: _MenuAction(icon: Icons.verified_user, label: 'Cambiar rol'),
          ),
        )
        ..add(
          PopupMenuItem(
            value: AdminProfileAction.toggleDisabled,
            child: _MenuAction(
              icon: profile.active ? Icons.block : Icons.check_circle_outline,
              label: profile.active ? 'Deshabilitar' : 'Habilitar',
            ),
          ),
        )
        ..add(const PopupMenuDivider())
        ..add(
          PopupMenuItem(
            value: AdminProfileAction.delete,
            child: _MenuAction(
              icon: Icons.delete_forever,
              label: 'Eliminar',
              color: deleteColor,
            ),
          ),
        );
    }

    return items;
  }

  String _roleLabel(String role) {
    switch (role) {
      case 'admin':
        return 'Admin';
      case 'user':
        return 'User';
      default:
        return role;
    }
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Chip(
      avatar: Icon(icon, size: 18),
      label: Text(label),
      visualDensity: VisualDensity.compact,
    );
  }
}

class _MenuAction extends StatelessWidget {
  const _MenuAction({required this.icon, required this.label, this.color});

  final IconData icon;
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: color),
        const SizedBox(width: 12),
        Text(label, style: TextStyle(color: color)),
      ],
    );
  }
}

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
