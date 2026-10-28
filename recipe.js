import { toBase } from './units.js';

/** Receta activa de un producto (la versión más alta con active=true). */
export function activeRecipe(recipes, productId) {
  return recipes
    .filter(r => r.productId === productId && r.active !== false)
    .sort((a, b) => (b.version || 0) - (a.version || 0))[0] || null;
}

/**
 * Explota una receta para `n` unidades.
 * - Cada línea se convierte a unidad base y se le suma su % de merma.
 * - Los insumos que se rastrean por proveedor (la carne) quedan con `supplierId`.
 * - Las variantes del proveedor elegido agregan insumos extra proporcionales
 *   a la cantidad del insumo que las dispara (ej. La Abuela: sal, ajo, pimienta).
 * Devuelve { lines: [{ingredientId, qtyBase, supplierId}], errors: [] }.
 */
export function explodeRecipe(recipe, n, { ingredientsById, variants = [], meatSupplierId = null }) {
  const lines = [];
  const errors = [];
  if (!recipe) return { lines, errors: ['Sin receta activa'] };
  const qtyN = Number(n);
  for (const item of recipe.items || []) {
    const ing = ingredientsById[item.ingredientId];
    if (!ing) { errors.push(`Insumo no encontrado: ${item.ingredientId}`); continue; }
    const perUnit = toBase(item.qty, item.unitCode, ing);
    if (perUnit == null) { errors.push(`No se puede convertir ${item.unitCode} a ${ing.baseUnit} (${ing.name})`); continue; }
    const yieldQty = Number(recipe.yieldQty) > 0 ? Number(recipe.yieldQty) : 1;
    const qtyBase = (perUnit * qtyN / yieldQty) * (1 + (Number(item.wastePct) || 0) / 100);
    const supplierId = ing.trackBySupplier ? meatSupplierId : null;
    lines.push({ ingredientId: ing.id, qtyBase, supplierId });

    if (ing.trackBySupplier && meatSupplierId) {
      for (const v of variants) {
        if (v.supplierId !== meatSupplierId || v.triggerIngredientId !== ing.id || v.active === false) continue;
        const extra = qtyBase * (Number(v.qtyPerBaseOfTrigger) || 0);
        if (extra > 0) lines.push({ ingredientId: v.extraIngredientId, qtyBase: extra, supplierId: null, fromVariant: v.id });
      }
    }
  }
  return { lines: mergeLines(lines), errors };
}

/** Suma líneas repetidas del mismo insumo y proveedor. */
export function mergeLines(lines) {
  const map = new Map();
  for (const l of lines) {
    const key = `${l.ingredientId}__${l.supplierId || ''}`;
    const prev = map.get(key);
    if (prev) prev.qtyBase += l.qtyBase;
    else map.set(key, { ...l });
  }
  return [...map.values()];
}

/** Id del documento resumen de stock: por insumo, o por insumo+proveedor si se rastrea. */
export function stockKey(ingredientId, supplierId) {
  return supplierId ? `${ingredientId}__${supplierId}` : ingredientId;
}

/** Stock total por insumo (suma de todos los proveedores). */
export function stockByIngredient(stockDocs) {
  const out = {};
  for (const s of stockDocs) out[s.ingredientId] = (out[s.ingredientId] || 0) + (Number(s.qtyBase) || 0);
  return out;
}
