import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { analyzeCard, isValidPrice, normalizeStoredPrice, summarizeSet } from '../scripts/price-analysis.mjs';
import { CATALOG_CLASSIC_ORDER, PRICE_MAPPINGS, VALIDATED_PRODUCTS } from '../scripts/price-mappings.mjs';

test('price validity requires finite positive numbers', () => {
  assert.equal(isValidPrice(null), false);
  assert.equal(isValidPrice(0), false);
  assert.equal(isValidPrice(1.25), true);
  assert.equal(isValidPrice('1.25'), false);
  assert.equal(isValidPrice(Infinity), false);
  assert.equal(isValidPrice(Number.NaN), false);
});

test('missing expected field never selects an available alternate', () => {
  const card = analyzeCard({
    id: '30th-001',
    variants: { normal: true },
    pricing: { cardmarket: { 'trend-holo': 2.5 } },
  }, '30th', 'es', { '30th-001': { normal: 'trend' } });
  assert.equal(card.selectedField, null);
  assert.equal(card.selectedPrice, null);
  assert.equal(card.status, 'alternate-only-unconfirmed');
});

test('two positive unequal fields are reported as a discrepancy', () => {
  const card = analyzeCard({
    id: '30th-001',
    variants: { normal: true },
    pricing: { cardmarket: { idProduct: 42, trend: 1, 'trend-holo': 2 } },
  }, '30th', 'es', { '30th-001': { normal: 'trend' } }, 42);
  assert.equal(card.status, 'valid-with-discrepancy');
  assert.equal(card.selectedPrice, 1);
  assert.equal(card.variantAssessments[0].discrepancy, true);
});

test('multiple variants remain separate assessments', () => {
  const card = analyzeCard({
    id: '30th-001',
    variants: { normal: true, reverse: true, holo: false },
    pricing: { cardmarket: { trend: 1, 'trend-holo': 2 } },
  }, '30th', 'es', {});
  assert.deepEqual(card.variantAssessments.map(result => result.variant), ['normal', 'reverse']);
  assert.equal(card.variantAssessments.length, 2);
  assert.equal(card.status, 'pending-review');
});

test('a card without pricing data is safely classified', () => {
  const card = analyzeCard({ id: '30th-001', variants: { normal: true } }, '30th', 'es');
  assert.equal(card.status, 'no-price-data');
  assert.equal(card.cardmarket, null);
  assert.equal(summarizeSet([card]).cardsWithoutPriceData, 1);
});

test('zero values are counted, but never confirmed as prices', () => {
  const card = analyzeCard({
    id: '30th-001',
    variants: { holo: true },
    pricing: { cardmarket: { 'trend-holo': 0 } },
  }, '30th', 'es', { '30th-001': { holo: 'trend-holo' } });
  const summary = summarizeSet([card]);
  assert.equal(card.status, 'expected-price-zero');
  assert.equal(summary.validPrices, 0);
  assert.equal(summary.zeroPriceCards, 1);
  assert.equal(summary.zeroTrendHoloCards, 1);
});

test('an unvalidated positive price is pending even when the other field is zero', () => {
  const card = analyzeCard({
    id: '30th-001',
    variants: { normal: true },
    pricing: { cardmarket: { trend: 1.2, 'trend-holo': 0 } },
  }, '30th', 'es', {});
  const summary = summarizeSet([card]);
  assert.equal(card.status, 'pending-review');
  assert.equal(card.selectedField, null);
  assert.equal(summary.zeroPriceCards, 0);
  assert.equal(summary.zeroTrendHoloCards, 1);
  assert.equal(summary.validPrices, 0);
});

test('a missing price block does not throw', () => {
  assert.doesNotThrow(() => analyzeCard({ id: '30th-001', variants: { normal: true } }, '30th', 'es'));
});

test('a manually validated product id is required when supplied', () => {
  const card = analyzeCard({
    id: '30th-001',
    variants: { normal: true },
    pricing: { cardmarket: { idProduct: 42, trend: 3.5 } },
  }, '30th', 'es', { '30th-001': { normal: 'trend' } }, 43);
  assert.equal(card.selectedPrice, null);
  assert.equal(card.valuationStatus, 'needs-review');
  assert.equal(card.productValidated, false);
});

test('a positive trend without an exact validated product id stays unpriced', () => {
  const card = analyzeCard({
    id: '30th-001', variants: { normal: true },
    pricing: { cardmarket: { trend: 3.5 } },
  }, '30th', 'es', { '30th-001': { normal: 'trend' } });
  assert.equal(card.selectedPrice, null);
  assert.equal(card.valuationStatus, 'needs-review');
});

test('secondary metrics without trend require review and are not used as a fallback', () => {
  const card = analyzeCard({
    id: '30th-001', variants: { normal: true },
    pricing: { cardmarket: { idProduct: 42, avg: 9, trend: null } },
  }, '30th', 'es', { '30th-001': { normal: 'trend' } }, 42);
  assert.equal(card.valuationStatus, 'needs-review');
  assert.equal(card.selectedPrice, null);
});

test('a validated trend produces the shared valuation state', () => {
  const card = analyzeCard({
    id: '30th-001',
    variants: { normal: true },
    pricing: { cardmarket: { idProduct: 42, trend: 3.5 } },
  }, '30th', 'es', { '30th-001': { normal: 'trend' } }, 42);
  assert.equal(card.selectedPrice, 3.5);
  assert.equal(card.valuationStatus, 'validated');
  assert.equal(card.productValidated, true);
});

test('the classic catalog crosswalk matches collection numbers, not array order', async () => {
  const source = JSON.parse(await readFile(new URL('../scripts/price-check-result_30th.json', import.meta.url), 'utf8'));
  const catalogSource = await readFile(new URL('../src/app/catalog/pokemon-30th.ts', import.meta.url), 'utf8');
  const cards = source.sets.find(set => set.set.id === '30th-c').cards;
  const classicBlock = catalogSource.match(/const classic: Raw\[\] = \('([\s\S]*?)'\)\s*\.split\(';'/)?.[1];
  assert.ok(classicBlock, 'classic card list should remain readable for crosswalk validation');
  const catalogNames = classicBlock.split(';').map(item => item.split('|')[0]);
  const expectedCatalogNames = [
    'Pikachu', 'Charizard', 'Misty', 'Erika’s Jigglypuff', 'Sneasel', 'Shining Celebi', '“Crystal” Lugia',
    'Delcatty', 'Dark Tyranitar', 'Scizor ex', 'Metagross δ', 'Palkia LV.X', 'Uxie', 'Crobat G', 'Gengar Prime',
    'Darkrai & Cresselia LEGEND (top)', 'Darkrai & Cresselia LEGEND (bottom)', 'N', 'Rayquaza-EX', 'Genesect-EX',
    'M Gardevoir-EX', 'Greninja BREAK', 'Solgaleo-GX', 'Buzzwole-GX', 'Pikachu & Zekrom-GX', 'Zacian V',
    'Raikou', 'Mew VMAX', 'Arceus VSTAR', 'Magikarp',
  ];
  const expectedApiNames = [
    'Pikachu', 'Charizard', 'Misty', 'Jigglypuff de Erika', 'Sneasel', 'Celebi Luminoso', 'Lugia', 'Delcatty',
    'Tyranitar Oscuro', 'Scizor ex', 'Metagross', 'Palkia', 'Uxie', 'Crobat G', 'Gengar',
    'Darkrai & Cresselia LEYENDA', 'Darkrai & Cresselia LEYENDA', 'N', 'Rayquaza EX', 'Genesect EX',
    'M Gardevoir EX', 'Greninja TURBO', 'Solgaleo GX', 'Buzzwole GX', 'Pikachu y Zekrom GX', 'Zacian V',
    'Raikou', 'Mew VMAX', 'Arceus V-ASTRO', 'Magikarp',
  ];
  assert.equal(CATALOG_CLASSIC_ORDER.length, 30);
  assert.equal(cards.length, 30);
  assert.deepEqual(catalogNames, expectedCatalogNames);
  for (let index = 0; index < CATALOG_CLASSIC_ORDER.length; index++) {
    const collectionNumber = String(CATALOG_CLASSIC_ORDER[index]).padStart(3, '0');
    assert.equal(cards.find(card => card.collectionNumber === collectionNumber)?.name, expectedApiNames[index], `c${index} -> 30th-c-${collectionNumber}`);
  }
});

test('all 191 snapshot prices match their checked products and trend source', async () => {
  const source = JSON.parse(await readFile(new URL('../scripts/price-check-result_30th.json', import.meta.url), 'utf8'));
  const sourceSets = source.sets;
  assert.deepEqual(sourceSets.map(set => [set.set.id, set.cards.length]), [['30th', 161], ['30th-c', 30]]);
  const catalogSource = await readFile(new URL('../src/app/catalog/cardmarket-prices.ts', import.meta.url), 'utf8');
  const catalog = JSON.parse(catalogSource.slice(catalogSource.indexOf('= ') + 2, catalogSource.lastIndexOf(';')));
  assert.equal(Object.keys(catalog).length, 191);
  for (const set of sourceSets) for (const card of set.cards) {
    const number = Number(card.collectionNumber);
    const localId = set.set.id === '30th-c'
      ? `c${CATALOG_CLASSIC_ORDER.indexOf(number)}`
      : card.cardId.endsWith('-B') ? 'rgbB' : card.cardId.endsWith('-G') ? 'rgbG' : card.cardId.endsWith('-R') ? 'rgbR'
        : number <= 128 ? `m${number}` : `s${number}`;
    const price = catalog[`pokemon-30th:${localId}:normal`];
    const idProduct = VALIDATED_PRODUCTS[set.set.id][card.cardId];
    const activeVariant = Object.keys(card.variants).find(key => card.variants[key]);
    assert.ok(price, `${card.cardId} should map to ${localId}`);
    assert.equal(idProduct, card.cardmarket.idProduct);
    assert.equal(price.productId, idProduct);
    assert.equal(price.amount, card.cardmarket.trend);
    assert.equal(price.sourceField, 'trend');
    assert.equal(price.status, 'validated');
    assert.equal(price.currency, 'EUR');
    assert.equal(price.updatedAt, Date.parse(card.cardmarket.updated));
    assert.equal(price.metrics.trend, card.cardmarket.trend);
    assert.equal(price.metrics['trend-holo'], card.cardmarket['trend-holo']);
    assert.equal(PRICE_MAPPINGS[set.set.id][card.cardId][activeVariant], 'trend');
  }
});

test('a validated price in an untouched expansion survives a single-set refresh', () => {
  const old = {
    setId: '30th-c', cardId: '30th-c-018',
    variants: { holo: true },
    cardmarket: { idProduct: 907953, trend: 46.37, 'trend-holo': 0, unit: 'EUR' },
    variantAssessments: [{ variant: 'holo', selectedField: null, selectedPrice: null, status: 'pending-review' }],
  };
  const saved = normalizeStoredPrice(old, { '30th-c-018': { holo: 'trend' } }, 907953);
  assert.equal(saved.valuationStatus, 'validated');
  assert.equal(saved.selectedField, 'trend');
  assert.equal(saved.selectedPrice, 46.37);
  assert.equal(saved.cardmarket['trend-holo'], 0);
});

test('stored trend-holo never replaces an invalid trend during refresh', () => {
  const old = {
    setId: '30th', cardId: '30th-001', variants: { normal: true },
    cardmarket: { idProduct: 123, trend: 0, 'trend-holo': 8, unit: 'EUR' },
    variantAssessments: [{ variant: 'normal' }],
  };
  const saved = normalizeStoredPrice(old, { '30th-001': { normal: 'trend' } }, 123);
  assert.equal(saved.valuationStatus, 'needs-review');
  assert.equal(saved.selectedPrice, null);
});

test('single-set, combined, incomplete-price and failed-set refreshes preserve other prices', async () => {
  const original = JSON.parse(await readFile(new URL('../scripts/price-check-result.json', import.meta.url), 'utf8'));
  const directory = await mkdtemp(join(tmpdir(), 'pokemon30-price-refresh-'));
  const makeFixture = async (name, initialData, failures = {}, apiData = initialData) => {
    const fixture = join(directory, name);
    await mkdir(join(fixture, 'scripts'), { recursive: true });
    await mkdir(join(fixture, 'src/app/catalog'), { recursive: true });
    for (const file of ['check-prices.mjs', 'price-analysis.mjs', 'price-mappings.mjs'])
      await writeFile(join(fixture, 'scripts', file), await readFile(new URL(`../scripts/${file}`, import.meta.url)));
    if (initialData) await writeFile(join(fixture, 'scripts/price-check-result.json'), JSON.stringify(initialData));
    await writeFile(join(fixture, 'src/app/catalog/cardmarket-prices.ts'), await readFile(new URL('../src/app/catalog/cardmarket-prices.ts', import.meta.url)));
    const mock = {
      data: apiData,
      failSetIds: failures.sets ?? [],
    };
    const preload = `const fixture = ${JSON.stringify(mock)};\n` +
      `globalThis.fetch = async input => {\n` +
      `  const url = new URL(input); const id = decodeURIComponent(url.pathname.split("/").at(-1));\n` +
      `  if (url.pathname.includes("/sets/")) {\n` +
      `    if (fixture.failSetIds.includes(id)) return { ok: false, status: 503, json: async () => ({}) };\n` +
      `    const set = fixture.data.sets.find(entry => entry.set.id === id);\n` +
      `    const value = { ...set.set, cards: set.cards.map(card => ({ id: card.cardId, name: card.name, localId: card.collectionNumber, rarity: card.rarity, variants: card.variants })) };\n` +
      `    return { ok: true, json: async () => value };\n` +
      `  }\n` +
      `  const card = fixture.data.sets.flatMap(set => set.cards).find(entry => entry.cardId === id);\n` +
      `  const value = { id: card.cardId, name: card.name, localId: card.collectionNumber, rarity: card.rarity, variants: card.variants, pricing: { cardmarket: card.cardmarket } };\n` +
      `  return { ok: true, json: async () => value };\n` +
      `};\n`;
    const mockPath = join(fixture, 'mock-api.mjs');
    await writeFile(mockPath, preload);
    const run = (...setIds) => execFileSync(process.execPath,
      ['--import', mockPath, 'scripts/check-prices.mjs', ...setIds], { cwd: fixture, encoding: 'utf8' });
    const readResult = async () => JSON.parse(await readFile(join(fixture, 'scripts/price-check-result.json'), 'utf8'));
    return { fixture, run, readResult };
  };
  const cardmarketBySet = result => Object.fromEntries(result.sets.map(set => [set.set.id,
    Object.fromEntries(set.cards.map(card => [card.cardId, card.cardmarket]))]));
  const readSnapshot = async fixture => {
    const text = await readFile(join(fixture.fixture, 'src/app/catalog/cardmarket-prices.ts'), 'utf8');
    return JSON.parse(text.slice(text.indexOf('= ') + 2, text.lastIndexOf(';')));
  };

  try {
    const fromThirty = await makeFixture('thirty-only', original);
    fromThirty.run('30th');
    const thirtyOnly = await fromThirty.readResult();
    assert.deepEqual(cardmarketBySet(thirtyOnly)['30th-c'], cardmarketBySet(original)['30th-c']);
    assert.equal(thirtyOnly.sets.find(set => set.set.id === '30th-c').summary.validPrices, 30);

    const fromClassic = await makeFixture('classic-only', original);
    fromClassic.run('30th-c');
    const classicOnly = await fromClassic.readResult();
    assert.deepEqual(cardmarketBySet(classicOnly)['30th'], cardmarketBySet(original)['30th']);

    const combinedFixture = await makeFixture('both', original);
    combinedFixture.run('30th', '30th-c');
    const combined = await combinedFixture.readResult();
    assert.deepEqual(cardmarketBySet(combined), cardmarketBySet(classicOnly));
    assert.deepEqual(cardmarketBySet(combined), cardmarketBySet(thirtyOnly));
    assert.deepEqual(await readSnapshot(combinedFixture), await readSnapshot(fromClassic));
    assert.deepEqual(await readSnapshot(combinedFixture), await readSnapshot(fromThirty));

    const sequentialFixture = await makeFixture('sequential', original);
    sequentialFixture.run('30th');
    sequentialFixture.run('30th-c');
    const sequential = await sequentialFixture.readResult();
    assert.deepEqual(cardmarketBySet(sequential), cardmarketBySet(combined));
    assert.deepEqual(await readSnapshot(sequentialFixture), await readSnapshot(combinedFixture));

    const incomplete = structuredClone(original);
    const failedPrice = incomplete.sets.find(set => set.set.id === '30th').cards.find(card => card.cardId === '30th-001');
    const oldTrend = failedPrice.cardmarket.trend;
    failedPrice.cardmarket.trend = null;
    const incompleteFixture = await makeFixture('incomplete', original, {}, incomplete);
    incompleteFixture.run('30th');
    const afterIncomplete = await incompleteFixture.readResult();
    const retained = afterIncomplete.sets.find(set => set.set.id === '30th').cards.find(card => card.cardId === '30th-001');
    assert.equal(retained.cardmarket.trend, oldTrend);
    assert.equal(retained.retainedPreviousPrice, true);

    const failedFixture = await makeFixture('set-failure', original, { sets: ['30th'] });
    failedFixture.run('30th');
    const afterFailure = await failedFixture.readResult();
    assert.deepEqual(cardmarketBySet(afterFailure), cardmarketBySet(original));
    const snapshotSource = await readFile(join(failedFixture.fixture, 'src/app/catalog/cardmarket-prices.ts'), 'utf8');
    const snapshot = JSON.parse(snapshotSource.slice(snapshotSource.indexOf('= ') + 2, snapshotSource.lastIndexOf(';')));
    assert.equal(Object.keys(snapshot).length, 191);
    assert.equal(snapshot['pokemon-30th:m1:normal'].status, 'validated');

    const noPrevious = await makeFixture('no-previous', null, {}, original);
    const oldSnapshot = await readSnapshot(noPrevious);
    assert.throws(() => noPrevious.run('30th'), /No existe un snapshot anterior completo/);
    assert.deepEqual(await readSnapshot(noPrevious), oldSnapshot);

    const incompletePrevious = structuredClone(original);
    incompletePrevious.sets.find(set => set.set.id === '30th-c').cards.pop();
    const incompletePreviousFixture = await makeFixture('incomplete-previous', incompletePrevious);
    const intactSnapshot = await readSnapshot(incompletePreviousFixture);
    assert.throws(() => incompletePreviousFixture.run('30th'), /snapshot anterior de 30th-c está incompleto/);
    assert.deepEqual(await readSnapshot(incompletePreviousFixture), intactSnapshot);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
