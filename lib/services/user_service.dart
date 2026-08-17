import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../models/app_user.dart';

class UserService {
  UserService({FirebaseFirestore? firestore})
    : _firestore = firestore ?? FirebaseFirestore.instance;

  // FirebaseFirestore.instance nos proporciona acceso al cliente de Cloud
  // Firestore asociado al proyecto Firebase inicializado previamente mediante
  // Firebase.initializeApp().
  //
  // FirebaseFirestore.instance
  //   -> Cloud Firestore
  //   -> colecciones
  //   -> documentos
  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _profilesCollection {
    // CollectionReference representa una referencia a una coleccion, no los
    // datos ya descargados. collection() apunta a esa coleccion: aqui
    // user_profiles contiene un documento por cuenta autenticada.
    return _firestore.collection('user_profiles');
  }

  CollectionReference<Map<String, dynamic>> get _directoryCollection {
    // user_directory es una coleccion separada con datos limitados para listar
    // usuarios sin descargar informacion interna como email o active.
    return _firestore.collection('user_directory');
  }

  DocumentReference<Map<String, dynamic>> userProfileDocument(String uid) {
    // DocumentReference representa la ubicacion de un documento concreto.
    // doc(uid) no lee todavia; solo construye la ruta user_profiles/{uid}.
    //
    // Utilizamos el UID de Authentication como Document ID en Firestore.
    // De esta manera relacionamos directamente:
    // cuenta autenticada <-> perfil de aplicacion
    // sin generar otro identificador ni hacer una consulta adicional.
    return _profilesCollection.doc(uid);
  }

  Future<AppUser?> getUserById(String uid) async {
    // get() hace una lectura unica: "dame el dato ahora una vez".
    final snapshot = await userProfileDocument(uid).get();
    if (!snapshot.exists) {
      return null;
    }

    return AppUser.fromFirestore(snapshot);
  }

  Stream<AppUser?> watchUserById(String uid) {
    // snapshots() mantiene una suscripcion activa al documento.
    // Cuando Firestore detecta un cambio, el Stream emite un nuevo
    // DocumentSnapshot y Flutter reconstruye la parte de la interfaz que lo usa.
    return userProfileDocument(uid).snapshots().map((snapshot) {
      if (!snapshot.exists) {
        return null;
      }

      return AppUser.fromFirestore(snapshot);
    });
  }

  Stream<List<UserDirectoryEntry>> watchUsers() {
    // snapshots() sobre una coleccion emite QuerySnapshot. QuerySnapshot es el
    // resultado de consultar varios documentos; docs contiene un snapshot por
    // cada documento encontrado en user_directory.
    return _directoryCollection.snapshots().map((snapshot) {
      return snapshot.docs
          .map(UserDirectoryEntry.fromFirestore)
          .toList(growable: false);
    });
  }

  Stream<List<AppUser>> watchProfiles() {
    // Esta lectura administrativa es solo una prueba de autorizacion en Fase 4.
    // Flutter puede ocultar o mostrar esta pantalla, pero Firestore decide si
    // realmente permite la consulta leyendo request.auth.token.role.
    return _profilesCollection.snapshots().map((snapshot) {
      return snapshot.docs.map(AppUser.fromFirestore).toList(growable: false);
    });
  }

  static String readableFirestoreError(Object error) {
    if (error is FirebaseException) {
      debugPrint('FirebaseException de Firestore: ${error.code}');

      switch (error.code) {
        case 'permission-denied':
          return 'Firestore rechazo la lectura. Revisa las Security Rules.';
        case 'unavailable':
          return 'No se pudo conectar con Firestore. Revisa tu conexion.';
        case 'not-found':
          return 'No se encontro el documento solicitado.';
        default:
          return 'Firestore no pudo completar la lectura. Intenta nuevamente.';
      }
    }

    if (error is FormatException) {
      debugPrint('Datos inconsistentes en Firestore: ${error.message}');
      return 'El documento existe, pero sus datos estan incompletos o tienen un formato incorrecto.';
    }

    debugPrint('Error no esperado de Firestore: $error');
    return 'Ocurrio un error al leer Firestore.';
  }
}
