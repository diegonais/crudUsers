import 'dart:convert';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:crudusers/firebase_emulator_config.dart';
import 'package:crudusers/firebase_options.dart';
import 'package:crudusers/services/user_service.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('setUserRole updates Firestore before token force refresh', (
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
      email: 'normal@test.local',
      password: 'NormalLocal123!',
    );

    final targetUser = auth.currentUser!;
    final oldToken = await targetUser.getIdTokenResult(true);
    expect(oldToken.claims?['role'], 'user');

    await _expectAdminProfilesDenied();

    final userService = UserService();
    final profileRoleFuture = userService
        .watchUserById(targetUser.uid)
        .firstWhere((profile) => profile?.role == 'admin')
        .timeout(const Duration(seconds: 20));

    final adminToken = await _signInWithPassword(
      email: 'admin@test.local',
      password: 'AdminLocal123!',
    );

    await _callSetUserRole(
      idToken: adminToken,
      uid: targetUser.uid,
      role: 'admin',
    );

    final profile = await profileRoleFuture;
    expect(profile, isNotNull);
    expect(profile!.role, 'admin');

    final stillCachedToken = await targetUser.getIdTokenResult();
    expect(stillCachedToken.claims?['role'], 'user');
    await _expectAdminProfilesDenied();

    final refreshedToken = await targetUser.getIdTokenResult(true);
    expect(refreshedToken.claims?['role'], 'admin');
    await _expectAdminProfilesAllowed();

    await _callSetUserRole(
      idToken: adminToken,
      uid: targetUser.uid,
      role: 'user',
    );
  });
}

Future<String> _signInWithPassword({
  required String email,
  required String password,
}) async {
  final response = await _postJson(
    Uri.parse(
      'http://${FirebaseEmulatorConfig.host}:'
      '${FirebaseEmulatorConfig.authPort}'
      '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword'
      '?key=local-emulator',
    ),
    {'email': email, 'password': password, 'returnSecureToken': true},
  );

  final idToken = response['idToken'];
  if (idToken is! String || idToken.isEmpty) {
    throw StateError('Auth Emulator no devolvio idToken.');
  }

  return idToken;
}

Future<void> _callSetUserRole({
  required String idToken,
  required String uid,
  required String role,
}) async {
  final response = await _postJson(
    Uri.parse(
      'http://${FirebaseEmulatorConfig.host}:'
      '${FirebaseEmulatorConfig.functionsPort}'
      '/${DefaultFirebaseOptions.currentPlatform.projectId}'
      '/${FirebaseEmulatorConfig.functionsRegion}'
      '/setUserRole',
    ),
    {
      'data': {'uid': uid, 'role': role},
    },
    idToken: idToken,
  );

  if (response['error'] != null) {
    throw StateError('setUserRole fallo: ${jsonEncode(response['error'])}');
  }
}

Future<Map<String, dynamic>> _postJson(
  Uri uri,
  Map<String, dynamic> body, {
  String? idToken,
}) async {
  final client = HttpClient();
  try {
    final request = await client.postUrl(uri);
    request.headers.contentType = ContentType.json;
    if (idToken != null) {
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $idToken');
    }
    request.write(jsonEncode(body));

    final response = await request.close();
    final text = await utf8.decodeStream(response);
    final decoded = jsonDecode(text);

    if (decoded is! Map<String, dynamic>) {
      throw StateError('Respuesta JSON inesperada: $text');
    }

    return decoded;
  } finally {
    client.close(force: true);
  }
}

Future<void> _expectAdminProfilesDenied() async {
  await expectLater(
    FirebaseFirestore.instance.collection('user_profiles').get(),
    throwsA(
      isA<FirebaseException>().having(
        (error) => error.code,
        'code',
        'permission-denied',
      ),
    ),
  );
}

Future<void> _expectAdminProfilesAllowed() async {
  final snapshot = await FirebaseFirestore.instance
      .collection('user_profiles')
      .get();
  expect(snapshot.docs, isNotEmpty);
}
