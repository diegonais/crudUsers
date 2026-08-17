import {Auth} from "firebase-admin/auth";
import {logger} from "firebase-functions";
import {CallableRequest, HttpsError} from "firebase-functions/v2/https";

export async function assertActiveAdmin(
    request: CallableRequest,
    auth: Pick<Auth, "getUser">,
    operation: string,
): Promise<void> {
  if (!request.auth) {
    throw new HttpsError(
        "unauthenticated",
        "Debes iniciar sesion para continuar.",
    );
  }

  if (request.auth.token.role !== "admin") {
    logger.warn(`${operation} rejected: caller is not admin`, {
      callerUid: request.auth.uid,
      callerRole: request.auth.token.role ?? null,
    });

    throw new HttpsError(
        "permission-denied",
        "Solo un administrador puede realizar esta operacion.",
    );
  }

  const callerRecord = await auth.getUser(request.auth.uid);

  // Un ID Token anterior puede seguir teniendo role=admin. Por eso las
  // operaciones administrativas sensibles consultan el estado vivo de Auth.
  if (callerRecord.disabled) {
    logger.warn(`${operation} rejected: caller is disabled`, {
      callerUid: request.auth.uid,
    });

    throw new HttpsError(
        "permission-denied",
        "Tu cuenta administrativa esta deshabilitada.",
    );
  }
}
