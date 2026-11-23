import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { CardSet, variantId, variantsOf } from '../catalog';
import { CatalogService } from './catalog.service';
import { InventoryService } from './inventory.service';
import { PriceService } from './price.service';
import { combine, valuate } from './valuation';
import { setStats } from './stats';
import { normalizeQuantity } from './quantity';

export interface ExpansionProgress {
  id: string;
  gameId: string;
  name: string;
  started: boolean;
  modes: ReturnType<typeof setStats>;
}

/** Estadísticas globales del usuario, derivadas de inventarios y catálogo compartido. */
@Injectable({ providedIn: 'root' })
export class CollectionDashboardService {
  private readonly inventory = inject(InventoryService);
  private readonly catalog = inject(CatalogService);
  private readonly prices = inject(PriceService);
  readonly loadError = signal('');

  readonly setIds = computed(() => [...new Set(this.inventory.collections().flatMap(collection => collection.setIds))]);
  readonly sets = computed<CardSet[]>(() => this.setIds().map(id => this.catalog.loadedSets()[id]).filter((set): set is CardSet => !!set));
  readonly ready = computed(() => this.inventory.collectionsReady() && this.inventory.itemsReady()
    && this.setIds().every(id => !!this.catalog.loadedSets()[id])
    && this.setIds().every(id => this.prices.loadedSetIds().includes(id)));

  constructor() {
    effect(() => {
      const setIds = this.setIds();
      if (!setIds.length) return;
      untracked(() => {
        void Promise.all([this.catalog.loadSets(setIds), this.prices.loadSets(setIds)])
          .then(() => this.loadError.set(''))
          .catch(error => this.loadError.set(error instanceof Error ? error.message : 'No se pudo cargar el catálogo o los precios.'));
      });
    });
  }

  readonly expansionProgress = computed<ExpansionProgress[]>(() => {
    const qty = this.inventory.accountQty();
    return this.sets().map(set => {
      let uniqueOwned = 0;
      for (const card of set.cards) for (const variant of variantsOf(card)) {
        if (normalizeQuantity(qty[variantId(set.id, card.id, variant.key)]) > 0) uniqueOwned++;
      }
      return { id: set.id, gameId: set.gameId, name: set.name, started: uniqueOwned > 0, modes: setStats(set, qty) };
    });
  });

  readonly counts = computed(() => {
    const qty = this.inventory.accountQty();
    let unique = 0;
    let copies = 0;
    for (const set of this.sets()) for (const card of set.cards) for (const variant of variantsOf(card)) {
      const quantity = normalizeQuantity(qty[variantId(set.id, card.id, variant.key)]);
      if (quantity > 0) {
        unique++;
        copies += quantity;
      }
    }
    return { unique, copies, duplicates: copies - unique };
  });

  readonly valuation = computed(() => {
    const qty = this.inventory.accountQty();
    const prices = this.prices.prices();
    return combine(this.sets().map(set => valuate(set, qty, prices)));
  });

  readonly euros = computed(() => this.valuation().totals['EUR'] ?? null);
  readonly otherCurrencies = computed(() =>
    Object.keys(this.valuation().totals).filter(currency => currency !== 'EUR'));
  readonly expansionsStarted = computed(() => this.expansionProgress().filter(set => set.started).length);
}
