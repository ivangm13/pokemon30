/** Normalizes stored and edited inventory counts to the supported range. */
export function normalizeQuantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(999, Math.floor(value)));
}
