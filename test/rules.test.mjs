// Pruebas de las reglas de Firestore con el emulador.  Ejecutar:  npm run test:rules
import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-pokemon30', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
after(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const user = (uid, claims = {}) => env.authenticatedContext(uid, { email_verified: true, ...claims }).firestore();
const unverified = uid => env.authenticatedContext(uid, { email_verified: false }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const colDoc = (db, uid, cid) => doc(db, `users/${uid}/collections/${cid}`);
const itemDoc = (db, uid, cid, id) => doc(db, `users/${uid}/collections/${cid}/items/${id}`);
const priceDoc = (db, uid, id) => doc(db, `users/${uid}/prices/${id}`);
const col = () => ({ name: 'Mi colección', gameId: 'pokemon', setIds: ['pokemon-30th'], createdAt: serverTimestamp() });
const VID = 'pokemon-30th:m1:normal';
async function withMain(uid) { // crea la colección main saltándose las reglas
  await env.withSecurityRulesDisabled(async c => { await setDoc(colDoc(c.firestore(), uid, 'main'), { name: 'x', gameId: 'pokemon', setIds: [] }); });
}

test('sin sesión no se lee ni se escribe nada', async () => {
  await withMain('alice');
  await assertFails(getDoc(colDoc(anon(), 'alice', 'main')));
  await assertFails(setDoc(colDoc(anon(), 'alice', 'main'), col()));
});
test('correo sin verificar: no puede crear ni leer', async () => {
  await assertFails(setDoc(colDoc(unverified('alice'), 'alice', 'main'), col()));
  await withMain('alice');
  await assertFails(getDoc(colDoc(unverified('alice'), 'alice', 'main')));
});
test('un usuario verificado crea y lee su colección main', async () => {
  await assertSucceeds(setDoc(colDoc(user('alice'), 'alice', 'main'), col()));
  await assertSucceeds(getDoc(colDoc(user('alice'), 'alice', 'main')));
});
test('otro usuario no puede leer ni escribir mis datos', async () => {
  await withMain('alice');
  await assertFails(getDoc(colDoc(user('bob'), 'alice', 'main')));
  await assertFails(setDoc(itemDoc(user('bob'), 'alice', 'main', VID), { setId: 'pokemon-30th', qty: 1 }));
});
test('no se pueden meter campos extra (plan, rol...) en la colección', async () => {
  await assertFails(setDoc(colDoc(user('alice'), 'alice', 'main'), { ...col(), plan: 'pro' }));
});
test('plan gratuito: solo la colección main; Pro puede crear más', async () => {
  await assertFails(setDoc(colDoc(user('alice'), 'alice', 'segunda'), col()));
  await assertSucceeds(setDoc(colDoc(user('alice', { plan: 'pro' }), 'alice', 'segunda'), col()));
});
test('solo Pro borra colecciones y main nunca se borra', async () => {
  await env.withSecurityRulesDisabled(async c => { await setDoc(colDoc(c.firestore(), 'alice', 'segunda'), { name: 'x', gameId: 'pokemon', setIds: [] }); });
  await assertFails(deleteDoc(colDoc(user('alice'), 'alice', 'segunda')));
  await assertSucceeds(deleteDoc(colDoc(user('alice', { plan: 'pro' }), 'alice', 'segunda')));
  await withMain('alice');
  await assertFails(deleteDoc(colDoc(user('alice', { plan: 'pro' }), 'alice', 'main')));
});
test('renombrar la colección main es posible en plan gratuito', async () => {
  await withMain('alice');
  await assertSucceeds(updateDoc(colDoc(user('alice'), 'alice', 'main'), { name: 'Nuevo nombre' }));
});
test('items: cantidades válidas (1..999 enteras)', async () => {
  await withMain('alice');
  const db = user('alice');
  await assertSucceeds(setDoc(itemDoc(db, 'alice', 'main', VID), { setId: 'pokemon-30th', qty: 1 }));
  await assertSucceeds(setDoc(itemDoc(db, 'alice', 'main', VID), { setId: 'pokemon-30th', qty: 999 }));
  for (const qty of [0, -1, 1000, 1.5, '2', null])
    await assertFails(setDoc(itemDoc(db, 'alice', 'main', VID), { setId: 'pokemon-30th', qty }));
});
test('items: no admiten campos extra ni falta de campos', async () => {
  await withMain('alice');
  const db = user('alice');
  await assertFails(setDoc(itemDoc(db, 'alice', 'main', VID), { setId: 'pokemon-30th', qty: 1, price: 5 }));
  await assertFails(setDoc(itemDoc(db, 'alice', 'main', VID), { qty: 1 }));
});
test('items: no se escribe en una colección que no existe', async () => {
  await assertFails(setDoc(itemDoc(user('alice'), 'alice', 'fantasma', VID), { setId: 'pokemon-30th', qty: 1 }));
});
test('items: se pueden borrar (qty 0)', async () => {
  await withMain('alice');
  await env.withSecurityRulesDisabled(async c => { await setDoc(itemDoc(c.firestore(), 'alice', 'main', VID), { setId: 'pokemon-30th', qty: 2 }); });
  await assertSucceeds(deleteDoc(itemDoc(user('alice'), 'alice', 'main', VID)));
});
test('precios: solo Pro, con datos válidos y fecha de servidor', async () => {
  const ok = { amount: 12.5, currency: 'EUR', source: 'manual', updatedAt: serverTimestamp() };
  await assertFails(setDoc(priceDoc(user('alice'), 'alice', VID), ok));                       // gratis
  const pro = user('alice', { plan: 'pro' });
  await assertSucceeds(setDoc(priceDoc(pro, 'alice', VID), ok));
  await assertSucceeds(setDoc(priceDoc(pro, 'alice', VID), { ...ok, language: 'EN' }));
  await assertFails(setDoc(priceDoc(pro, 'alice', VID), { ...ok, amount: -1 }));
  await assertFails(setDoc(priceDoc(pro, 'alice', VID), { ...ok, amount: 100000 }));
  await assertFails(setDoc(priceDoc(pro, 'alice', VID), { ...ok, amount: '5' }));
  await assertFails(setDoc(priceDoc(pro, 'alice', VID), { ...ok, currency: 'EURO' }));
  await assertFails(setDoc(priceDoc(pro, 'alice', VID), { ...ok, updatedAt: new Date('2020-01-01') }));
  await assertFails(setDoc(priceDoc(pro, 'alice', VID), { ...ok, extra: 1 }));
  await assertFails(setDoc(priceDoc(user('bob', { plan: 'pro' }), 'alice', VID), ok));        // ajeno
});
test('priceSnapshots: lectura con cuenta verificada, escritura nunca', async () => {
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'priceSnapshots/s1'), { v: 1 }); });
  await assertSucceeds(getDoc(doc(user('alice'), 'priceSnapshots/s1')));
  await assertFails(getDoc(doc(anon(), 'priceSnapshots/s1')));
  await assertFails(setDoc(doc(user('alice', { plan: 'pro' }), 'priceSnapshots/s2'), { v: 1 }));
});
test('lo no declarado está denegado', async () => {
  await assertFails(setDoc(doc(user('alice'), 'otra/cosa'), { a: 1 }));
  await assertFails(setDoc(doc(user('alice'), 'users/alice'), { plan: 'pro' }));
});
