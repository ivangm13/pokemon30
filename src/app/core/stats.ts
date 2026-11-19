import { CardSet, inRule, ruleVariants, variantId } from '../catalog';
import { normalizeQuantity } from './quantity';

export interface ModeStats { key: string; label: string; total: number; owned: number; missing: number; dups: number; pct: number; }

/** Estadísticas por modalidad. Genérico: solo usa las reglas que declara la expansión. */
export function setStats(set: CardSet, qty: Record<string, number>): ModeStats[] {
  return set.modes.map(m => {
    let total = 0, owned = 0, dups = 0;
    for (const c of set.cards) {
      if (!inRule(c, m.rule)) continue;
      for (const v of ruleVariants(c, m.rule)) {
        total++;
        const q = normalizeQuantity(qty[variantId(set.id, c.id, v.key)]);
        if (q > 0) owned++;        // las repetidas no suman al porcentaje
        if (q > 1) dups += q - 1;
      }
    }
    return { key: m.key, label: m.label, total, owned, missing: total - owned, dups,
      pct: total ? Math.round((owned / total) * 1000) / 10 : 0 };
  });
}
