import 'package:flutter/material.dart';

import '../models/app_role.dart';
import '../models/app_user.dart';
import '../services/functions_service.dart';
import '../services/user_service.dart';

class ChangeUserRoleScreen extends StatefulWidget {
  const ChangeUserRoleScreen({
    super.key,
    required this.profile,
    this.isCurrentUser = false,
    FunctionsService? functionsService,
    UserService? userService,
  }) : _functionsService = functionsService,
       _userService = userService;

  final AppUser profile;
  final bool isCurrentUser;
  final FunctionsService? _functionsService;
  final UserService? _userService;

  @override
  State<ChangeUserRoleScreen> createState() => _ChangeUserRoleScreenState();
}

class _ChangeUserRoleScreenState extends State<ChangeUserRoleScreen> {
  late AppRole _selectedRole;
  bool _isSubmitting = false;
  String? _errorMessage;

  FunctionsService get _functionsService {
    return widget._functionsService ?? FunctionsService();
  }

  UserService get _userService => widget._userService ?? UserService();

  @override
  void initState() {
    super.initState();
    final currentRole = appRoleFromClaim(widget.profile.role);
    _selectedRole = currentRole == AppRole.unknown ? AppRole.user : currentRole;
  }

  Future<void> _submit() async {
    if (widget.isCurrentUser) {
      setState(() {
        _errorMessage = 'No puedes cambiar tu propio rol desde esta pantalla.';
      });
      return;
    }

    if (!await _confirmRoleChange()) {
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      final result = await _functionsService.setUserRole(
        uid: widget.profile.uid,
        role: _selectedRole,
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result.changed
                ? 'Rol actualizado a ${result.role.value}.'
                : 'No habia cambios de rol para guardar.',
          ),
        ),
      );
      Navigator.of(context).pop();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _errorMessage = FunctionsService.readableSetUserRoleError(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  Future<bool> _confirmRoleChange() async {
    final currentRole = appRoleFromClaim(widget.profile.role);

    if (currentRole == _selectedRole) {
      return true;
    }

    final message = _selectedRole == AppRole.admin
        ? 'Este usuario podra realizar operaciones administrativas.'
        : 'Este usuario dejara de tener permisos administrativos.';

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Confirmar cambio de rol'),
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

    return confirmed ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit = !_isSubmitting && !widget.isCurrentUser;

    return Scaffold(
      appBar: AppBar(title: const Text('Cambiar rol')),
      body: SafeArea(
        child: StreamBuilder<AppUser?>(
          initialData: widget.profile,
          stream: _userService.watchUserById(widget.profile.uid),
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return _CenteredMessage(
                message: UserService.readableFirestoreError(snapshot.error!),
                isError: true,
              );
            }

            final profile = snapshot.data;
            if (profile == null) {
              return const _CenteredMessage(
                message: 'El usuario ya no existe.',
                showBackButton: true,
              );
            }

            return _ChangeRoleBody(
              profile: profile,
              selectedRole: _selectedRole,
              canSubmit: canSubmit,
              isCurrentUser: widget.isCurrentUser,
              isSubmitting: _isSubmitting,
              errorMessage: _errorMessage,
              onRoleChanged: (value) {
                setState(() {
                  _selectedRole = value;
                });
              },
              onSubmit: _submit,
            );
          },
        ),
      ),
    );
  }
}

class _ChangeRoleBody extends StatelessWidget {
  const _ChangeRoleBody({
    required this.profile,
    required this.selectedRole,
    required this.canSubmit,
    required this.isCurrentUser,
    required this.isSubmitting,
    required this.errorMessage,
    required this.onRoleChanged,
    required this.onSubmit,
  });

  final AppUser profile;
  final AppRole selectedRole;
  final bool canSubmit;
  final bool isCurrentUser;
  final bool isSubmitting;
  final String? errorMessage;
  final ValueChanged<AppRole> onRoleChanged;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _ReadOnlyLine(label: 'Usuario', value: profile.name),
              const SizedBox(height: 8),
              _ReadOnlyLine(label: 'Email', value: profile.email),
              const SizedBox(height: 8),
              _ReadOnlyLine(label: 'Rol actual', value: profile.role),
              const SizedBox(height: 16),
              DropdownButtonFormField<AppRole>(
                initialValue: selectedRole,
                decoration: const InputDecoration(
                  labelText: 'Nuevo rol',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: AppRole.user, child: Text('user')),
                  DropdownMenuItem(value: AppRole.admin, child: Text('admin')),
                ],
                onChanged: canSubmit
                    ? (value) {
                        if (value == null) return;
                        onRoleChanged(value);
                      }
                    : null,
              ),
              if (isCurrentUser) ...[
                const SizedBox(height: 16),
                const _MessageBox(
                  message:
                      'La UI bloquea este cambio por conveniencia; la Function tambien lo rechaza como seguridad real.',
                ),
              ],
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: canSubmit ? onSubmit : null,
                icon: isSubmitting
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.verified_user),
                label: const Text('Guardar rol'),
              ),
              if (errorMessage != null) ...[
                const SizedBox(height: 16),
                _MessageBox(message: errorMessage!, isError: true),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _CenteredMessage extends StatelessWidget {
  const _CenteredMessage({
    required this.message,
    this.isError = false,
    this.showBackButton = false,
  });

  final String message;
  final bool isError;
  final bool showBackButton;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _MessageBox(message: message, isError: isError),
              if (showBackButton) ...[
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Volver al listado'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _ReadOnlyLine extends StatelessWidget {
  const _ReadOnlyLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text('$label: ', style: Theme.of(context).textTheme.labelLarge),
        Expanded(child: Text(value)),
      ],
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
