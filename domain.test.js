import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toBase, fromBase, ceilToStep } from './units.js';
import { explodeRecipe } from './recipe.js';
import { shoppingList, shoppingSentence } from './shopping.js';
import { allocatePayment, splitByWeights } from './funds.js';
import { averageCosts, energyCostPerUnit, wattsFrom, fullUnitCost, currentPrice, overheadPerUnit } from './costing.js';
import { openCommissions, pickFifo, lotStatus, reconcilePos, validWasteNote, commissionRateFor } from './production.js';

const ING = {
  carne: { id: 'carne', name: 'Carne molida', baseUnit: 'g', purchaseUnit: 'kg', purchaseStep: 0.5, trackBySupplier: true },
  pan: { id: 'pan', name: 'Pan', baseUnit: 'und', purchaseUnit: 'und', purchaseStep: 1 },
  tomate: { id: 'tomate', name: 'Tomate', baseUnit: 'rebanada', conversions: { und: 8 }, purchaseUnit: 'und' },
  sal: { id: 'sal', name: 'Sal', baseUnit: 'g', purchaseUnit: 'g' },
  cinta: { id: 'cinta', name: 'Cinta', baseUnit: 'cm', purchaseUnit: 'rollo', conversions: { rollo: 3000 } }
};
const RECIPE = { id: 'r1', productId: 'mb', version: 1, items: [
  { ingredientId: 'carne', qty: 60, unitCode: 'g' },
  { ingredientId: 'pan', qty: 1, unitCode: 'und' },
  { ingredientId: 'tomate', qty: 1, unitCode: 'rebanada' },
  { ingredientId: 'cinta', qty: 15, unitCode: 'cm' }
] };
const VARIANTS = [{ id: 'v1', supplierId: 'abuela', triggerIngredientId: 'carne', extraIngredientId: 'sal', qtyPerBaseOfTrigger: 0.01 }];

test('conversiones de unidades', () => {
  assert.equal(toBase(2.5, 'kg', ING.carne), 2500);
  assert.equal(toBase(1, 'lb', ING.carne), 453.592);
  assert.equal(toBase(2, 'und', ING.tomate), 16);
  assert.equal(toBase(1, 'kg', ING.pan), null);
  assert.equal(fromBase(2500, 'kg', ING.carne), 2.5);
  assert.equal(ceilToStep(2.1, 0.5), 2.5);
  assert.equal(ceilToStep(2.5, 0.5), 2.5);
});

test('explosión de receta: La Abuela descuenta sal, La Doña no', () => {
  const a = explodeRecipe(RECIPE, 10, { ingredientsById: ING, variants: VARIANTS, meatSupplierId: 'abuela' });
  const carne = a.lines.find(l => l.ingredientId === 'carne');
  assert.equal(carne.qtyBase, 600);
  assert.equal(carne.supplierId, 'abuela');
  assert.equal(a.lines.find(l => l.ingredientId === 'sal').qtyBase, 6);
  const d = explodeRecipe(RECIPE, 10, { ingredientsById: ING, variants: VARIANTS, meatSupplierId: 'dona' });
  assert.equal(d.lines.find(l => l.ingredientId === 'sal'), undefined);
  assert.deepEqual(d.errors, []);
});

test('merma porcentual en la receta', () => {
  const r = { items: [{ ingredientId: 'carne', qty: 100, unitCode: 'g', wastePct: 10 }] };
  const { lines } = explodeRecipe(r, 2, { ingredientsById: ING });
  assert.ok(Math.abs(lines[0].qtyBase - 220) < 1e-9);
});

test('calculadora de faltantes descuenta nevera y redondea a la unidad de compra', () => {
  const res = shoppingList({ planned: 50, finishedOnHand: 8, recipe: RECIPE, ingredientsById: ING, variants: VARIANTS, meatSupplierId: 'dona', stock: { carne: 300, pan: 27, tomate: 100 } });
  assert.equal(res.toProduce, 42);
  const carne = res.lines.find(l => l.ingredientId === 'carne');
  assert.equal(carne.shortBase, 42 * 60 - 300); // 2220 g
  assert.equal(carne.buyQty, 2.5);
  const pan = res.lines.find(l => l.ingredientId === 'pan');
  assert.equal(pan.buyQty, 15);
  const tomate = res.lines.find(l => l.ingredientId === 'tomate');
  assert.equal(tomate.shortBase, 0);
  const s = shoppingSentence(res.lines);
  assert.match(s, /2\.5 kg de carne molida/);
  assert.match(s, /15 und de pan/);
});

test('reparto en fondos: fijo y costo real suman exacto', () => {
  const funds = [
    { id: 'f1', code: 'resurtido', pct: 40 }, { id: 'f2', code: 'nomina', pct: 20 },
    { id: 'f3', code: 'operativos', pct: 15 }, { id: 'f4', code: 'utilidad', pct: 25 }
  ];
  const fijo = allocatePayment(10001, funds, 'fijo');
  assert.equal(fijo.reduce((s, f) => s + f.amount, 0), 10001);
  assert.equal(fijo.find(f => f.code === 'resurtido').amount, 4001); // el peso sobrante va a la fracción mayor
  const real = allocatePayment(60000, funds, 'costo_real', { costOfGoods: 30000, commission: 10000 });
  const by = Object.fromEntries(real.map(f => [f.code, f.amount]));
  assert.deepEqual(by, { resurtido: 30000, nomina: 10000, operativos: 7500, utilidad: 12500 });
  const corto = allocatePayment(5000, funds, 'costo_real', { costOfGoods: 8000, commission: 1000 });
  assert.equal(corto.find(f => f.code === 'resurtido').amount, 5000);
  assert.equal(splitByWeights(10, [{ code: 'a', weight: 1 }, { code: 'b', weight: 2 }]).reduce((s, x) => s + x.amount, 0), 10);
});

test('costo promedio, energía y costo completo', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  const purchases = [
    { purchasedAt: '2026-10-20T10:00:00Z', items: [{ ingredientId: 'carne', qtyBase: 1000, lineTotal: 20000 }, { ingredientId: 'pan', qtyBase: 10, lineTotal: 6000 }] },
    { purchasedAt: '2026-10-25T10:00:00Z', items: [{ ingredientId: 'carne', qtyBase: 1000, lineTotal: 24000 }] },
    { purchasedAt: '2026-01-01T10:00:00Z', items: [{ ingredientId: 'tomate', qtyBase: 80, lineTotal: 4000 }, { ingredientId: 'cinta', qtyBase: 3000, lineTotal: 3000 }] }
  ];
  const avg = averageCosts(purchases, { now });
  assert.equal(avg.carne, 22);
  assert.equal(avg.pan, 600);
  assert.equal(avg.tomate, 50); // fuera de la ventana: usa todas
  assert.equal(wattsFrom({ volts: 120, amps: 10 }), 1200);
  const e = energyCostPerUnit({ watts: 1200, minutesPerBatch: 10, unitsPerBatch: 4, pricePerKwh: 900 });
  assert.ok(Math.abs(e - 45) < 1e-9);
  assert.equal(energyCostPerUnit({ watts: null, minutesPerBatch: 10, unitsPerBatch: 4, pricePerKwh: 900 }), null);
  const full = fullUnitCost({ recipe: RECIPE, ingredientsById: ING, variants: VARIANTS, meatSupplierId: 'dona', avgCost: avg, commission: 1000, energy: e, cleaningPerUnit: 100, overhead: 50 });
  // 60*22 + 600 + 50 + 15*1 = 1985 insumos
  assert.equal(full.materials, 1985);
  assert.equal(full.total, 1985 + 1000 + 45 + 100 + 50);
  assert.equal(overheadPerUnit([{ amount: 30000, allocation: 'por_unidad' }], { unitsInPeriod: 300 }), 100);
});

test('precio vigente por canal', () => {
  const prices = [
    { productId: 'mb', channelId: 'ds', price: 7000, validFrom: '2026-10-01' },
    { productId: 'mb', channelId: 'ds', price: 7500, validFrom: '2026-10-20' },
    { productId: 'mb', channelId: 'ds', price: 9000, validFrom: '2026-12-01' }
  ];
  assert.equal(currentPrice(prices, 'mb', 'ds', '2026-10-26'), 7500);
  assert.equal(currentPrice(prices, 'mb', 'otro', '2026-10-26'), null);
});

test('comisiones abiertas del día', () => {
  const prods = [
    { cookId: 'n', qty: 20, commissionSnapshot: 1000, producedAt: '2026-10-26T09:00:00Z' },
    { cookId: 'n', qty: 10, commissionSnapshot: 1000, producedAt: '2026-10-25T09:00:00Z' },
    { cookId: 'n', qty: 5, commissionSnapshot: 1000, producedAt: '2026-10-24T09:00:00Z', settlementId: 's1' }
  ];
  const c = openCommissions(prods, 'n', '2026-10-26');
  assert.equal(c.todayAmount, 20000);
  assert.equal(c.openAmount, 30000);
  assert.equal(commissionRateFor([{ userId: 'n', amountPerUnit: 1200, validFrom: '2026-01-01' }], 'n'), 1200);
  assert.equal(commissionRateFor([], 'n'), 1000);
});

test('PEPS y vencimiento a 3 días', () => {
  const lots = [
    { id: 'b', productId: 'mb', remaining: 10, producedAt: '2026-10-25T08:00:00Z' },
    { id: 'a', productId: 'mb', remaining: 4, producedAt: '2026-10-23T08:00:00Z' }
  ];
  const r = pickFifo(lots, 'mb', 6);
  assert.deepEqual(r.picks, [{ lotId: 'a', qty: 4 }, { lotId: 'b', qty: 2 }]);
  assert.equal(pickFifo(lots, 'mb', 20).missing, 6);
  const now = new Date('2026-10-26T09:00:00Z');
  assert.equal(lotStatus(lots[1], 3, now).expired, true);
  assert.equal(lotStatus(lots[0], 3, now).expired, false);
});

test('cuadre del bote y nota de merma', () => {
  const r = reconcilePos({ unitsPlaced: 20, unitsReturned: 2, unitPrice: 8000, receivedAmount: 128000 });
  assert.equal(r.expected, 144000);
  assert.equal(r.difference, 16000);
  assert.equal(r.missingUnits, 2);
  assert.equal(validWasteNote('corto'), false);
  assert.equal(validWasteNote('se cayó al piso'), true);
});

test('lista de compras con dos productos comparte el pan y el stock', async () => {
  const { shoppingListMulti } = await import('./shopping.js');
  const ING2 = { ...ING, pollo: { id: 'pollo', name: 'Carne molida de pollo', baseUnit: 'g', purchaseUnit: 'kg', purchaseStep: 0.5 }, mayo: { id: 'mayo', name: 'Sobre de mayonesa', baseUnit: 'und', purchaseUnit: 'und' } };
  const CHICKEN = { items: [{ ingredientId: 'pollo', qty: 60, unitCode: 'g' }, { ingredientId: 'pan', qty: 1, unitCode: 'und' }, { ingredientId: 'mayo', qty: 1, unitCode: 'und' }] };
  const res = shoppingListMulti({
    plans: [
      { productId: 'mb', planned: 20, finishedOnHand: 0, recipe: RECIPE, meatSupplierId: 'dona' },
      { productId: 'mc', planned: 10, finishedOnHand: 4, recipe: CHICKEN }
    ],
    ingredientsById: ING2, variants: VARIANTS, stock: { pan: 10 }
  });
  assert.deepEqual(res.plans.map(p => p.toProduce), [20, 6]);
  const pan = res.lines.find(l => l.ingredientId === 'pan');
  assert.equal(pan.needBase, 26);
  assert.equal(pan.shortBase, 16);
  assert.equal(res.lines.find(l => l.ingredientId === 'pollo').buyQty, 0.5);
  assert.equal(res.lines.find(l => l.ingredientId === 'mayo').shortBase, 6);
});
