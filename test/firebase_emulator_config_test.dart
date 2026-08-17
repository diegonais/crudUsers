import 'package:crudusers/firebase_emulator_config.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('FirebaseEmulatorConfig', () {
    test('uses loopback host for web', () {
      expect(
        FirebaseEmulatorConfig.emulatorHostForPlatform(
          isWeb: true,
          platform: TargetPlatform.android,
        ),
        '127.0.0.1',
      );
    });

    test('uses Android Emulator host alias for Android', () {
      expect(
        FirebaseEmulatorConfig.emulatorHostForPlatform(
          isWeb: false,
          platform: TargetPlatform.android,
        ),
        '10.0.2.2',
      );
    });

    test('uses loopback host for desktop/mobile hosts other than Android', () {
      expect(
        FirebaseEmulatorConfig.emulatorHostForPlatform(
          isWeb: false,
          platform: TargetPlatform.windows,
        ),
        '127.0.0.1',
      );
    });
  });
}
