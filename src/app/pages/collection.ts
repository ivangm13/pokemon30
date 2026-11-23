import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { Card, CardSet, Variant, variantId, variantsOf } from '../catalog';
import { CatalogService } from '../core/catalog.service';
import { InventoryService } from '../core/inventory.service';
import { setStats } from '../core/stats';
import { PlanService } from '../core/plan.service';
import { PriceService } from '../core/price.service';
import { fmtDate, fmtMoney, valuate } from '../core/valuation';
import { ValuablePrice } from '../core/pricing';

interface Entry { vid: string; setId: string; card: Card; v: Variant; multi: boolean; }

@Component({
  selector: 'app-collection',
  standalone: true,
  template: `
    @if (showCollectionPicker()) {
      <section class="collection-picker" aria-labelledby="collection-picker-title">
        <p class="eyebrow">TUS INVENTARIOS</p>
        <h1 id="collection-picker-title">Elige una colección</h1>
        <p>Selecciona qué colección quieres consultar.</p>
        <ul>
          @for (collection of inv.collections(); track collection.id) {
            <li><button type="button" (click)="openCollection(collection.id)">
              <strong>{{ collection.name }}</strong><span>{{ collection.setIds.length }} expansiones</span>
            </button></li>
          }
        </ul>
      </section>
    } @else if (set(); as s) {
      <div class="head">
        <div class="top">
          <h1>{{ inv.collection()?.name }} · {{ s.name }}</h1>
        </div>
        @if (!inv.collection()?.setIds.includes(s.id)) {
          <div class="banner">Esta expansión todavía no forma parte de este inventario.
            <button type="button" (click)="addExpansion(s.id)">Añadir a mi colección</button>
          </div>
        }
        @if (!routeSetId() && sets().length > 1) {
          @if (sets().length <= 3) {
            <nav class="set-switcher" aria-label="Expansiones de esta colección">
              @for (x of sets(); track x.id) { <button [class.on]="x.id === s.id" (click)="setId.set(x.id)">{{ x.name }}</button> }
            </nav>
          } @else {
            <label class="set-picker">Expansión mostrada
              <select [value]="s.id" (change)="setId.set($any($event.target).value)">
                @for (x of sets(); track x.id) { <option [value]="x.id">{{ x.name }}</option> }
              </select>
            </label>
          }
        }
        <details class="overview">
          <summary>Progreso y valoración de {{ s.name }}</summary>
          <div class="overview-status"><small>{{ inv.status() }}</small></div>
          <div class="overview-actions">
            @if (inv.collections().length > 1) {
              <label>Colección
                <select [value]="inv.collection()?.id" (change)="openCollection($any($event.target).value)">
                  @for (c of inv.collections(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
                </select>
              </label>
            }
            @if (inv.collection()?.id !== 'main') { <button class="alt" (click)="removeCollection()">🗑 Borrar colección</button> }
          </div>
          @if (legacy()) {
            <div class="banner">Hemos encontrado datos de la versión anterior en este navegador.
              <button (click)="importLegacy()">Importarlos</button></div>
          }
          <div class="panel">
            @for (m of stats(); track m.key) {
              <div class="stat">
                <div class="stat-h"><b>{{ m.label }}</b><span class="pct">{{ m.pct }}%</span></div>
                <div class="bar"><i [style.width.%]="m.pct"></i></div>
                <div class="nums">
                  <span>✓ {{ m.owned }}/{{ m.total }}</span>
                  <span>Pendientes {{ m.missing }}</span>
                  <span>⧉ Repetidas {{ m.dups }}</span>
                </div>
              </div>
            }
            @if (plan.can('valuation')) {
              @for (valuation of vals(); track valuation.id) {
                <div class="stat val">
                  <div class="stat-h"><b>{{ valuation.name }} · Valor estimado</b><span class="pct">{{ valuationMoney(valuation.totals) }}</span></div>
                  <div class="nums">
                    <span>⧉ Repetidas: {{ money(valuation.dups) }}</span>
                    <span>Sin precio: {{ valuation.unpriced }}</span>
                    <span>Precios: {{ date(valuation.updatedAt) }}</span>
                  </div>
                  <small>Valoración de referencia compartida de Cardmarket.</small>
                </div>
              }
            } @else {
              <div class="stat lock">💎 <b>Valoración económica</b> <small>Función Pro</small></div>
            }
          </div>
        </details>
      </div>

      <header>
        <input type="search" placeholder="Buscar por nombre o número…" (input)="q.set($any($event.target).value)" />
        <nav>
          @for (t of tabs(); track t.key) {
            <button [class.on]="g() === t.key" (click)="g.set(t.key)">{{ t.label }} <small>{{ count(t.key) }}</small></button>
          }
        </nav>
        <nav>
          @for (x of states; track x.k) {
            <button class="alt" [class.on]="st() === x.k" (click)="st.set(x.k)">{{ x.l }}</button>
          }
        </nav>
      </header>

      <main>
        @for (e of list(); track e.vid) {
          <div [class]="'card ' + e.card.tags[0]" [class.own]="n(e) > 0" (click)="toggle(e)">
            <span class="chk">{{ n(e) > 0 ? '✓' : '' }}</span>
            <div class="art">
              <img [src]="e.card.img" [alt]="e.card.name" loading="lazy" (error)="$any($event.target).style.display='none'" />
              @if (n(e) > 1) { <span class="badge">×{{ n(e) }}</span> }
            </div>
            <small>{{ e.card.num }}</small>
            <strong>{{ e.card.name }}</strong>
            <em>{{ e.multi ? e.v.label : (e.card.note || e.card.rarity) }}</em>
            @if (plan.can('valuation')) {
              <div class="price" (click)="$event.stopPropagation()">
                @if (priceFor(e); as p) {
                  <span>Unitario: {{ priceMoney(p) }}</span>
                  @if (n(e) > 0) { <strong>Total (×{{ n(e) }}): {{ totalPrice(e, p) }}</strong> }
                  <small>Cardmarket · {{ date(p.updatedAt) }} · {{ p.sourceField }}</small>
                } @else { <span>Sin valoración</span> }
              </div>
            }
            @if (n(e) > 0) {
              <div class="step" (click)="$event.stopPropagation()">
                <button (click)="add(e, -1)">−</button><span>{{ n(e) }}</span><button (click)="add(e, 1)">+</button>
              </div>
            }
          </div>
        } @empty { <p class="empty">No hay cartas con ese filtro.</p> }
      </main>

      <footer>
        <button (click)="exportData()">⬇ Exportar copia</button>
        <label class="btn">⬆ Importar<input type="file" accept=".json" hidden (change)="onFile($event)" /></label>
      </footer>
    } @else { <p class="empty">Cargando tu colección…</p> }
  `,
  styles: [`
    :host { display:block; min-height:100vh; color:#eef; font-family:system-ui,sans-serif;
      background:radial-gradient(circle at top,#2a2f6b,#0d0f26 60%); padding-bottom:3rem; }
    .collection-picker { width:min(680px, calc(100% - 2rem)); margin:clamp(2rem,8vh,5rem) auto; padding:1.25rem; border:1px solid #ffffff24; border-radius:16px; background:#ffffff0d; }
    .collection-picker .eyebrow { color:#ffdc52; font-size:.75rem; font-weight:800; letter-spacing:.12em; }
    .collection-picker h1 { margin:.2rem 0 .5rem; }
    .collection-picker p { color:#c2c6df; }
    .collection-picker ul { display:grid; gap:.65rem; margin:1rem 0 0; padding:0; list-style:none; }
    .collection-picker button { display:flex; width:100%; justify-content:space-between; gap:1rem; padding:1rem; border:1px solid #ffffff30; border-radius:12px; background:#ffffff0d; color:#fff; text-align:left; cursor:pointer; }
    .collection-picker button:hover { border-color:#ffcb05; background:#ffcb0512; }
    .collection-picker button span { color:#c2c6df; }
    button:focus-visible { outline:3px solid #ffdc52; outline-offset:3px; }
    header { position:sticky; top:env(safe-area-inset-top,0px); z-index:5; padding:.8rem 1rem; background:#0d0f26e6; backdrop-filter:blur(8px); border-bottom:1px solid #ffffff22; }
    h1 { margin:0 0 .4rem; font-size:1.2rem; font-weight:500 } h1 b { color:#ffcb05 }
    .stats { display:flex; gap:1rem; flex-wrap:wrap; font-size:.9rem; margin-bottom:.4rem }
    .bar { height:8px; border-radius:8px; background:#ffffff22; overflow:hidden; margin-bottom:.6rem }
    .bar i { display:block; height:100%; background:linear-gradient(90deg,#ffcb05,#ff7a18); transition:width .3s }
    input[type=search] { width:100%; box-sizing:border-box; padding:.55rem .8rem; border-radius:10px; border:1px solid #ffffff33; background:#ffffff12; color:#fff; margin-bottom:.5rem }
    nav { display:flex; gap:.4rem; overflow-x:auto; padding-bottom:.4rem }
    button, .btn { cursor:pointer; border:1px solid #ffffff33; background:#ffffff12; color:#fff; border-radius:999px; padding:.35rem .8rem; white-space:nowrap; font-size:.85rem }
    button.on { background:#ffcb05; color:#111; border-color:#ffcb05 } button.alt.on { background:#7c8cff; color:#fff }
    small { opacity:.7 }
    main { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:.7rem; padding:1rem; max-width:1200px; margin:auto }
    .card { --c:#7c8cff; position:relative; display:flex; flex-direction:column; gap:.2rem; padding:.8rem; border-radius:14px; cursor:pointer;
      background:#ffffff0d; border:1px solid #ffffff22; border-top:4px solid var(--c); transition:.15s; user-select:none }
    .art { aspect-ratio:5/7; border-radius:8px; overflow:hidden; background:#ffffff10; margin-bottom:.3rem }
    .art img { width:100%; height:100%; object-fit:cover; display:block; filter:grayscale(1) brightness(.55); transition:.25s }
    .card:hover { transform:translateY(-3px) }
    .card.own { background:#ffffff1f; box-shadow:0 0 18px -4px var(--c) }
    .card.own .art img { filter:none }
    .pikachu { --c:#ffcb05 } .secret { --c:#ff5fa2 } .rgb { --c:#35e0c2 } .classic { --c:#ff9f43 } .energy { --c:#aaa }
    .card strong { font-size:.95rem; } .card em { font-size:.75rem; opacity:.7; font-style:normal }
    .chk { position:absolute; z-index:2; top:1rem; right:1rem; background:#0d0f26cc; width:22px; height:22px; border-radius:50%; border:2px solid #ffffff55; display:grid; place-items:center; font-size:.8rem; color:#111 }
    .own .chk { background:var(--c); border-color:var(--c) }
    .dup { margin-top:.4rem; font-size:.75rem; padding:.25rem .5rem } .dup.on { background:#35e0c2; color:#111; border-color:#35e0c2 } .dup:disabled { opacity:.3; cursor:default }
    footer { text-align:center; padding:1rem } footer p { font-size:.8rem; opacity:.6 } footer button, footer .btn { margin:.2rem; display:inline-block }
    .empty { grid-column:1/-1; text-align:center; opacity:.6 }
  
    .head { padding:calc(.8rem + env(safe-area-inset-top,0px)) 1rem 0; max-width:1200px; margin:auto }
    .top { display:flex; justify-content:space-between; align-items:center; gap:.5rem; flex-wrap:wrap; margin-bottom:.5rem }
    .overview { margin:.55rem 0 .8rem; border:1px solid #ffffff24; border-radius:12px; background:#ffffff08; }
    .overview > summary { padding:.75rem .9rem; color:#ffdc52; cursor:pointer; font-weight:650; }
    .overview > summary:focus-visible { outline:3px solid #ffdc52; outline-offset:3px; border-radius:10px; }
    .overview-actions { display:flex; align-items:end; flex-wrap:wrap; gap:.65rem; padding:0 .8rem .7rem; }
    .overview-status { padding:0 .8rem .65rem; color:#c2c6df; }
    .overview-actions label,.set-picker { display:grid; gap:.35rem; color:#d5d8ed; font-size:.82rem; }
    .overview select,.set-picker select { min-height:38px; padding:.4rem .65rem; border:1px solid #ffffff35; border-radius:9px; background:#171a39; color:#fff; font:inherit; }
    .set-switcher { margin:.55rem 0; }
    .set-picker { width:min(100%,360px); margin:.6rem 0; }
    .panel { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:.6rem; margin-bottom:.8rem }
    .stat { padding:.7rem .9rem; border-radius:12px; background:#ffffff12; border:1px solid #ffffff22 }
    .stat-h { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:.3rem }
    .pct { font-size:1.6rem; font-weight:700; color:#ffcb05 }
    .nums { display:flex; gap:.8rem; flex-wrap:wrap; font-size:.8rem; opacity:.85 }
    .banner { padding:.6rem .8rem; border-radius:12px; background:#ffcb0526; border:1px solid #ffcb05; margin-bottom:.6rem; font-size:.9rem }
    .art { position:relative }
    .badge { position:absolute; left:.4rem; bottom:.4rem; background:#0d0f26dd; border-radius:999px; padding:.1rem .5rem; font-size:.8rem; font-weight:700 }
    .step { display:flex; align-items:center; justify-content:center; gap:.7rem; margin-top:.4rem }
    .step button { width:30px; height:30px; padding:0; font-size:1rem }
    .cols { display:flex; gap:.4rem; flex-wrap:wrap; align-items:center; margin-bottom:.6rem }
    select { padding:.4rem .6rem; border-radius:999px; border:1px solid #ffffff33; background:#1b1f4a; color:#fff }
    .plan.on { background:#35e0c2; color:#111; border-color:#35e0c2 }
    .val { grid-column:1/-1 } .val small { display:block; opacity:.7; margin-top:.3rem }
    .lock { opacity:.6; display:flex; gap:.5rem; align-items:center }
    .price { display:flex; flex-direction:column; gap:.15rem; min-width:0; margin-top:.3rem; font-size:.75rem; padding:.2rem .3rem; cursor:default; overflow-wrap:anywhere }
    footer { padding-bottom:calc(1rem + env(safe-area-inset-bottom)) }
  `],
})
export class CollectionPage {
  inv = inject(InventoryService);
  plan = inject(PlanService);
  private priceSvc = inject(PriceService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly catalog = inject(CatalogService);
  private readonly routeCollectionId = toSignal(this.route.queryParamMap.pipe(map(params => params.get('id'))), { initialValue: null });
  readonly routeSetId = toSignal(this.route.paramMap.pipe(map(params => params.get('setId'))), { initialValue: this.route.snapshot.paramMap.get('setId') });
  readonly showCollectionPicker = computed(() => !this.routeSetId() && this.inv.collections().length > 1 && !this.routeCollectionId());
  money = fmtMoney;
  date = fmtDate;

  readonly sets = computed(() => (this.inv.collection()?.setIds ?? [])
    .map(id => this.catalog.loadedSets()[id]).filter((set): set is CardSet => !!set));
  readonly setId = signal('');
  readonly set = computed(() => {
    const routeId = this.routeSetId();
    if (routeId) return this.catalog.loadedSets()[routeId];
    return this.sets().find(set => set.id === this.setId()) ?? this.sets()[0];
  });
  readonly q = signal('');
  readonly g = signal('all');
  readonly st = signal<'all' | 'have' | 'missing' | 'dup'>('all');
  readonly legacy = signal(!!this.inv.legacyLocal());
  readonly states = [
    { k: 'all' as const, l: 'Todas' }, { k: 'have' as const, l: 'Las tengo' },
    { k: 'missing' as const, l: 'Me faltan' }, { k: 'dup' as const, l: 'Repetidas' },
  ];

  constructor() {
    effect(() => {
      const requested = this.routeSetId();
      const ids = [...new Set([...(this.inv.collection()?.setIds ?? []), ...(requested ? [requested] : [])])];
      if (!ids.length) return;
      untracked(() => {
        void Promise.all([this.catalog.loadSets(ids), this.priceSvc.loadSets(ids)]).catch(error => {
          this.inv.status.set('Error: ' + (error instanceof Error ? error.message : 'No se pudo cargar la expansión.'));
        });
      });
    });
    effect(() => {
      const id = this.routeCollectionId();
      if (id && this.inv.collectionsReady() && this.inv.collections().some(collection => collection.id === id)) {
        this.inv.select(id);
      }
    });
  }

  async openCollection(id: string) {
    this.inv.select(id);
    await this.router.navigate([], { relativeTo: this.route, queryParams: { id }, replaceUrl: true });
  }

  async addExpansion(id: string) { await this.inv.addSetToCollection(id); }

  readonly tabs = computed(() => [{ key: 'all', label: 'Todas' }, ...(this.set()?.groups ?? [])]);
  readonly entries = computed<Entry[]>(() => {
    const s = this.set();
    return s ? s.cards.flatMap(card => variantsOf(card).map(v => ({
      vid: variantId(s.id, card.id, v.key), setId: s.id, card, v, multi: variantsOf(card).length > 1 }))) : [];
  });
  readonly vals = computed(() => {
    const set = this.set();
    return set ? [{ id: set.id, name: set.name, ...valuate(set, this.inv.qty(), this.priceSvc.prices()) }] : [];
  });
  readonly stats = computed(() => { const s = this.set(); return s ? setStats(s, this.inv.qty()) : []; });
  readonly list = computed(() => {
    const g = this.g(), st = this.st(), q = this.q().trim().toLowerCase(), m = this.inv.qty();
    return this.entries().filter(e => {
      const n = m[e.vid] || 0;
      return (g === 'all' || e.card.tags.includes(g)) &&
        (st === 'all' || (st === 'have' ? n > 0 : st === 'missing' ? n === 0 : n > 1)) &&
        (!q || e.card.name.toLowerCase().includes(q) || e.card.num.toLowerCase().includes(q));
    });
  });

  n(e: Entry) { return this.inv.qty()[e.vid] || 0; }
  count(k: string) {
    const l = this.entries().filter(e => k === 'all' || e.card.tags.includes(k));
    return `${l.filter(e => this.n(e) > 0).length}/${l.length}`;
  }
  toggle(e: Entry) { const n = this.n(e); if (n <= 1) this.inv.setQty(e.setId, e.vid, n ? 0 : 1); } // con varias copias, usa − / +
  add(e: Entry, d: number) { this.inv.setQty(e.setId, e.vid, this.n(e) + d); }

  exportData() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ version: 2, items: this.inv.qty() })], { type: 'application/json' }));
    a.download = 'coleccion-tcg.json'; a.click();
  }
  async onFile(e: Event) {
    const input = e.target as HTMLInputElement, f = input.files?.[0];
    if (!f) return;
    try { alert(`${await this.inv.importData(JSON.parse(await f.text()))} cartas importadas`); }
    catch { alert('Archivo no válido'); }
    input.value = '';
  }
  async importLegacy() { alert(`${await this.inv.importLegacyLocal()} cartas importadas`); this.legacy.set(false); }

  priceFor(e: Entry): ValuablePrice | null {
    const p = this.priceSvc.prices()[e.vid];
    return p?.status === 'validated' && p.source === 'cardmarket' && p.sourceField === 'trend'
      && typeof p.amount === 'number' && Number.isFinite(p.amount) && p.amount > 0
      && typeof p.productId === 'number' && Number.isInteger(p.productId) && p.productId > 0 ? p as ValuablePrice : null;
  }
  valuationMoney(totals: Record<string, number>) {
    return Object.keys(totals).length ? fmtMoney(totals) : 'Sin valoración';
  }
  priceMoney(price: ValuablePrice) { return fmtMoney({ [price.currency]: price.amount }); }
  totalPrice(entry: Entry, price: ValuablePrice) { return fmtMoney({ [price.currency]: price.amount * this.n(entry) }); }

  async removeCollection() {
    if (confirm(`¿Borrar la colección «${this.inv.collection()?.name}» y todas sus cartas?`)) await this.inv.deleteCollection();
  }
}
