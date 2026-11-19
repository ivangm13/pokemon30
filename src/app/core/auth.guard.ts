import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Rutas privadas: exige sesión y correo verificado. */
export const authGuard: CanActivateFn = async () => {
  const a = inject(AuthService), r = inject(Router);
  await a.whenReady();
  return !a.user() ? r.parseUrl('/login') : !a.verified() ? r.parseUrl('/verify') : true;
};
/** Login/registro: si ya hay sesión, redirige. */
export const guestGuard: CanActivateFn = async () => {
  const a = inject(AuthService), r = inject(Router);
  await a.whenReady();
  return a.user() ? r.parseUrl(a.verified() ? '/' : '/verify') : true;
};
/** Pantalla de verificación: solo con sesión iniciada. */
export const userGuard: CanActivateFn = async () => {
  const a = inject(AuthService), r = inject(Router);
  await a.whenReady();
  return a.user() ? true : r.parseUrl('/login');
};
