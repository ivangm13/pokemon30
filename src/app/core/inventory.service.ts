import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  collection, deleteDoc, doc, getDocs, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { POKEMON_30TH, SETS, VARIANT_IDS, variantId } from '../catalog';
import { AuthService } from './auth.service';
import { db } from './firebase';

const LEGACY_KEY = 'pokemon30-collection';   // datos de la versión anterior (localStorage)
const LEGACY_DONE = 'pokemon30-legacy-imported';
const ACTIVE_KEY = 'pokemon30-active-collection';

export interface CollectionInfo { id: string; name: string; setIds: string[]; }

/**
 * Datos privados del usuario:
 *   users/{uid}/collections/{cid}              { name, gameId, setIds, createdAt }
 *   users/{uid}/collections/{cid}/items/{vid}  { setId, qty }   (qty 0 = se borra el documento)
 * "main" es la colección gratuita; el plan Pro puede crear más.
 */
@Injectable({ providedIn: 'root' })
export class InventoryService {
  private auth = inject(AuthService);
  readonly collections = signal<CollectionInfo[]>([]);
  readonly activeId = signal(this.stored());
  readonly collection = computed(() => this.collections().find(c => c.id === this.activeId()) ?? this.collections()[0] ?? null);
  private readonly cid = computed(() => this.collection()?.id ?? '');
  readonly qty = signal<Record<string, number>>({});
  readonly status = signal('');
  private unsubCols?: () => void;
  private unsubItems?: () => void;
  private creating = false;

  constructor() {
    effect(() => { // lista de colecciones
      const u = this.auth.user(), ok = this.auth.verified();
      untracked(() => {
        this.unsubCols?.(); this.unsubCols = undefined;
        this.collections.set([]);
        if (u && ok) this.watchCollections(u.uid);
      });
    });
    effect(() => { // inventario de la colección activa
      const id = this.cid(), u = this.auth.user();
      untracked(() => {
        this.unsubItems?.(); this.unsubItems = undefined;
        this.qty.set({});
        if (u && this.auth.verified() && id) this.watchItems(u.uid, id);
      });
    });
  }

  private stored() { try { return localStorage.getItem(ACTIVE_KEY) || ''; } catch { return ''; } }
  private colPath(uid: string, cid: string) { return `users/${uid}/collections/${cid}`; }
  private fail(e: any) { this.status.set('Error: ' + (e?.code || e?.message)); }

  private watchCollections(uid: string) {
    this.status.set('Conectando…');
    this.unsubCols = onSnapshot(collection(db, `users/${uid}/collections`), async s => {
      const list: CollectionInfo[] = s.docs.map(d => ({ id: d.id, name: d.data()['name'], setIds: d.data()['setIds'] ?? [] }));
      list.sort((a, b) => (a.id === 'main' ? -1 : b.id === 'main' ? 1 : a.name.localeCompare(b.name)));
      this.collections.set(list);
      if (s.empty && !s.metadata.fromCache && !this.creating) { // primera vez: crea la colección gratuita
        this.creating = true;
        try { await this.createWith(uid, 'main', 'Mi colección'); } catch (e) { this.fail(e); } finally { this.creating = false; }
      }
    }, e => this.fail(e));
  }

  private watchItems(uid: string, cid: string) {
    this.unsubItems = onSnapshot(collection(db, `${this.colPath(uid, cid)}/items`), s => {
      const m: Record<string, number> = {};
      s.forEach(d => (m[d.id] = d.data()['qty']));
      this.qty.set(m);
      this.status.set(s.metadata.hasPendingWrites ? 'Guardando…' : '☁ Sincronizado');
    }, e => this.fail(e));
  }

  private createWith(uid: string, id: string, name: string) {
    return setDoc(doc(db, this.colPath(uid, id)), {
      name, gameId: 'pokemon', setIds: SETS.filter(x => x.gameId === 'pokemon').map(x => x.id), createdAt: serverTimestamp(),
    });
  }

  select(id: string) { this.activeId.set(id); try { localStorage.setItem(ACTIVE_KEY, id); } catch {} }

  async createCollection(name: string) {
    const u = this.auth.user();
    if (!u) return;
    const id = doc(collection(db, `users/${u.uid}/collections`)).id;
    try { await this.createWith(u.uid, id, name.trim().slice(0, 60)); this.select(id); } catch (e) { this.fail(e); }
  }
  async renameCollection(name: string) {
    const u = this.auth.user(), id = this.cid();
    if (!u || !id) return;
    try { await updateDoc(doc(db, this.colPath(u.uid, id)), { name: name.trim().slice(0, 60) }); } catch (e) { this.fail(e); }
  }
  async deleteCollection() {
    const u = this.auth.user(), id = this.cid();
    if (!u || !id || id === 'main') return;
    try {
      const items = await getDocs(collection(db, `${this.colPath(u.uid, id)}/items`));
      for (let i = 0; i < items.docs.length; i += 400) {
        const b = writeBatch(db);
        items.docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
        await b.commit();
      }
      await deleteDoc(doc(db, this.colPath(u.uid, id)));
      this.select('main');
    } catch (e) { this.fail(e); }
  }

  async setQty(setId: string, vid: string, q: number) {
    const u = this.auth.user(), id = this.cid();
    if (!u || !id) return;
    q = Math.max(0, Math.min(999, Math.floor(q)));
    const ref = doc(db, `${this.colPath(u.uid, id)}/items/${vid}`);
    try { await (q === 0 ? deleteDoc(ref) : setDoc(ref, { setId, qty: q })); }
    catch (e: any) { this.status.set('Error al guardar: ' + (e.code || e.message)); }
  }

  /** Importa JSON v2 {version:2, items:{variantId:qty}} o el formato antiguo {idCarta: 1|2}. No pisa lo que ya tienes. */
  async importData(raw: any): Promise<number> {
    const u = this.auth.user(), id = this.cid();
    if (!u || !id) return 0;
    const entries: [string, number][] = raw?.items
      ? Object.entries(raw.items)
      : Object.entries(raw ?? {}).map(([k, q]) => [variantId(POKEMON_30TH.id, k, 'normal'), q as number]);
    const todo = entries.filter(([v, q]) => VARIANT_IDS.has(v) && Number(q) >= 1 && !this.qty()[v]);
    for (let i = 0; i < todo.length; i += 400) {
      const b = writeBatch(db);
      for (const [v, q] of todo.slice(i, i + 400))
        b.set(doc(db, `${this.colPath(u.uid, id)}/items/${v}`), { setId: v.split(':')[0], qty: Math.min(999, Math.floor(Number(q))) });
      await b.commit();
    }
    return todo.length;
  }

  legacyLocal(): Record<string, number> | null {
    try {
      if (localStorage.getItem(LEGACY_DONE)) return null;
      const o = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
      return o && Object.keys(o).length ? o : null;
    } catch { return null; }
  }
  async importLegacyLocal() {
    const l = this.legacyLocal();
    if (!l) return 0;
    const n = await this.importData(l);
    try { localStorage.setItem(LEGACY_DONE, '1'); } catch {}
    return n;
  }
}
