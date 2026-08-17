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

  testWidgets('admin deleteUser removes user from realtime directory', (
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
    final name = 'Delete Flutter $timestamp';
    final email = 'delete-flutter-$timestamp@test.local';
    final functionsService = FunctionsService();
    final userService = UserService();

    final created = await functionsService.createUser(
      name: name,
      email: email,
      password: 'DeleteFlutter123!',
      role: AppRole.user,
    );

    final appearsFuture = userService
        .watchUsers()
        .firstWhere(
          (entries) => entries.any((entry) => entry.uid == created.uid),
        )
        .timeout(const Duration(seconds: 20));
    await appearsFuture;

    final disappearsFuture = userService
        .watchUsers()
        .firstWhere(
          (entries) => entries.every((entry) => entry.uid != created.uid),
        )
        .timeout(const Duration(seconds: 20));

    final deleted = await functionsService.deleteUser(uid: created.uid);
    expect(deleted.uid, created.uid);

    final directoryEntries = await disappearsFuture;
    expect(directoryEntries.every((entry) => entry.uid != created.uid), isTrue);

    final profile = await userService.getUserById(created.uid);
    expect(profile, isNull);
  });
}
