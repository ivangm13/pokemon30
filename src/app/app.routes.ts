import { Routes } from '@angular/router';
import { authGuard, guestGuard, userGuard } from './core/auth.guard';
import { CollectionPage } from './pages/collection';
import { Login, Register, Reset, Verify } from './pages/auth-pages';

export const routes: Routes = [
  { path: '', component: CollectionPage, canActivate: [authGuard] },
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'register', component: Register, canActivate: [guestGuard] },
  { path: 'reset', component: Reset, canActivate: [guestGuard] },
  { path: 'verify', component: Verify, canActivate: [userGuard] },
  { path: '**', redirectTo: '' },
];
