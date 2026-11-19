const PRICE_FIELDS = ['trend', 'trend-holo'];
const PRICE_METRICS = ['avg', 'low', 'trend', 'avg1', 'avg7', 'avg30', 'avg-holo', 'low-holo', 'trend-holo', 'avg1-holo', 'avg7-holo', 'avg30-holo'];

export function isValidPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

const hasValue = value => value !== null && value !== undefined;
const isAbsent = value => !hasValue(value);
const isZero = value => typeof value === 'number' && value === 0;
const variantKeys = variants => Object.entries(variants ?? {})
  .filter(([, enabled]) => enabled === true)
  .map(([key]) => key);

function inspectVariant(card, variant, mapping) {
  const pricing = card.pricing?.cardmarket;
  const expectedField = mapping?.[variant] ?? null;
  const expectedValue = expectedField ? pricing?.[expectedField] : undefined;
  const alternateField = expectedField
    ? PRICE_FIELDS.find(field => field !== expectedField)
    : null;
  const alternateValue = alternateField ? pricing?.[alternateField] : undefined;
  const values = PRICE_FIELDS.map(field => pricing?.[field]);
  const bothValid = values.every(isValidPrice);
  const discrepancy = bothValid && values[0] !== values[1];
  const anyValid = values.some(isValidPrice);
  let status;
  let reason;
  let selectedField = null;
  let selectedPrice = null;

  if (!expectedField) {
    if (PRICE_METRICS.every(field => isAbsent(pricing?.[field]))) {
      status = 'no-price-data';
      reason = 'No hay valores trend ni trend-holo en Cardmarket.';
    } else if (anyValid) {
      status = 'pending-review';
      reason = 'Hay al menos un precio positivo, pero no existe una correspondencia validada para esta expansión, carta y variante.';
    } else if (values.some(isZero)) {
      status = 'zero-price-unconfirmed';
      reason = 'Hay un campo con valor cero; no es un precio válido y la correspondencia no está validada.';
    } else {
      status = 'pending-review';
      reason = 'Hay campos de precio, pero ninguno es un número finito mayor que cero y no existe correspondencia validada.';
    }
  } else if (!pricing || PRICE_METRICS.every(field => isAbsent(pricing[field]))) {
    status = 'no-price-data';
    reason = 'El bloque Cardmarket no contiene trend ni trend-holo.';
  } else if (isAbsent(expectedValue)) {
    if (isValidPrice(alternateValue)) {
      status = 'alternate-only-unconfirmed';
      reason = `El campo esperado ${expectedField} está ausente; ${alternateField} tiene valor, sin equivalencia confirmada.`;
    } else {
      status = 'expected-field-absent';
      reason = `El campo esperado ${expectedField} está ausente.`;
    }
  } else if (isZero(expectedValue)) {
    status = 'expected-price-zero';
    reason = `El campo esperado ${expectedField} es cero; no se selecciona ningún campo alternativo.`;
  } else if (!isValidPrice(expectedValue)) {
    status = 'expected-price-invalid';
    reason = `El campo esperado ${expectedField} no es un número finito mayor que cero.`;
  } else {
    selectedField = expectedField;
    selectedPrice = expectedValue;
    if (discrepancy) {
      status = 'valid-with-discrepancy';
      reason = 'El precio sigue la correspondencia configurada; trend y trend-holo discrepan y requieren auditoría.';
    } else {
      status = 'valid';
      reason = 'Precio válido según una correspondencia configurada para esta expansión, carta y variante.';
    }
  }

  return {
    variant,
    expectedField,
    selectedField,
    selectedPrice,
    trend: pricing?.trend ?? null,
    trendHolo: pricing?.['trend-holo'] ?? null,
    status,
    reason,
    discrepancy,
  };
}

export function analyzeCard(card, setId, setLanguage, mapping = {}, validatedProductId = undefined) {
  if (!card || typeof card !== 'object' || !card.id) {
    return {
      setId,
      cardId: card?.id ?? null,
      name: card?.name ?? null,
      collectionNumber: card?.localId ?? null,
      rarity: card?.rarity ?? null,
      language: card?.language ?? setLanguage ?? null,
      variants: card?.variants ?? null,
      cardmarket: card?.pricing?.cardmarket ?? null,
      trend: card?.pricing?.cardmarket?.trend ?? null,
      trendHolo: card?.pricing?.cardmarket?.['trend-holo'] ?? null,
      expectedField: null,
      selectedField: null,
      selectedPrice: null,
      status: 'incomplete-data',
      reason: 'La respuesta de TCGdex no incluye un ID de carta válido.',
      updatedAt: card?.pricing?.cardmarket?.updated ?? null,
      currency: card?.pricing?.cardmarket?.unit ?? null,
      unit: card?.pricing?.cardmarket?.unit ?? null,
      variantAssessments: [],
    };
  }

  const variants = card.variants ?? null;
  const keys = variantKeys(variants);
  const productId = card.pricing?.cardmarket?.idProduct;
  const productMatches = validatedProductId !== undefined && productId === validatedProductId;
  const variantAssessments = keys.map(variant => {
    const result = inspectVariant(card, variant, mapping[card.id]);
    if (!productMatches && result.selectedPrice !== null) {
      result.selectedField = null;
      result.selectedPrice = null;
      result.status = 'pending-review';
      result.reason = 'El identificador de producto de Cardmarket no coincide con el producto validado.';
    }
    return result;
  });
  if (!variantAssessments.length) {
    variantAssessments.push({
      variant: null,
      expectedField: null,
      selectedField: null,
      selectedPrice: null,
      trend: card.pricing?.cardmarket?.trend ?? null,
      trendHolo: card.pricing?.cardmarket?.['trend-holo'] ?? null,
      status: 'incomplete-data',
      reason: 'TCGdex no proporciona indicadores de variantes activos para esta carta.',
      discrepancy: false,
    });
  }

  const statuses = new Set(variantAssessments.map(result => result.status));
  const allValid = variantAssessments.every(result => result.status === 'valid' || result.status === 'valid-with-discrepancy');
  const status = allValid
    ? (statuses.has('valid-with-discrepancy') ? 'valid-with-discrepancy' : 'valid')
    : (statuses.has('incomplete-data') ? 'incomplete-data'
      : variantAssessments.length > 1 ? 'pending-review' : variantAssessments[0].status);

  const usesFallback = allValid && variantAssessments.some(result => result.selectedField !== 'trend');
  const valuationStatus = usesFallback ? 'fallback'
    : allValid ? 'validated'
      : variantAssessments.every(result => result.status === 'no-price-data') ? 'missing' : 'needs-review';

  return {
    setId,
    cardId: card.id,
    name: card.name ?? null,
    collectionNumber: card.localId ?? null,
    rarity: card.rarity ?? null,
    language: card.language ?? setLanguage ?? null,
    variants,
    cardmarket: card.pricing?.cardmarket ?? null,
    productId: productId ?? null,
    productValidated: productMatches && validatedProductId !== undefined,
    trend: card.pricing?.cardmarket?.trend ?? null,
    trendHolo: card.pricing?.cardmarket?.['trend-holo'] ?? null,
    expectedField: variantAssessments.length === 1 ? variantAssessments[0].expectedField : null,
    selectedField: variantAssessments.length === 1 ? variantAssessments[0].selectedField : null,
    selectedPrice: variantAssessments.length === 1 ? variantAssessments[0].selectedPrice : null,
    status,
    valuationStatus,
    reason: variantAssessments.map(result => `${result.variant ?? 'variante'}: ${result.reason}`).join(' '),
    updatedAt: card.pricing?.cardmarket?.updated ?? null,
    currency: card.pricing?.cardmarket?.unit ?? null,
    unit: card.pricing?.cardmarket?.unit ?? null,
    variantAssessments,
  };
}

/** Reclassifies a stored snapshot row while keeping its original Cardmarket payload. */
export function normalizeStoredPrice(card, mapping = {}, validatedProductId = undefined) {
  const cardmarket = card.cardmarket;
  const activeVariants = card.variantAssessments?.length
    ? card.variantAssessments.map(assessment => assessment.variant).filter(Boolean)
    : variantKeys(card.variants);
  const productId = card.productId ?? cardmarket?.idProduct ?? null;
  const productValidated = validatedProductId !== undefined && productId === validatedProductId;
  const mappedTrend = activeVariants.length > 0 && activeVariants.every(variant => mapping[card.cardId]?.[variant] === 'trend');
  const validated = productValidated && mappedTrend && isValidPrice(cardmarket?.trend);
  const hasPriceData = PRICE_METRICS.some(field => !isAbsent(cardmarket?.[field]));
  const valuationStatus = validated ? 'validated' : hasPriceData ? 'needs-review' : 'missing';
  const assessments = activeVariants.map(variant => ({
    variant,
    expectedField: mapping[card.cardId]?.[variant] ?? null,
    selectedField: validated ? 'trend' : null,
    selectedPrice: validated ? cardmarket.trend : null,
    trend: cardmarket?.trend ?? null,
    trendHolo: cardmarket?.['trend-holo'] ?? null,
    status: validated ? 'valid' : hasPriceData ? 'pending-review' : 'no-price-data',
    reason: validated ? 'Precio trend conservado de un producto validado.' : hasPriceData ? 'El precio guardado no cumple la validación actual.' : 'No hay datos de precio utilizables.',
    discrepancy: false,
  }));
  const expectedField = assessments.length === 1 ? assessments[0].expectedField : null;
  const selectedField = validated && assessments.length === 1 ? 'trend' : null;
  const selectedPrice = validated && assessments.length === 1 ? cardmarket.trend : null;
  const status = validated ? 'valid' : hasPriceData ? 'pending-review' : 'no-price-data';
  return {
    ...card,
    productId,
    productValidated,
    expectedField,
    selectedField,
    selectedPrice,
    status,
    valuationStatus,
    reason: validated ? 'Producto validado; se usa el campo principal trend.' : hasPriceData ? 'Los datos de precio no cumplen todos los criterios de validación.' : 'No hay datos de precio utilizables.',
    variantAssessments: assessments,
  };
}

const combinationOf = variants => {
  const keys = variantKeys(variants);
  return keys.length ? keys.sort().join('+') : 'sin-indicadores';
};

export function summarizeSet(cards) {
  const summary = {
    totalCards: cards.length,
    validPrices: 0,
    pendingReview: 0,
    zeroPriceCards: 0,
    zeroTrendHoloCards: 0,
    cardsWithoutPriceData: 0,
    discrepancies: 0,
    cardsWithoutProductId: 0,
    invalidTrendCards: 0,
    valuationStates: {},
    variantCombinations: {},
    validationStates: {},
    variantStates: {},
  };

  for (const card of cards) {
    summary.variantCombinations[combinationOf(card.variants)] = (summary.variantCombinations[combinationOf(card.variants)] ?? 0) + 1;
    summary.validationStates[card.status] = (summary.validationStates[card.status] ?? 0) + 1;
    summary.valuationStates[card.valuationStatus ?? 'needs-review'] = (summary.valuationStates[card.valuationStatus ?? 'needs-review'] ?? 0) + 1;
    if (!Number.isInteger(card.cardmarket?.idProduct) || card.cardmarket.idProduct <= 0) summary.cardsWithoutProductId++;
    if (hasValue(card.cardmarket?.trend) && !isValidPrice(card.cardmarket.trend)) summary.invalidTrendCards++;
    if (card.status === 'valid' || card.status === 'valid-with-discrepancy') summary.validPrices++;
    if (card.status !== 'valid' && card.status !== 'valid-with-discrepancy') summary.pendingReview++;
    if (card.variantAssessments.some(result => isZero(result.expectedField === 'trend-holo' ? result.trendHolo : result.trend))) summary.zeroPriceCards++;
    if (card.variantAssessments.some(result => isZero(result.trendHolo))) summary.zeroTrendHoloCards++;
    if (card.variantAssessments.length > 0 && card.variantAssessments.every(result => result.status === 'no-price-data')) summary.cardsWithoutPriceData++;
    if (card.variantAssessments.some(result => result.discrepancy)) summary.discrepancies++;
    for (const result of card.variantAssessments) {
      summary.variantStates[result.status] = (summary.variantStates[result.status] ?? 0) + 1;
    }
  }

  summary.note = 'La valoración utiliza el campo esperado y una correspondencia validada. Los ceros de métricas secundarias como trend-holo no invalidan trend.';
  return summary;
}
