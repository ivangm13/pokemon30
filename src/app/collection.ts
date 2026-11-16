import { Component, computed, signal } from '@angular/core';
import { CARDS, Card, Group } from './cards';
import { User, onUser, login as cloudLogin, logout, loadCloud, saveCloud } from './cloud';

type State = Record<string, 1 | 2>; // 1 = la tengo, 2 = la tengo repetida
const KEY = 'pokemon30-collection';

@Component({
  selector: 'app-root',
  standalone: true,
  template: `
    <header>
      <h1>Pokémon TCG <b>30th Celebration</b></h1>
      <div class="stats">
        <span><b>{{ owned() }}</b> / {{ total }} cartas</span>
        <span>{{ pct() }}%</span>
        <span>⧉ {{ dups() }} repetidas</span>
        @if (user(); as u) {
          <button class="alt on" (click)="logout()">☁ {{ u.displayName }} · Salir</button>
        } @else {
          <button (click)="login()">☁ Entrar con Google para sincronizar</button>
        }
        <small class="sync">{{ sync() }}</small>
      </div>
      <div class="bar"><i [style.width.%]="pct()"></i></div>
      <input type="search" placeholder="Buscar por nombre o número…" (input)="q.set($any($event.target).value)" />
      <nav>
        @for (t of tabs; track t.k) {
          <button [class.on]="g() === t.k" (click)="g.set(t.k)">{{ t.l }} <small>{{ count(t.k) }}</small></button>
        }
      </nav>
      <nav>
        @for (s of states; track s.k) {
          <button class="alt" [class.on]="st() === s.k" (click)="st.set(s.k)">{{ s.l }}</button>
        }
      </nav>
    </header>

    <main>
      @for (c of list(); track c.id) {
        <div [class]="'card ' + c.group" [class.own]="state()[c.id]" (click)="toggle(c.id)">
          <span class="chk">{{ state()[c.id] ? '✓' : '' }}</span>
          <div class="art">
            <img [src]="c.img" [alt]="c.name" loading="lazy" (error)="$any($event.target).style.display='none'" />
          </div>
          <small>{{ c.num }}</small>
          <strong>{{ c.name }}</strong>
          <em>{{ c.set || c.rarity }}</em>
          <button class="dup" [class.on]="state()[c.id] === 2" [disabled]="!state()[c.id]"
            (click)="dup(c.id); $event.stopPropagation()">⧉ Repetida</button>
        </div>
      } @empty { <p class="empty">No hay cartas con ese filtro.</p> }
    </main>

    <footer>
      <button (click)="exportData()">⬇ Exportar copia</button>
      <label class="btn">⬆ Importar<input type="file" accept=".json" hidden (change)="importData($event)" /></label>
      <button (click)="reset()">Borrar todo</button>
      <p>Tu progreso se guarda automáticamente en este dispositivo. Haz copias con «Exportar».</p>
    </footer>
  `,
  styles: [`
    :host { display:block; min-height:100vh; color:#eef; font-family:system-ui,sans-serif;
      background:radial-gradient(circle at top,#2a2f6b,#0d0f26 60%); padding-bottom:3rem; }
    header { position:sticky; top:0; z-index:5; padding:.8rem 1rem; background:#0d0f26e6; backdrop-filter:blur(8px); border-bottom:1px solid #ffffff22; }
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
  `],
})
export class Collection {
  readonly cards = CARDS;
  readonly total = CARDS.length;
  readonly state = signal<State>(this.load());
  readonly user = signal<User | null>(null);
  readonly sync = signal('Sin sesión: solo se guarda en este navegador');
  login() { cloudLogin().catch(e => this.sync.set('Error de login: ' + (e.code || e.message))); }
  readonly logout = logout;
  readonly q = signal('');
  readonly g = signal<Group | 'all'>('all');
  readonly st = signal<'all' | 'have' | 'missing' | 'dup'>('all');

  readonly tabs: { k: Group | 'all'; l: string }[] = [
    { k: 'all', l: 'Todas' }, { k: 'main', l: 'Principal' }, { k: 'pikachu', l: 'Pikachu' },
    { k: 'secret', l: 'Secretas' }, { k: 'rgb', l: 'Mew RGB' }, { k: 'classic', l: 'Classic' }, { k: 'energy', l: 'Energías' },
  ];
  readonly states = [
    { k: 'all' as const, l: 'Todas' }, { k: 'have' as const, l: 'Las tengo' },
    { k: 'missing' as const, l: 'Me faltan' }, { k: 'dup' as const, l: 'Repetidas' },
  ];

  readonly owned = computed(() => Object.keys(this.state()).length);
  readonly dups = computed(() => Object.values(this.state()).filter(v => v === 2).length);
  readonly pct = computed(() => Math.round((this.owned() / this.total) * 100));

  readonly list = computed(() => {
    const s = this.state(), q = this.q().trim().toLowerCase(), g = this.g(), st = this.st();
    return CARDS.filter((c: Card) =>
      (g === 'all' || c.group === g) &&
      (st === 'all' || (st === 'have' ? !!s[c.id] : st === 'missing' ? !s[c.id] : s[c.id] === 2)) &&
      (!q || c.name.toLowerCase().includes(q) || c.num.toLowerCase().includes(q)));
  });

  constructor() {
    onUser(async u => {
      this.user.set(u);
      if (!u) { this.sync.set('Sin sesión: solo se guarda en este navegador'); return; }
      this.sync.set('Conectando con la nube…');
      try {
        const remote = await loadCloud(u.uid);
        if (remote) this.set(remote, false);   // la nube manda
        else await saveCloud(u.uid, this.state()); // primera vez: sube lo local
        this.sync.set('☁ Sincronizado ✓');
      } catch (e: any) { console.error(e); this.sync.set('Error nube: ' + (e.code || e.message)); }
    });
  }

  count(k: Group | 'all'): string {
    const s = this.state(), l = CARDS.filter(c => k === 'all' || c.group === k);
    return `${l.filter(c => s[c.id]).length}/${l.length}`;
  }

  toggle(id: string) {
    const s = { ...this.state() };
    if (s[id]) delete s[id]; else s[id] = 1;
    this.set(s);
  }
  dup(id: string) {
    const s = { ...this.state() };
    if (s[id]) s[id] = s[id] === 2 ? 1 : 2;
    this.set(s);
  }
  private set(s: State, push = true) {
    this.state.set(s);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
    const u = this.user();
    if (push && u) {
      this.sync.set('Guardando…');
      saveCloud(u.uid, s).then(() => this.sync.set('☁ Guardado ✓'))
        .catch((e: any) => { console.error(e); this.sync.set('Error al guardar: ' + (e.code || e.message)); });
    }
  }
  private load(): State { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }

  exportData() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(this.state())], { type: 'application/json' }));
    a.download = 'pokemon30-coleccion.json'; a.click();
  }
  async importData(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try { this.set(JSON.parse(await f.text())); } catch { alert('Archivo no válido'); }
  }
  reset() { if (confirm('¿Borrar todo tu progreso?')) this.set({}); }
}
