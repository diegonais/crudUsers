import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../models/app_role.dart';
import '../screens/home_screen.dart';
import '../services/auth_service.dart';
import '../services/role_service.dart';

class RoleGate extends StatefulWidget {
  const RoleGate({
    super.key,
    required this.user,
    required this.authService,
    RoleService? roleService,
  }) : _roleService = roleService;

  final User user;
  final AuthService authService;
  final RoleService? _roleService;

  @override
  State<RoleGate> createState() => _RoleGateState();
}

class _RoleGateState extends State<RoleGate> {
  late Future<RoleInfo> _roleFuture;

  RoleService get _roleService => widget._roleService ?? RoleService();

  @override
  void initState() {
    super.initState();
    _roleFuture = _loadRole(forceRefresh: false);
  }

  @override
  void didUpdateWidget(RoleGate oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.user.uid != widget.user.uid) {
      _roleFuture = _loadRole(forceRefresh: false);
    }
  }

  Future<RoleInfo> _loadRole({required bool forceRefresh}) {
    debugPrint('Usuario autenticado: ${widget.user.uid}');
    return _roleService.getRoleFromToken(
      widget.user,
      forceRefresh: forceRefresh,
    );
  }

  void _refreshRole() {
    setState(() {
      _roleFuture = _loadRole(forceRefresh: true);
    });
  }

  Future<void> _signOut() {
    return widget.authService.signOut();
  }

  @override
  Widget build(BuildContext context) {
    // authStateChanges() confirma la sesion; RoleGate lee el Custom Claim role
    // del ID Token para decidir que interfaz mostrar. Firestore volvera a
    // verificar ese mismo claim en Security Rules con request.auth.token.role.
    return FutureBuilder<RoleInfo>(
      future: _roleFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        if (snapshot.hasError) {
          return _RoleMessageScreen(
            title: 'No se pudo leer el rol',
            message:
                'Firebase Authentication inicio sesion, pero no pudimos leer los Custom Claims del ID Token.',
            onRefreshRole: _refreshRole,
            onSignOut: _signOut,
            isError: true,
          );
        }

        final roleInfo = snapshot.data;

        switch (roleInfo?.role) {
          case AppRole.admin:
            return HomeScreen(
              title: 'AdminHome',
              user: widget.user,
              authService: widget.authService,
              roleInfo: roleInfo!,
              onRefreshRole: _refreshRole,
              showAdminReadTest: true,
            );
          case AppRole.user:
            return HomeScreen(
              title: 'UserHome',
              user: widget.user,
              authService: widget.authService,
              roleInfo: roleInfo!,
              onRefreshRole: _refreshRole,
            );
          case AppRole.unknown:
          case null:
            return _RoleMessageScreen(
              title: 'Rol no configurado',
              message:
                  'No existe un rol asignado a esta cuenta en el ID Token. La app no la tratara como admin.',
              onRefreshRole: _refreshRole,
              onSignOut: _signOut,
            );
        }
      },
    );
  }
}

class _RoleMessageScreen extends StatelessWidget {
  const _RoleMessageScreen({
    required this.title,
    required this.message,
    required this.onRefreshRole,
    required this.onSignOut,
    this.isError = false,
  });

  final String title;
  final String message;
  final VoidCallback onRefreshRole;
  final Future<void> Function() onSignOut;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
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
                          color: isError
                              ? Theme.of(context).colorScheme.error
                              : null,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton(
                    onPressed: onRefreshRole,
                    child: const Text('Refrescar token'),
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: onSignOut,
                    child: const Text('Cerrar sesion'),
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
