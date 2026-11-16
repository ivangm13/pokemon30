import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

// Pega aquí tu configuración (Firebase Console → Configuración del proyecto → Tus apps → Web)
const firebaseConfig = {
  apiKey: 'AIzaSyCgaGkI7Ys9j1KSCgxLN5a5RCSKkJJwT_M',
  authDomain: 'pokemon30-329e2.firebaseapp.com',
  projectId: 'pokemon30-329e2',
  appId: '1:600763609618:web:7898d59d60135c41e95ecb',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export type { User };
export const onUser = (cb: (u: User | null) => void) => onAuthStateChanged(auth, cb);
export const login = () => signInWithPopup(auth, new GoogleAuthProvider());
export const logout = () => signOut(auth);
export const loadCloud = async (uid: string) => {
  const s = await getDoc(doc(db, 'collections', uid));
  return s.exists() ? (s.data()['cards'] as Record<string, 1 | 2>) : null;
};
export const saveCloud = (uid: string, cards: Record<string, 1 | 2>) =>
  setDoc(doc(db, 'collections', uid), { cards });
