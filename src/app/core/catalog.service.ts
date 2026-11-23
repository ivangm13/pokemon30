import { Injectable, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CardSet, CatalogManifest, CatalogSetSummary, variantId, variantsOf } from '../catalog';

const MANIFEST_PATH = 'catalog/manifest.json';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  readonly manifest = signal<CatalogManifest | null>(null);
  readonly loadedSets = signal<Record<string, CardSet>>({});
  readonly error = signal('');
  private manifestRequest?: Promise<CatalogManifest>;
  private readonly setRequests = new Map<string, Promise<CardSet>>();

  async loadManifest(): Promise<CatalogManifest> {
    if (this.manifest()) return this.manifest()!;
    if (this.manifestRequest) return this.manifestRequest;
    this.manifestRequest = firstValueFrom(this.http.get<CatalogManifest>(this.url(MANIFEST_PATH)))
      .then(manifest => {
        this.validateManifest(manifest);
        this.manifest.set(manifest);
        this.error.set('');
        return manifest;
      })
      .catch(error => {
        this.error.set(error instanceof Error ? error.message : 'No se pudo cargar el catálogo.');
        this.manifestRequest = undefined;
        throw error;
      });
    return this.manifestRequest;
  }

  summary(setId: string): CatalogSetSummary | undefined {
    return this.manifest()?.sets.find(set => set.id === setId);
  }

  async loadSet(setId: string): Promise<CardSet> {
    const cached = this.loadedSets()[setId];
    if (cached) return cached;
    const pending = this.setRequests.get(setId);
    if (pending) return pending;

    const request = this.loadManifest().then(async manifest => {
      const summary = manifest.sets.find(set => set.id === setId);
      if (!summary) throw new Error(`La expansión «${setId}» no existe en el catálogo.`);
      const set = await firstValueFrom(this.http.get<CardSet>(this.url(summary.assetPath)));
      this.validateSet(summary, set);
      this.loadedSets.update(current => ({ ...current, [setId]: set }));
      return set;
    }).catch(error => {
      this.setRequests.delete(setId);
      this.error.set(error instanceof Error ? error.message : `No se pudo cargar ${setId}.`);
      throw error;
    });
    this.setRequests.set(setId, request);
    return request;
  }

  async loadSets(setIds: string[]): Promise<CardSet[]> {
    const uniqueIds = [...new Set(setIds)];
    return Promise.all(uniqueIds.map(id => this.loadSet(id)));
  }

  validVariantIds(set: CardSet): Set<string> {
    return new Set(set.cards.flatMap(card => variantsOf(card).map(variant => variantId(set.id, card.id, variant.key))));
  }

  private url(path: string): string {
    return new URL(path, this.document.baseURI).toString();
  }

  private validateManifest(manifest: CatalogManifest): void {
    if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.games) || !Array.isArray(manifest.sets)) {
      throw new Error('El manifiesto del catálogo tiene un formato inválido.');
    }
    const ids = new Set<string>();
    for (const set of manifest.sets) {
      if (!set.id || !set.gameId || !set.name || !set.assetPath || ids.has(set.id)) {
        throw new Error(`El manifiesto contiene una expansión inválida o duplicada (${set.id || 'sin ID'}).`);
      }
      ids.add(set.id);
    }
  }

  private validateSet(summary: CatalogSetSummary, set: CardSet): void {
    if (!set || set.id !== summary.id || set.gameId !== summary.gameId || !Array.isArray(set.cards)) {
      throw new Error(`Los datos de ${summary.id} no coinciden con su manifiesto.`);
    }
    const cardIds = new Set<string>();
    for (const card of set.cards) {
      if (!card.id || !card.name || !card.num || cardIds.has(card.id)) {
        throw new Error(`${summary.id} contiene cartas incompletas o con IDs duplicados.`);
      }
      cardIds.add(card.id);
    }
  }
}
