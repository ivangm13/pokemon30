import { Component, computed, inject, signal } from '@angular/core';
import { DOCUMENT, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CatalogService } from '../core/catalog.service';
import { CollectionDashboardService } from '../core/collection-dashboard.service';
import { InventoryService } from '../core/inventory.service';

const pageStyles = `
  :host { display:block; min-height:calc(100vh - 64px); color:#eef0ff; background:radial-gradient(circle at top,#202550,#0d0f26 55%); }
  .page { width:min(1180px,100%); box-sizing:border-box; margin:auto; padding:clamp(1rem,4vw,2.5rem); }
  h1 { margin:.1rem 0 1rem; font-size:clamp(1.7rem,4vw,2.3rem); } h2 { margin:0 0 .4rem; font-size:1.15rem; }
  p { color:#c2c6df; line-height:1.5; } .subtitle { max-width:650px; }
  .eyebrow { margin:0 0 .4rem; color:#ffdc52; font-size:.72rem; font-weight:800; letter-spacing:.14em; }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr)); gap:.8rem; margin-top:1rem; }
  .tile { display:grid; align-content:start; gap:.55rem; padding:1rem; border:1px solid #ffffff24; border-radius:15px; background:#ffffff0d; color:#f4f5ff; text-decoration:none; }
  .tile > span { color:#ffdc52; font-size:1.2rem; font-weight:750; }
  .tile small,.muted { color:#c2c6df; }
  .tile p { margin:0; font-size:.86rem; }
  .primary { display:inline-flex; width:max-content; min-height:40px; box-sizing:border-box; align-items:center; justify-content:center; padding:.55rem .9rem; border-radius:999px; background:#ffcb05; color:#171923; font-weight:700; text-decoration:none; }
  .primary:hover { background:#ffdc52; }
  a:focus-visible,input:focus-visible,select:focus-visible { outline:3px solid #ffdc52; outline-offset:3px; }
  @media(max-width:560px) { .page { padding:1rem; } }
`;

@Component({
  selector: 'app-tcg-home',
  imports: [RouterLink],
  template: `
    <main class="page">
      <p class="eyebrow">CATÁLOGO</p><h1>Juegos de cartas</h1>
      @if (!catalog.manifest()) { <p role="status">Cargando catálogo…</p> }
      @if (catalog.error()) { <p role="alert">{{ catalog.error() }}</p> }
      <section class="tiles" aria-label="Juegos disponibles">
        @for (game of catalog.manifest()?.games ?? []; track game.id) {
          <a class="tile" [routerLink]="['/tcg', game.id]"><span>{{ game.name }}</span><small>Ver expansiones disponibles</small></a>
        }
      </section>
    </main>
  `,
  styles: [pageStyles],
})
export class TcgHomePage {
  readonly catalog = inject(CatalogService);
  constructor() { void this.catalog.loadManifest().catch(() => {}); }
}

@Component({
  selector: 'app-tcg-sets',
  imports: [RouterLink, NgOptimizedImage],
  template: `
    <main class="page">
      <p class="eyebrow">POKÉMON TCG</p><h1>Expansiones</h1>
      <div class="filters">
        <label>Buscar <input type="search" [value]="query()" (input)="query.set($any($event.target).value)" placeholder="Nombre, ID o serie" /></label>
        <label>Serie
          <select [value]="seriesFilter()" (change)="seriesFilter.set($any($event.target).value)">
            <option value="all">Todas</option>
            @for (series of seriesOptions(); track series.id) { <option [value]="series.id">{{ series.name }}</option> }
          </select>
        </label>
      </div>
      @if (!catalog.manifest()) { <p role="status">Cargando expansiones…</p> }
      @if (catalog.error()) { <p role="alert">{{ catalog.error() }}</p> }
      @if (data.loadError()) { <p role="alert">No se pudo cargar el progreso: {{ data.loadError() }}</p> }
      <section class="tiles" aria-label="Expansiones de Pokémon TCG">
        @for (set of filteredSets(); track set.id) {
          <article class="tile">
            <div class="set-card-head">
              <div class="set-card-copy">
                <p class="eyebrow">{{ set.series?.name || 'Serie no indicada' }}</p>
                <h2>{{ set.name }}</h2>
                <p>{{ set.releaseDate || 'Fecha no disponible' }} · {{ set.cardCount?.official ?? set.cardCount?.total ?? '—' }} cartas oficiales</p>
                <small>{{ set.id }} · {{ set.language?.toUpperCase() || 'Idioma no indicado' }}</small>
              </div>
              @if (logoFor(set); as logo) {
                <img class="set-logo" [ngSrc]="logo" width="200" height="110" [alt]="'Logo de ' + set.name" />
              }
            </div>
            @if (progress(set.id); as current) {
              <div class="progress"><span>{{ current.owned }}/{{ current.total }} Base Set · {{ current.pct }}%</span>
                <div class="track" role="progressbar" [attr.aria-label]="set.name + ', progreso Base Set'" [attr.aria-valuenow]="current.pct" aria-valuemin="0" aria-valuemax="100"><i [style.width.%]="current.pct"></i></div>
              </div>
            } @else { <p class="muted">Sin progreso registrado en esta expansión.</p> }
            <a class="primary" [routerLink]="['/tcg/pokemon/sets', set.id]">Ver expansión</a>
          </article>
        } @empty { <p class="muted">No hay expansiones que coincidan con la búsqueda.</p> }
      </section>
    </main>
  `,
  styles: [pageStyles + `
    .filters { display:flex; gap:.8rem; flex-wrap:wrap; margin:1rem 0; }
    .set-card-head { display:flex; align-items:center; justify-content:space-between; gap:1rem; min-height:110px; }
    .set-card-copy { min-width:0; }
    .set-logo { flex:0 0 auto; width:min(38%,200px); height:110px; object-fit:contain; }
    label { display:grid; gap:.35rem; color:#d5d8ed; font-size:.85rem; }
    input,select { min-height:40px; padding:.5rem .7rem; border:1px solid #ffffff33; border-radius:9px; background:#171a39; color:#fff; font:inherit; }
    .progress { margin:.9rem 0; color:#e5e7fa; font-size:.8rem; }
    .track { height:8px; margin-top:.4rem; overflow:hidden; border-radius:99px; background:#ffffff25; }
    .track i { display:block; height:100%; background:linear-gradient(90deg,#ffcb05,#ff9f43); }
    @media(max-width:560px) { .set-card-head { gap:.5rem; } .set-logo { width:34%; height:80px; } }
  `],
})
export class TcgSetsPage {
  readonly catalog = inject(CatalogService);
  readonly inventory = inject(InventoryService);
  readonly data = inject(CollectionDashboardService);
  private readonly document = inject(DOCUMENT);
  readonly query = signal('');
  readonly seriesFilter = signal('all');
  readonly seriesOptions = computed(() => {
    const sets = this.catalog.manifest()?.sets.filter(set => set.gameId === 'pokemon') ?? [];
    return [...new Map(sets.filter(set => set.series).map(set => [set.series!.id, set.series!])).values()];
  });
  readonly filteredSets = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('es');
    return (this.catalog.manifest()?.sets ?? []).filter(set => set.gameId === 'pokemon')
      .filter(set => this.seriesFilter() === 'all' || set.series?.id === this.seriesFilter())
      .filter(set => !query || `${set.id} ${set.name} ${set.series?.name ?? ''}`.toLocaleLowerCase('es').includes(query));
  });
  private readonly logos: Record<string, string> = {
    'pokemon-30th': 'assets/thirty-2x.png',
    me06: 'assets/me06-2x.png',
  };

  constructor() { void this.catalog.loadManifest().catch(() => {}); }

  progress(setId: string) {
    const mode = this.data.expansionProgress().find(set => set.id === setId)?.modes.find(item => item.key === 'base');
    if (!mode) return null;
    return { owned: mode.owned, total: mode.total, pct: mode.pct };
  }

  logoFor(set: { id: string; logo?: string }): string | null {
    const path = set.logo ?? this.logos[set.id];
    return path ? new URL(path, this.document.baseURI).toString() : null;
  }
}

