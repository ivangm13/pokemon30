import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from './auth.service';
import { PlanService } from './plan.service';
import { PRICE_PROVIDER, Price } from './pricing';

@Injectable({ providedIn: 'root' })
export class PriceService {
  private auth = inject(AuthService);
  private plan = inject(PlanService);
  private provider = inject(PRICE_PROVIDER);
  readonly prices = signal<Record<string, Price>>({});
  private unsub?: () => void;

  constructor() {
    effect(() => {
      const u = this.auth.user(), ok = this.auth.verified(), pro = this.plan.can('valuation');
      untracked(() => {
        this.unsub?.(); this.unsub = undefined; this.prices.set({});
        if (u && ok && pro) this.unsub = this.provider.watch(u.uid, p => this.prices.set(p), e => console.error(e));
      });
    });
  }

  get editable() { return !!this.provider.save; }
  save(vid: string, p: Omit<Price, 'updatedAt'> | null) {
    const u = this.auth.user();
    return u && this.provider.save ? this.provider.save(u.uid, vid, p) : Promise.resolve();
  }
}
