import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  arrayUnion, collection, deleteDoc, doc, getDocs, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { LEGACY_POKEMON_SET_ID, variantId, variantsOf } from '../catalog';
import { AuthService } from './auth.service';
import { CatalogService } from './catalog.service';
import { normalizeQuantity } from './quantity';

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
  private db = inject(Firestore);
  private catalog = inject(CatalogService);
  readonly collections = signal<CollectionInfo[]>([]);
  readonly collectionsReady = signal(false);
  readonly activeId = signal(this.stored());
  readonly collection = computed(() => this.collections().find(c => c.id === this.activeId()) ?? this.collections()[0] ?? null);
  private readonly cid = computed(() => this.collection()?.id ?? '');
  readonly qtyByCollection = signal<Record<string, Record<string, number>>>({});
  readonly readyCollectionIds = signal<string[]>([]);
  readonly itemsReady = computed(() => this.collections().every(item => this.readyCollectionIds().includes(item.id)));
  readonly qty = computed(() => this.qtyByCollection()[this.cid()] ?? {});
  readonly accountQty = computed(() => {
    const result: Record<string, number> = {};
    for (const inventory of Object.values(this.qtyByCollection())) {
      for (const [id, quantity] of Object.entries(inventory)) result[id] = (result[id] ?? 0) + quantity;
    }
    return result;
  });
  readonly status = signal('');
  private unsubCols?: () => void;
  private readonly itemUnsubs = new Map<string, () => void>();
  private creating = false;
  private watchedUid: string | null = null;

  constructor() {
    effect(() => { // lista de colecciones
      const u = this.auth.user(), ok = this.auth.verified();
      untracked(() => {
        this.collectionsReady.set(false);
        this.unsubCols?.(); this.unsubCols = undefined;
        this.collections.set([]);
        if (u && ok) this.watchCollections(u.uid);
        else this.collectionsReady.set(true);
      });
    });
    effect(() => { // limpia todas las escuchas al cerrar o cambiar usuario
      const uid = this.auth.user()?.uid ?? null;
      const verified = this.auth.verified();
      untracked(() => {
        if (this.watchedUid !== uid || !verified) this.clearItemWatchers();
        this.watchedUid = verified ? uid : null;
      });
    });
  }

  private stored() { try { return localStorage.getItem(ACTIVE_KEY) || ''; } catch { return ''; } }
  private colPath(uid: string, cid: string) { return `users/${uid}/collections/${cid}`; }
  private fail(e: any) { this.status.set('Error: ' + (e?.code || e?.message)); }

  private watchCollections(uid: string) {
    this.status.set('Conectando…');
    this.unsubCols = onSnapshot(collection(this.db, `users/${uid}/collections`), async s => {
      const list: CollectionInfo[] = s.docs.map(d => {
        const storedName = d.data()['name'];
        return {
          id: d.id,
          name: d.id === 'main' ? 'Mi colección' : storedName,
          setIds: d.data()['setIds'] ?? [],
        };
      });
      list.sort((a, b) => (a.id === 'main' ? -1 : b.id === 'main' ? 1 : a.name.localeCompare(b.name)));
      this.collections.set(list);
      this.collectionsReady.set(true);
      const collectionIds = new Set(list.map(item => item.id));
      for (const id of this.itemUnsubs.keys()) if (!collectionIds.has(id)) this.unwatchItems(id);
      for (const item of list) if (!this.itemUnsubs.has(item.id)) this.watchItems(uid, item.id);
      if (s.empty && !s.metadata.fromCache && !this.creating) { // primera vez: crea la colección gratuita
        this.creating = true;
        try { await this.createWith(uid, 'main', 'Mi colección'); } catch (e) { this.fail(e); } finally { this.creating = false; }
      }
    }, e => { this.collectionsReady.set(true); this.fail(e); });
  }

  private watchItems(uid: string, cid: string) {
    const unsubscribe = onSnapshot(collection(this.db, `${this.colPath(uid, cid)}/items`), { includeMetadataChanges: true }, s => {
      const m: Record<string, number> = {};
      s.forEach(d => {
        const q = normalizeQuantity(d.data()['qty']);
        if (q > 0) m[d.id] = q;
      });
      this.qtyByCollection.update(current => ({ ...current, [cid]: m }));
      this.readyCollectionIds.update(ids => ids.includes(cid) ? ids : [...ids, cid]);
      this.status.set(s.metadata.hasPendingWrites ? 'Guardando…' : '☁ Sincronizado');
    }, e => {
      this.readyCollectionIds.update(ids => ids.includes(cid) ? ids : [...ids, cid]);
      this.fail(e);
    });
    this.itemUnsubs.set(cid, unsubscribe);
  }

  private unwatchItems(cid: string) {
    this.itemUnsubs.get(cid)?.();
    this.itemUnsubs.delete(cid);
    this.qtyByCollection.update(current => { const next = { ...current }; delete next[cid]; return next; });
    this.readyCollectionIds.update(ids => ids.filter(id => id !== cid));
  }

  private clearItemWatchers() {
    for (const unsubscribe of this.itemUnsubs.values()) unsubscribe();
    this.itemUnsubs.clear();
    this.qtyByCollection.set({});
    this.readyCollectionIds.set([]);
  }

  private async createWith(uid: string, id: string, name: string) {
    const firstPokemonSet = (await this.catalog.loadManifest()).sets.find(set => set.gameId === 'pokemon');
    return setDoc(doc(this.db, this.colPath(uid, id)), {
      name, gameId: 'pokemon', setIds: firstPokemonSet ? [firstPokemonSet.id] : [], createdAt: serverTimestamp(),
    });
  }

  select(id: string) { this.activeId.set(id); try { localStorage.setItem(ACTIVE_KEY, id); } catch {} }

  async addSetToCollection(setId: string) {
    const user = this.auth.user(), current = this.collection();
    if (!user || !current || !this.catalog.summary(setId)) return;
    if (current.setIds.includes(setId)) return;
    try {
      await updateDoc(doc(this.db, this.colPath(user.uid, current.id)), { setIds: arrayUnion(setId) });
    } catch (error) { this.fail(error); }
  }

  async createCollection(name: string) {
    const u = this.auth.user();
    if (!u) return;
    const id = doc(collection(this.db, `users/${u.uid}/collections`)).id;
    try { await this.createWith(u.uid, id, name.trim().slice(0, 60)); this.select(id); } catch (e) { this.fail(e); }
  }
  async renameCollection(name: string) {
    const u = this.auth.user(), id = this.cid();
    if (!u || !id) return;
    try { await updateDoc(doc(this.db, this.colPath(u.uid, id)), { name: name.trim().slice(0, 60) }); } catch (e) { this.fail(e); }
  }
  async deleteCollection() {
    const u = this.auth.user(), id = this.cid();
    if (!u || !id || id === 'main') return;
    try {
      const items = await getDocs(collection(this.db, `${this.colPath(u.uid, id)}/items`));
      for (let i = 0; i < items.docs.length; i += 400) {
        const b = writeBatch(this.db);
        items.docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
        await b.commit();
      }
      await deleteDoc(doc(this.db, this.colPath(u.uid, id)));
      this.select('main');
    } catch (e) { this.fail(e); }
  }

  async setQty(setId: string, vid: string, q: number) {
    const u = this.auth.user(), current = this.collection(), id = this.cid();
    if (!u || !id || !current?.setIds.includes(setId)) return;
    q = normalizeQuantity(q);
    const ref = doc(this.db, `${this.colPath(u.uid, id)}/items/${vid}`);
    try { await (q === 0 ? deleteDoc(ref) : setDoc(ref, { setId, qty: q })); }
    catch (e: any) { this.status.set('Error al guardar: ' + (e.code || e.message)); }
  }

  /** Importa JSON v2 {version:2, items:{variantId:qty}} o el formato antiguo {idCarta: 1|2}. No pisa lo que ya tienes. */
  async importData(raw: any): Promise<number> {
    const u = this.auth.user(), id = this.cid();
    if (!u || !id) return 0;
    const entries: [string, number][] = raw?.items
      ? Object.entries(raw.items)
      : Object.entries(raw ?? {}).map(([k, q]) => [variantId(LEGACY_POKEMON_SET_ID, k, 'normal'), q as number]);
    const setIds = [...new Set(entries.map(([id]) => id.split(':')[0]).filter(Boolean))];
    const sets = await this.catalog.loadSets(setIds);
    const validIds = new Set(sets.flatMap(set => set.cards.flatMap(card => variantsOf(card).map(variant => variantId(set.id, card.id, variant.key)))));
    for (const setId of setIds) if (!this.collection()?.setIds.includes(setId)) await this.addSetToCollection(setId);
    const todo = entries.filter(([v, q]) => validIds.has(v) && Number.isFinite(Number(q)) && Number(q) >= 1 && !this.qty()[v]);
    for (let i = 0; i < todo.length; i += 400) {
      const b = writeBatch(this.db);
      for (const [v, q] of todo.slice(i, i + 400))
        b.set(doc(this.db, `${this.colPath(u.uid, id)}/items/${v}`), { setId: v.split(':')[0], qty: Math.min(999, Math.floor(Number(q))) });
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
