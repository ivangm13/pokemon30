import { CardSet, Game, variantId, variantsOf } from './types';
import { POKEMON_30TH } from './pokemon-30th';

export * from './types';
export { POKEMON_30TH };

export const GAMES: Game[] = [{ id: 'pokemon', name: 'Pokémon TCG' }];
// Para añadir una expansión: crear su archivo CardSet y añadirlo aquí.
export const SETS: CardSet[] = [POKEMON_30TH];
export const setById = (id: string) => SETS.find(s => s.id === id);

/** Todos los ids de variante válidos (se usa para validar importaciones). */
export const VARIANT_IDS = new Set(SETS.flatMap(s => s.cards.flatMap(c => variantsOf(c).map(v => variantId(s.id, c.id, v.key)))));
