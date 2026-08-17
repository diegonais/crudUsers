import 'package:flutter/material.dart';

import '../models/app_role.dart';
import '../services/functions_service.dart';

class CreateUserScreen extends StatefulWidget {
  const CreateUserScreen({super.key, FunctionsService? functionsService})
    : _functionsService = functionsService;

  final FunctionsService? _functionsService;

  @override
  State<CreateUserScreen> createState() => _CreateUserScreenState();
}

class _CreateUserScreenState extends State<CreateUserScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  AppRole _selectedRole = AppRole.user;
  bool _isSubmitting = false;
  String? _errorMessage;
  String? _successMessage;

  FunctionsService get _functionsService {
    return widget._functionsService ?? FunctionsService();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
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
      _successMessage = null;
    });

    try {
      final result = await _functionsService.createUser(
        name: _nameController.text,
        email: _emailController.text,
        password: _passwordController.text,
        role: _selectedRole,
      );

      _passwordController.clear();

      if (!mounted) return;
      setState(() {
        _successMessage = 'Usuario creado: ${result.email}';
      });
    } catch (error) {
      _passwordController.clear();

      if (!mounted) return;
      setState(() {
        _errorMessage = FunctionsService.readableFunctionsError(error);
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
      appBar: AppBar(title: const Text('Crear usuario')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextFormField(
                      controller: _nameController,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                        labelText: 'Nombre',
                        border: OutlineInputBorder(),
                      ),
                      validator: _requiredText,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                        labelText: 'Email',
                        border: OutlineInputBorder(),
                      ),
                      validator: _emailValidator,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _passwordController,
                      obscureText: true,
                      textInputAction: TextInputAction.done,
                      decoration: const InputDecoration(
                        labelText: 'Contrasena inicial',
                        border: OutlineInputBorder(),
                      ),
                      validator: _passwordValidator,
                      onFieldSubmitted: (_) => _isSubmitting ? null : _submit(),
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<AppRole>(
                      initialValue: _selectedRole,
                      decoration: const InputDecoration(
                        labelText: 'Rol',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: AppRole.user,
                          child: Text('user'),
                        ),
                        DropdownMenuItem(
                          value: AppRole.admin,
                          child: Text('admin'),
                        ),
                      ],
                      onChanged: _isSubmitting
                          ? null
                          : (value) {
                              if (value == null) return;
                              setState(() {
                                _selectedRole = value;
                              });
                            },
                    ),
                    const SizedBox(height: 24),
                    FilledButton.icon(
                      onPressed: _isSubmitting ? null : _submit,
                      icon: _isSubmitting
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.person_add),
                      label: const Text('Crear'),
                    ),
                    if (_errorMessage != null) ...[
                      const SizedBox(height: 16),
                      _MessageBox(message: _errorMessage!, isError: true),
                    ],
                    if (_successMessage != null) ...[
                      const SizedBox(height: 16),
                      _MessageBox(message: _successMessage!),
                    ],
                  ],
                ),
              ),
            ),
          ),
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

  String? _passwordValidator(String? value) {
    final text = value ?? '';
    if (text.isEmpty) {
      return 'Campo requerido';
    }

    if (text.length < 6) {
      return 'Minimo 6 caracteres';
    }

    return null;
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
