import {initializeApp} from "firebase-admin/app";
import {setGlobalOptions} from "firebase-functions";

import {createUser} from "./users/create-user";
import {deleteUser} from "./users/delete-user";
import {setUserRole} from "./users/set-user-role";
import {setUserDisabledStatus} from "./users/set-user-disabled-status";
import {updateUser} from "./users/update-user";

// Cloud Functions se ejecuta en infraestructura administrada por Firebase.
// initializeApp() permite que Firebase Admin SDK use las credenciales del
// entorno servidor; no necesitamos ni debemos subir un Service Account JSON.
initializeApp();

// 2nd gen permite controlar concurrencia y escalado. La region se define en
// cada Callable para mantener cerca la Function de Firestore en Santiago.
setGlobalOptions({maxInstances: 10});

export {createUser, deleteUser, setUserDisabledStatus, setUserRole, updateUser};
