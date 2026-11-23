import { Component, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../core/auth.service';
import { CollectionDashboardService } from '../core/collection-dashboard.service';
import { InventoryService } from '../core/inventory.service';
import { PlanService } from '../core/plan.service';

@Component({
  selector: 'app-profile',
  template: `
    <div class="page">
      <p class="eyebrow">CUENTA</p>
      <h1>Mi perfil</h1>
      @if (auth.user(); as user) {
        <section class="profile-card" aria-label="Datos del perfil">
          @if (user.photoURL; as photo) {
            @if (!avatarFailed()) {
              <img class="avatar" [src]="photo" alt="" (error)="avatarFailed.set(true)" />
            } @else {
              <span class="avatar initials" aria-hidden="true">{{ initials() }}</span>
            }
          } @else {
            <span class="avatar initials" aria-hidden="true">{{ initials() }}</span>
          }
          <div class="identity"><h2>{{ displayName() }}</h2><p>{{ user.email || 'Email no disponible' }}</p></div>
        </section>

        <section class="panel" aria-labelledby="account-title">
          <h2 id="account-title">Resumen de cuenta</h2>
          <dl>
            <div><dt>Nombre visible</dt><dd>{{ displayName() }}</dd></div>
            <div><dt>Email</dt><dd>{{ user.email || 'No disponible' }}</dd></div>
            <div><dt>Cuenta creada</dt><dd>{{ createdAt() }}</dd></div>
            <div><dt>Plan</dt><dd><span class="plan">{{ plan.plan() === 'pro' ? 'Pro' : 'Free' }}</span></dd></div>
            <div><dt>Colecciones</dt><dd>{{ inventory.collectionsReady() ? inventory.collections().length : 'Cargando…' }}</dd></div>
            <div><dt>Inventario seleccionado</dt><dd>{{ inventory.collection()?.name || 'Sin colección seleccionada' }}</dd></div>
            <div><dt>Cartas únicas / copias</dt><dd>{{ data.counts().unique }} / {{ data.counts().copies }}</dd></div>
          </dl>
          <p class="note">El plan se muestra desde el estado de autenticación. Esta pantalla no permite cambiarlo.</p>
        </section>
      } @else {
        <p class="state" role="status">Cargando los datos de la cuenta…</p>
      }
    </div>
  `,
  styles: [`
    :host { display:block; min-height:calc(100vh - 64px); color:#eef0ff; background:radial-gradient(circle at top,#202550,#0d0f26 55%); }
    .page { width:min(820px,100%); box-sizing:border-box; margin:auto; padding:clamp(1rem,4vw,2.5rem); }
    .eyebrow { margin:0 0 .3rem; color:#ffdc52; font-size:.7rem; font-weight:800; letter-spacing:.14em; }
    h1 { margin:0 0 1.2rem; font-size:clamp(1.6rem,4vw,2.2rem); } h2 { margin:0; font-size:1.1rem; }
    .profile-card,.panel { border:1px solid #ffffff24; border-radius:16px; background:#ffffff0d; }
    .profile-card { display:flex; align-items:center; gap:1rem; margin-bottom:1rem; padding:1.1rem; }
    .avatar { display:block; width:72px; height:72px; flex:0 0 72px; border-radius:50%; object-fit:cover; }
    .initials { display:grid; place-items:center; background:#ffcb05; color:#171923; font-size:1.4rem; font-weight:800; }
    .identity h2 { margin-bottom:.3rem; color:#ffdc52; } .identity p { margin:0; color:#c2c6df; overflow-wrap:anywhere; }
    .panel { padding:1.1rem; }
    dl { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr)); gap:0 1rem; margin:1rem 0; }
    dl div { padding:.7rem 0; border-bottom:1px solid #ffffff1a; }
    dt { margin-bottom:.25rem; color:#c2c6df; font-size:.8rem; }
    dd { margin:0; color:#f4f5ff; overflow-wrap:anywhere; }
    .plan { display:inline-block; padding:.18rem .55rem; border-radius:999px; background:#ffffff18; font-size:.82rem; }
    .note,.state { color:#c2c6df; font-size:.85rem; line-height:1.5; }
    .note { margin:1rem 0 0; }
  `],
})
export class ProfilePage {
  readonly auth = inject(AuthService);
  readonly inventory = inject(InventoryService);
  readonly data = inject(CollectionDashboardService);
  readonly plan = inject(PlanService);
  private readonly user = computed(() => this.auth.user());
  readonly avatarFailed = signal(false);

  constructor() {
    effect(() => {
      this.user()?.photoURL;
      this.avatarFailed.set(false);
    });
  }

  displayName() {
    const user = this.user();
    return user?.displayName?.trim() || user?.email?.split('@')[0] || 'Coleccionista';
  }

  initials() {
    return this.displayName().split(/[\s._-]+/).filter(Boolean).slice(0, 2)
      .map(part => part[0].toLocaleUpperCase()).join('') || 'U';
  }

  createdAt() {
    const date = this.user()?.metadata.creationTime;
    return date ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date(date)) : 'No disponible';
  }
}
