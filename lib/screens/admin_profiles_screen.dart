import 'package:flutter/material.dart';

import '../models/app_user.dart';
import '../services/user_service.dart';

class AdminProfilesScreen extends StatelessWidget {
  const AdminProfilesScreen({super.key, UserService? userService})
    : _userService = userService;

  final UserService? _userService;

  @override
  Widget build(BuildContext context) {
    final userService = _userService ?? UserService();

    return Scaffold(
      appBar: AppBar(title: const Text('Admin Profiles')),
      body: SafeArea(
        child: StreamBuilder<List<AppUser>>(
          stream: userService.watchProfiles(),
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

                return ListTile(
                  title: Text(profile.name),
                  subtitle: Text(
                    '${profile.email}\nrole: ${profile.role} | active: ${profile.active}',
                  ),
                  isThreeLine: true,
                );
              },
            );
          },
        ),
      ),
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
