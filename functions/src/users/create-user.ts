import {getAuth} from "firebase-admin/auth";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {HttpsError, onCall} from "firebase-functions/v2/https";

type CreateUserPayload = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
};

type AppRole = "admin" | "user";

const allowedRoles = new Set<AppRole>(["admin", "user"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const createUser = onCall(
    {region: "southamerica-west1"},
    async (request) => {
    // onCall crea una Callable Function. Cuando Flutter usa el SDK oficial
    // cloud_functions, Firebase puede adjuntar y verificar la identidad del
    // usuario autenticado sin que Flutter envie manualmente uid, rol o token.
      if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "Debes iniciar sesion para crear usuarios.",
        );
      }

      // No confiamos en que Flutter nos diga que el solicitante es admin.
      // request.auth.token contiene los Custom Claims del ID Token que Firebase
      // Authentication verifico para esta Callable Function.
      if (request.auth.token.role !== "admin") {
        throw new HttpsError(
            "permission-denied",
            "Solo un administrador puede crear usuarios.",
        );
      }

      // El cliente no es una frontera de confianza. Las validaciones de Flutter
      // mejoran UX, pero las reglas de negocio y autorizacion deben verificarse
      // nuevamente en el servidor.
      const input = parseCreateUserPayload(request.data);
      const auth = getAuth();
      const firestore = getFirestore();
      let createdUid: string | undefined;

      try {
      // getAuth() expone Firebase Admin SDK para Authentication desde backend.
      // createUser() crea la cuenta y devuelve un UserRecord: el registro
      // administrativo de la cuenta creada, incluyendo el uid generado.
        const userRecord = await auth.createUser({
          email: input.email,
          password: input.password,
          displayName: input.name,
        });

        createdUid = userRecord.uid;

        // El servidor construye los claims permitidos; no copiamos objetos de
        // claims enviados por Flutter.
        await auth.setCustomUserClaims(createdUid, {role: input.role});

        // getFirestore() usa Admin SDK para escribir desde el backend
        // confiable.
        // FieldValue.serverTimestamp() pide a Firestore que asigne la hora del
        // servidor, no la hora posiblemente manipulable del cliente.
        const now = FieldValue.serverTimestamp();
        const batch = firestore.batch();
        const profileRef = firestore
            .collection("user_profiles")
            .doc(createdUid);
        const directoryRef = firestore
            .collection("user_directory")
            .doc(createdUid);

        // WriteBatch agrupa escrituras Firestore: ambos documentos se confirman
        // juntos o ninguno se escribe dentro de Firestore.
        batch.set(profileRef, {
          uid: createdUid,
          name: input.name,
          email: input.email,
          role: input.role,
          active: true,
          createdAt: now,
          updatedAt: now,
        });

        batch.set(directoryRef, {
          uid: createdUid,
          name: input.name,
          role: input.role,
        });

        await batch.commit();

        return {
          success: true,
          uid: createdUid,
          email: input.email,
        };
      } catch (error) {
        if (isAuthEmailAlreadyExistsError(error)) {
          throw new HttpsError(
              "already-exists",
              "Ya existe una cuenta con ese email.",
          );
        }

        if (createdUid) {
        // Authentication y Firestore son servicios diferentes. Si
        // Authentication ya creo la cuenta y una operacion posterior falla,
        // intentamos eliminar esa cuenta como compensacion. Esto NO convierte
        // el proceso en una transaccion distribuida real.
          try {
            await auth.deleteUser(createdUid);
          } catch (rollbackError) {
            logger.error(
                "Rollback de createUser fallo; puede existir inconsistencia.",
                {
                  createdUid,
                  originalError: safeErrorForLog(error),
                  rollbackError: safeErrorForLog(rollbackError),
                },
            );

            throw new HttpsError(
                "internal",
                "No se pudo completar la creacion y fallo la compensacion. " +
                "Revisa logs.",
            );
          }
        }

        logger.error("createUser fallo.", {error: safeErrorForLog(error)});
        throw new HttpsError(
            "internal",
            "No se pudo crear el usuario. Intenta nuevamente.",
        );
      }
    },
);

function parseCreateUserPayload(data: unknown): {
  name: string;
  email: string;
  password: string;
  role: AppRole;
} {
  if (!isRecord(data)) {
    throw new HttpsError("invalid-argument", "Datos de usuario invalidos.");
  }

  const payload = data as CreateUserPayload;
  const name = readTrimmedString(payload.name, "name");
  const email = readTrimmedString(payload.email, "email").toLowerCase();
  const password = readTrimmedString(payload.password, "password");
  const role = readTrimmedString(payload.role, "role");

  if (!emailPattern.test(email)) {
    throw new HttpsError(
        "invalid-argument",
        "El email no tiene formato valido.",
    );
  }

  if (password.length < 6) {
    throw new HttpsError(
        "invalid-argument",
        "La contrasena inicial debe tener al menos 6 caracteres.",
    );
  }

  if (!allowedRoles.has(role as AppRole)) {
    throw new HttpsError("invalid-argument", "Rol invalido.");
  }

  return {
    name,
    email,
    password,
    role: role as AppRole,
  };
}

function readTrimmedString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `El campo ${field} es requerido.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpsError("invalid-argument", `El campo ${field} es requerido.`);
  }

  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAuthEmailAlreadyExistsError(error: unknown): boolean {
  return isRecord(error) && error.code === "auth/email-already-exists";
}

function safeErrorForLog(error: unknown): Record<string, unknown> {
  if (!isRecord(error)) {
    return {message: String(error)};
  }

  return {
    code: error.code,
    message: error.message,
  };
}
