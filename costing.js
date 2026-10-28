import { explodeRecipe } from './recipe.js';
import { localDay } from './dates.js';

/**
 * Costo promedio ponderado por unidad base, a partir de las líneas de compra.
 * purchases: [{purchasedAt, items:[{ingredientId, qtyBase, lineTotal}]}]
 * Usa las compras de los últimos `windowDays` días; si no hay, todas.
 */
export function averageCosts(purchases, { windowDays = 30, now = new Date() } = {}) {
  const since = new Date(now.getTime() - windowDays * 864e5).toISOString();
  const acc = (list) => {
    const t = {};
    for (const p of list) for (const it of p.items || []) {
      if (!(Number(it.qtyBase) > 0)) continue;
      const a = (t[it.ingredientId] ||= { qty: 0, cost: 0 });
      a.qty += Number(it.qtyBase); a.cost += Number(it.lineTotal) || 0;
    }
    return t;
  };
  const recent = acc(purchases.filter(p => (p.purchasedAt || '') >= since));
  const all = acc(purchases);
  const out = {};
  for (const id of Object.keys(all)) {
    const a = recent[id] || all[id];
    out[id] = a.qty > 0 ? a.cost / a.qty : 0;
  }
  return out;
}

/** Costo de unas líneas explotadas. Devuelve {total, missing:[ingredientId]}. */
export function costOfLines(lines, avgCost) {
  let total = 0; const missing = [];
  for (const l of lines) {
    const c = avgCost[l.ingredientId];
    if (c == null) { missing.push(l.ingredientId); continue; }
    total += l.qtyBase * c;
  }
  return { total, missing };
}

/** Energía por unidad: kW × horas por tanda ÷ unidades por tanda × tarifa kWh. */
export function energyCostPerUnit({ watts, minutesPerBatch, unitsPerBatch, pricePerKwh }) {
  const w = Number(watts), m = Number(minutesPerBatch), u = Number(unitsPerBatch), p = Number(pricePerKwh);
  if (!(w > 0 && m > 0 && u > 0 && p >= 0)) return null;
  return ((w / 1000) * (m / 60) / u) * p;
}

/** Vatios desde la etiqueta: si trae amperios, W = V × A. */
export function wattsFrom({ watts, volts, amps }) {
  if (Number(watts) > 0) return Number(watts);
  if (Number(volts) > 0 && Number(amps) > 0) return Number(volts) * Number(amps);
  return null;
}

/**
 * Gastos indirectos por unidad.
 * expenses: [{amount, allocation:'por_unidad'|'por_lote', periodStart, periodEnd}]
 * unitsInPeriod / batchesInPeriod / unitsPerBatch para repartir.
 */
export function overheadPerUnit(expenses, { unitsInPeriod, batchesInPeriod, unitsPerBatch }) {
  let total = 0;
  for (const e of expenses) {
    const amt = Number(e.amount) || 0;
    if (e.allocation === 'por_lote') {
      if (batchesInPeriod > 0 && unitsPerBatch > 0) total += amt / batchesInPeriod / unitsPerBatch;
    } else if (unitsInPeriod > 0) total += amt / unitsInPeriod;
  }
  return total;
}

/**
 * Costo completo de una unidad (RF-17):
 * insumos + comisión + energía + limpieza de cierre por unidad + indirectos.
 */
export function fullUnitCost({ recipe, ingredientsById, variants, meatSupplierId, avgCost, commission = 0, energy = 0, cleaningPerUnit = 0, overhead = 0 }) {
  const { lines, errors } = explodeRecipe(recipe, 1, { ingredientsById, variants, meatSupplierId });
  const { total: materials, missing } = costOfLines(lines, avgCost);
  const parts = {
    materials,
    commission: Number(commission) || 0,
    energy: Number(energy) || 0,
    cleaning: Number(cleaningPerUnit) || 0,
    overhead: Number(overhead) || 0
  };
  const total = Object.values(parts).reduce((s, v) => s + v, 0);
  return { ...parts, total, lines, missing, errors };
}

/** Margen por canal: precio − costo completo. */
export function marginByChannel(prices, channels, productId, unitCost) {
  return channels.map(ch => {
    const p = currentPrice(prices, productId, ch.id);
    return { channelId: ch.id, name: ch.name, price: p, margin: p == null ? null : p - unitCost, marginPct: p ? (p - unitCost) / p : null };
  });
}

/** Precio vigente de un producto en un canal. */
export function currentPrice(prices, productId, channelId, at = localDay()) {
  const list = prices
    .filter(p => p.productId === productId && p.channelId === channelId && (p.validFrom || '') <= at && (!p.validTo || p.validTo >= at))
    .sort((a, b) => (b.validFrom || '').localeCompare(a.validFrom || ''));
  return list.length ? Number(list[0].price) : null;
}
