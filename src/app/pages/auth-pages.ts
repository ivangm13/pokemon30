import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

const CSS = `
  :host { display:grid; place-items:center; min-height:100vh; padding:1rem; color:#eef; font-family:system-ui,sans-serif;
    background:radial-gradient(circle at top,#2a2f6b,#0d0f26 60%) }
  form, .box { width:min(380px,100%); display:flex; flex-direction:column; gap:.7rem; padding:1.4rem; border-radius:16px; background:#ffffff12; border:1px solid #ffffff22 }
  h1 { margin:0; font-size:1.25rem; font-weight:500 } h1 b { color:#ffcb05 }
  input { padding:.65rem .8rem; border-radius:10px; border:1px solid #ffffff33; background:#ffffff12; color:#fff; font-size:1rem }
  button { cursor:pointer; border:0; border-radius:10px; padding:.7rem; background:#ffcb05; color:#111; font-weight:600; font-size:1rem }
  button.alt { background:#ffffff18; color:#fff; font-weight:400 } button:disabled { opacity:.5 }
  a { color:#9aa6ff } .err { color:#ff8a8a; font-size:.9rem } .ok { color:#6ff0c8; font-size:.9rem }
  small { opacity:.8; line-height:1.4 } .links { display:flex; justify-content:space-between; font-size:.9rem }
`;

abstract class Base {
  auth = inject(AuthService);
  router = inject(Router);
  email = signal(''); pw = signal(''); pw2 = signal('');
  err = signal(''); msg = signal(''); busy = signal(false);
  protected async run(fn: () => Promise<void>) {
    this.err.set(''); this.msg.set(''); this.busy.set(true);
    try { await fn(); } catch (e) { this.err.set(this.auth.msg(e)); } finally { this.busy.set(false); }
  }
}

@Component({
  selector: 'app-login', standalone: true, imports: [RouterLink], styles: [CSS],
  template: `
    <form (submit)="submit($event)">
      <h1>Pokémon TCG <b>Colección</b></h1>
      <input type="email" name="email" autocomplete="email" placeholder="Correo electrónico" required (input)="email.set($any($event.target).value)" />
      <input type="password" name="password" autocomplete="current-password" placeholder="Contraseña" required (input)="pw.set($any($event.target).value)" />
      @if (err()) { <div class="err">{{ err() }}</div> }
      <button [disabled]="busy()">Entrar</button>
      <div class="links"><a routerLink="/register">Crear cuenta</a><a routerLink="/reset">¿Olvidaste la contraseña?</a></div>
    </form>`,
})
export class Login extends Base {
  submit(e: Event) {
    e.preventDefault();
    this.run(async () => { await this.auth.login(this.email().trim(), this.pw()); this.router.navigateByUrl('/'); });
  }
}

@Component({
  selector: 'app-register', standalone: true, imports: [RouterLink], styles: [CSS],
  template: `
    <form (submit)="submit($event)">
      <h1>Crear <b>cuenta</b></h1>
      <input type="email" name="email" autocomplete="email" placeholder="Correo electrónico" required (input)="email.set($any($event.target).value)" />
      <input type="password" name="password" autocomplete="new-password" placeholder="Contraseña (mín. 6)" required (input)="pw.set($any($event.target).value)" />
      <input type="password" name="password2" autocomplete="new-password" placeholder="Repite la contraseña" required (input)="pw2.set($any($event.target).value)" />
      @if (err()) { <div class="err">{{ err() }}</div> }
      <button [disabled]="busy()">Registrarme</button>
      <div class="links"><a routerLink="/login">Ya tengo cuenta</a></div>
    </form>`,
})
export class Register extends Base {
  submit(e: Event) {
    e.preventDefault();
    this.run(async () => {
      if (this.pw() !== this.pw2()) throw { code: 'app/mismatch' };
      await this.auth.register(this.email().trim(), this.pw());
      this.router.navigateByUrl('/verify');
    });
  }
}

@Component({
  selector: 'app-reset', standalone: true, imports: [RouterLink], styles: [CSS],
  template: `
    <form (submit)="submit($event)">
      <h1>Recuperar <b>contraseña</b></h1>
      <small>Te enviaremos un enlace para crear una contraseña nueva.</small>
      <input type="email" name="email" autocomplete="email" placeholder="Correo electrónico" required (input)="email.set($any($event.target).value)" />
      @if (err()) { <div class="err">{{ err() }}</div> }
      @if (msg()) { <div class="ok">{{ msg() }}</div> }
      <button [disabled]="busy()">Enviar enlace</button>
      <div class="links"><a routerLink="/login">Volver a entrar</a></div>
    </form>`,
})
export class Reset extends Base {
  submit(e: Event) {
    e.preventDefault();
    this.run(async () => {
      await this.auth.resetPassword(this.email().trim());
      this.msg.set('Si el correo está registrado, recibirás un enlace en unos minutos.');
    });
  }
}

@Component({
  selector: 'app-verify', standalone: true, styles: [CSS],
  template: `
    <div class="box">
      <h1>Verifica tu <b>correo</b></h1>
      <small>Hemos enviado un enlace a <b>{{ auth.user()?.email }}</b>. Ábrelo y vuelve aquí. Revisa también la carpeta de spam.</small>
      @if (err()) { <div class="err">{{ err() }}</div> }
      @if (msg()) { <div class="ok">{{ msg() }}</div> }
      <button (click)="check()" [disabled]="busy()">Ya lo he verificado</button>
      <button class="alt" (click)="resend()" [disabled]="busy()">Reenviar correo</button>
      <button class="alt" (click)="out()">Cerrar sesión</button>
    </div>`,
})
export class Verify extends Base {
  check() {
    this.run(async () => {
      if (await this.auth.refresh()) this.router.navigateByUrl('/');
      else this.err.set('Todavía no aparece como verificado.');
    });
  }
  resend() { this.run(async () => { await this.auth.resendVerification(); this.msg.set('Correo reenviado.'); }); }
  async out() { await this.auth.logout(); this.router.navigateByUrl('/login'); }
}
