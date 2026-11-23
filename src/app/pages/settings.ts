import { Component } from '@angular/core';

@Component({
  selector: 'app-settings',
  template: `
    <div class="page">
      <p class="eyebrow">CUENTA</p>
      <h1>Configuración</h1>
      <section class="panel" aria-labelledby="settings-empty-title">
        <h2 id="settings-empty-title">No hay preferencias configurables</h2>
        <p>Esta sección queda preparada para preferencias reales cuando estén disponibles. No hay opciones que guardar por ahora.</p>
      </section>
    </div>
  `,
  styles: [`
    :host { display:block; min-height:calc(100vh - 64px); color:#eef0ff; background:radial-gradient(circle at top,#202550,#0d0f26 55%); }
    .page { width:min(820px,100%); box-sizing:border-box; margin:auto; padding:clamp(1rem,4vw,2.5rem); }
    .eyebrow { margin:0 0 .3rem; color:#ffdc52; font-size:.7rem; font-weight:800; letter-spacing:.14em; }
    h1 { margin:0 0 1.2rem; font-size:clamp(1.6rem,4vw,2.2rem); }
    .panel { padding:1.2rem; border:1px solid #ffffff24; border-radius:16px; background:#ffffff0d; }
    h2 { margin:0 0 .6rem; font-size:1.1rem; }
    p { max-width:620px; margin:0; color:#c2c6df; line-height:1.6; }
  `],
})
export class SettingsPage {}
