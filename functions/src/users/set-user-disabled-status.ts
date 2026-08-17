import {Auth, getAuth, UserRecord} from "firebase-admin/auth";
import {FieldValue, Firestore, getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {assertActiveAdmin} from "./assert-active-admin";

type SetUserDisabledStatusPayload = {
  uid?: unknown;
  disabled?: unknown;
};

type SetUserDisabledStatusInput = {
  uid: string;
  disabled: boolean;
};

type SetUserDisabledStatusResult = SetUserDisabledStatusInput & {
  success: true;
  changed: boolean;
  active: boolean;
};

type CommitFirestoreActiveUpdate = (
  firestore: Firestore,
  input: {
    uid: string;
    active: boolean;
  },
) => Promise<void>;

type SetUserDisabledStatusDependencies = {
  auth: Pick<Auth, "getUser" | "updateUser">;
  firestore: Firestore;
  commitFirestoreActiveUpdate?: CommitFirestoreActiveUpdate;
};

const allowedPayloadFields = new Set(["uid", "disabled"]);

export const setUserDisabledStatus = onCall(
    {region: "southamerica-west1"},
    async (request) => {
      logger.info("setUserDisabledStatus called", {
        callerUid: request.auth?.uid ?? null,
      });

      const auth = getAuth();
      await assertActiveAdmin(request, auth, "setUserDisabledStatus");

      const input = parseSetUserDisabledStatusPayload(request.data);

      if (request.auth?.uid === input.uid) {
        throw new HttpsError(
            "failed-precondition",
            "No puedes cambiar el estado de tu propia cuenta.",
        );
      }

      logger.info("setUserDisabledStatus caller authorized", {
        callerUid: request.auth?.uid,
        targetUid: input.uid,
        newDisabled: input.disabled,
      });

      return setUserDisabledStatusCore(input, {
        auth,
        firestore: getFirestore(),
      });
    },
);

export async function setUserDisabledStatusCore(
    input: SetUserDisabledStatusInput,
    dependencies: SetUserDisabledStatusDependencies,
): Promise<SetUserDisabledStatusResult> {
  const auth = dependencies.auth;
  const firestore = dependencies.firestore;
  const commitFirestoreActiveUpdate =
    dependencies.commitFirestoreActiveUpdate ??
    defaultCommitFirestoreActiveUpdate;

  const userRecord = await getExistingUser(auth, input.uid);
  const oldDisabled = userRecord.disabled;

  const profileRef = firestore.collection("user_profiles").doc(input.uid);
  const profileSnapshot = await profileRef.get();

  if (!profileSnapshot.exists) {
    logger.warn("setUserDisabledStatus rejected: missing profile", {
      targetUid: input.uid,
    });

    throw new HttpsError(
        "failed-precondition",
        "El perfil del usuario esta incompleto o inconsistente.",
    );
  }

  const profile = profileSnapshot.data() ?? {};
  const oldActive = readActiveValue(profile.active);

  if (oldDisabled !== !oldActive) {
    logger.warn("setUserDisabledStatus rejected: inconsistent status", {
      targetUid: input.uid,
      authDisabled: oldDisabled,
      profileActive: oldActive,
    });

    throw new HttpsError(
        "failed-precondition",
        "Authentication y Firestore estan desincronizados.",
    );
  }

  if (oldDisabled === input.disabled) {
    logger.info("setUserDisabledStatus no-op", {
      targetUid: input.uid,
      oldDisabled,
      newDisabled: input.disabled,
    });

    return {
      success: true,
      changed: false,
      uid: input.uid,
      disabled: input.disabled,
      active: !input.disabled,
    };
  }

  if (input.disabled) {
    return disableUser({
      input,
      auth,
      firestore,
      userRecord,
      commitFirestoreActiveUpdate,
    });
  }

  return enableUser({
    input,
    auth,
    firestore,
    userRecord,
    commitFirestoreActiveUpdate,
  });
}

async function disableUser(params: {
  input: SetUserDisabledStatusInput;
  auth: Pick<Auth, "updateUser">;
  firestore: Firestore;
  userRecord: UserRecord;
  commitFirestoreActiveUpdate: CommitFirestoreActiveUpdate;
}): Promise<SetUserDisabledStatusResult> {
  const {input, auth, firestore, commitFirestoreActiveUpdate} = params;

  try {
    // DESHABILITAR: deny first. Cerramos primero el acceso a datos
    // (active=false) y al final deshabilitamos la identidad en Auth.
    await commitFirestoreActiveUpdate(firestore, {
      uid: input.uid,
      active: false,
    });
    logger.info("setUserDisabledStatus Firestore access closed", {
      targetUid: input.uid,
    });
  } catch (error) {
    logger.error("setUserDisabledStatus Firestore close failed", {
      targetUid: input.uid,
      error: safeErrorForLog(error),
    });
    throw new HttpsError(
        "internal",
        "No se pudo cerrar el acceso en Firestore.",
    );
  }

  try {
    await auth.updateUser(input.uid, {disabled: true});
    logger.info("setUserDisabledStatus Authentication disabled", {
      targetUid: input.uid,
      oldDisabled: params.userRecord.disabled,
      newDisabled: true,
    });
  } catch (error) {
    try {
      logger.warn("setUserDisabledStatus rollback attempted", {
        targetUid: input.uid,
        rollback: "restore Firestore active=true",
      });
      await commitFirestoreActiveUpdate(firestore, {
        uid: input.uid,
        active: true,
      });
      logger.warn("setUserDisabledStatus rollback completed", {
        targetUid: input.uid,
      });
    } catch (rollbackError) {
      logger.error(
          "Rollback de setUserDisabledStatus fallo; posible inconsistencia.",
          {
            targetUid: input.uid,
            operation: "disableUser",
            originalError: safeErrorForLog(error),
            rollbackError: safeErrorForLog(rollbackError),
          },
      );

      throw new HttpsError(
          "internal",
          "No se pudo deshabilitar y fallo la compensacion. Revisa logs.",
      );
    }

    logger.error("setUserDisabledStatus Auth disable failed", {
      targetUid: input.uid,
      error: safeErrorForLog(error),
    });
    throw new HttpsError(
        "internal",
        "No se pudo deshabilitar la cuenta en Authentication.",
    );
  }

  return successResult(input, true);
}

async function enableUser(params: {
  input: SetUserDisabledStatusInput;
  auth: Pick<Auth, "updateUser">;
  firestore: Firestore;
  userRecord: UserRecord;
  commitFirestoreActiveUpdate: CommitFirestoreActiveUpdate;
}): Promise<SetUserDisabledStatusResult> {
  const {input, auth, firestore, commitFirestoreActiveUpdate} = params;

  try {
    // HABILITAR: grant last. Primero habilitamos la identidad; solo despues
    // abrimos el acceso a datos con active=true.
    await auth.updateUser(input.uid, {disabled: false});
    logger.info("setUserDisabledStatus Authentication enabled", {
      targetUid: input.uid,
      oldDisabled: params.userRecord.disabled,
      newDisabled: false,
    });
  } catch (error) {
    logger.error("setUserDisabledStatus Auth enable failed", {
      targetUid: input.uid,
      error: safeErrorForLog(error),
    });
    throw new HttpsError(
        "internal",
        "No se pudo habilitar la cuenta en Authentication.",
    );
  }

  try {
    await commitFirestoreActiveUpdate(firestore, {
      uid: input.uid,
      active: true,
    });
    logger.info("setUserDisabledStatus Firestore access opened", {
      targetUid: input.uid,
    });
  } catch (error) {
    try {
      logger.warn("setUserDisabledStatus rollback attempted", {
        targetUid: input.uid,
        rollback: "restore Authentication disabled=true",
      });
      await auth.updateUser(input.uid, {disabled: true});
      logger.warn("setUserDisabledStatus rollback completed", {
        targetUid: input.uid,
      });
    } catch (rollbackError) {
      logger.error(
          "Rollback de setUserDisabledStatus fallo; posible inconsistencia.",
          {
            targetUid: input.uid,
            operation: "enableUser",
            originalError: safeErrorForLog(error),
            rollbackError: safeErrorForLog(rollbackError),
          },
      );

      throw new HttpsError(
          "internal",
          "No se pudo habilitar y fallo la compensacion. Revisa logs.",
      );
    }

    logger.error("setUserDisabledStatus Firestore open failed", {
      targetUid: input.uid,
      error: safeErrorForLog(error),
    });
    throw new HttpsError(
        "internal",
        "No se pudo abrir el acceso en Firestore.",
    );
  }

  return successResult(input, true);
}

function parseSetUserDisabledStatusPayload(
    data: unknown,
): SetUserDisabledStatusInput {
  if (!isRecord(data)) {
    throw new HttpsError("invalid-argument", "Datos de estado invalidos.");
  }

  for (const field of Object.keys(data)) {
    if (!allowedPayloadFields.has(field)) {
      throw new HttpsError(
          "invalid-argument",
          `El campo ${field} no esta permitido en setUserDisabledStatus.`,
      );
    }
  }

  const payload = data as SetUserDisabledStatusPayload;
  const uid = readTrimmedString(payload.uid, "uid");

  if (typeof payload.disabled !== "boolean") {
    throw new HttpsError(
        "invalid-argument",
        "El campo disabled debe ser booleano.",
    );
  }

  return {
    uid,
    disabled: payload.disabled,
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

    logger.error("setUserDisabledStatus getUser failed", {
      targetUid: uid,
      error: safeErrorForLog(error),
    });
    throw new HttpsError(
        "internal",
        "No se pudo comprobar el usuario.",
    );
  }
}

async function defaultCommitFirestoreActiveUpdate(
    firestore: Firestore,
    input: {
      uid: string;
      active: boolean;
    },
): Promise<void> {
  const profileRef = firestore.collection("user_profiles").doc(input.uid);

  // Firestore guarda active, que es el inverso de Authentication.disabled.
  // No tocamos name, email, role ni user_directory en esta fase.
  await profileRef.update({
    active: input.active,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

function successResult(
    input: SetUserDisabledStatusInput,
    changed: boolean,
): SetUserDisabledStatusResult {
  return {
    success: true,
    changed,
    uid: input.uid,
    disabled: input.disabled,
    active: !input.disabled,
  };
}

function readActiveValue(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  throw new HttpsError(
      "failed-precondition",
      "El campo user_profiles.active no contiene un booleano valido.",
  );
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
