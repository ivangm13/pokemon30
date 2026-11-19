import { Injectable, signal } from '@angular/core';
import { CARDMARKET_PRICES } from '../catalog/cardmarket-prices';
import { Price } from './pricing';

@Injectable({ providedIn: 'root' })
export class PriceService {
  readonly prices = signal<Record<string, Price>>(CARDMARKET_PRICES);
}
