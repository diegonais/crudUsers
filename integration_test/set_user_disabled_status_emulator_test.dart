import 'dart:convert';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:crudusers/firebase_emulator_config.dart';
import 'package:crudusers/firebase_options.dart';
import 'package:crudusers/services/auth_service.dart';
import 'package:crudusers/widgets/account_status_gate.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('disabled account session is blocked by realtime status gate', (
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

    final authService = AuthService();
    await authService.signIn(
      email: 'normal@test.local',
      password: 'NormalLocal123!',
    );
    final normalUser = FirebaseAuth.instance.currentUser!;

    await tester.pumpWidget(
      MaterialApp(
        home: AccountStatusGate(user: normalUser, authService: authService),
      ),
    );
    await _pumpUntilFound(tester, find.text('UserHome'));

    final adminToken = await _signInWithPassword(
      email: 'admin@test.local',
      password: 'AdminLocal123!',
    );

    await _callSetUserDisabledStatus(
      idToken: adminToken,
      uid: normalUser.uid,
      disabled: true,
    );

    await _pumpUntilFound(tester, find.text('Cuenta deshabilitada'));

    await expectLater(
      FirebaseFirestore.instance.collection('user_directory').get(),
      throwsA(
        isA<FirebaseException>().having(
          (error) => error.code,
          'code',
          'permission-denied',
        ),
      ),
    );

    final ownProfile = await FirebaseFirestore.instance
        .collection('user_profiles')
        .doc(normalUser.uid)
        .get();
    expect(ownProfile.data()?['active'], isFalse);

    await _callSetUserDisabledStatus(
      idToken: adminToken,
      uid: normalUser.uid,
      disabled: false,
    );
    await FirebaseAuth.instance.currentUser?.reload();
  });
}

Future<void> _pumpUntilFound(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 20),
}) async {
  final end = DateTime.now().add(timeout);

  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isNotEmpty) {
      return;
    }
  }

  expect(finder, findsOneWidget);
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

Future<void> _callSetUserDisabledStatus({
  required String idToken,
  required String uid,
  required bool disabled,
}) async {
  final response = await _postJson(
    Uri.parse(
      'http://${FirebaseEmulatorConfig.host}:'
      '${FirebaseEmulatorConfig.functionsPort}'
      '/${DefaultFirebaseOptions.currentPlatform.projectId}'
      '/${FirebaseEmulatorConfig.functionsRegion}'
      '/setUserDisabledStatus',
    ),
    {
      'data': {'uid': uid, 'disabled': disabled},
    },
    idToken: idToken,
  );

  if (response['error'] != null) {
    throw StateError(
      'setUserDisabledStatus fallo: ${jsonEncode(response['error'])}',
    );
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
