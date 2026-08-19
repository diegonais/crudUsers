// Example only. Do not import this file directly.
//
// Generate your real lib/firebase_options.dart with:
//
//   flutterfire configure
//
// The generated file contains client Firebase configuration for your own
// project. It is intentionally ignored by Git in this repository.

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }

    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      case TargetPlatform.macOS:
        return macos;
      case TargetPlatform.windows:
        return windows;
      case TargetPlatform.linux:
        throw UnsupportedError(
          'FirebaseOptions have not been configured for linux.',
        );
      default:
        throw UnsupportedError(
          'FirebaseOptions are not supported for this platform.',
        );
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'YOUR_WEB_API_KEY',
    appId: 'YOUR_WEB_APP_ID',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    projectId: 'your-firebase-project-id',
    authDomain: 'your-firebase-project-id.firebaseapp.com',
    storageBucket: 'your-firebase-project-id.firebasestorage.app',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'YOUR_ANDROID_API_KEY',
    appId: 'YOUR_ANDROID_APP_ID',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    projectId: 'your-firebase-project-id',
    storageBucket: 'your-firebase-project-id.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'YOUR_IOS_API_KEY',
    appId: 'YOUR_IOS_APP_ID',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    projectId: 'your-firebase-project-id',
    storageBucket: 'your-firebase-project-id.firebasestorage.app',
    iosBundleId: 'com.example.crudusers',
  );

  static const FirebaseOptions macos = FirebaseOptions(
    apiKey: 'YOUR_MACOS_API_KEY',
    appId: 'YOUR_MACOS_APP_ID',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    projectId: 'your-firebase-project-id',
    storageBucket: 'your-firebase-project-id.firebasestorage.app',
    iosBundleId: 'com.example.crudusers',
  );

  static const FirebaseOptions windows = FirebaseOptions(
    apiKey: 'YOUR_WINDOWS_API_KEY',
    appId: 'YOUR_WINDOWS_APP_ID',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    projectId: 'your-firebase-project-id',
    authDomain: 'your-firebase-project-id.firebaseapp.com',
    storageBucket: 'your-firebase-project-id.firebasestorage.app',
  );
}
