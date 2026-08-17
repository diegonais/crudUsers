import {Auth, getAuth, UserRecord} from "firebase-admin/auth";
import {FieldValue, Firestore, getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {assertActiveAdmin} from "./assert-active-admin";

type UpdateUserPayload = {
  uid?: unknown;
  name?: unknown;
  email?: unknown;
};

type UpdateUserInput = {
  uid: string;
  name: string;
  email: string;
};

type UpdateUserResult = UpdateUserInput & {
  success: true;
  changed: boolean;
};

type CommitFirestoreUserUpdate = (
  firestore: Firestore,
  input: UpdateUserInput,
) => Promise<void>;

type UpdateUserDependencies = {
  auth: Pick<Auth, "getUser" | "updateUser">;
  firestore: Firestore;
  commitFirestoreUserUpdate?: CommitFirestoreUserUpdate;
};

const allowedPayloadFields = new Set(["uid", "name", "email"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const maxNameLength = 120;

export const updateUser = onCall(
    {region: "southamerica-west1"},
    async (request) => {
      logger.info("updateUser called", {
        callerUid: request.auth?.uid ?? null,
      });

      const auth = getAuth();
      await assertActiveAdmin(request, auth, "updateUser");

      const input = parseUpdateUserPayload(request.data);
      logger.info("updateUser caller authorized", {
        callerUid: request.auth!.uid,
        targetUid: input.uid,
      });

      return updateUserCore(input, {
        auth,
        firestore: getFirestore(),
      });
    },
);

export async function updateUserCore(
    input: UpdateUserInput,
    dependencies: UpdateUserDependencies,
): Promise<UpdateUserResult> {
  const auth = dependencies.auth;
  const firestore = dependencies.firestore;
  const commitFirestoreUserUpdate =
    dependencies.commitFirestoreUserUpdate ?? defaultCommitFirestoreUserUpdate;

  const userRecord = await getExistingUser(auth, input.uid);
  const oldDisplayName = userRecord.displayName;
  const oldEmail = userRecord.email;

  // Leemos las dos representaciones Firestore antes de tocar Authentication.
  // Si falta alguna, preferimos detectar la inconsistencia y detenernos en vez
  // de recrear documentos silenciosamente durante esta fase educativa.
  const profileRef = firestore.collection("user_profiles").doc(input.uid);
  const directoryRef = firestore.collection("user_directory").doc(input.uid);
  const [profileSnapshot, directorySnapshot] = await Promise.all([
    profileRef.get(),
    directoryRef.get(),
  ]);

  if (!profileSnapshot.exists || !directorySnapshot.exists) {
    logger.warn("updateUser rejected: missing Firestore representation", {
      targetUid: input.uid,
      hasProfile: profileSnapshot.exists,
      hasDirectory: directorySnapshot.exists,
    });

    throw new HttpsError(
        "failed-precondition",
        "Los datos del usuario estan incompletos o inconsistentes.",
    );
  }

  const profile = profileSnapshot.data() ?? {};
  const directory = directorySnapshot.data() ?? {};
  const authName = oldDisplayName ?? "";
  const authEmail = oldEmail?.toLowerCase() ?? "";
  const currentProfileName = readExistingString(profile.name, "profile.name");
  const currentProfileEmail = readExistingString(
      profile.email,
      "profile.email",
  ).toLowerCase();
  const currentDirectoryName = readExistingString(
      directory.name,
      "directory.name",
  );

  const alreadyConsistent =
    authName === input.name &&
    authEmail === input.email &&
    currentProfileName === input.name &&
    currentProfileEmail === input.email &&
    currentDirectoryName === input.name;

  if (alreadyConsistent) {
    logger.info("updateUser no-op", {targetUid: input.uid});
    return {
      success: true,
      changed: false,
      uid: input.uid,
      name: input.name,
      email: input.email,
    };
  }

  let authUpdated = false;

  try {
    if (authName !== input.name || authEmail !== input.email) {
      // Authentication guarda los datos propios de la cuenta. Aqui solo
      // actualizamos displayName y email; no tocamos password, disabled,
      // emailVerified, phoneNumber ni Custom Claims.
      await auth.updateUser(input.uid, {
        displayName: input.name,
        email: input.email,
      });
      authUpdated = true;
      logger.info("updateUser Auth updated", {targetUid: input.uid});
    }
  } catch (error) {
    if (isAuthEmailAlreadyExistsError(error)) {
      throw new HttpsError(
          "already-exists",
          "Ese correo ya pertenece a otra cuenta.",
      );
    }

    if (isAuthInvalidEmailError(error)) {
      throw new HttpsError(
          "invalid-argument",
          "El email no tiene formato valido.",
      );
    }

    logger.error("updateUser Auth update failed", {
      targetUid: input.uid,
      error: safeErrorForLog(error),
    });
    throw new HttpsError(
        "internal",
        "No se pudo actualizar Authentication.",
    );
  }

  try {
    // Una sola modificacion conceptual, "editar usuario", impacta varias
    // representaciones: Auth es la cuenta, user_profiles es el perfil completo,
    // y user_directory es una vista reducida para listados.
    await commitFirestoreUserUpdate(firestore, input);
    logger.info("updateUser Firestore batch committed", {
      targetUid: input.uid,
    });
  } catch (error) {
    if (authUpdated) {
      // Esto NO convierte Auth + Firestore en una transaccion ACID distribuida.
      // Es una compensacion: si Firestore falla despues de actualizar Auth,
      // intentamos regresar solo el usuario objetivo a sus valores anteriores.
      try {
        logger.warn("updateUser Auth rollback attempted", {
          targetUid: input.uid,
        });
        await auth.updateUser(input.uid, rollbackPayload(userRecord));
        logger.warn("updateUser Auth rollback completed", {
          targetUid: input.uid,
        });
      } catch (rollbackError) {
        logger.error(
            "Rollback de updateUser fallo; puede existir inconsistencia.",
            {
              targetUid: input.uid,
              originalError: safeErrorForLog(error),
              rollbackError: safeErrorForLog(rollbackError),
            },
        );

        throw new HttpsError(
            "internal",
            "No se pudo completar la edicion y fallo la compensacion. " +
            "Revisa logs.",
        );
      }
    }

    logger.error("updateUser Firestore update failed", {
      targetUid: input.uid,
      error: safeErrorForLog(error),
    });
    throw new HttpsError(
        "internal",
        "No se pudo sincronizar Firestore. Intenta nuevamente.",
    );
  }

  return {
    success: true,
    changed: true,
    uid: input.uid,
    name: input.name,
    email: input.email,
  };
}

function parseUpdateUserPayload(data: unknown): UpdateUserInput {
  if (!isRecord(data)) {
    throw new HttpsError("invalid-argument", "Datos de usuario invalidos.");
  }

  for (const field of Object.keys(data)) {
    if (!allowedPayloadFields.has(field)) {
      throw new HttpsError(
          "invalid-argument",
          `El campo ${field} no esta permitido en updateUser.`,
      );
    }
  }

  const payload = data as UpdateUserPayload;
  const uid = readTrimmedString(payload.uid, "uid");
  const name = readTrimmedString(payload.name, "name");
  const email = readTrimmedString(payload.email, "email").toLowerCase();

  if (name.length > maxNameLength) {
    throw new HttpsError(
        "invalid-argument",
        `El nombre no debe superar ${maxNameLength} caracteres.`,
    );
  }

  if (!emailPattern.test(email)) {
    throw new HttpsError(
        "invalid-argument",
        "El email no tiene formato valido.",
    );
  }

  return {uid, name, email};
}

async function getExistingUser(
    auth: Pick<Auth, "getUser">,
    uid: string,
): Promise<UserRecord> {
  try {
    return await auth.getUser(uid);
  } catch (error) {
    if (isAuthUserNotFoundError(error)) {
      throw new HttpsError("not-found", "El usuario no existe.");
    }

    logger.error("updateUser getUser failed", {
      targetUid: uid,
      error: safeErrorForLog(error),
    });
    throw new HttpsError(
        "internal",
        "No se pudo comprobar el usuario.",
    );
  }
}

async function defaultCommitFirestoreUserUpdate(
    firestore: Firestore,
    input: UpdateUserInput,
): Promise<void> {
  const batch = firestore.batch();
  const profileRef = firestore.collection("user_profiles").doc(input.uid);
  const directoryRef = firestore.collection("user_directory").doc(input.uid);

  // WriteBatch garantiza atomicidad dentro de Firestore: estos dos updates se
  // confirman juntos o ninguno queda aplicado. No cubre Authentication.
  batch.update(profileRef, {
    name: input.name,
    email: input.email,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.update(directoryRef, {
    name: input.name,
  });

  await batch.commit();
}

function rollbackPayload(userRecord: UserRecord): {
  displayName?: string | null;
  email?: string;
} {
  const payload: {
    displayName?: string | null;
    email?: string;
  } = {
    displayName: userRecord.displayName ?? null,
  };

  if (userRecord.email) {
    payload.email = userRecord.email;
  }

  return payload;
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

function readExistingString(value: unknown, field: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  throw new HttpsError(
      "failed-precondition",
      `El campo ${field} esta incompleto o es inconsistente.`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAuthUserNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "auth/user-not-found";
}

function isAuthEmailAlreadyExistsError(error: unknown): boolean {
  return isRecord(error) && error.code === "auth/email-already-exists";
}

function isAuthInvalidEmailError(error: unknown): boolean {
  return isRecord(error) && error.code === "auth/invalid-email";
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
