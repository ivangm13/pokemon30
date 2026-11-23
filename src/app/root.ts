import { Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="site-header">
      <a class="brand" routerLink="/dashboard" aria-label="Pokemon30, ir al inicio">
        <span class="brand-mark" aria-hidden="true">P</span>
        <span>Pokemon<span class="brand-accent">30</span></span>
      </a>

      <div class="top-nav">
        @if (auth.initialized()) {
          @if (auth.user(); as user) {
            <details class="account-menu" #accountMenu>
              <summary>
                @if (user.photoURL; as photo) {
                  @if (!avatarFailed()) {
                    <img class="avatar" [src]="photo" alt="" (error)="avatarFailed.set(true)" />
                  } @else {
                    <span class="avatar avatar-initials" aria-hidden="true">{{ initials(user.displayName || user.email?.split('@')[0] || '') }}</span>
                  }
                } @else {
                  <span class="avatar avatar-initials" aria-hidden="true">{{ initials(user.displayName || user.email?.split('@')[0] || '') }}</span>
                }
                <span class="account-name">{{ user.displayName || user.email || 'Mi cuenta' }}</span>
                <span class="menu-chevron" aria-hidden="true">⌄</span>
              </summary>
              <div class="menu-panel">
                <nav aria-label="Menú de usuario">
                  <a routerLink="/dashboard" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeMenu(accountMenu)">Dashboard</a>
                  <a routerLink="/tcg" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeMenu(accountMenu)">Explorar TCG</a>
                  <a routerLink="/collection" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeMenu(accountMenu)">Mi colección</a>
                  <a routerLink="/profile" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeMenu(accountMenu)">Mi perfil</a>
                  <a routerLink="/settings" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeMenu(accountMenu)">Configuración</a>
                  <button type="button" class="logout" (click)="logout(accountMenu)">Cerrar sesión</button>
                  @if (logoutError()) { <p class="menu-error" role="alert">{{ logoutError() }}</p> }
                </nav>
              </div>
            </details>
          } @else {
            <a class="login-link" routerLink="/login">Iniciar sesión</a>
          }
        }
      </div>
    </header>

    <div id="main-content">
      <router-outlet />
    </div>
  `,
  styles: [`
    :host { display:block; min-height:100vh; color:#eef0ff; background:#0d0f26; font-family:system-ui,sans-serif; }
    .site-header { position:sticky; top:0; z-index:20; display:flex; justify-content:space-between; align-items:center; gap:1rem;
      min-height:64px; box-sizing:border-box; padding:.65rem clamp(1rem,4vw,2.5rem); background:#0d0f26f2; border-bottom:1px solid #ffffff24; backdrop-filter:blur(12px); }
    .brand { display:inline-flex; align-items:center; gap:.65rem; color:#fff; font-weight:750; letter-spacing:.01em; text-decoration:none; }
    .brand-mark { display:grid; place-items:center; width:32px; height:32px; border-radius:10px; background:#ffcb05; color:#171923; }
    .brand-accent { color:#ffcb05; }
    .top-nav { display:flex; align-items:center; }
    .account-menu { position:relative; }
    .account-menu summary { display:flex; align-items:center; gap:.55rem; min-height:42px; padding:.25rem .55rem; border:1px solid #ffffff30; border-radius:999px; cursor:pointer; list-style:none; }
    .account-menu summary::-webkit-details-marker { display:none; }
    .account-menu summary:hover, .account-menu[open] summary, .login-link:hover { background:#ffffff16; }
    .avatar { width:30px; height:30px; border-radius:50%; object-fit:cover; }
    .avatar-initials { display:grid; place-items:center; background:#ffcb05; color:#171923; font-size:.78rem; font-weight:800; }
    .account-name { max-width:min(34vw,240px); overflow:hidden; color:#f2f3ff; text-overflow:ellipsis; white-space:nowrap; font-size:.88rem; }
    .menu-chevron { color:#d7daf1; }
    .menu-panel { position:absolute; top:calc(100% + .55rem); right:0; width:min(260px, calc(100vw - 2rem)); padding:.45rem; border:1px solid #ffffff28; border-radius:14px; background:#171a39; box-shadow:0 16px 36px #0008; }
    .menu-panel nav { display:grid; gap:.2rem; }
    .menu-panel a, .menu-panel button, .login-link { display:block; width:100%; box-sizing:border-box; padding:.7rem .8rem; border:0; border-radius:9px; background:transparent; color:#f2f3ff; text-align:left; text-decoration:none; font:inherit; font-size:.9rem; cursor:pointer; }
    .menu-panel a:hover, .menu-panel a.active { background:#ffffff16; color:#ffdc52; }
    .menu-panel .logout { margin-top:.25rem; border-top:1px solid #ffffff22; border-radius:0 0 9px 9px; color:#ffc2c2; }
    .menu-panel .logout:hover { background:#652a3a; }
    .menu-error { margin:.4rem .7rem; color:#ffb8b8; font-size:.82rem; }
    .login-link { width:auto; border:1px solid #ffffff30; border-radius:999px; white-space:nowrap; }
    a:focus-visible, button:focus-visible, summary:focus-visible { outline:3px solid #ffdc52; outline-offset:3px; }
    @media (max-width:520px) {
      .site-header { min-height:58px; padding:.55rem .75rem; }
      .brand { gap:.45rem; font-size:.92rem; }
      .account-menu summary { gap:.35rem; padding:.2rem .35rem; }
      .account-name { max-width:38vw; font-size:.8rem; }
    }
  `],
})
export class Root {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly logoutError = signal('');
  readonly avatarFailed = signal(false);

  constructor() {
    effect(() => {
      this.auth.user()?.photoURL;
      this.avatarFailed.set(false);
    });
  }

  initials(value: string) {
    const words = value.trim().split(/[\s@._-]+/).filter(Boolean);
    return words.slice(0, 2).map(word => word[0].toLocaleUpperCase()).join('') || 'U';
  }

  closeMenu(menu: HTMLDetailsElement) { menu.open = false; }

  async logout(menu: HTMLDetailsElement) {
    this.logoutError.set('');
    try {
      await this.auth.logout();
      menu.open = false;
      await this.router.navigateByUrl('/login');
    } catch {
      this.logoutError.set('No se pudo cerrar la sesión. Inténtalo de nuevo.');
    }
  }
}
