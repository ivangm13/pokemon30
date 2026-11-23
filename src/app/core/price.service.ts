import { Injectable, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CatalogService } from './catalog.service';
import { Price } from './pricing';

@Injectable({ providedIn: 'root' })
export class PriceService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly catalog = inject(CatalogService);
  readonly prices = signal<Record<string, Price>>({});
  readonly loadedSetIds = signal<string[]>([]);
  readonly error = signal('');
  private readonly requests = new Map<string, Promise<void>>();

  async loadSet(setId: string): Promise<void> {
    if (this.loadedSetIds().includes(setId)) return;
    const pending = this.requests.get(setId);
    if (pending) return pending;
    const request = this.catalog.loadManifest().then(async manifest => {
      const summary = manifest.sets.find(set => set.id === setId);
      if (!summary?.pricePath) {
        this.loadedSetIds.update(ids => [...ids, setId]);
        return;
      }
      const data = await firstValueFrom(this.http.get<Record<string, Price>>(
        new URL(summary.pricePath, this.document.baseURI).toString(),
      ));
      this.prices.update(current => ({ ...current, ...data }));
      this.loadedSetIds.update(ids => [...ids, setId]);
      this.error.set('');
    }).catch(error => {
      this.requests.delete(setId);
      this.error.set(error instanceof Error ? error.message : `No se pudieron cargar los precios de ${setId}.`);
      throw error;
    });
    this.requests.set(setId, request);
    return request;
  }

  async loadSets(setIds: string[]): Promise<void> {
    await Promise.all([...new Set(setIds)].map(id => this.loadSet(id)));
  }
}
