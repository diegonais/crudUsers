import 'package:crudusers/models/app_user.dart';
import 'package:crudusers/screens/admin_profiles_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AdminProfilesList', () {
    testWidgets('muestra estado vacio y accion de crear usuario', (
      tester,
    ) async {
      await tester.pumpWidget(
        _TestApp(
          child: AdminProfilesList(
            profiles: const [],
            currentUid: 'admin-uid',
            busyUid: null,
            onCreateUser: () {},
            onActionSelected: (_) {},
          ),
        ),
      );

      expect(find.text('Crear usuario'), findsOneWidget);
      expect(find.text('No hay usuarios disponibles.'), findsOneWidget);
    });

    testWidgets('muestra rol y estado con texto visible', (tester) async {
      await tester.pumpWidget(
        _TestApp(
          child: AdminProfilesList(
            profiles: [
              _appUser(uid: 'pedro-uid', active: true, role: 'user'),
              _appUser(
                uid: 'maria-uid',
                name: 'Maria Lopez',
                email: 'maria@test.local',
                active: false,
                role: 'admin',
              ),
            ],
            currentUid: 'admin-uid',
            busyUid: null,
            onCreateUser: () {},
            onActionSelected: (_) {},
          ),
        ),
      );

      expect(find.text('Pedro Perez'), findsOneWidget);
      expect(find.text('pedro@test.local'), findsOneWidget);
      expect(find.text('User'), findsOneWidget);
      expect(find.text('Activo'), findsOneWidget);
      expect(find.text('Maria Lopez'), findsOneWidget);
      expect(find.text('Admin'), findsOneWidget);
      expect(find.text('Deshabilitado'), findsOneWidget);
    });

    testWidgets('oculta acciones destructivas para el usuario actual', (
      tester,
    ) async {
      await tester.pumpWidget(
        _TestApp(
          child: AdminProfilesList(
            profiles: [_appUser(uid: 'admin-uid', role: 'admin')],
            currentUid: 'admin-uid',
            busyUid: null,
            onCreateUser: () {},
            onActionSelected: (_) {},
          ),
        ),
      );

      await tester.tap(find.byTooltip('Acciones de usuario'));
      await tester.pumpAndSettle();

      expect(find.text('Editar'), findsOneWidget);
      expect(find.text('Cambiar rol'), findsNothing);
      expect(find.text('Deshabilitar'), findsNothing);
      expect(find.text('Habilitar'), findsNothing);
      expect(find.text('Eliminar'), findsNothing);
    });

    testWidgets('muestra Deshabilitar o Habilitar segun active', (
      tester,
    ) async {
      await tester.pumpWidget(
        _TestApp(
          child: AdminProfilesList(
            profiles: [_appUser(uid: 'pedro-uid', active: true)],
            currentUid: 'admin-uid',
            busyUid: null,
            onCreateUser: () {},
            onActionSelected: (_) {},
          ),
        ),
      );

      await tester.tap(find.byTooltip('Acciones de usuario'));
      await tester.pumpAndSettle();

      expect(find.text('Deshabilitar'), findsOneWidget);
      expect(find.text('Eliminar'), findsOneWidget);

      await tester.tapAt(const Offset(8, 8));
      await tester.pumpAndSettle();

      await tester.pumpWidget(
        _TestApp(
          child: AdminProfilesList(
            profiles: [_appUser(uid: 'pedro-uid', active: false)],
            currentUid: 'admin-uid',
            busyUid: null,
            onCreateUser: () {},
            onActionSelected: (_) {},
          ),
        ),
      );

      await tester.tap(find.byTooltip('Acciones de usuario'));
      await tester.pumpAndSettle();

      expect(find.text('Habilitar'), findsOneWidget);
      expect(find.text('Eliminar'), findsOneWidget);
    });
  });
}

class _TestApp extends StatelessWidget {
  const _TestApp({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(home: Scaffold(body: child));
  }
}

AppUser _appUser({
  required String uid,
  String name = 'Pedro Perez',
  String email = 'pedro@test.local',
  String role = 'user',
  bool active = true,
}) {
  final now = DateTime(2026, 1, 1);

  return AppUser(
    uid: uid,
    name: name,
    email: email,
    role: role,
    active: active,
    createdAt: now,
    updatedAt: now,
  );
}
