import 'package:cloud_firestore/cloud_firestore.dart';

class AppUser {
  const AppUser({
    required this.uid,
    required this.name,
    required this.email,
    required this.role,
    required this.active,
    required this.createdAt,
    required this.updatedAt,
  });

  final String uid;
  final String name;
  final String email;

  // El campo role almacenado en Firestore pertenece al perfil.
  // Para decisiones de seguridad no confiamos unicamente en el.
  // El rol autorizado se obtiene del ID Token emitido por Firebase
  // Authentication mediante un Custom Claim.
  final String role;
  final bool active;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory AppUser.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> snapshot,
  ) {
    // DocumentSnapshot representa una "foto" de un documento concreto de
    // Firestore en un momento determinado. exists nos dice si el documento
    // user_profiles/{uid} realmente existe antes de intentar leer data().
    if (!snapshot.exists) {
      throw const FormatException('El documento del perfil no existe.');
    }

    // data() devuelve los campos del documento como Map<String, dynamic>.
    // Convertimos ese Map a AppUser para que el resto de la app trabaje con
    // propiedades tipadas en lugar de repetir llaves de texto por todas partes.
    final data = snapshot.data();
    if (data == null) {
      throw const FormatException('El documento del perfil no tiene datos.');
    }

    return AppUser(
      uid: _readString(data, 'uid'),
      name: _readString(data, 'name'),
      email: _readString(data, 'email'),
      role: _readString(data, 'role'),
      active: _readBool(data, 'active'),
      createdAt: _readTimestamp(data, 'createdAt'),
      updatedAt: _readTimestamp(data, 'updatedAt'),
    );
  }

  Map<String, dynamic> toFirestore() {
    // Timestamp es el tipo de fecha/hora propio de Firestore. En el modelo
    // usamos DateTime porque es comodo en Dart, y al guardar lo transformamos.
    return {
      'uid': uid,
      'name': name,
      'email': email,
      'role': role,
      'active': active,
      'createdAt': Timestamp.fromDate(createdAt),
      'updatedAt': Timestamp.fromDate(updatedAt),
    };
  }

  static String _readString(Map<String, dynamic> data, String field) {
    final value = data[field];
    if (value is String && value.trim().isNotEmpty) {
      return value;
    }

    throw FormatException('El campo "$field" falta o no es texto valido.');
  }

  static bool _readBool(Map<String, dynamic> data, String field) {
    final value = data[field];
    if (value is bool) {
      return value;
    }

    throw FormatException('El campo "$field" falta o no es booleano.');
  }

  static DateTime _readTimestamp(Map<String, dynamic> data, String field) {
    final value = data[field];
    if (value is Timestamp) {
      return value.toDate();
    }

    throw FormatException('El campo "$field" falta o no es Timestamp.');
  }
}

class UserDirectoryEntry {
  const UserDirectoryEntry({
    required this.uid,
    required this.name,
    required this.role,
  });

  final String uid;
  final String name;
  final String role;

  factory UserDirectoryEntry.fromFirestore(
    QueryDocumentSnapshot<Map<String, dynamic>> snapshot,
  ) {
    // Cada documento dentro del QuerySnapshot del directorio se convierte a un
    // modelo pequeno. Esta coleccion no incluye email ni estado interno.
    final data = snapshot.data();

    return UserDirectoryEntry(
      uid: _readString(data, 'uid'),
      name: _readString(data, 'name'),
      role: _readString(data, 'role'),
    );
  }

  static String _readString(Map<String, dynamic> data, String field) {
    final value = data[field];
    if (value is String && value.trim().isNotEmpty) {
      return value;
    }

    throw FormatException('El campo "$field" falta o no es texto valido.');
  }
}
