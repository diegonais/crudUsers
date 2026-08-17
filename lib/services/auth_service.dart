import 'package:firebase_auth/firebase_auth.dart';

class AuthService {
  AuthService({FirebaseAuth? firebaseAuth})
    : _auth = firebaseAuth ?? FirebaseAuth.instance;

  // FirebaseAuth.instance es el punto de entrada al servicio de
  // Authentication para la app Firebase ya inicializada en main.dart.
  // No crea un proyecto nuevo: usa la configuracion de firebase_options.dart.
  final FirebaseAuth _auth;

  // Un User representa la cuenta autenticada que Firebase devolvio despues
  // de validar credenciales. Si no hay sesion activa, currentUser sera null.
  User? get currentUser => _auth.currentUser;

  // FirebaseAuth mantiene internamente la sesion del usuario.
  // authStateChanges() emite un nuevo valor cuando el usuario inicia sesion
  // o cierra sesion, por lo que no necesitamos guardar manualmente un booleano
  // como "isLoggedIn".
  Stream<User?> get authStateChanges => _auth.authStateChanges();

  Future<UserCredential> signIn({
    required String email,
    required String password,
  }) {
    // signInWithEmailAndPassword envia email + password a Firebase
    // Authentication. Si las credenciales son validas devuelve un
    // UserCredential con un User; si no, lanza FirebaseAuthException.
    return _auth.signInWithEmailAndPassword(
      email: email.trim(),
      password: password,
    );
  }

  Future<void> signOut() {
    // signOut() borra la sesion local administrada por Firebase Auth.
    // El AuthGate reaccionara al cambio porque authStateChanges() emitira null.
    return _auth.signOut();
  }

  static String readableAuthError(FirebaseAuthException exception) {
    // FirebaseAuthException contiene un code estable para decidir que mensaje
    // mostrar. No exponemos mensajes tecnicos ni stack traces al usuario.
    switch (exception.code) {
      case 'invalid-credential':
      case 'INVALID_LOGIN_CREDENTIALS':
      case 'user-not-found':
      case 'wrong-password':
        return 'El email o la contrasena no son correctos.';
      case 'invalid-email':
        return 'El formato del email no es valido.';
      case 'user-disabled':
        return 'Esta cuenta fue deshabilitada. Contacta al administrador.';
      case 'too-many-requests':
        return 'Hubo demasiados intentos. Espera un momento e intenta nuevamente.';
      case 'network-request-failed':
        return 'No se pudo conectar con Firebase. Revisa tu conexion a internet.';
      case 'operation-not-allowed':
        return 'El inicio de sesion con email y contrasena no esta habilitado.';
      default:
        return 'No se pudo iniciar sesion. Intenta nuevamente.';
    }
  }
}
