import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

// Copia aquí el firebaseConfig que tenías en cloud.ts
const firebaseConfig = {
  apiKey: 'AIzaSyCgaGkI7Ys9j1KSCgxLN5a5RCSKkJJwT_M',
  authDomain: 'pokemon30-329e2.firebaseapp.com',
  projectId: 'pokemon30-329e2',
  appId: '1:600763609618:web:7898d59d60135c41e95ecb',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app); // la sesión persiste por defecto (localStorage)
// Caché offline: la app sigue funcionando sin conexión y sincroniza al volver.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
