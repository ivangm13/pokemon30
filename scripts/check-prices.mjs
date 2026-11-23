import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CATALOG_CLASSIC_ORDER, PRICE_MAPPINGS, VALIDATED_PRODUCTS } from './price-mappings.mjs';
import { analyzeCard, isValidPrice, normalizeStoredPrice, summarizeSet } from './price-analysis.mjs';

const API_BASE = 'https://api.tcgdex.net/v2/es';
const CONCURRENCY = 8;
const REQUEST_DELAY_MS = 50;
const SET_IDS = process.argv.slice(2);
const RESULT_PATH = 'scripts/price-check-result.json';
const SUMMARY_PATH = 'scripts/price-check-summary.json';
const CATALOG_PATH = 'src/app/catalog/cardmarket-prices.ts';

async function writeAtomically(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  try {
    await writeFile(temporaryPath, contents, { flag: 'wx' });
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

if (SET_IDS.length === 0) {
  console.error('Indica al menos un ID de expansión.');
  console.error('Ejemplos: node scripts/check-prices.mjs 30th');
  console.error('          node scripts/check-prices.mjs 30th 30th-c');
  process.exit(1);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

async function mapWithConcurrency(items, limit, callback) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const currentIndex = index++;
      if (currentIndex >= items.length) return;
      try {
        results[currentIndex] = await callback(items[currentIndex]);
      } catch (error) {
        results[currentIndex] = { error: error instanceof Error ? error.message : String(error) };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function assertCompleteSnapshot(sets, requestedSetIds) {
  for (const setId of Object.keys(VALIDATED_PRODUCTS)) {
    const set = sets.find(entry => entry.set.id === setId);
    const cardIds = new Set((set?.cards ?? []).map(card => card.cardId));
    const missing = Object.keys(VALIDATED_PRODUCTS[setId]).filter(cardId => !cardIds.has(cardId));
    if (missing.length) throw new Error(`Snapshot incompleto: faltan ${missing.length} cartas de ${setId}; no se guardará ningún artefacto.`);
  }
  for (const setId of requestedSetIds) {
    const set = sets.find(entry => entry.set.id === setId);
    if (!set) throw new Error(`No se guardará el snapshot: no existe resultado para ${setId}.`);
    // A failed refresh is safe only after the old, complete set was restored below.
    if (set.error && set.cards.length === 0)
      throw new Error(`No se guardará el snapshot: ${setId} falló y no hay datos anteriores que conservar.`);
    const expected = set.set.cardCount?.total;
    if (Number.isInteger(expected) && set.cards.length !== expected)
      throw new Error(`Snapshot incompleto de ${setId}: esperadas ${expected} cartas y recibidas ${set.cards.length}.`);
    if (set.cards.some(card => card.status === 'query-error' || !card.cardId || !card.collectionNumber || !card.name))
      throw new Error(`Snapshot incompleto de ${setId}: hay cartas con errores o campos clave ausentes.`);
    if (new Set(set.cards.map(card => card.cardId)).size !== set.cards.length)
      throw new Error(`Snapshot incompleto de ${setId}: hay IDs de carta duplicados.`);
  }
}

function failedCard(setId, setLanguage, setCard, error) {
  return {
    setId,
    cardId: setCard?.id ?? null,
    name: setCard?.name ?? null,
    collectionNumber: setCard?.localId ?? null,
    rarity: setCard?.rarity ?? null,
    language: setLanguage ?? null,
    variants: setCard?.variants ?? null,
    cardmarket: null,
    trend: null,
    trendHolo: null,
    expectedField: null,
    selectedField: null,
    selectedPrice: null,
    status: 'query-error',
    reason: error,
    updatedAt: null,
    currency: null,
    unit: null,
    variantAssessments: [],
  };
}

function summarizeAll(sets) {
  const allCards = sets.flatMap(set => set.cards);
  const summary = summarizeSet(allCards);
  summary.processed = allCards.length;
  summary.successfullyValidated = summary.valuationStates?.validated ?? 0;
  summary.problems = summary.processed - summary.successfullyValidated;
  summary.queryErrors = allCards.filter(card => card.status === 'query-error').length
    + sets.filter(set => set.error).length;
  summary.expansionQueryErrors = sets.filter(set => set.error).length;
  return summary;
}

async function analyzeSet(setId) {
  console.log(`\nConsultando expansión ${setId}…`);
  const set = await fetchJson(`${API_BASE}/sets/${encodeURIComponent(setId)}`);
  const setCards = set.cards ?? [];
  const results = await mapWithConcurrency(setCards, CONCURRENCY, async setCard => {
    await sleep(REQUEST_DELAY_MS);
    try {
      const card = await fetchJson(`${API_BASE}/cards/${encodeURIComponent(setCard.id)}`);
      return analyzeCard(card, setId, set.language, PRICE_MAPPINGS[setId] ?? {}, VALIDATED_PRODUCTS[setId]?.[card.id]);
    } catch (error) {
      return failedCard(setId, set.language, setCard, error instanceof Error ? error.message : String(error));
    }
  });

  const cards = results.map((result, index) => result?.error
    ? failedCard(setId, set.language, setCards[index], result.error)
    : result);
  return {
    set: {
      id: set.id ?? setId,
      name: set.name ?? null,
      language: set.language ?? null,
      cardCount: set.cardCount ?? null,
    },
    summary: summarizeSet(cards),
    cards,
  };
}

async function main() {
  let previous;
  try {
    previous = JSON.parse(await readFile(RESULT_PATH, 'utf8'));
    if (!Array.isArray(previous?.sets)) throw new Error('El JSON anterior no contiene el listado de expansiones.');
    if (previous.sets.some(entry => !entry || typeof entry.set?.id !== 'string' || !Array.isArray(entry.cards)))
      throw new Error('El JSON anterior contiene expansiones incompletas.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new Error(`No se puede usar el snapshot anterior: ${error.message}`);
    previous = null;
  }
  const allSetIds = Object.keys(VALIDATED_PRODUCTS);
  const completeRefresh = allSetIds.every(setId => SET_IDS.includes(setId));
  if (!previous && !completeRefresh) {
    throw new Error('No existe un snapshot anterior completo. Para evitar borrar precios de otra expansión, consulta todos los IDs validados en la misma ejecución.');
  }
  const previousCards = new Map((previous?.sets ?? []).flatMap(set => (set.cards ?? []).map(card => [`${card.setId}:${card.cardId}`, card])));
  if (previous && !completeRefresh) {
    for (const setId of allSetIds) {
      const oldSet = previous.sets.find(set => set.set?.id === setId);
      const oldIds = new Set((oldSet?.cards ?? []).map(card => card.cardId));
      if (!oldSet || Object.keys(VALIDATED_PRODUCTS[setId]).some(cardId => !oldIds.has(cardId))) {
        throw new Error(`El snapshot anterior de ${setId} está incompleto; no se ejecutará una actualización parcial.`);
      }
    }
  }
  const sets = [];
  for (const setId of SET_IDS) {
    try {
      sets.push(await analyzeSet(setId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error consultando la expansión ${setId}: ${message}`);
      sets.push({
        set: { id: setId, name: null, language: null, cardCount: null },
        error: message,
        summary: summarizeSet([]),
        cards: [],
      });
    }
  }

  for (const set of sets) {
    set.cards = set.cards.map(card => {
      const old = previousCards.get(`${card.setId}:${card.cardId}`);
      const oldProductId = old?.productId ?? old?.cardmarket?.idProduct;
      const oldValid = Number.isFinite(old?.cardmarket?.trend) && old.cardmarket.trend > 0
        && oldProductId === VALIDATED_PRODUCTS[card.setId]?.[card.cardId];
      if (!oldValid || card.valuationStatus === 'validated') return card;
      return {
        ...card,
        cardmarket: old.cardmarket,
        trend: old.cardmarket.trend,
        trendHolo: old.cardmarket['trend-holo'] ?? null,
        expectedField: card.variantAssessments.length === 1 ? 'trend' : null,
        selectedField: 'trend',
        selectedPrice: old.cardmarket.trend,
        status: 'valid',
        valuationStatus: 'validated',
        productId: oldProductId,
        productValidated: true,
        updatedAt: old.cardmarket.updated,
        currency: old.cardmarket.unit ?? 'EUR',
        retainedPreviousPrice: true,
        refreshIssue: card.reason,
        reason: 'Se conserva el último precio validado porque la consulta actual no proporcionó un nuevo trend válido.',
        variantAssessments: card.variantAssessments.map(assessment => ({
          ...assessment,
          expectedField: 'trend', selectedField: 'trend', selectedPrice: old.cardmarket.trend,
          trend: old.cardmarket.trend, status: 'valid',
          reason: 'Se conserva el último trend de un producto previamente validado.', discrepancy: false,
        })),
      };
    });
    set.cards = set.cards.map(card => card.cardmarket
      ? normalizeStoredPrice(card, PRICE_MAPPINGS[card.setId] ?? {}, VALIDATED_PRODUCTS[card.setId]?.[card.cardId])
      : card);
    set.summary = summarizeSet(set.cards);
  }
  for (const oldSet of previous?.sets ?? []) {
    const current = sets.find(set => set.set.id === oldSet.set.id);
    const normalizedOldCards = (oldSet.cards ?? []).map(card => normalizeStoredPrice(
      card,
      PRICE_MAPPINGS[card.setId] ?? {},
      VALIDATED_PRODUCTS[card.setId]?.[card.cardId],
    ));
    if (!current) {
      sets.push({ ...oldSet, cards: normalizedOldCards, summary: summarizeSet(normalizedOldCards) });
      continue;
    }
    if (current.error) current.set = oldSet.set;
    const currentIds = new Set(current.cards.map(card => card.cardId));
    const omitted = normalizedOldCards.filter(card => !currentIds.has(card.cardId));
    if (omitted.length) current.cards.push(...omitted);
    current.summary = summarizeSet(current.cards);
  }
  assertCompleteSnapshot(sets, SET_IDS);
  const audit = summarizeAll(sets);
  const output = {
    generatedAt: new Date().toISOString(),
    language: 'es',
    source: 'TCGdex / Cardmarket',
    validationPolicy: 'La valoración usa trend si es finito y positivo, el idProduct coincide con la lista validada y existe una correspondencia de variante explícita. No se sustituyen automáticamente otros campos.',
    sets,
    audit,
  };

  await mkdir('scripts', { recursive: true });
  const resultText = JSON.stringify(output, null, 2);
  const summaryText = JSON.stringify({ generatedAt: output.generatedAt, audit, sets: sets.map(({ set, summary }) => ({ set, summary })) }, null, 2);
  const catalogPrices = {};
  const perSetPrices = {};
  for (const set of sets) for (const card of set.cards) {
    const collectionNumber = Number(card.collectionNumber);
    let catalogCardId = null;
    if (card.setId === '30th') {
      catalogCardId = card.cardId.endsWith('-B') ? 'rgbB' : card.cardId.endsWith('-G') ? 'rgbG' : card.cardId.endsWith('-R') ? 'rgbR'
        : collectionNumber <= 128 ? `m${collectionNumber}` : collectionNumber <= 158 ? `s${collectionNumber}` : null;
    } else if (card.setId === '30th-c' && CATALOG_CLASSIC_ORDER.indexOf(collectionNumber) >= 0) {
      catalogCardId = `c${CATALOG_CLASSIC_ORDER.indexOf(collectionNumber)}`;
    }
    const assessments = card.variantAssessments?.filter(assessment => assessment.variant) ?? [];
    for (const assessment of assessments) {
      const appSetId = card.setId === '30th' || card.setId === '30th-c' ? 'pokemon-30th' : card.setId;
      let appCardId = catalogCardId;
      let appVariant = assessment.variant;
      if (card.setId === '30th' || card.setId === '30th-c') {
        if (!catalogCardId) continue;
        appVariant = 'normal'; // the existing 30th catalog uses one inventory variant per card
      } else {
        appCardId = card.cardId;
      }
      const key = `${appSetId}:${appCardId}:${appVariant}`;
      const cm = assessment.variantPrice ?? card.cardmarket;
      const sourceField = assessment.selectedField ?? assessment.expectedField ?? 'trend';
      const status = card.valuationStatus ?? 'needs-review';
      const amount = status === 'validated' && sourceField === 'trend' && isValidPrice(assessment.selectedPrice)
        ? assessment.selectedPrice : null;
      const price = {
        amount,
        currency: cm?.unit ?? card.currency ?? 'EUR',
        source: 'cardmarket',
        productId: Number.isInteger(card.productId ?? cm?.idProduct) ? card.productId ?? cm.idProduct : null,
        sourceField,
        status,
        metrics: Object.fromEntries(['avg','low','trend','avg1','avg7','avg30','avg-holo','low-holo','trend-holo','avg1-holo','avg7-holo','avg30-holo'].map(field => [field, cm?.[field] ?? null])),
        updatedAt: cm?.updated ? Date.parse(cm.updated) : null,
      };
      (perSetPrices[appSetId] ??= {})[key] = price;
      if (appSetId === 'pokemon-30th') catalogPrices[key] = price;
    }
  }
  const catalogText = `import { PriceCatalog } from '../core/pricing';\n\n/** Snapshot compartido Cardmarket generado desde los datos auditados. */\nexport const CARDMARKET_PRICES: PriceCatalog = ${JSON.stringify(catalogPrices, null, 2)};\n`;
  await writeAtomically(RESULT_PATH, resultText);
  await writeAtomically(SUMMARY_PATH, summaryText);
  // The application snapshot is committed last; a failed run leaves the live bundle data intact.
  await writeAtomically(CATALOG_PATH, catalogText);
  for (const [appSetId, prices] of Object.entries(perSetPrices)) {
    const file = encodeURIComponent(appSetId).replaceAll('%', '_');
    await writeAtomically(`public/catalog/prices/${file}.json`, JSON.stringify(prices, null, 2));
  }

  console.log('\nResumen de auditoría');
  console.log(JSON.stringify(audit, null, 2));
  console.log(`\nResultados detallados: ${RESULT_PATH}`);
  console.log(`Resumen de auditoría: ${SUMMARY_PATH}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
