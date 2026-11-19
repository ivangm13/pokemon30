import { CardSet, variantId, variantsOf } from '../catalog';
import { Price } from './pricing';

export interface Valuation { totals: Record<string, number>; dups: Record<string, number>; unpriced: number; updatedAt?: number; }

const add = (r: Record<string, number>, k: string, v: number) => { r[k] = (r[k] || 0) + v; };

/** Valor de lo que tienes en una expansión. Las cartas sin precio NO suman 0: se cuentan aparte en `unpriced`. */
export function valuate(set: CardSet, qty: Record<string, number>, prices: Record<string, Price>): Valuation {
  const v: Valuation = { totals: {}, dups: {}, unpriced: 0 };
  for (const c of set.cards) for (const x of variantsOf(c)) {
    const id = variantId(set.id, c.id, x.key), q = qty[id] || 0;
    if (!q) continue;
    const p = prices[id];
    if (!p) { v.unpriced++; continue; }
    add(v.totals, p.currency, p.amount * q);
    if (q > 1) add(v.dups, p.currency, p.amount * (q - 1));   // valor de las copias sobrantes
    if (p.updatedAt && (!v.updatedAt || p.updatedAt > v.updatedAt)) v.updatedAt = p.updatedAt;
  }
  return v;
}

export function combine(list: Valuation[]): Valuation {
  const r: Valuation = { totals: {}, dups: {}, unpriced: 0 };
  for (const x of list) {
    for (const [c, n] of Object.entries(x.totals)) add(r.totals, c, n);
    for (const [c, n] of Object.entries(x.dups)) add(r.dups, c, n);
    r.unpriced += x.unpriced;
    if (x.updatedAt && (!r.updatedAt || x.updatedAt > r.updatedAt)) r.updatedAt = x.updatedAt;
  }
  return r;
}

export function fmtMoney(t: Record<string, number>): string {
  const e = Object.entries(t);
  if (!e.length) return 'Sin datos';
  return e.map(([c, n]) => { try { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: c }).format(n); } catch { return `${n.toFixed(2)} ${c}`; } }).join(' + ');
}
export const fmtDate = (ms?: number) => (ms ? new Date(ms).toLocaleDateString('es-ES') : '—');
