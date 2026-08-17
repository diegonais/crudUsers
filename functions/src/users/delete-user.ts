import {Auth, getAuth, UserRecord} from "firebase-admin/auth";
import {
  DocumentData,
  Firestore,
  getFirestore,
} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {assertActiveAdmin} from "./assert-active-admin";

type DeleteUserPayload = {
  uid?: unknown;
};

type DeleteUserInput = {
  uid: string;
};

type DeleteUserResult = DeleteUserInput & {
  success: true;
};

type DeleteUserSnapshots = {
  auth: {
    uid: string;
    email?: string;
    displayName?: string;
    disabled: boolean;
    emailVerified: boolean;
    customClaims?: Record<string, unknown>;
  };
  profile: DocumentData;
  directory: DocumentData;
};

type CommitFirestoreDelete = (
  firestore: Firestore,
  uid: string,
) => Promise<void>;

type CommitFirestoreRestore = (
  firestore: Firestore,
  uid: string,
  snapshots: DeleteUserSnapshots,
) => Promise<void>;

type DeleteUserDependencies = {
  auth: Pick<Auth, "getUser" | "deleteUser">;
  firestore: Firestore;
  commitFirestoreDelete?: CommitFirestoreDelete;
  commitFirestoreRestore?: CommitFirestoreRestore;
};

const allowedPayloadFields = new Set(["uid"]);

export const deleteUser = onCall(
    {region: "southamerica-west1"},
    async (request) => {
      logger.info("deleteUser called", {
        callerUid: request.auth?.uid ?? null,
      });

      const auth = getAuth();
      await assertActiveAdmin(request, auth, "deleteUser");

      const input = parseDeleteUserPayload(request.data);

      if (request.auth?.uid === input.uid) {
        throw new HttpsError(
            "failed-precondition",
            "No puedes eliminar tu propia cuenta.",
        );
      }

      logger.info("deleteUser caller authorized", {
        callerUid: request.auth?.uid,
        targetUid: input.uid,
      });

      return deleteUserCore(input, {
        auth,
        firestore: getFirestore(),
      });
    },
);

export async function deleteUserCore(
    input: DeleteUserInput,
    dependencies: DeleteUserDependencies,
): Promise<DeleteUserResult> {
  const auth = dependencies.auth;
  const firestore = dependencies.firestore;
  const commitFirestoreDelete =
    dependencies.commitFirestoreDelete ?? defaultCommitFirestoreDelete;
  const commitFirestoreRestore =
    dependencies.commitFirestoreRestore ?? defaultCommitFirestoreRestore;

  const userRecord = await getExistingUser(auth, input.uid);
  const profileRef = firestore.collection("user_profiles").doc(input.uid);
  const directoryRef = firestore.collection("user_directory").doc(input.uid);
  const [profileSnapshot, directorySnapshot] = await Promise.all([
    profileRef.get(),
    directoryRef.get(),
  ]);

  if (!profileSnapshot.exists || !directorySnapshot.exists) {
    logger.warn("deleteUser rejected: missing Firestore representation", {
      targetUid: input.uid,
      hasProfile: profileSnapshot.exists,
      hasDirectory: directorySnapshot.exists,
    });

    throw new HttpsError(
        "failed-precondition",
        "El usuario no puede eliminarse porque sus datos estan incompletos.",
    );
  }

  const snapshots: DeleteUserSnapshots = {
    auth: snapshotAuthUser(userRecord),
    profile: profileSnapshot.data() ?? {},
    directory: directorySnapshot.data() ?? {},
  };

  logger.info("deleteUser Firestore documents read", {
    targetUid: input.uid,
  });

  try {
    // El batch es atomico solo dentro de Firestore: profile y directory se
    // borran juntos o no se borra ninguno. No incluye Authentication.
    await commitFirestoreDelete(firestore, input.uid);
    logger.info("deleteUser Firestore batch deleted", {
      targetUid: input.uid,
    });
  } catch (error) {
    logger.error("deleteUser Firestore delete failed", {
      targetUid: input.uid,
      error: safeErrorForLog(error),
    });
    throw new HttpsError(
        "internal",
        "No se pudieron eliminar los documentos del usuario.",
    );
  }

  try {
    // No limpiamos claims por separado: pertenecen a la cuenta Auth que se
    // elimina. Tampoco intentamos recrear Auth en rollback porque no podemos
    // leer ni restaurar la contrasena original del usuario.
    await auth.deleteUser(input.uid);
    logger.info("deleteUser Authentication deleted", {
      targetUid: input.uid,
    });
  } catch (error) {
    try {
      logger.warn("deleteUser Firestore restore attempted", {
        targetUid: input.uid,
      });
      await commitFirestoreRestore(firestore, input.uid, snapshots);
      logger.warn("deleteUser Firestore restore completed", {
        targetUid: input.uid,
      });
    } catch (restoreError) {
      logger.error("Critical inconsistency after deleteUser failure.", {
        targetUid: input.uid,
        operation: "deleteUser",
        originalError: safeErrorForLog(error),
        restoreError: safeErrorForLog(restoreError),
      });

      throw new HttpsError(
          "internal",
          "No se pudo eliminar el usuario y fallo la restauracion. " +
          "Revisa logs.",
      );
    }

    logger.error("deleteUser Authentication delete failed", {
      targetUid: input.uid,
      error: safeErrorForLog(error),
    });
    throw new HttpsError(
        "internal",
        "No se pudo eliminar la cuenta en Authentication.",
    );
  }

  return {
    success: true,
    uid: input.uid,
  };
}

function parseDeleteUserPayload(data: unknown): DeleteUserInput {
  if (!isRecord(data)) {
    throw new HttpsError("invalid-argument", "Datos de eliminacion invalidos.");
  }

  for (const field of Object.keys(data)) {
    if (!allowedPayloadFields.has(field)) {
      throw new HttpsError(
          "invalid-argument",
          `El campo ${field} no esta permitido en deleteUser.`,
      );
    }
  }

  return {
    uid: readTrimmedString((data as DeleteUserPayload).uid, "uid"),
  };
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

    logger.error("deleteUser getUser failed", {
      targetUid: uid,
      error: safeErrorForLog(error),
    });
    throw new HttpsError(
        "internal",
        "No se pudo comprobar el usuario.",
    );
  }
}

async function defaultCommitFirestoreDelete(
    firestore: Firestore,
    uid: string,
): Promise<void> {
  const batch = firestore.batch();

  batch.delete(firestore.collection("user_profiles").doc(uid));
  batch.delete(firestore.collection("user_directory").doc(uid));

  await batch.commit();
}

async function defaultCommitFirestoreRestore(
    firestore: Firestore,
    uid: string,
    snapshots: DeleteUserSnapshots,
): Promise<void> {
  const batch = firestore.batch();

  // Restauramos exactamente los documentos leidos antes del borrado. Firestore
  // puede restaurarse completamente porque si tenemos sus datos completos.
  batch.set(firestore.collection("user_profiles").doc(uid), snapshots.profile);
  batch.set(
      firestore.collection("user_directory").doc(uid),
      snapshots.directory,
  );

  await batch.commit();
}

function snapshotAuthUser(userRecord: UserRecord): DeleteUserSnapshots["auth"] {
  const snapshot: DeleteUserSnapshots["auth"] = {
    uid: userRecord.uid,
    disabled: userRecord.disabled,
    emailVerified: userRecord.emailVerified,
  };

  if (userRecord.email) {
    snapshot.email = userRecord.email;
  }

  if (userRecord.displayName) {
    snapshot.displayName = userRecord.displayName;
  }

  if (userRecord.customClaims) {
    snapshot.customClaims = {...userRecord.customClaims};
  }

  return snapshot;
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

function isAuthUserNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "auth/user-not-found";
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
