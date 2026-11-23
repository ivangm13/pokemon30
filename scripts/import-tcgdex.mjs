import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PRICE_MAPPINGS, VALIDATED_PRODUCTS } from './price-mappings.mjs';

const API = 'https://api.tcgdex.net/v2';
const METRICS = ['avg', 'low', 'trend', 'avg1', 'avg7', 'avg30', 'avg-holo', 'low-holo', 'trend-holo', 'avg1-holo', 'avg7-holo', 'avg30-holo'];
const CONCURRENCY = 8;
const [, , setId, ...args] = process.argv;
const valueAfter = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const language = valueAfter('--lang', 'es');
const gameId = valueAfter('--game', 'pokemon');
const apply = args.includes('--apply');
const reportPath = valueAfter('--report', `scripts/catalog-import-reports/${setId || 'missing'}-${language}.json`);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (!setId || !/^[A-Za-z0-9._+-]+$/.test(setId) || !/^[a-z]{2,5}(-[A-Z]{2})?$/.test(language)) {
  fail('Uso: node scripts/import-tcgdex.mjs <setId> [--lang es] [--game pokemon] [--report archivo.json] [--apply]');
} else {
  main().catch(error => fail(error instanceof Error ? error.message : String(error)));
}

async function fetchJson(path) {
  const response = await fetch(`${API}/${encodeURIComponent(language)}/${path}`);
  if (!response.ok) throw new Error(`TCGdex HTTP ${response.status} en ${path}`);
  return response.json();
}

async function mapConcurrent(items, callback) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await callback(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}

function canonicalVariants(card) {
  const detailed = Array.isArray(card.variants_detailed) ? card.variants_detailed : [];
  const keys = detailed.map(variant => variant?.type).filter(type => typeof type === 'string' && type.length > 0);
  if (keys.length) return [...new Set(keys.map(key => key.replace(/[^a-zA-Z0-9_-]/g, '-')))];
  const enabled = Object.entries(card.variants ?? {}).filter(([, value]) => value === true).map(([key]) => key);
  return [...new Set(enabled)];
}

function makeCard(card, baseCardCount) {
  const localId = String(card.localId);
  const numericId = Number.parseInt(localId, 10);
  const base = Number.isInteger(numericId) && numericId <= baseCardCount;
  const group = base ? 'base' : 'secret';
  const variants = canonicalVariants(card);
  const label = value => value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ')
    .replace(/^./, character => character.toLocaleUpperCase(language));
  return {
    id: card.id,
    num: `${localId}/${baseCardCount}`,
    name: card.name,
    rarity: card.rarity,
    category: card.category,
    tags: card.category ? [group, card.category.toLowerCase()] : [group],
    img: `${card.image.replace(/\/$/, '')}/low.webp`,
    variants: variants.map(key => ({ key, label: label(key) })),
  };
}

function validPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function cardmarketFor(card, variant) {
  const detail = card.variants_detailed?.find(item => item.type === variant);
  return detail?.pricing?.cardmarket ?? card.pricing?.cardmarket ?? null;
}

function makePrice(setId, card, variant) {
  const mapping = PRICE_MAPPINGS[setId]?.[card.id]?.[variant];
  const validatedProductId = VALIDATED_PRODUCTS[setId]?.[card.id];
  const cardmarket = cardmarketFor(card, variant);
  const productId = cardmarket?.idProduct ?? card.variants_detailed?.find(item => item.type === variant)?.thirdParty?.cardmarket
    ?? card.thirdParty?.cardmarket ?? null;
  const productValidated = Number.isInteger(productId) && productId > 0 && productId === validatedProductId;
  const amount = mapping === 'trend' && productValidated && validPrice(cardmarket?.trend) ? cardmarket.trend : null;
  const metrics = Object.fromEntries(METRICS.map(field => [field, cardmarket?.[field] ?? null]));
  const hasPriceData = Object.values(metrics).some(value => value !== null && value !== undefined);
  const status = amount !== null ? 'validated' : hasPriceData ? 'needs-review' : 'missing';
  return {
    amount,
    currency: cardmarket?.unit ?? 'EUR',
    source: 'cardmarket',
    productId: Number.isInteger(productId) && productId > 0 ? productId : null,
    sourceField: 'trend',
    status,
    metrics,
    updatedAt: cardmarket?.updated ? Date.parse(cardmarket.updated) : null,
  };
}

function slug(id) {
  return encodeURIComponent(id).replaceAll('%', '_');
}

async function writeAtomically(path, contents) {
  await mkdir(join(path, '..'), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  try {
    await writeFile(temporary, contents, { flag: 'wx' });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function main() {
  const set = await fetchJson(`sets/${encodeURIComponent(setId)}`);
  const issues = [];
  const cardsBrief = Array.isArray(set.cards) ? set.cards : [];
  const ids = new Set();
  const localIds = new Set();
  for (const card of cardsBrief) {
    if (!card?.id || !card.id.startsWith(`${setId}-`)) issues.push({ cardId: card?.id ?? null, issue: 'bad-card-id' });
    if (ids.has(card?.id)) issues.push({ cardId: card?.id ?? null, issue: 'duplicate-card-id' });
    if (localIds.has(card?.localId)) issues.push({ cardId: card?.id ?? null, issue: 'duplicate-collection-number' });
    ids.add(card?.id);
    localIds.add(card?.localId);
    if (!card?.name) issues.push({ cardId: card?.id ?? null, issue: 'missing-name' });
    if (!card?.localId) issues.push({ cardId: card?.id ?? null, issue: 'missing-collection-number' });
    if (!card?.image) issues.push({ cardId: card?.id ?? null, issue: 'missing-image' });
    else {
      try {
        const image = new URL(card.image);
        if (image.hostname !== 'assets.tcgdex.net' || !card.image.startsWith(`https://assets.tcgdex.net/${language}/`))
          issues.push({ cardId: card.id, issue: 'unexpected-image-url' });
      } catch { issues.push({ cardId: card.id, issue: 'invalid-image-url' }); }
    }
  }
  if (set.id !== setId) issues.push({ issue: 'set-id-mismatch', expected: setId, actual: set.id });
  if (!set.name || !set.serie?.id || !set.serie?.name || !/^\d{4}-\d{2}-\d{2}$/.test(set.releaseDate ?? ''))
    issues.push({ issue: 'incomplete-set-metadata' });
  if (!set.cardCount || !Number.isInteger(set.cardCount.total) || cardsBrief.length !== set.cardCount.total)
    issues.push({ issue: 'set-card-count-mismatch', expected: set.cardCount?.total ?? null, received: cardsBrief.length });

  const detailResults = await mapConcurrent(cardsBrief, async brief => {
    try {
      const detail = await fetchJson(`cards/${encodeURIComponent(brief.id)}`);
      const cardIssues = [];
      if (detail.id !== brief.id) cardIssues.push('detail-id-mismatch');
      if (String(detail.localId) !== String(brief.localId)) cardIssues.push('detail-number-mismatch');
      if (detail.name !== brief.name) cardIssues.push('detail-name-mismatch');
      if (!detail.set?.id || detail.set.id !== setId) cardIssues.push('detail-set-mismatch');
      if (!detail.rarity) cardIssues.push('missing-rarity');
      if (!detail.image) cardIssues.push('missing-detail-image');
      if (!detail.variants || !Object.values(detail.variants).some(value => value === true)) cardIssues.push('missing-variant-flags');
      const variants = canonicalVariants(detail);
      if (!variants.length) cardIssues.push('missing-variant-details');
      if (cardIssues.length) issues.push(...cardIssues.map(issue => ({ cardId: brief.id, issue })));
      return { ...detail, variants_detailed: detail.variants_detailed ?? [], _issues: cardIssues };
    } catch (error) {
      issues.push({ cardId: brief.id, issue: 'detail-query-error', message: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });
  const details = detailResults.filter(Boolean);
  if (details.length !== cardsBrief.length) issues.push({ issue: 'partial-card-details', expected: cardsBrief.length, received: details.length });

  const official = Number(set.cardCount?.official ?? cardsBrief.length);
  const appSet = {
    id: setId,
    gameId,
    name: set.name,
    language,
    series: { id: set.serie.id, name: set.serie.name },
    releaseDate: set.releaseDate,
    logo: set.logo,
    symbol: set.symbol,
    cardCount: set.cardCount,
    source: { provider: 'tcgdex', setId, language },
    availability: 'available',
    groups: [
      { key: 'base', label: `Base ${String(1).padStart(3, '0')}–${String(official).padStart(3, '0')}` },
      { key: 'secret', label: 'Secretas' },
    ],
    modes: [
      { key: 'base', label: 'Base Set', rule: { tags: ['base'] } },
      { key: 'master', label: 'Master Set', rule: { all: true } },
    ],
    cards: details.map(card => makeCard(card, official)),
  };
  const prices = {};
  for (const card of details) for (const variant of canonicalVariants(card)) {
    prices[`${setId}:${card.id}:${variant}`] = makePrice(setId, card, variant);
  }
  const reviewCount = Object.values(prices).filter(price => price.status === 'needs-review').length;
  const validatedCount = Object.values(prices).filter(price => price.status === 'validated').length;
  const missingCount = Object.values(prices).filter(price => price.status === 'missing').length;
  const report = {
    generatedAt: new Date().toISOString(),
    source: `${API}/${language}/sets/${setId}`,
    validation: { passed: issues.length === 0, issueCount: issues.length, issues },
    set: {
      id: set.id, name: set.name, language, series: set.serie, releaseDate: set.releaseDate,
      abbreviation: set.abbreviation ?? null, logo: set.logo ?? null, symbol: set.symbol ?? null,
      cardCount: set.cardCount, briefCards: cardsBrief.length, detailedCards: details.length,
      uniqueIds: ids.size, uniqueCollectionNumbers: localIds.size,
    },
    cardFields: {
      missingRarity: details.filter(card => !card.rarity).length,
      missingImage: details.filter(card => !card.image).length,
      missingVariants: details.filter(card => !canonicalVariants(card).length).length,
      variants: Object.fromEntries([...new Set(details.flatMap(card => canonicalVariants(card)))].map(variant => [variant,
        details.filter(card => canonicalVariants(card).includes(variant)).length])),
    },
    cardmarket: {
      validated: validatedCount, needsReview: reviewCount, missing: missingCount,
      cardsWithProductId: details.filter(card => Number.isInteger(card.pricing?.cardmarket?.idProduct) || Number.isInteger(card.thirdParty?.cardmarket)).length,
      note: 'Los precios sin correspondencia explícita y validada de producto y variante se conservan como métricas, pero no se publican como valoración.'
    },
    cards: details.map(card => ({
      id: card.id, localId: card.localId, name: card.name, rarity: card.rarity ?? null,
      image: card.image ? `${card.image.replace(/\/$/, '')}/low.webp` : null,
      variants: canonicalVariants(card), productId: card.pricing?.cardmarket?.idProduct ?? card.thirdParty?.cardmarket ?? null,
      trend: card.pricing?.cardmarket?.trend ?? null, trendHolo: card.pricing?.cardmarket?.['trend-holo'] ?? null,
      priceStatus: canonicalVariants(card).map(variant => prices[`${setId}:${card.id}:${variant}`].status),
    })),
  };
  await writeAtomically(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ report: reportPath, validation: report.validation, set: report.set, cardFields: report.cardFields, cardmarket: report.cardmarket }, null, 2));

  if (!apply) {
    console.log('\nModo informe: no se ha modificado el catálogo de la aplicación. Usa --apply después de revisar el informe.');
    if (issues.length) process.exitCode = 1;
    return;
  }
  if (issues.length) throw new Error('Importación cancelada: el informe contiene errores y no se aplicó ningún artefacto.');

  const manifestPath = 'public/catalog/manifest.json';
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const existingIndex = manifest.sets.findIndex(entry => entry.id === setId);
  const file = slug(setId);
  const assetPath = `catalog/sets/${file}.json`;
  const pricePath = `catalog/prices/${file}.json`;
  if (existingIndex >= 0) {
    const existing = manifest.sets[existingIndex];
    if (existing.gameId !== gameId || existing.assetPath !== assetPath) {
      throw new Error(`${setId} ya está registrado con un origen incompatible; no se sobrescribió.`);
    }
    try {
      const oldSet = JSON.parse(await readFile(`public/${assetPath}`, 'utf8'));
      const currentById = new Map(appSet.cards.map(card => [card.id, card]));
      for (const oldCard of oldSet.cards ?? []) {
        const currentCard = currentById.get(oldCard.id);
        if (!currentCard || oldCard.num !== currentCard.num) {
          throw new Error(`${setId} cambió o eliminó el ID/número ${oldCard.id}; se conserva el catálogo anterior.`);
        }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  if (!manifest.games.some(game => game.id === gameId)) manifest.games.push({ id: gameId, name: gameId });
  const { cards: _cards, ...summary } = appSet;
  const manifestEntry = { ...summary, assetPath, pricePath };
  if (existingIndex >= 0) manifest.sets[existingIndex] = manifestEntry;
  else manifest.sets.push(manifestEntry);
  await writeAtomically(`public/${assetPath}`, `${JSON.stringify(appSet, null, 2)}\n`);
  await writeAtomically(`public/${pricePath}`, `${JSON.stringify(prices, null, 2)}\n`);
  await writeAtomically(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Catálogo de ${setId} incorporado. El manifiesto se actualizó al final.`);
}
