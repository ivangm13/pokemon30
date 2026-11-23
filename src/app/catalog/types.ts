export interface Variant { key: string; label: string; }

export interface Card {
  id: string;            // id local dentro de la expansión (estable)
  num: string;
  name: string;
  rarity: string;
  tags: string[];        // etiquetas que usan los grupos y las reglas (main, secret, ...)
  img?: string;
  note?: string;
  category?: string;
  variants?: Variant[];  // si no existe, la carta tiene una única variante "normal"
}

/** Regla de composición: qué cartas (y qué variantes) cuentan para una modalidad. */
export interface Rule { all?: boolean; tags?: string[]; variants?: string[]; }
export interface Mode { key: string; label: string; rule: Rule; }

export interface CardSet {
  id: string;
  gameId: string;
  name: string;
  language?: string;                          // idioma de la edición (EN, ES...)
  series?: { id: string; name: string };
  releaseDate?: string;
  logo?: string;
  symbol?: string;
  cardCount?: { firstEd?: number; holo?: number; normal?: number; official?: number; reverse?: number; total?: number };
  source?: { provider: string; setId: string; language: string };
  availability?: 'available' | 'cataloguing' | 'unavailable';
  groups: { key: string; label: string }[];  // pestañas de filtro de la expansión
  modes: Mode[];                              // Base Set, Master Set... definidos por expansión
  cards: Card[];
}
export interface Game { id: string; name: string; }

/** Manifiesto global liviano; el contenido de cartas se descarga por expansión. */
export type CatalogSetSummary = Omit<CardSet, 'cards'> & {
  assetPath: string;
  pricePath?: string;
};

export interface CatalogManifest {
  version: number;
  games: Game[];
  sets: CatalogSetSummary[];
}

export const NORMAL: Variant[] = [{ key: 'normal', label: 'Normal' }];
export const variantsOf = (c: Card) => c.variants ?? NORMAL;
/** Id estable de una variante coleccionable: es también el id del documento en el inventario. */
export const variantId = (setId: string, cardId: string, key: string) => `${setId}:${cardId}:${key}`;
export const inRule = (c: Card, r: Rule) => !!r.all || !!r.tags?.some(t => c.tags.includes(t));
export const ruleVariants = (c: Card, r: Rule) => variantsOf(c).filter(v => !r.variants || r.variants.includes(v.key));
