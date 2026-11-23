import { CardSet } from './types';
import { POKEMON_30TH } from './pokemon-30th';

export * from './types';
export { POKEMON_30TH };

export type { CatalogManifest, CatalogSetSummary, CardSet, Game, Mode, Rule, Variant, Card } from './types';

export const LEGACY_POKEMON_SET_ID = POKEMON_30TH.id;
