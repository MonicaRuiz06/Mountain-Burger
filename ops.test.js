// Flujo completo contra el backend de memoria: compra → producción → despacho → cobro → cuadre → merma → liquidación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryBackend } from './memoryAdapter.js';
import { seedOps } from './seed.js';
import * as ops from './ops.js';
import { stockKey } from './recipe.js';

let n = 0;
const nid = () => 'id' + (++n);

function snapshot(be) {
  const cols = ['ingredients', 'products', 'recipes', 'supplier_ingredient_variants', 'clients_channels', 'custom_prices', 'funds', 'commission_rates', 'stock', 'finished_stock', 'finished_lots', 'settings', 'productions', 'dispatches', 'fund_balances', 'waste_logs', 'payroll_settlements'];
  const out = {};
  return Promise.all(cols.map(c => new Promise(r => { const un = be.subscribe(c, {}, d => { out[c] = d; queueMicrotask(() => un()); r(); }); }))).then(() => out);
}

async function ctxOf(be, now = '2026-10-26T10:00:00.000Z', uid = 'admin') {
  const s = await snapshot(be);
  const cat = {
    ingredientsById: Object.fromEntries(s.ingredients.map(i => [i.id, i])),
    products: s.products, recipes: s.recipes, variants: s.supplier_ingredient_variants, channels: s.clients_channels,
    prices: s.custom_prices, funds: s.funds, rates: s.commission_rates,
    lots: s.finished_lots.filter(l => l.remaining > 0),
    stockMap: Object.fromEntries(s.stock.map(x => [x.id, x.qtyBase])),
    settings: s.settings.find(x => x.id === 'app')
  };
  return { ctx: { uid, deviceId: 'test', now, newId: nid, cat }, s };
}

test('flujo de un día completo', async () => {
  const be = createMemoryBackend();
  await be.commit(seedOps({ now: '2026-10-25T08:00:00.000Z', uid: 'admin', newId: nid }));
  // Configuración que hace la administración desde la app
  await be.commit([
    { type: 'set', col: 'supplier_ingredient_variants', id: 'abuela-sal', merge: true, data: { qtyPerBaseOfTrigger: 0.01 } },
    { type: 'set', col: 'funds', id: 'resurtido', merge: true, data: { pct: 40 } },
    { type: 'set', col: 'funds', id: 'nomina', merge: true, data: { pct: 20 } },
    { type: 'set', col: 'funds', id: 'operativos', merge: true, data: { pct: 15 } },
    { type: 'set', col: 'funds', id: 'utilidad', merge: true, data: { pct: 25 } }
  ]);

  let { ctx } = await ctxOf(be, '2026-10-26T07:00:00.000Z', 'papa');
  const buy = ops.registerPurchase({ supplierId: 'carniceria-abuela', items: [
    { ingredientId: 'carne-molida', qty: 2, unitCode: 'kg', lineTotal: 44000 },
    { ingredientId: 'pan', qty: 40, unitCode: 'und', lineTotal: 24000 },
    { ingredientId: 'sal', qty: 500, unitCode: 'g', lineTotal: 2000 }
  ] }, ctx);
  await be.commit(buy.ops);

  ({ ctx } = await ctxOf(be, '2026-10-26T09:00:00.000Z', 'novio'));
  const prod = ops.registerProduction({ productId: 'mountain-burger', qty: 30, meatSupplierId: 'carniceria-abuela', cookId: 'novio' }, ctx);
  await be.commit(prod.ops);
  let { s } = await ctxOf(be);
  const stock = Object.fromEntries(s.stock.map(x => [x.id, x.qtyBase]));
  assert.equal(stock[stockKey('carne-molida', 'carniceria-abuela')], 2000 - 1800);
  assert.equal(stock.pan, 10);
  assert.equal(stock.sal, 500 - 18);
  assert.equal(s.finished_stock.find(f => f.id === 'mountain-burger').qty, 30);
  assert.equal(prod.commission, 30000);

  ({ ctx } = await ctxOf(be, '2026-10-26T11:00:00.000Z', 'papa'));
  const d1 = ops.registerDispatch({ channelId: 'alorica', items: [{ productId: 'mountain-burger', qty: 20 }] }, ctx);
  await be.commit(d1.ops);
  ({ ctx } = await ctxOf(be, '2026-10-26T11:10:00.000Z', 'papa'));
  const d2 = ops.registerDispatch({ channelId: 'don-santiago', items: [{ productId: 'mountain-burger', qty: 8 }] }, ctx);
  await be.commit(d2.ops);
  assert.equal(d2.total, 64000); // precio de ejemplo: 8.000
  ({ ctx } = await ctxOf(be, '2026-10-26T11:20:00.000Z', 'papa'));
  assert.throws(() => ops.registerDispatch({ channelId: 'parque', items: [{ productId: 'mountain-burger', qty: 5 }] }, ctx), /Solo hay 2/);

  ({ ctx, s } = await ctxOf(be, '2026-10-26T12:00:00.000Z', 'papa'));
  const pay = ops.registerPayment({ channelId: 'don-santiago', amount: 64000, method: 'transferencia', dispatchIds: [d2.id] }, ctx, { costOfGoods: 8 * 2500, commission: 8000, costsKnown: true });
  await be.commit(pay.ops);
  assert.equal(pay.alloc.reduce((a, x) => a + x.amount, 0), 64000);

  ({ ctx, s } = await ctxOf(be, '2026-10-26T18:00:00.000Z', 'papa'));
  const alorica = s.dispatches.filter(d => d.channelId === 'alorica' && !d.paid);
  const pos = ops.closePosSession({ channelId: 'alorica', dispatches: alorica, unitsReturned: 2, receivedAmount: 160000, unitPrice: 10000 }, ctx, { costsKnown: false });
  await be.commit(pos.ops);
  assert.equal(pos.rec.missingUnits, 2);

  ({ ctx, s } = await ctxOf(be, '2026-10-26T18:30:00.000Z', 'novio'));
  assert.equal(s.finished_stock.find(f => f.id === 'mountain-burger').qty, 4); // 2 quedaron + 2 devueltas
  assert.throws(() => ops.registerWaste({ itemKind: 'producto', productId: 'mountain-burger', qty: 1, reason: 'danado', note: 'mal' }, ctx), /nota/);
  const w = ops.registerWaste({ itemKind: 'producto', productId: 'mountain-burger', qty: 1, reason: 'danado', note: 'Se cayó al empacar' }, ctx);
  await be.commit(w.ops);

  ({ ctx, s } = await ctxOf(be, '2026-10-26T19:00:00.000Z', 'papa'));
  const open = s.productions.filter(p => p.cookId === 'novio' && !p.settled);
  const pay2 = ops.settlePayroll({ userId: 'novio', productions: open }, ctx);
  await be.commit(pay2.ops);
  ({ s } = await ctxOf(be));
  assert.equal(pay2.amount, 30000);
  assert.equal(s.productions.filter(p => !p.settled).length, 0);
  assert.equal(s.waste_logs.length, 2); // faltante del bote + dañada
  const bal = Object.fromEntries(s.fund_balances.map(b => [b.fundCode, b.balance]));
  // Resurtido: −compra + costo real de Don Santiago + 40 % del cuadre (sin costos → modo fijo)
  assert.equal(bal.resurtido, -70000 + 20000 + 64000);
  // Nómina: comisión de Don Santiago + 20 % del cuadre − liquidación
  assert.equal(bal.nomina, 8000 + 32000 - 30000);
  assert.equal(bal.operativos, 13500 + 24000);
  assert.equal(bal.utilidad, 22500 + 40000);
});
