
const API_BASE = 'https://api.tcgdex.net/v2/es';
const CONCURRENCY = 8;

const SET_IDS = process.argv.slice(2);

if (SET_IDS.length === 0) {
  console.error('Indica al menos un ID de expansión.');
  console.error('Ejemplo: node scripts/check-prices.mjs me05');
  process.exit(1);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }

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
        results[currentIndex] = {
          error: error.message
        };
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(limit, items.length) },
      () => worker()
    )
  );

  return results;
}

function getPriceAnalysis(card) {
  const variants = card.variants ?? {};
  const pricing = card.pricing?.cardmarket ?? {};

  // Conservamos los dos precios para poder auditarlos.
  const trend = pricing.trend ?? null;
  const trendHolo = pricing['trend-holo'] ?? null;

  // Misma lógica de selección que utilizábamos anteriormente.
  const holoOnly = Boolean(variants.holo && !variants.normal);

  const expectedField = holoOnly ? 'trend-holo' : 'trend';

  const expectedValue = expectedField === 'trend-holo'
    ? trendHolo
    : trend;

  const alternateField = expectedField === 'trend-holo'
    ? 'trend'
    : 'trend-holo';

  const alternateValue = expectedField === 'trend-holo'
    ? trend
    : trendHolo;

  let selectedField = null;
  let selectedPrice = null;
  let status = null;

  if (expectedValue !== null) {
    selectedField = expectedField;
    selectedPrice = expectedValue;
    status = 'ok';
  } else if (alternateValue !== null) {
    selectedField = alternateField;
    selectedPrice = alternateValue;
    status = 'solo-otro-campo';
  } else if (pricing.trend !== undefined ||
             pricing['trend-holo'] !== undefined) {
    status = 'sin-trend';
  } else {
    status = 'sin-bloque';
  }

  return {
    variants,
    expectedField,
    selectedField,
    selectedPrice,
    trend,
    trendHolo,
    status,
    updated: pricing.updated ?? null,
    unit: pricing.unit ?? null
  };
}

async function analyzeSet(setId) {
  console.log(`\nAnalizando expansión: ${setId}`);

  const set = await fetchJson(`${API_BASE}/sets/${setId}`);

  console.log(`Nombre: ${set.name}`);
  console.log(`Cartas declaradas: ${set.cardCount?.total ?? 'N/D'}`);

  const cards = set.cards ?? [];

  const results = await mapWithConcurrency(
    cards,
    CONCURRENCY,
    async (setCard) => {
      await sleep(50);

      const card = await fetchJson(
        `${API_BASE}/cards/${setCard.id}`
      );

      const priceAnalysis = getPriceAnalysis(card);

      return {
        setId,
        setName: set.name,
        id: card.id,
        name: card.name,
        localId: card.localId,
        image: card.image ?? null,
        ...priceAnalysis
      };
    }
  );

  const summary = {
    total: results.length,
    ok: 0,
    soloOtroCampo: 0,
    sinTrend: 0,
    sinBloque: 0,
    errors: 0
  };

  for (const result of results) {
    if (result.error) {
      summary.errors++;
      continue;
    }

    switch (result.status) {
      case 'ok':
        summary.ok++;
        break;
      case 'solo-otro-campo':
        summary.soloOtroCampo++;
        break;
      case 'sin-trend':
        summary.sinTrend++;
        break;
      case 'sin-bloque':
        summary.sinBloque++;
        break;
    }
  }

  return {
    set: {
      id: set.id,
      name: set.name,
      cardCount: set.cardCount
    },
    summary,
    cards: results
  };
}

async function main() {
  const output = {
    generatedAt: new Date().toISOString(),
    language: 'es',
    source: 'TCGdex / Cardmarket',
    sets: []
  };

  for (const setId of SET_IDS) {
    try {
      const result = await analyzeSet(setId);
      output.sets.push(result);

      console.log('\nResultado:', result.set.name);
      console.table(result.summary);
    } catch (error) {
      console.error(`Error analizando ${setId}:`, error.message);

      output.sets.push({
        set: { id: setId },
        error: error.message,
        cards: []
      });
    }
  }

  const fs = await import('node:fs/promises');

  await fs.mkdir('scripts', { recursive: true });

  const outputPath = 'scripts/price-check-result.json';

  await fs.writeFile(
    outputPath,
    JSON.stringify(output, null, 2),
    'utf8'
  );

  console.log(`\nArchivo generado: ${outputPath}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
