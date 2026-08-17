import {Auth, getAuth, UserRecord} from "firebase-admin/auth";
import {FieldValue, Firestore, getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {assertActiveAdmin} from "./assert-active-admin";

type AppRole = "admin" | "user";

type SetUserRolePayload = {
  uid?: unknown;
  role?: unknown;
};

type SetUserRoleInput = {
  uid: string;
  role: AppRole;
};

type SetUserRoleResult = SetUserRoleInput & {
  success: true;
  changed: boolean;
};

type CommitFirestoreRoleUpdate = (
  firestore: Firestore,
  input: SetUserRoleInput,
) => Promise<void>;

type SetUserRoleDependencies = {
  auth: Pick<Auth, "getUser" | "setCustomUserClaims">;
  firestore: Firestore;
  commitFirestoreRoleUpdate?: CommitFirestoreRoleUpdate;
};

const allowedPayloadFields = new Set(["uid", "role"]);
const allowedRoles = new Set<AppRole>(["admin", "user"]);

export const setUserRole = onCall(
    {region: "southamerica-west1"},
    async (request) => {
      logger.info("setUserRole called", {
        callerUid: request.auth?.uid ?? null,
      });

      const auth = getAuth();
      await assertActiveAdmin(request, auth, "setUserRole");

      const input = parseSetUserRolePayload(request.data);

      // Es una regla de negocio/seguridad de esta fase, no una limitacion
      // tecnica de Firebase: evitamos que un admin se quite sus propios
      // permisos por accidente durante pruebas o demos.
      if (request.auth!.uid === input.uid) {
        throw new HttpsError(
            "failed-precondition",
            "No puedes cambiar tu propio rol desde esta pantalla.",
        );
      }

      logger.info("setUserRole caller authorized", {
        callerUid: request.auth!.uid,
        targetUid: input.uid,
        newRole: input.role,
      });

      return setUserRoleCore(input, {
        auth,
        firestore: getFirestore(),
      });
    },
);

export async function setUserRoleCore(
    input: SetUserRoleInput,
    dependencies: SetUserRoleDependencies,
): Promise<SetUserRoleResult> {
  const auth = dependencies.auth;
  const firestore = dependencies.firestore;
  const commitFirestoreRoleUpdate =
    dependencies.commitFirestoreRoleUpdate ?? defaultCommitFirestoreRoleUpdate;

  const userRecord = await getExistingUser(auth, input.uid);
  const oldCustomClaims = cloneCustomClaims(userRecord.customClaims);
  const currentAuthRole = readRoleValue(oldCustomClaims?.role, "auth.role");

  const profileRef = firestore.collection("user_profiles").doc(input.uid);
  const directoryRef = firestore.collection("user_directory").doc(input.uid);
  const [profileSnapshot, directorySnapshot] = await Promise.all([
    profileRef.get(),
    directoryRef.get(),
  ]);

  if (!profileSnapshot.exists || !directorySnapshot.exists) {
    logger.warn("setUserRole rejected: missing Firestore representation", {
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
  const profileRole = readRoleValue(profile.role, "user_profiles.role");
  const directoryRole = readRoleValue(directory.role, "user_directory.role");

  if (currentAuthRole !== profileRole || currentAuthRole !== directoryRole) {
    logger.warn("setUserRole rejected: inconsistent role state", {
      targetUid: input.uid,
      authRole: currentAuthRole,
      profileRole,
      directoryRole,
    });

    throw new HttpsError(
        "failed-precondition",
        "Los datos de rol del usuario estan inconsistentes.",
    );
  }

  if (
    currentAuthRole === input.role &&
    profileRole === input.role &&
    directoryRole === input.role
  ) {
    logger.info("setUserRole no-op", {
      targetUid: input.uid,
      oldRole: currentAuthRole,
      newRole: input.role,
    });

    return {
      success: true,
      changed: false,
      uid: input.uid,
      role: input.role,
    };
  }

  const nextClaims = {
    ...(oldCustomClaims ?? {}),
    role: input.role,
  };

  let claimsUpdated = false;

  try {
    // setCustomUserClaims reemplaza el objeto completo de claims. Por eso
    // conservamos claims existentes y cambiamos solo role.
    await auth.setCustomUserClaims(input.uid, nextClaims);
    claimsUpdated = true;
    logger.info("setUserRole claims updated", {
      targetUid: input.uid,
      oldRole: currentAuthRole,
      newRole: input.role,
    });
  } catch (error) {
    logger.error("setUserRole claims update failed", {
      targetUid: input.uid,
      error: safeErrorForLog(error),
    });
    throw new HttpsError(
        "internal",
        "No se pudo actualizar el rol en Authentication.",
    );
  }

  try {
    // Custom Claim role autoriza. Firestore role representa datos del perfil.
    // Los sincronizamos para que listados realtime muestren el nuevo rol, pero
    // las decisiones de permisos siguen dependiendo del ID Token.
    await commitFirestoreRoleUpdate(firestore, input);
    logger.info("setUserRole Firestore batch committed", {
      targetUid: input.uid,
      newRole: input.role,
    });
  } catch (error) {
    if (claimsUpdated) {
      try {
        // Esta compensacion intenta devolver Authentication al estado anterior,
        // pero no convierte Auth + Firestore en una transaccion ACID
        // distribuida.
        logger.warn("setUserRole claims rollback attempted", {
          targetUid: input.uid,
        });
        await auth.setCustomUserClaims(input.uid, oldCustomClaims);
        logger.warn("setUserRole claims rollback completed", {
          targetUid: input.uid,
        });
      } catch (rollbackError) {
        logger.error(
            "Rollback de setUserRole fallo; puede existir inconsistencia.",
            {
              targetUid: input.uid,
              operation: "setUserRole",
              originalError: safeErrorForLog(error),
              rollbackError: safeErrorForLog(rollbackError),
            },
        );

        throw new HttpsError(
            "internal",
            "No se pudo cambiar el rol y fallo la compensacion. Revisa logs.",
        );
      }
    }

    logger.error("setUserRole Firestore update failed", {
      targetUid: input.uid,
      error: safeErrorForLog(error),
    });
    throw new HttpsError(
        "internal",
        "No se pudo sincronizar el rol en Firestore.",
    );
  }

  return {
    success: true,
    changed: true,
    uid: input.uid,
    role: input.role,
  };
}

function parseSetUserRolePayload(data: unknown): SetUserRoleInput {
  if (!isRecord(data)) {
    throw new HttpsError("invalid-argument", "Datos de rol invalidos.");
  }

  for (const field of Object.keys(data)) {
    if (!allowedPayloadFields.has(field)) {
      throw new HttpsError(
          "invalid-argument",
          `El campo ${field} no esta permitido en setUserRole.`,
      );
    }
  }

  const payload = data as SetUserRolePayload;
  const uid = readTrimmedString(payload.uid, "uid");
  const role = readTrimmedString(payload.role, "role");

  if (!allowedRoles.has(role as AppRole)) {
    throw new HttpsError(
        "invalid-argument",
        "El rol seleccionado no es valido.",
    );
  }

  return {
    uid,
    role: role as AppRole,
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

    logger.error("setUserRole getUser failed", {
      targetUid: uid,
      error: safeErrorForLog(error),
    });
    throw new HttpsError(
        "internal",
        "No se pudo comprobar el usuario.",
    );
  }
}

async function defaultCommitFirestoreRoleUpdate(
    firestore: Firestore,
    input: SetUserRoleInput,
): Promise<void> {
  const batch = firestore.batch();
  const profileRef = firestore.collection("user_profiles").doc(input.uid);
  const directoryRef = firestore.collection("user_directory").doc(input.uid);

  // WriteBatch garantiza atomicidad dentro de Firestore: profile.role y
  // directory.role cambian juntos o no cambia ninguno. No cubre Auth.
  batch.update(profileRef, {
    role: input.role,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.update(directoryRef, {
    role: input.role,
  });

  await batch.commit();
}

function cloneCustomClaims(
    claims: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!claims) {
    return null;
  }

  return {...claims};
}

function readRoleValue(value: unknown, field: string): AppRole {
  if (typeof value === "string" && allowedRoles.has(value as AppRole)) {
    return value as AppRole;
  }

  throw new HttpsError(
      "failed-precondition",
      `El campo ${field} no contiene un rol valido.`,
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
