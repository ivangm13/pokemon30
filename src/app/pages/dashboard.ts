import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CollectionDashboardService } from '../core/collection-dashboard.service';
import { InventoryService } from '../core/inventory.service';
import { fmtMoney } from '../core/valuation';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  template: `
    <div class="page">
      <header class="page-heading">
        <div>
          <p class="eyebrow">TU ESPACIO</p>
          <h1>Dashboard</h1>
          <p class="subtitle">
            @if (inventory.collection(); as collection) {
              Resumen de tus posesiones. Incluye las expansiones de todos tus inventarios.
            } @else { Resumen global de tus inventarios Pokémon TCG. }
          </p>
        </div>
        <a class="primary" routerLink="/collection">Gestionar colección</a>
      </header>

      @if (!inventory.collectionsReady()) {
        <p class="state" role="status">Cargando tus colecciones…</p>
      } @else if (inventory.status().startsWith('Error')) {
        <p class="state error" role="alert">{{ inventory.status() }}</p>
      } @else if (!inventory.collection()) {
        <section class="panel empty" aria-labelledby="empty-title">
          <h2 id="empty-title">Aún no hay una colección disponible</h2>
          <p>Abre la sección de colección para crear o recuperar una colección.</p>
          <a class="primary" routerLink="/collection">Ir a mi colección</a>
        </section>
      } @else if (!inventory.itemsReady()) {
        <p class="state" role="status">Cargando tus inventarios…</p>
      } @else if (!data.ready()) {
        <p class="state" role="status">Cargando datos de las expansiones y sus precios…</p>
      } @else if (data.loadError()) {
        <p class="state error" role="alert">{{ data.loadError() }}</p>
      } @else {
        <section class="metrics" aria-label="Resumen de inventario">
          <article class="metric"><span>Cartas únicas</span><strong>{{ data.counts().unique }}</strong><small>Cada variante poseída cuenta una vez</small></article>
          <article class="metric"><span>Total de copias</span><strong>{{ data.counts().copies }}</strong><small>Incluye todas las unidades</small></article>
          <article class="metric"><span>Copias repetidas</span><strong>{{ data.counts().duplicates }}</strong><small>Unidades por encima de una por variante</small></article>
          <article class="metric"><span>Valor estimado de toda tu colección</span>
            <strong>{{ euroValue() }}</strong>
            <small>
              Incluye todas tus colecciones y expansiones.
              @if (data.valuation().unpriced > 0) { {{ data.valuation().unpriced }} variantes poseídas sin valoración }
              @else { Según los precios de referencia disponibles }
              @if (data.otherCurrencies().length) { · Otras monedas no convertidas }
            </small>
          </article>
          <article class="metric"><span>Expansiones iniciadas</span><strong>{{ data.expansionsStarted() }}</strong><small>al menos una carta conseguida</small></article>
          <article class="metric"><span>Colecciones de la cuenta</span><strong>{{ inventory.collections().length }}</strong><small>Inventarios independientes</small></article>
        </section>

        <section class="panel" aria-labelledby="progress-title">
          <div class="section-heading"><div><p class="eyebrow">PROGRESO</p><h2 id="progress-title">Progreso por expansión</h2></div></div>
          @if (data.expansionProgress().length) {
            <div class="progress-list">
              @for (expansion of data.expansionProgress(); track expansion.id) {
                <article class="expansion">
                  <h3><a [routerLink]="['/tcg', expansion.gameId, 'sets', expansion.id]">{{ expansion.name }}</a></h3>
                  @for (mode of expansion.modes; track mode.key) {
                    <div class="mode-progress">
                      <div class="mode-heading"><span>{{ mode.label }}</span><span>{{ mode.owned }}/{{ mode.total }} · {{ mode.pct }}%</span></div>
                      <div class="track" role="progressbar" [attr.aria-label]="expansion.name + ', ' + mode.label" [attr.aria-valuenow]="mode.pct" aria-valuemin="0" aria-valuemax="100">
                        <span [style.width.%]="mode.pct"></span>
                      </div>
                    </div>
                  } @empty { <p class="muted">Esta expansión no define modalidades de progreso.</p> }
                </article>
              }
            </div>
          } @else {
            <p class="muted">Todavía no hay expansiones añadidas a tus inventarios.</p>
            <a class="secondary" routerLink="/tcg/pokemon/sets">Explorar expansiones</a>
          }
        </section>

        <section class="panel" aria-labelledby="collections-title">
          <div class="section-heading">
            <div><p class="eyebrow">TUS INVENTARIOS</p><h2 id="collections-title">Colecciones</h2></div>
            <a class="secondary" routerLink="/collection">Gestionar nombres y contenido</a>
          </div>
          <ul class="collection-list">
            @for (collection of inventory.collections(); track collection.id) {
              <li>
                <button type="button" [class.selected]="collection.id === inventory.collection()?.id" (click)="openCollection(collection.id)">
                  <span><strong>{{ collection.name }}</strong><small>{{ collection.setIds.length }} expansiones incluidas</small></span>
                  <span class="collection-action">{{ collection.id === inventory.collection()?.id ? 'Seleccionada' : 'Ver resumen' }}</span>
                </button>
              </li>
            } @empty { <li class="muted">No hay colecciones guardadas.</li> }
          </ul>
        </section>
      }
    </div>
  `,
  styles: [`
    :host { display:block; min-height:calc(100vh - 64px); color:#eef0ff; background:radial-gradient(circle at top,#202550,#0d0f26 55%); }
    .page { width:min(1180px,100%); box-sizing:border-box; margin:auto; padding:clamp(1rem,3vw,2rem); }
    .page-heading, .section-heading { display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap; }
    .page-heading { margin-bottom:1.3rem; }
    h1,h2,h3,p { margin-top:0; } h1 { margin-bottom:.25rem; font-size:clamp(1.6rem,4vw,2.2rem); } h2 { margin-bottom:.2rem; font-size:1.2rem; } h3 { margin-bottom:.85rem; font-size:1rem; }
    .eyebrow { margin-bottom:.35rem; color:#ffdc52; font-size:.7rem; font-weight:800; letter-spacing:.14em; }
    .subtitle,.muted { color:#c2c6df; } .subtitle { margin:0; max-width:680px; line-height:1.5; }
    .metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr)); gap:.8rem; margin-bottom:1rem; }
    .metric,.panel { border:1px solid #ffffff24; border-radius:16px; background:#ffffff0d; }
    .metric { display:flex; min-height:120px; flex-direction:column; gap:.35rem; padding:1rem; }
    .metric span { color:#d5d8ed; font-size:.86rem; }
    .metric strong { color:#ffdc52; font-size:1.65rem; overflow-wrap:anywhere; }
    .metric small { color:#c2c6df; font-size:.76rem; line-height:1.4; }
    .panel { margin-bottom:1rem; padding:1.1rem; }
    .section-heading { margin-bottom:.85rem; }
    .progress-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,310px),1fr)); gap:.7rem; }
    .expansion { padding:.9rem; border:1px solid #ffffff20; border-radius:12px; background:#0d0f263d; }
    .mode-progress + .mode-progress { margin-top:.8rem; }
    .mode-heading { display:flex; justify-content:space-between; gap:.5rem; margin-bottom:.35rem; color:#e9eaff; font-size:.82rem; }
    .track { height:9px; overflow:hidden; border-radius:999px; background:#ffffff24; }
    .track span { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#ffcb05,#ff9f43); }
    .collection-list { display:grid; gap:.5rem; margin:0; padding:0; list-style:none; }
    .collection-list button { display:flex; width:100%; align-items:center; justify-content:space-between; gap:.75rem; padding:.8rem; border:1px solid #ffffff24; border-radius:11px; background:#ffffff09; color:#f4f5ff; text-align:left; cursor:pointer; }
    .collection-list button:hover,.collection-list button.selected { border-color:#ffcb05a0; background:#ffcb0512; }
    .collection-list button > span:first-child { display:grid; gap:.2rem; }
    .collection-list small,.collection-action { color:#c2c6df; font-size:.8rem; }
    .collection-action { white-space:nowrap; }
    .primary,.secondary { display:inline-flex; min-height:40px; box-sizing:border-box; align-items:center; justify-content:center; padding:.55rem .9rem; border-radius:999px; font-weight:700; text-decoration:none; }
    .primary { background:#ffcb05; color:#171923; }
    .primary:hover { background:#ffdc52; }
    .secondary { border:1px solid #ffffff35; color:#f4f5ff; font-size:.85rem; }
    .secondary:hover { background:#ffffff12; }
    .empty { max-width:650px; margin:2rem auto; text-align:center; }
    .empty p { color:#c2c6df; }
    .state { padding:1rem; color:#e4e7fb; } .error { color:#ffc2c2; }
    a:focus-visible,button:focus-visible { outline:3px solid #ffdc52; outline-offset:3px; }
    @media(max-width:560px) { .page-heading { align-items:flex-start; } .collection-list button { align-items:flex-start; flex-direction:column; } }
  `],
})
export class DashboardPage {
  readonly inventory = inject(InventoryService);
  readonly data = inject(CollectionDashboardService);
  private readonly router = inject(Router);

  euroValue() {
    const amount = this.data.euros();
    if (amount !== null) return fmtMoney({ EUR: amount });
    return this.data.counts().unique > 0 ? 'Sin valoración' : '—';
  }

  async openCollection(id: string) {
    this.inventory.select(id);
    await this.router.navigate(['/collection'], { queryParams: { id } });
  }
}
