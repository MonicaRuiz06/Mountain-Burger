import { explodeRecipe } from './recipe.js';
import { fromBase, ceilToStep, round } from './units.js';

/**
 * Calculadora de faltantes (RF-08).
 * planned: hamburguesas de la comanda; finishedOnHand: armadas en nevera.
 * stock: { ingredientId: qtyBase }.
 * Devuelve { toProduce, lines: [...], errors }.
 */
export function shoppingList({ planned, finishedOnHand = 0, recipe, ingredientsById, variants, meatSupplierId, stock, includeMinStock = true }) {
  const res = shoppingListMulti({ plans: [{ planned, finishedOnHand, recipe, meatSupplierId }], ingredientsById, variants, stock, includeMinStock });
  return { toProduce: res.plans[0].toProduce, lines: res.lines, errors: res.errors };
}

/**
 * Lista de compras para varios productos a la vez (ej. Mountain Burger + Mountain Chicken).
 * Suma lo que necesita cada uno y lo compara una sola vez contra el stock,
 * para no contar dos veces el pan, la bolsita o la cinta que comparten.
 * plans: [{ productId, planned, finishedOnHand, recipe, meatSupplierId }]
 */
export function shoppingListMulti({ plans, ingredientsById, variants, stock, includeMinStock = true }) {
  const byIng = {};
  const errors = [];
  const outPlans = plans.map(pl => {
    const toProduce = Math.max(0, Math.ceil(Number(pl.planned || 0) - Number(pl.finishedOnHand || 0)));
    if (toProduce > 0) {
      const r = explodeRecipe(pl.recipe, toProduce, { ingredientsById, variants, meatSupplierId: pl.meatSupplierId });
      errors.push(...r.errors);
      for (const l of r.lines) byIng[l.ingredientId] = (byIng[l.ingredientId] || 0) + l.qtyBase;
    }
    return { productId: pl.productId, toProduce };
  });
  return { plans: outPlans, errors: [...new Set(errors)], lines: linesFor(byIng, ingredientsById, stock, includeMinStock) };
}

function linesFor(byIng, ingredientsById, stock, includeMinStock) {

  const lines = Object.entries(byIng).map(([ingredientId, needBase]) => {
    const ing = ingredientsById[ingredientId];
    const onHand = Number(stock[ingredientId] || 0);
    const minBase = includeMinStock ? Number(ing.minStock || 0) : 0;
    const shortBase = Math.max(0, needBase + minBase - onHand);
    const unit = ing.purchaseUnit || ing.baseUnit;
    const inPurchase = shortBase > 0 ? fromBase(shortBase, unit, ing) : 0;
    const buyQty = inPurchase == null ? null : ceilToStep(inPurchase, Number(ing.purchaseStep) || 1);
    return {
      ingredientId,
      name: ing.name,
      baseUnit: ing.baseUnit,
      needBase: round(needBase, 3),
      onHand: round(onHand, 3),
      shortBase: round(shortBase, 3),
      buyQty: buyQty == null ? null : round(buyQty, 3),
      buyUnit: buyQty == null ? ing.baseUnit : unit,
      fallbackQty: buyQty == null ? round(shortBase, 3) : null
    };
  }).sort((a, b) => (b.shortBase > 0) - (a.shortBase > 0) || a.name.localeCompare(b.name));
  return lines;
}

/** Texto corto tipo "Comprar 2.5 kg de carne y 15 panes". */
export function shoppingSentence(lines) {
  const parts = lines.filter(l => l.shortBase > 0).map(l => {
    const q = l.buyQty ?? l.fallbackQty;
    return `${q} ${l.buyUnit} de ${l.name.toLowerCase()}`;
  });
  if (!parts.length) return 'No hace falta comprar nada.';
  if (parts.length === 1) return `Comprar ${parts[0]}.`;
  return `Comprar ${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}.`;
}
