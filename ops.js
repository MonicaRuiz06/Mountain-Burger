// Cada operación del negocio se arma aquí como una lista de escrituras que se guardan
// juntas en un solo lote (todo o nada). No hay lecturas: todo lo necesario llega en `ctx`,
// que la app toma de su caché local. Por eso funciona igual sin señal.
import { toBase, round } from './units.js';
import { activeRecipe, explodeRecipe, stockKey } from './recipe.js';
import { allocatePayment } from './funds.js';
import { currentPrice } from './costing.js';
import { commissionRateFor, pickFifo, reconcilePos, validWasteNote } from './production.js';
import { localDay } from './dates.js';

export class OpError extends Error {}

const meta = ctx => ({ createdAt: ctx.now, createdBy: ctx.uid, deviceId: ctx.deviceId });
const fundByCode = (ctx, code) => (ctx.cat.funds || []).find(f => f.code === code);

function cash(ctx, fundCode, amount, type, sourceCol, sourceId, description) {
  const fund = fundByCode(ctx, fundCode);
  if (!fund || !amount) return [];
  const id = ctx.newId();
  return [
    { type: 'set', col: 'cash_movements', id, data: { fundId: fund.id, fundCode, amount, type, sourceCol, sourceId, description, occurredAt: ctx.now, ...meta(ctx) } },
    { type: 'inc', col: 'fund_balances', id: fund.id, base: { fundId: fund.id, fundCode }, fields: { balance: amount } }
  ];
}

function movement(ctx, { ingredientId, supplierId = null, qtyBase, type, refCol, refId, unitCost = null }) {
  const id = ctx.newId();
  return [
    { type: 'set', col: 'inventory_movements', id, data: { ingredientId, supplierId, qtyBase: round(qtyBase, 4), type, refCol, refId, unitCost, ...meta(ctx) } },
    { type: 'inc', col: 'stock', id: stockKey(ingredientId, supplierId), base: { ingredientId, supplierId }, fields: { qtyBase: round(qtyBase, 4) } }
  ];
}

/* ---------- Compras (RF-09) ---------- */
export function registerPurchase({ supplierId, items, notes = '' }, ctx) {
  if (!items.length) throw new OpError('Agrega al menos un insumo');
  const id = ctx.newId();
  const ops = [];
  const lines = [];
  let total = 0;
  for (const it of items) {
    const ing = ctx.cat.ingredientsById[it.ingredientId];
    if (!ing) throw new OpError('Insumo no encontrado');
    const qty = Number(it.qty), lineTotal = Math.round(Number(it.lineTotal) || 0), counted = Number(it.unitsCounted) || 0;
    let qtyBase;
    if (counted > 0 && ing.countUnit) {
      // Conteo físico: ej. 1 kg de tomate = 7 tomates → 7 × (rebanadas por tomate)
      qtyBase = toBase(counted, ing.countUnit, ing);
      if (qtyBase == null) throw new OpError(`Configura cuántas ${ing.baseUnit} da 1 ${ing.countUnit} de ${ing.name}`);
      if (qty > 0 && it.unitCode !== ing.baseUnit && it.unitCode !== ing.countUnit) {
        // Aprende la conversión real de esta compra (fuente: conteo_compra)
        ops.push({ type: 'set', col: 'ingredients', id: ing.id, merge: true, data: { conversions: { [it.unitCode]: round(qtyBase / qty, 4) }, conversionSource: { [it.unitCode]: 'conteo_compra' } } });
      }
    } else {
      qtyBase = toBase(qty, it.unitCode, ing);
      if (qtyBase == null) throw new OpError(`No sé convertir ${it.unitCode} a ${ing.baseUnit} para ${ing.name}`);
    }
    if (!(qtyBase > 0)) throw new OpError(`Cantidad inválida para ${ing.name}`);
    total += lineTotal;
    const sup = ing.trackBySupplier ? supplierId : null;
    lines.push({ ingredientId: ing.id, qty, unitCode: it.unitCode, unitsCounted: counted || null, qtyBase: round(qtyBase, 4), lineTotal });
    ops.push(...movement(ctx, { ingredientId: ing.id, supplierId: sup, qtyBase, type: 'compra', refCol: 'purchases', refId: id, unitCost: lineTotal / qtyBase }));
  }
  ops.unshift({ type: 'set', col: 'purchases', id, data: { supplierId: supplierId || null, purchasedAt: ctx.now, items: lines, total, notes, ...meta(ctx) } });
  ops.push(...cash(ctx, 'resurtido', -total, 'egreso', 'purchases', id, 'Compra de insumos'));
  return { id, ops, total };
}

/* ---------- Producción (RF-11, RF-13) y cierre de jornada ---------- */
export function registerProduction({ productId, qty, meatSupplierId = null, destination = 'nevera', cookId }, ctx) {
  const n = Number(qty);
  if (!(n > 0)) throw new OpError('La cantidad debe ser mayor que cero');
  const product = (ctx.cat.products || []).find(p => p.id === productId);
  if (!product) throw new OpError('Producto no encontrado');
  const recipe = activeRecipe(ctx.cat.recipes || [], productId);
  if (!recipe) throw new OpError(`${product.name} no tiene receta activa`);
  const needsMeat = (recipe.items || []).some(i => ctx.cat.ingredientsById[i.ingredientId]?.trackBySupplier);
  if (needsMeat && !meatSupplierId) throw new OpError('Elige de qué carnicería es la carne');
  const { lines, errors } = explodeRecipe(recipe, n, { ingredientsById: ctx.cat.ingredientsById, variants: ctx.cat.variants || [], meatSupplierId });
  if (errors.length) throw new OpError(errors.join('. '));

  const id = ctx.newId();
  const isCierre = product.kind === 'proceso_interno';
  const shelf = Number(ctx.cat.settings?.shelfLifeDays) || 3;
  const expiresAt = new Date(new Date(ctx.now).getTime() + shelf * 864e5).toISOString();
  const rate = isCierre ? 0 : commissionRateFor(ctx.cat.rates || [], cookId, Number(ctx.cat.settings?.defaultCommission) || 1000, ctx.now);
  const warnings = [];
  const ops = [{
    type: 'set', col: 'productions', id, data: {
      kind: isCierre ? 'cierre' : 'produccion', productId, recipeId: recipe.id, recipeVersion: recipe.version || 1,
      meatSupplierId, qty: n, cookId: cookId || ctx.uid, destination, producedAt: ctx.now, day: localDay(ctx.now),
      expiresAt: isCierre ? null : expiresAt, lines: lines.map(l => ({ ...l, qtyBase: round(l.qtyBase, 4) })),
      commissionSnapshot: rate, settlementId: null, settled: isCierre, ...meta(ctx)
    }
  }];
  for (const l of lines) {
    ops.push(...movement(ctx, { ingredientId: l.ingredientId, supplierId: l.supplierId, qtyBase: -l.qtyBase, type: 'produccion', refCol: 'productions', refId: id }));
    const have = ctx.cat.stockMap?.[stockKey(l.ingredientId, l.supplierId)];
    if (have != null && have - l.qtyBase < 0) warnings.push(`${ctx.cat.ingredientsById[l.ingredientId]?.name}: el stock queda negativo, revisa el conteo`);
  }
  if (!isCierre) {
    const loc = destination === 'despacho_inmediato' ? 'en_ruta' : 'nevera';
    ops.push(
      { type: 'set', col: 'finished_goods_movements', id: ctx.newId(), data: { productId, lotId: id, qty: n, type: 'produccion', location: loc, refCol: 'productions', refId: id, ...meta(ctx) } },
      { type: 'inc', col: 'finished_stock', id: productId, base: { productId }, fields: { qty: n } },
      { type: 'inc', col: 'finished_lots', id, base: { productId, producedAt: ctx.now, expiresAt, location: loc, produced: n }, fields: { remaining: n } }
    );
  }
  return { id, ops, warnings, commission: rate * n };
}

/* ---------- Despacho (RF-10) ---------- */
export function registerDispatch({ channelId, items, notes = '' }, ctx) {
  const channel = (ctx.cat.channels || []).find(c => c.id === channelId);
  if (!channel) throw new OpError('Elige el canal');
  const id = ctx.newId();
  const ops = [];
  const lines = [];
  let total = 0;
  const lots = (ctx.cat.lots || []).map(l => ({ ...l }));
  for (const it of items) {
    const qty = Number(it.qty);
    if (!(qty > 0)) continue;
    const { picks, missing } = pickFifo(lots, it.productId, qty);
    if (missing > 0) throw new OpError(`Solo hay ${qty - missing} en nevera`);
    const price = currentPrice(ctx.cat.prices || [], it.productId, channelId, localDay(ctx.now));
    for (const p of picks) {
      const lot = lots.find(l => l.id === p.lotId); lot.remaining -= p.qty;
      ops.push(
        { type: 'set', col: 'finished_goods_movements', id: ctx.newId(), data: { productId: it.productId, lotId: p.lotId, qty: -p.qty, type: 'despacho', location: 'nevera', refCol: 'dispatches', refId: id, ...meta(ctx) } },
        { type: 'inc', col: 'finished_lots', id: p.lotId, fields: { remaining: -p.qty } }
      );
    }
    ops.push({ type: 'inc', col: 'finished_stock', id: it.productId, base: { productId: it.productId }, fields: { qty: -qty } });
    lines.push({ productId: it.productId, qty, unitPrice: price, picks });
    total += (price || 0) * qty;
  }
  if (!lines.length) throw new OpError('Indica cuántas despachas');
  ops.unshift({ type: 'set', col: 'dispatches', id, data: { channelId, channelType: channel.type, dispatchedAt: ctx.now, day: localDay(ctx.now), items: lines, total, status: 'entregado', paid: false, notes, ...meta(ctx) } });
  return { id, ops, total, missingPrice: lines.some(l => l.unitPrice == null) };
}

/* ---------- Pagos y reparto en fondos (RF-05) ---------- */
export function registerPayment({ channelId, amount, method = 'nequi', reference = '', dispatchIds = [] }, ctx, { costOfGoods = 0, commission = 0, costsKnown = false } = {}) {
  const total = Math.round(Number(amount) || 0);
  if (!(total > 0)) throw new OpError('El monto debe ser mayor que cero');
  const funds = ctx.cat.funds || [];
  if (!funds.length) throw new OpError('Configura los fondos primero');
  const configured = ctx.cat.settings?.fundMode || 'costo_real';
  const mode = configured === 'costo_real' && !costsKnown ? 'fijo' : configured;
  const id = ctx.newId();
  const alloc = allocatePayment(total, funds, mode, { costOfGoods, commission });
  const ops = [{ type: 'set', col: 'payments', id, data: { channelId, amount: total, method, reference, dispatchIds, receivedAt: ctx.now, day: localDay(ctx.now), allocationMode: mode, allocation: alloc, ...meta(ctx) } }];
  for (const a of alloc) if (a.amount) ops.push(...cash(ctx, a.code, a.amount, 'ingreso', 'payments', id, 'Pago recibido'));
  for (const d of dispatchIds) ops.push({ type: 'update', col: 'dispatches', id: d, data: { paid: true, status: 'pagado', paymentId: id } });
  return { id, ops, alloc, mode };
}

/* ---------- Cuadre del bote de confianza (Alórica) ---------- */
export function closePosSession({ channelId, dispatches, unitsReturned = 0, receivedAmount, unitPrice, notes = '' }, ctx, costInfo) {
  const unitsPlaced = dispatches.reduce((s, d) => s + d.items.reduce((a, i) => a + i.qty, 0), 0);
  if (!unitsPlaced) throw new OpError('No hay despachos abiertos para cuadrar');
  const rec = reconcilePos({ unitsPlaced, unitsReturned, unitPrice, receivedAmount });
  const id = ctx.newId();
  const ops = [{ type: 'set', col: 'pos_sessions', id, data: { channelId, day: localDay(ctx.now), unitsPlaced, unitsReturned: Number(unitsReturned) || 0, unitPrice, expectedAmount: rec.expected, receivedAmount: rec.received, difference: rec.difference, missingUnits: rec.missingUnits, dispatchIds: dispatches.map(d => d.id), notes, ...meta(ctx) } }];

  // Las que volvieron sin vender regresan a sus lotes (de la última despachada hacia atrás).
  let back = Number(unitsReturned) || 0;
  const productId = dispatches[0]?.items[0]?.productId;
  const picks = dispatches.flatMap(d => d.items.flatMap(i => i.picks || [])).reverse();
  for (const p of picks) {
    if (back <= 0) break;
    const q = Math.min(back, p.qty); back -= q;
    ops.push(
      { type: 'set', col: 'finished_goods_movements', id: ctx.newId(), data: { productId, lotId: p.lotId, qty: q, type: 'devolucion', location: 'nevera', refCol: 'pos_sessions', refId: id, ...meta(ctx) } },
      { type: 'inc', col: 'finished_lots', id: p.lotId, fields: { remaining: q } }
    );
  }
  if (unitsReturned > 0) ops.push({ type: 'inc', col: 'finished_stock', id: productId, base: { productId }, fields: { qty: Number(unitsReturned) } });

  if (rec.missingUnits > 0) {
    ops.push({ type: 'set', col: 'waste_logs', id: ctx.newId(), data: { itemKind: 'producto', productId, qty: rec.missingUnits, reason: 'faltante_confianza', note: `Cuadre del bote: se esperaban ${rec.expected} y llegaron ${rec.received} por Nequi.`, valueLost: rec.difference, refCol: 'pos_sessions', refId: id, loggedAt: ctx.now, day: localDay(ctx.now), ...meta(ctx) } });
  }
  let payment = null;
  if (rec.received > 0) {
    payment = registerPayment({ channelId, amount: rec.received, method: 'nequi', reference: `Cuadre ${localDay(ctx.now)}` }, ctx, costInfo);
    ops.push(...payment.ops);
  }
  for (const d of dispatches) ops.push({ type: 'update', col: 'dispatches', id: d.id, data: { paid: true, status: 'cuadrado', posSessionId: id } });
  return { id, ops, rec };
}

/* ---------- Mermas (RF-04, RNF-04) ---------- */
export function registerWaste({ itemKind, ingredientId, supplierId = null, productId, qty, unitCode, reason, note }, ctx) {
  if (!validWasteNote(note)) throw new OpError('La nota es obligatoria (mínimo 10 caracteres)');
  const id = ctx.newId();
  const ops = [];
  const data = { itemKind, reason, note: note.trim(), loggedAt: ctx.now, day: localDay(ctx.now), ...meta(ctx) };
  if (itemKind === 'insumo') {
    const ing = ctx.cat.ingredientsById[ingredientId];
    if (!ing) throw new OpError('Elige el insumo');
    const qtyBase = toBase(qty, unitCode || ing.baseUnit, ing);
    if (!(qtyBase > 0)) throw new OpError('Cantidad inválida');
    const sup = ing.trackBySupplier ? supplierId : null;
    if (ing.trackBySupplier && !sup) throw new OpError('Elige de qué carnicería es');
    ops.push({ type: 'set', col: 'waste_logs', id, data: { ...data, ingredientId, supplierId: sup, qty: Number(qty), unitCode: unitCode || ing.baseUnit, qtyBase: round(qtyBase, 4) } });
    ops.push(...movement(ctx, { ingredientId, supplierId: sup, qtyBase: -qtyBase, type: 'merma', refCol: 'waste_logs', refId: id }));
  } else {
    const n = Number(qty);
    if (!(n > 0)) throw new OpError('Cantidad inválida');
    const { picks, missing } = pickFifo(ctx.cat.lots || [], productId, n);
    if (missing > 0) throw new OpError(`Solo hay ${n - missing} en nevera`);
    ops.push({ type: 'set', col: 'waste_logs', id, data: { ...data, productId, qty: n, picks } });
    for (const p of picks) ops.push(
      { type: 'set', col: 'finished_goods_movements', id: ctx.newId(), data: { productId, lotId: p.lotId, qty: -p.qty, type: 'merma', location: 'nevera', refCol: 'waste_logs', refId: id, ...meta(ctx) } },
      { type: 'inc', col: 'finished_lots', id: p.lotId, fields: { remaining: -p.qty } }
    );
    ops.push({ type: 'inc', col: 'finished_stock', id: productId, base: { productId }, fields: { qty: -n } });
  }
  return { id, ops };
}

/* ---------- Conteo físico ---------- */
export function adjustStock({ ingredientId, supplierId = null, countedBase, currentBase }, ctx) {
  const diff = Number(countedBase) - Number(currentBase || 0);
  if (!Number.isFinite(diff) || Math.abs(diff) < 1e-9) return { ops: [] };
  return { ops: movement(ctx, { ingredientId, supplierId, qtyBase: diff, type: 'ajuste_conteo', refCol: 'stock', refId: stockKey(ingredientId, supplierId) }) };
}

/* ---------- Liquidación diaria (RF-06) ---------- */
export function settlePayroll({ userId, productions, kind = 'comision', fixedAmount = 0, notes = '' }, ctx) {
  const id = ctx.newId();
  const units = productions.reduce((s, p) => s + Number(p.qty || 0), 0);
  const amount = kind === 'comision'
    ? productions.reduce((s, p) => s + Number(p.qty || 0) * Number(p.commissionSnapshot || 0), 0)
    : Math.round(Number(fixedAmount) || 0);
  if (!(amount > 0)) throw new OpError('No hay nada por liquidar');
  const days = productions.map(p => p.day || (p.producedAt || '').slice(0, 10)).sort();
  const ops = [{ type: 'set', col: 'payroll_settlements', id, data: { userId, kind, periodStart: days[0] || localDay(ctx.now), periodEnd: days.at(-1) || localDay(ctx.now), units, amount, status: 'pagado', paidAt: ctx.now, notes, productionIds: productions.map(p => p.id), ...meta(ctx) } }];
  for (const p of productions) ops.push({ type: 'update', col: 'productions', id: p.id, data: { settlementId: id, settled: true } });
  ops.push(...cash(ctx, 'nomina', -amount, 'egreso', 'payroll_settlements', id, kind === 'comision' ? 'Liquidación de comisiones' : 'Honorarios de administración'));
  return { id, ops, amount, units };
}

/* ---------- Gastos indirectos y traslados ---------- */
export function registerExpense({ concept, amount, periodStart, periodEnd, allocation = 'por_unidad', fundCode = 'operativos', notes = '' }, ctx) {
  const a = Math.round(Number(amount) || 0);
  if (!(a > 0)) throw new OpError('El monto debe ser mayor que cero');
  const id = ctx.newId();
  return { id, ops: [
    { type: 'set', col: 'overhead_expenses', id, data: { concept, amount: a, periodStart, periodEnd, allocation, notes, ...meta(ctx) } },
    ...cash(ctx, fundCode, -a, 'egreso', 'overhead_expenses', id, `Gasto: ${concept}`)
  ] };
}

export function transferFunds({ fromCode, toCode, amount, description = 'Traslado entre fondos' }, ctx) {
  const a = Math.round(Number(amount) || 0);
  if (!(a > 0) || fromCode === toCode) throw new OpError('Revisa el monto y los fondos');
  const ref = ctx.newId();
  return { ops: [...cash(ctx, fromCode, -a, 'traslado', 'transfer', ref, description), ...cash(ctx, toCode, a, 'traslado', 'transfer', ref, description)] };
}

export function registerCapital({ fundCode = 'resurtido', amount, description = 'Aporte de capital' }, ctx) {
  const a = Math.round(Number(amount) || 0);
  if (!(a > 0)) throw new OpError('El monto debe ser mayor que cero');
  return { ops: cash(ctx, fundCode, a, 'ingreso', 'capital', ctx.newId(), description) };
}

/* ---------- Catálogos ---------- */
export function saveDoc(col, id, data, ctx) {
  return { id, ops: [{ type: 'set', col, id, merge: true, data: { ...data, updatedAt: ctx.now, updatedBy: ctx.uid } }] };
}
