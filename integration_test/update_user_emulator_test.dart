import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:crudusers/firebase_emulator_config.dart';
import 'package:crudusers/firebase_options.dart';
import 'package:crudusers/models/app_role.dart';
import 'package:crudusers/services/functions_service.dart';
import 'package:crudusers/services/user_service.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('admin updateUser is reflected by Firestore snapshots', (
    tester,
  ) async {
    expect(
      FirebaseEmulatorConfig.useEmulators,
      isTrue,
      reason: 'Ejecuta con --dart-define=USE_FIREBASE_EMULATORS=true.',
    );

    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    await configureFirebaseEmulators();

    final auth = FirebaseAuth.instance;
    await auth.signInWithEmailAndPassword(
      email: 'admin@test.local',
      password: 'AdminLocal123!',
    );

    final tokenResult = await auth.currentUser!.getIdTokenResult(true);
    expect(tokenResult.claims?['role'], 'admin');

    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final originalName = 'Editable Local $timestamp';
    final originalEmail = 'editable-$timestamp@test.local';
    final updatedName = 'Editable Local Actualizado $timestamp';
    final updatedEmail = 'editable-updated-$timestamp@test.local';
    const password = 'EditableLocal123!';
    final functionsService = FunctionsService();
    final userService = UserService();

    final created = await functionsService.createUser(
      name: originalName,
      email: originalEmail,
      password: password,
      role: AppRole.user,
    );

    final profileFuture = userService
        .watchUserById(created.uid)
        .firstWhere(
          (profile) =>
              profile?.name == updatedName && profile?.email == updatedEmail,
        )
        .timeout(const Duration(seconds: 20));
    final directoryFuture = userService
        .watchUsers()
        .firstWhere(
          (entries) => entries.any(
            (entry) => entry.uid == created.uid && entry.name == updatedName,
          ),
        )
        .timeout(const Duration(seconds: 20));

    final result = await functionsService.updateUser(
      uid: created.uid,
      name: updatedName,
      email: updatedEmail,
    );

    expect(result.changed, isTrue);
    expect(result.uid, created.uid);

    final profile = await profileFuture;
    expect(profile, isNotNull);
    expect(profile!.name, updatedName);
    expect(profile.email, updatedEmail);

    final directoryEntries = await directoryFuture;
    expect(
      directoryEntries.any(
        (entry) => entry.uid == created.uid && entry.name == updatedName,
      ),
      isTrue,
    );

    final directorySnapshot = await FirebaseFirestore.instance
        .collection('user_directory')
        .doc(created.uid)
        .get();
    expect(directorySnapshot.data()?.containsKey('email'), isFalse);
  });
}
