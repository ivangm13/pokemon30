export interface Price {
  amount: number | null;
  currency: string;
  source: 'cardmarket';
  productId: number | null;
  sourceField: string;
  status: 'validated' | 'missing' | 'needs-review' | 'fallback';
  metrics: Record<string, number | null>;
  updatedAt?: number;
}

export type PriceCatalog = Record<string, Price>;
export type ValuablePrice = Price & { amount: number; productId: number };
