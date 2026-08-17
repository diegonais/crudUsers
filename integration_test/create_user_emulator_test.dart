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

  testWidgets('admin createUser updates Firestore directory snapshots', (
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
    final name = 'Flutter Local $timestamp';
    final email = 'flutter-$timestamp@test.local';
    const password = 'FlutterLocal123!';
    final userService = UserService();

    final directoryFuture = userService
        .watchUsers()
        .firstWhere(
          (entries) => entries.any(
            (entry) => entry.name == name && entry.role == AppRole.user.value,
          ),
        )
        .timeout(const Duration(seconds: 20));

    final result = await FunctionsService().createUser(
      name: name,
      email: email,
      password: password,
      role: AppRole.user,
    );

    expect(result.email, email);
    expect(result.uid, isNotEmpty);

    final directoryEntries = await directoryFuture;
    expect(
      directoryEntries.any(
        (entry) =>
            entry.uid == result.uid &&
            entry.name == name &&
            entry.role == AppRole.user.value,
      ),
      isTrue,
    );

    final profile = await userService.getUserById(result.uid);
    expect(profile, isNotNull);
    expect(profile!.uid, result.uid);
    expect(profile.name, name);
    expect(profile.email, email);
    expect(profile.role, AppRole.user.value);
    expect(profile.active, isTrue);
  });
}
