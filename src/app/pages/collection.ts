import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Card, CardSet, Variant, setById, variantId, variantsOf } from '../catalog';
import { AuthService } from '../core/auth.service';
import { InventoryService } from '../core/inventory.service';
import { setStats } from '../core/stats';
import { PlanService } from '../core/plan.service';
import { PriceService } from '../core/price.service';
import { combine, fmtDate, fmtMoney, valuate } from '../core/valuation';

interface Entry { vid: string; setId: string; card: Card; v: Variant; multi: boolean; }

@Component({
  selector: 'app-collection',
  standalone: true,
  template: `
    @if (set(); as s) {
      <div class="head">
        <div class="top">
          <h1>{{ inv.collection()?.name }} · <b>{{ s.name }}</b></h1>
          <div class="user">
            <small>{{ inv.status() }}</small>
            <button class="alt plan" [class.on]="plan.plan() === 'pro'" title="Actualizar plan" (click)="plan.refresh()">{{ plan.plan() === 'pro' ? 'PRO' : 'Gratis' }}</button>
            <button class="alt" (click)="logout()">{{ auth.user()?.email }} · Salir</button>
          </div>
        </div>
        <div class="cols">
          @if (inv.collections().length > 1) {
            <select (change)="inv.select($any($event.target).value)">
              @for (c of inv.collections(); track c.id) {
                <option [value]="c.id" [selected]="c.id === inv.collection()?.id">{{ c.name }}</option>
              }
            </select>
          }
          <button class="alt" (click)="newCollection()">＋ Colección{{ plan.can('multiCollection') ? '' : ' 🔒' }}</button>
          <button class="alt" (click)="renameCollection()">✎ Renombrar</button>
          @if (inv.collection()?.id !== 'main') { <button class="alt" (click)="removeCollection()">🗑 Borrar</button> }
        </div>
        @if (sets().length > 1) {
          <nav>@for (x of sets(); track x.id) { <button [class.on]="x.id === s.id" (click)="setId.set(x.id)">{{ x.name }}</button> }</nav>
        }
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
            <div class="stat val">
              <div class="stat-h"><b>Valor estimado</b><span class="pct">{{ money(grand().totals) }}</span></div>
              <div class="nums">
                <span>⧉ Repetidas: {{ money(grand().dups) }}</span>
                <span>Sin precio: {{ grand().unpriced }}</span>
                <span>Precios: {{ date(grand().updatedAt) }}</span>
              </div>
              @if (vals().length > 1) {
                <div class="nums">@for (x of vals(); track x.name) { <span>{{ x.name }}: {{ money(x.totals) }}</span> }</div>
              }
              <small>Estimación con los precios que has introducido; no es un valor de venta.</small>
            </div>
          } @else {
            <div class="stat lock">💎 <b>Valoración económica</b> <small>Función Pro</small></div>
          }
        </div>
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
              <button class="alt price" (click)="editPrice(e); $event.stopPropagation()">{{ priceLabel(e) }}</button>
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
    .user { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap }
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
    .price { margin-top:.3rem; font-size:.75rem; padding:.2rem .5rem }
    footer { padding-bottom:calc(1rem + env(safe-area-inset-bottom)) }
  `],
})
export class CollectionPage {
  auth = inject(AuthService);
  inv = inject(InventoryService);
  private router = inject(Router);
  plan = inject(PlanService);
  private priceSvc = inject(PriceService);
  money = fmtMoney;
  date = fmtDate;

  readonly sets = computed(() => (this.inv.collection()?.setIds ?? []).map(setById).filter((x): x is CardSet => !!x));
  readonly setId = signal('');
  readonly set = computed(() => this.sets().find(x => x.id === this.setId()) ?? this.sets()[0]);
  readonly q = signal('');
  readonly g = signal('all');
  readonly st = signal<'all' | 'have' | 'missing' | 'dup'>('all');
  readonly legacy = signal(!!this.inv.legacyLocal());
  readonly states = [
    { k: 'all' as const, l: 'Todas' }, { k: 'have' as const, l: 'Las tengo' },
    { k: 'missing' as const, l: 'Me faltan' }, { k: 'dup' as const, l: 'Repetidas' },
  ];

  readonly tabs = computed(() => [{ key: 'all', label: 'Todas' }, ...(this.set()?.groups ?? [])]);
  readonly entries = computed<Entry[]>(() => {
    const s = this.set();
    return s ? s.cards.flatMap(card => variantsOf(card).map(v => ({
      vid: variantId(s.id, card.id, v.key), setId: s.id, card, v, multi: variantsOf(card).length > 1 }))) : [];
  });
  readonly vals = computed(() => {
    const p = this.priceSvc.prices(), q = this.inv.qty();
    return this.sets().map(s => ({ name: s.name, ...valuate(s, q, p) }));
  });
  readonly grand = computed(() => combine(this.vals()));
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

  async logout() { await this.auth.logout(); this.router.navigateByUrl('/login'); }
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

  priceLabel(e: Entry) {
    const p = this.priceSvc.prices()[e.vid];
    return p ? fmtMoney({ [p.currency]: p.amount }) : '＋ precio';
  }
  async editPrice(e: Entry) {
    const cur = this.priceSvc.prices()[e.vid];
    const v = prompt(`Precio de ${e.card.name} (${e.card.num}) en €. Vacío = borrar el precio.`, cur ? String(cur.amount).replace('.', ',') : '');
    if (v === null) return;
    try {
      const t = v.trim().replace(',', '.');
      if (!t) return await this.priceSvc.save(e.vid, null);
      const amount = Number(t);
      if (!isFinite(amount) || amount < 0 || amount > 99999) return alert('Precio no válido');
      await this.priceSvc.save(e.vid, { amount: Math.round(amount * 100) / 100, currency: 'EUR', language: this.set()?.language, source: 'manual' });
    } catch { alert('No se pudo guardar el precio (¿tienes el plan Pro?).'); }
  }

  async newCollection() {
    if (!this.plan.can('multiCollection')) return alert('Tener varias colecciones es una función del plan Pro.');
    const n = prompt('Nombre de la nueva colección');
    if (n?.trim()) await this.inv.createCollection(n);
  }
  async renameCollection() {
    const n = prompt('Nuevo nombre', this.inv.collection()?.name ?? '');
    if (n?.trim()) await this.inv.renameCollection(n);
  }
  async removeCollection() {
    if (confirm(`¿Borrar la colección «${this.inv.collection()?.name}» y todas sus cartas?`)) await this.inv.deleteCollection();
  }
}
