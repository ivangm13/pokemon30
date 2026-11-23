import { Injectable, inject, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  User, createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification,
  sendPasswordResetEmail, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';

const ERR: Record<string, string> = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Correo o contraseña incorrectos.',
  'auth/user-not-found': 'Correo o contraseña incorrectos.',
  'auth/invalid-email': 'El correo no es válido.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese correo.',
  'auth/weak-password': 'La contraseña es demasiado débil (mínimo 6 caracteres).',
  'auth/too-many-requests': 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  'auth/network-request-failed': 'Sin conexión. Revisa tu red.',
  'auth/operation-not-allowed': 'El acceso con correo no está activado en Firebase.',
  'app/mismatch': 'Las contraseñas no coinciden.',
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  readonly user = signal<User | null>(null);
  readonly verified = signal(false);
  readonly initialized = signal(false);
  private readonly ready = new Promise<void>(res =>
    onAuthStateChanged(this.auth, u => {
      this.user.set(u);
      this.verified.set(!!u?.emailVerified);
      this.initialized.set(true);
      res();
    }));

  whenReady() { return this.ready; }

  async register(email: string, pw: string) {
    const c = await createUserWithEmailAndPassword(this.auth, email, pw);
    await sendEmailVerification(c.user);
  }
  async login(email: string, pw: string) { await signInWithEmailAndPassword(this.auth, email, pw); }
  logout() { return signOut(this.auth); }
  resetPassword(email: string) { return sendPasswordResetEmail(this.auth, email); }
  async resendVerification() { if (this.auth.currentUser) await sendEmailVerification(this.auth.currentUser); }

  /** Recarga el usuario y refresca el token para que las reglas de Firestore vean email_verified. */
  async refresh() {
    const u = this.auth.currentUser;
    if (!u) return false;
    await u.reload();
    if (u.emailVerified) await u.getIdToken(true);
    this.verified.set(u.emailVerified);
    return u.emailVerified;
  }

  msg(e: any) { return ERR[e?.code] ?? `Ha ocurrido un error (${e?.code || e?.message}).`; }
}
