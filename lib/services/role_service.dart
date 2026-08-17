import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

import '../models/app_role.dart';

class RoleInfo {
  const RoleInfo({
    required this.role,
    required this.rawClaimValue,
    required this.wasForceRefreshed,
  });

  final AppRole role;
  final Object? rawClaimValue;
  final bool wasForceRefreshed;

  String get tokenRoleLabel {
    if (rawClaimValue == null) {
      return 'Sin claim role';
    }

    if (role == AppRole.unknown) {
      return 'Valor desconocido: $rawClaimValue';
    }

    return role.value;
  }
}

class RoleService {
  Future<RoleInfo> getRoleFromToken(
    User user, {
    bool forceRefresh = false,
  }) async {
    // Un ID Token es emitido y firmado por Firebase Authentication despues
    // del login. No lo decodificamos manualmente: el SDK oficial expone
    // getIdTokenResult(), incluyendo los Custom Claims como role.
    final tokenResult = await user.getIdTokenResult(forceRefresh);
    final rawRole = tokenResult.claims?['role'];
    final role = appRoleFromClaim(rawRole);

    if (forceRefresh) {
      // forceRefresh=true pide a Firebase un token nuevo para comprobar de
      // inmediato cambios de Custom Claims hechos desde un entorno admin.
      // No conviene refrescar en cada build porque genera trabajo innecesario.
      debugPrint('Token actualizado con forceRefresh=true.');
    }

    debugPrint('Rol obtenido desde ID Token: ${role.value}');

    return RoleInfo(
      role: role,
      rawClaimValue: rawRole,
      wasForceRefreshed: forceRefresh,
    );
  }
}
