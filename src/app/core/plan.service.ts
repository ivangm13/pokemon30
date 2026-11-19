import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { getIdTokenResult } from 'firebase/auth';
import { AuthService } from './auth.service';

export type Plan = 'free' | 'pro';
export type Feature = 'multiCollection' | 'valuation';

/** Plan mínimo que exige cada función. Es el ÚNICO sitio donde se decide qué es Pro. */
const REQUIRED: Record<Feature, Plan> = { multiCollection: 'pro', valuation: 'pro' };

/** El plan viene de un custom claim del token (no lo puede cambiar el cliente); las reglas de Firestore lo vuelven a comprobar. */
@Injectable({ providedIn: 'root' })
export class PlanService {
  private auth = inject(AuthService);
  readonly plan = signal<Plan>('free');

  constructor() {
    effect(() => {
      const u = this.auth.user();
      this.auth.verified();
      untracked(() => { this.plan.set('free'); if (u) this.refresh(false); });
    });
  }

  /** force=true pide un token nuevo (úsalo tras cambiar el plan). */
  async refresh(force = true) {
    const u = this.auth.user();
    if (!u) return;
    try { this.plan.set((await getIdTokenResult(u, force)).claims['plan'] === 'pro' ? 'pro' : 'free'); } catch {}
  }
  can(f: Feature) { return REQUIRED[f] === 'free' || this.plan() === 'pro'; }
}
