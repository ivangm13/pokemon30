import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { environment } from '../environments/environment';

const app = initializeApp(environment.firebaseConfig);
export const auth = getAuth(app); // la sesión persiste por defecto (localStorage)
// Caché offline: la app sigue funcionando sin conexión y sincroniza al volver.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
