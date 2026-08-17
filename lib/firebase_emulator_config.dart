import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

class FirebaseEmulatorConfig {
  FirebaseEmulatorConfig._();

  static const bool useEmulators = bool.fromEnvironment(
    'USE_FIREBASE_EMULATORS',
    defaultValue: false,
  );

  static const String functionsRegion = 'southamerica-west1';
  static const int authPort = int.fromEnvironment(
    'FIREBASE_AUTH_EMULATOR_PORT',
    defaultValue: 9099,
  );
  static const int firestorePort = int.fromEnvironment(
    'FIRESTORE_EMULATOR_PORT',
    defaultValue: 8080,
  );
  static const int functionsPort = int.fromEnvironment(
    'FUNCTIONS_EMULATOR_PORT',
    defaultValue: 5001,
  );

  static String get host => emulatorHostForPlatform();

  static String emulatorHostForPlatform({
    bool isWeb = kIsWeb,
    TargetPlatform? platform,
  }) {
    final resolvedPlatform = platform ?? defaultTargetPlatform;

    if (isWeb) {
      return '127.0.0.1';
    }

    if (resolvedPlatform == TargetPlatform.android) {
      // El Android Emulator corre en una maquina virtual. Desde esa VM,
      // 127.0.0.1 apunta al propio Android; 10.0.2.2 es el alias especial
      // para alcanzar el localhost de Windows donde corren los emuladores.
      return '10.0.2.2';
    }

    return '127.0.0.1';
  }
}

Future<void> configureFirebaseEmulators() async {
  if (!FirebaseEmulatorConfig.useEmulators) {
    return;
  }

  final host = FirebaseEmulatorConfig.host;

  await FirebaseAuth.instance.useAuthEmulator(
    host,
    FirebaseEmulatorConfig.authPort,
    automaticHostMapping: false,
  );

  final firestore = FirebaseFirestore.instance;
  // En pruebas locales, el cache persistente puede mostrar documentos de una
  // corrida anterior aunque el Emulator Suite haya reiniciado vacio. Por eso
  // se desactiva solo cuando USE_FIREBASE_EMULATORS=true.
  firestore.settings = const Settings(persistenceEnabled: false);
  firestore.useFirestoreEmulator(
    host,
    FirebaseEmulatorConfig.firestorePort,
    automaticHostMapping: false,
  );

  configuredFirebaseFunctions().useFunctionsEmulator(
    host,
    FirebaseEmulatorConfig.functionsPort,
    automaticHostMapping: false,
  );
}

FirebaseFunctions configuredFirebaseFunctions() {
  return FirebaseFunctions.instanceFor(
    region: FirebaseEmulatorConfig.functionsRegion,
  );
}
