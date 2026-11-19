import { InjectionToken } from '@angular/core';
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface Price {
  amount: number;
  currency: string;      // ISO 4217: EUR, USD...
  language?: string;
  condition?: string;    // NM, LP... (solo si se conoce)
  source: string;        // 'manual', 'cardmarket'...
  updatedAt?: number;    // ms
}

/** Origen de precios. Para cambiar de proveedor basta con otra implementación y proveer PRICE_PROVIDER. */
export interface PriceProvider {
  readonly id: string;
  readonly label: string;
  readonly editable: boolean;
  watch(uid: string, cb: (prices: Record<string, Price>) => void, onError: (e: any) => void): () => void;
  save?(uid: string, variantId: string, price: Omit<Price, 'updatedAt'> | null): Promise<void>;
}

/** Precios que introduce el propio usuario: users/{uid}/prices/{variantId}. */
export class ManualPriceProvider implements PriceProvider {
  readonly id = 'manual';
  readonly label = 'Manual';
  readonly editable = true;

  watch(uid: string, cb: (p: Record<string, Price>) => void, onError: (e: any) => void) {
    return onSnapshot(collection(db, `users/${uid}/prices`), s => {
      const m: Record<string, Price> = {};
      s.forEach(d => { const x = d.data(); m[d.id] = { ...(x as Price), updatedAt: x['updatedAt']?.toMillis?.() }; });
      cb(m);
    }, onError);
  }

  async save(uid: string, vid: string, p: Omit<Price, 'updatedAt'> | null) {
    const ref = doc(db, `users/${uid}/prices/${vid}`);
    if (!p) return deleteDoc(ref);
    // Firestore no admite campos undefined
    const data: Record<string, unknown> = { amount: p.amount, currency: p.currency, source: p.source, updatedAt: serverTimestamp() };
    if (p.language) data['language'] = p.language;
    if (p.condition) data['condition'] = p.condition;
    return setDoc(ref, data);
  }
}

export const PRICE_PROVIDER = new InjectionToken<PriceProvider>('PRICE_PROVIDER', {
  providedIn: 'root', factory: () => new ManualPriceProvider(),
});
