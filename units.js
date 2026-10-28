// Unidades universales. Las de conteo (und, tajada, rebanada) no se convierten
// entre sí: para eso cada insumo tiene su propio mapa `conversions`.
export const UNITS = [
  { code: 'g', name: 'gramo', dimension: 'masa', factor: 1 },
  { code: 'kg', name: 'kilo', dimension: 'masa', factor: 1000 },
  { code: 'lb', name: 'libra', dimension: 'masa', factor: 453.592 },
  { code: 'ml', name: 'mililitro', dimension: 'volumen', factor: 1 },
  { code: 'l', name: 'litro', dimension: 'volumen', factor: 1000 },
  { code: 'cm', name: 'centímetro', dimension: 'longitud', factor: 1 },
  { code: 'm', name: 'metro', dimension: 'longitud', factor: 100 },
  { code: 'und', name: 'unidad', dimension: 'conteo:und', factor: 1 },
  { code: 'tajada', name: 'tajada', dimension: 'conteo:tajada', factor: 1 },
  { code: 'rebanada', name: 'rebanada', dimension: 'conteo:rebanada', factor: 1 },
  { code: 'paquete', name: 'paquete', dimension: 'conteo:paquete', factor: 1 },
  { code: 'rollo', name: 'rollo', dimension: 'conteo:rollo', factor: 1 }
];

export const UNIT_BY_CODE = Object.fromEntries(UNITS.map(u => [u.code, u]));

/**
 * Convierte `qty` en `unitCode` a la unidad base del insumo.
 * Orden: conversión propia del insumo → conversión universal de la misma dimensión.
 * Devuelve null si no hay forma de convertir.
 */
export function toBase(qty, unitCode, ingredient) {
  const q = Number(qty);
  if (!Number.isFinite(q)) return null;
  const base = ingredient.baseUnit;
  if (unitCode === base) return q;
  const own = ingredient.conversions && ingredient.conversions[unitCode];
  if (own != null && Number(own) > 0) return q * Number(own);
  const from = UNIT_BY_CODE[unitCode];
  const to = UNIT_BY_CODE[base];
  if (from && to && from.dimension === to.dimension) return (q * from.factor) / to.factor;
  return null;
}

/** Inverso de toBase: cuántas `unitCode` son `qtyBase`. */
export function fromBase(qtyBase, unitCode, ingredient) {
  const one = toBase(1, unitCode, ingredient);
  if (!one) return null;
  return qtyBase / one;
}

/** Redondea hacia arriba al múltiplo de `step` (ej. 0.5 kg, 1 paquete). */
export function ceilToStep(value, step = 1) {
  if (value <= 0) return 0;
  const s = step > 0 ? step : 1;
  return Math.ceil(value / s - 1e-9) * s;
}

export function round(n, d = 2) {
  const p = 10 ** d;
  return Math.round((Number(n) + Number.EPSILON) * p) / p;
}
