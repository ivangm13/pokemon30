// Asigna el plan a un usuario (custom claim). Uso:  node scripts/set-plan.mjs correo@ejemplo.com pro
// Requiere: npm i -D firebase-admin  y una clave de cuenta de servicio en ./serviceAccount.json
// (Firebase Console → Configuración → Cuentas de servicio → Generar clave). NO la subas a Git.
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [email, plan = 'pro'] = process.argv.slice(2);
if (!email || !['free', 'pro'].includes(plan)) { console.error('Uso: node scripts/set-plan.mjs <correo> [free|pro]'); process.exit(1); }
initializeApp({ credential: cert(JSON.parse(readFileSync('./serviceAccount.json', 'utf8'))) });
const u = await getAuth().getUserByEmail(email);
await getAuth().setCustomUserClaims(u.uid, { plan });
console.log(`${email} (${u.uid}) → plan ${plan}. Pulsa en la etiqueta del plan de la web (o vuelve a entrar) para refrescarlo.`);
