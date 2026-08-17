enum AppRole { admin, user, unknown }

extension AppRoleLabel on AppRole {
  String get value {
    switch (this) {
      case AppRole.admin:
        return 'admin';
      case AppRole.user:
        return 'user';
      case AppRole.unknown:
        return 'unknown';
    }
  }

  String get displayName {
    switch (this) {
      case AppRole.admin:
        return 'admin';
      case AppRole.user:
        return 'user';
      case AppRole.unknown:
        return 'No configurado';
    }
  }
}

AppRole appRoleFromClaim(Object? claimValue) {
  // AppRole evita strings magicos repartidos por la app.
  // Si el ID Token no trae role, o trae un valor desconocido, usamos unknown.
  // La politica segura es nunca asumir admin por defecto.
  switch (claimValue) {
    case 'admin':
      return AppRole.admin;
    case 'user':
      return AppRole.user;
    default:
      return AppRole.unknown;
  }
}
