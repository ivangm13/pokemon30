import { Routes } from '@angular/router';
import { authGuard, guestGuard, userGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'tcg',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/tcg-pages').then(m => m.TcgHomePage),
  },
  {
    path: 'tcg/pokemon',
    pathMatch: 'full',
    redirectTo: 'tcg/pokemon/sets',
  },
  {
    path: 'tcg/pokemon/sets',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/tcg-pages').then(m => m.TcgSetsPage),
  },
  {
    path: 'tcg/pokemon/sets/:setId',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/collection').then(m => m.CollectionPage),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/dashboard').then(m => m.DashboardPage),
  },
  {
    path: 'collection',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/collection').then(m => m.CollectionPage),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/profile').then(m => m.ProfilePage),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/settings').then(m => m.SettingsPage),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth-pages').then(m => m.Login),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth-pages').then(m => m.Register),
  },
  {
    path: 'reset',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth-pages').then(m => m.Reset),
  },
  {
    path: 'verify',
    canActivate: [userGuard],
    loadComponent: () => import('./pages/auth-pages').then(m => m.Verify),
  },
  { path: '**', redirectTo: '' },
];
