import 'package:flutter/material.dart';

import '../models/app_user.dart';
import '../services/functions_service.dart';
import '../services/user_service.dart';

class EditUserScreen extends StatefulWidget {
  const EditUserScreen({
    super.key,
    required this.profile,
    FunctionsService? functionsService,
    UserService? userService,
  }) : _functionsService = functionsService,
       _userService = userService;

  final AppUser profile;
  final FunctionsService? _functionsService;
  final UserService? _userService;

  @override
  State<EditUserScreen> createState() => _EditUserScreenState();
}

class _EditUserScreenState extends State<EditUserScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _emailController;

  bool _isSubmitting = false;
  String? _errorMessage;

  FunctionsService get _functionsService {
    return widget._functionsService ?? FunctionsService();
  }

  UserService get _userService => widget._userService ?? UserService();

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.profile.name);
    _emailController = TextEditingController(text: widget.profile.email);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final formState = _formKey.currentState;
    if (formState == null || !formState.validate()) {
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      final result = await _functionsService.updateUser(
        uid: widget.profile.uid,
        name: _nameController.text,
        email: _emailController.text,
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result.changed
                ? 'Usuario actualizado.'
                : 'No habia cambios para guardar.',
          ),
        ),
      );
      Navigator.of(context).pop();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _errorMessage = FunctionsService.readableUpdateUserError(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Editar usuario')),
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

            return _EditUserFormBody(
              formKey: _formKey,
              nameController: _nameController,
              emailController: _emailController,
              profile: profile,
              isSubmitting: _isSubmitting,
              errorMessage: _errorMessage,
              onSubmit: _submit,
              requiredTextValidator: _requiredText,
              emailValidator: _emailValidator,
            );
          },
        ),
      ),
    );
  }

  String? _requiredText(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Campo requerido';
    }

    return null;
  }

  String? _emailValidator(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) {
      return 'Campo requerido';
    }

    if (!text.contains('@') || !text.contains('.')) {
      return 'Email invalido';
    }

    return null;
  }
}

class _EditUserFormBody extends StatelessWidget {
  const _EditUserFormBody({
    required this.formKey,
    required this.nameController,
    required this.emailController,
    required this.profile,
    required this.isSubmitting,
    required this.errorMessage,
    required this.onSubmit,
    required this.requiredTextValidator,
    required this.emailValidator,
  });

  final GlobalKey<FormState> formKey;
  final TextEditingController nameController;
  final TextEditingController emailController;
  final AppUser profile;
  final bool isSubmitting;
  final String? errorMessage;
  final VoidCallback onSubmit;
  final FormFieldValidator<String> requiredTextValidator;
  final FormFieldValidator<String> emailValidator;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Form(
            key: formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  controller: nameController,
                  enabled: !isSubmitting,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(
                    labelText: 'Nombre',
                    border: OutlineInputBorder(),
                  ),
                  validator: requiredTextValidator,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: emailController,
                  enabled: !isSubmitting,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.done,
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    border: OutlineInputBorder(),
                  ),
                  validator: emailValidator,
                  onFieldSubmitted: (_) => isSubmitting ? null : onSubmit(),
                ),
                const SizedBox(height: 16),
                _ReadOnlyLine(label: 'Rol', value: profile.role),
                const SizedBox(height: 8),
                _ReadOnlyLine(
                  label: 'Estado',
                  value: profile.active ? 'Activo' : 'Deshabilitado',
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: isSubmitting ? null : onSubmit,
                  icon: isSubmitting
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save),
                  label: const Text('Guardar'),
                ),
                if (errorMessage != null) ...[
                  const SizedBox(height: 16),
                  _MessageBox(message: errorMessage!, isError: true),
                ],
              ],
            ),
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
