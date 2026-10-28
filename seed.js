// Datos iniciales. Las cantidades en 0 o null están "por configurar" desde la app:
import { localDay } from './dates.js';
// la administración pone los gramajes reales en Catálogo → Recetas e Insumos.
export function seedOps(ctx) {
  const t = { createdAt: ctx.now, createdBy: ctx.uid, active: true };
  const set = (col, id, data) => ({ type: 'set', col, id, merge: true, data: { ...t, ...data } });
  const ing = (id, name, category, baseUnit, extra = {}) => set('ingredients', id, {
    name, category, baseUnit, purchaseUnit: baseUnit, purchaseStep: 1, minStock: 0, trackBySupplier: false, conversions: {}, ...extra
  });

  // Fondos: con "costo real", Resurtido y Nómina se calculan solos; lo que sobra se parte 50/50
  // entre Operativos y Utilidad como punto de partida (se cambia en Finanzas).
  return [
    set('settings', 'app', { shelfLifeDays: 3, defaultCommission: 1000, fundMode: 'costo_real', costWindowDays: 30, burgerProductId: 'mountain-burger', cierreProductId: 'cierre-jornada', currency: 'COP' }),

    ing('carne-molida', 'Carne molida', 'materia_prima', 'g', { purchaseUnit: 'kg', purchaseStep: 0.5, trackBySupplier: true }),
    ing('carne-molida-pollo', 'Carne molida de pollo', 'materia_prima', 'g', { purchaseUnit: 'kg', purchaseStep: 0.5 }),
    ing('harina-maiz', 'Harina de maíz', 'materia_prima', 'g', { purchaseUnit: 'kg', purchaseStep: 0.5 }),
    ing('sobre-mayonesa', 'Sobre de mayonesa', 'empaque', 'und'),
    ing('pan', 'Pan de hamburguesa', 'materia_prima', 'und'),
    ing('catsup', 'Salsa cátsup', 'materia_prima', 'g'),
    ing('tomate', 'Tomate', 'materia_prima', 'rebanada', { purchaseUnit: 'kg', purchaseStep: 0.5, countUnit: 'und' }),
    ing('queso', 'Queso amarillo / sabana', 'materia_prima', 'tajada', { purchaseUnit: 'paquete' }),
    ing('lechuga', 'Lechuga', 'materia_prima', 'g', { purchaseUnit: 'und', countUnit: 'und' }),
    ing('bolsita-termica', 'Bolsita metálica térmica', 'empaque', 'und'),
    ing('cinta', 'Cinta adhesiva de sellado', 'empaque', 'cm', { purchaseUnit: 'rollo' }),
    ing('sal', 'Sal en polvo', 'especia', 'g'),
    ing('ajo', 'Ajo en polvo', 'especia', 'g'),
    ing('pimienta', 'Pimienta en polvo', 'especia', 'g'),
    ing('jabon', 'Jabón', 'limpieza', 'g'),
    ing('fabuloso', 'Fabuloso (trapear)', 'limpieza', 'ml', { purchaseUnit: 'l' }),
    ing('fino', 'Fino', 'limpieza', 'ml'),
    ing('bolsa-basura', 'Bolsa de basura', 'limpieza', 'und'),

    set('suppliers', 'carniceria-abuela', { name: 'Carnicería de la Abuela', notes: 'Carne natural, sin sazonar', sellsMeat: true }),
    set('suppliers', 'carniceria-dona', { name: 'Carnicería de la Doña', notes: 'Carne ya sazonada', sellsMeat: true }),
    set('suppliers', 'plaza', { name: 'Plaza de mercado', notes: '', sellsMeat: false }),

    set('supplier_ingredient_variants', 'abuela-sal', { supplierId: 'carniceria-abuela', triggerIngredientId: 'carne-molida', extraIngredientId: 'sal', qtyPerBaseOfTrigger: 0 }),
    set('supplier_ingredient_variants', 'abuela-ajo', { supplierId: 'carniceria-abuela', triggerIngredientId: 'carne-molida', extraIngredientId: 'ajo', qtyPerBaseOfTrigger: 0 }),
    set('supplier_ingredient_variants', 'abuela-pimienta', { supplierId: 'carniceria-abuela', triggerIngredientId: 'carne-molida', extraIngredientId: 'pimienta', qtyPerBaseOfTrigger: 0 }),

    set('products', 'mountain-burger', { name: 'Mountain Burger', sku: 'MB-01', kind: 'venta' }),
    set('products', 'mountain-chicken', { name: 'Mountain Chicken', sku: 'MC-01', kind: 'venta', notes: 'Hamburguesa de pollo, se vende con sobre de mayonesa' }),
    set('products', 'cierre-jornada', { name: 'Cierre de jornada (limpieza)', sku: 'PROC-CIERRE', kind: 'proceso_interno' }),

    set('recipes', 'mountain-burger-v1', { productId: 'mountain-burger', version: 1, validFrom: localDay(ctx.now), yieldQty: 1, items: [
      { ingredientId: 'carne-molida', qty: 60, unitCode: 'g', wastePct: 0 },
      { ingredientId: 'pan', qty: 1, unitCode: 'und', wastePct: 0 },
      { ingredientId: 'catsup', qty: 0, unitCode: 'g', wastePct: 0 },
      { ingredientId: 'tomate', qty: 1, unitCode: 'rebanada', wastePct: 0 },
      { ingredientId: 'queso', qty: 1, unitCode: 'tajada', wastePct: 0 },
      { ingredientId: 'lechuga', qty: 0, unitCode: 'g', wastePct: 0 },
      { ingredientId: 'bolsita-termica', qty: 1, unitCode: 'und', wastePct: 0 },
      { ingredientId: 'cinta', qty: 15, unitCode: 'cm', wastePct: 0 }
    ] }),
    // Igual a la Mountain Burger pero con pollo en vez de res, harina de maíz y sobre de mayonesa.
    // Pollo en 60 g como la de res y harina en 0 g: se ajustan en Catálogo → Recetas.
    set('recipes', 'mountain-chicken-v1', { productId: 'mountain-chicken', version: 1, validFrom: localDay(ctx.now), yieldQty: 1, items: [
      { ingredientId: 'carne-molida-pollo', qty: 60, unitCode: 'g', wastePct: 0 },
      { ingredientId: 'harina-maiz', qty: 0, unitCode: 'g', wastePct: 0 },
      { ingredientId: 'pan', qty: 1, unitCode: 'und', wastePct: 0 },
      { ingredientId: 'catsup', qty: 0, unitCode: 'g', wastePct: 0 },
      { ingredientId: 'tomate', qty: 1, unitCode: 'rebanada', wastePct: 0 },
      { ingredientId: 'queso', qty: 1, unitCode: 'tajada', wastePct: 0 },
      { ingredientId: 'lechuga', qty: 0, unitCode: 'g', wastePct: 0 },
      { ingredientId: 'sobre-mayonesa', qty: 1, unitCode: 'und', wastePct: 0 },
      { ingredientId: 'bolsita-termica', qty: 1, unitCode: 'und', wastePct: 0 },
      { ingredientId: 'cinta', qty: 15, unitCode: 'cm', wastePct: 0 }
    ] }),
    set('recipes', 'cierre-jornada-v1', { productId: 'cierre-jornada', version: 1, validFrom: localDay(ctx.now), yieldQty: 1, items: [
      // Recomendación inicial por jornada; ajústala cuando sepas cuánto dura cada producto.
      { ingredientId: 'jabon', qty: 20, unitCode: 'g', wastePct: 0 },
      { ingredientId: 'fabuloso', qty: 60, unitCode: 'ml', wastePct: 0 },
      { ingredientId: 'fino', qty: 0, unitCode: 'ml', wastePct: 0 },
      { ingredientId: 'bolsa-basura', qty: 1, unitCode: 'und', wastePct: 0 }
    ] }),

    set('clients_channels', 'parque', { name: 'Parque', type: 'parque', paymentTermsDays: 0 }),
    set('clients_channels', 'alorica', { name: 'Alórica (bote Nequi)', type: 'bote_confianza', paymentTermsDays: 0 }),
    set('clients_channels', 'don-santiago', { name: 'Don Santiago (máquinas)', type: 'mayorista_vending', paymentTermsDays: 0 }),

    set('funds', 'resurtido', { code: 'resurtido', name: 'Resurtido de materia prima', pct: 0, order: 1 }),
    set('funds', 'nomina', { code: 'nomina', name: 'Nómina / comisiones', pct: 0, order: 2 }),
    set('funds', 'operativos', { code: 'operativos', name: 'Gastos operativos', pct: 50, order: 3 }),
    set('funds', 'utilidad', { code: 'utilidad', name: 'Utilidad / inversión', pct: 50, order: 4 }),

    set('equipment', 'parrilla-electrica', { name: 'Parrilla eléctrica', resource: 'electricidad', volts: 110, amps: null, watts: 1500 }),
    // Tarifa aproximada: EMCALI publicó un costo unitario de ≈ 759 $/kWh en enero de 2026; se redondea a 800.
    set('utility_rates', 'electricidad-aprox', { resource: 'electricidad', unit: 'kWh', pricePerUnit: 800, validFrom: localDay(ctx.now), approx: true, notes: 'Aproximado (casa compartida, sin medidor propio)' }),
    // Precios de ejemplo; se cambian en Catálogo → Canales y precios.
    set('custom_prices', 'mb-alorica', { productId: 'mountain-burger', channelId: 'alorica', price: 10000, validFrom: localDay(ctx.now) }),
    set('custom_prices', 'mb-don-santiago', { productId: 'mountain-burger', channelId: 'don-santiago', price: 8000, validFrom: localDay(ctx.now) }),
    set('cooking_profiles', 'mb-abuela', { productId: 'mountain-burger', supplierId: 'carniceria-abuela', equipmentId: 'parrilla-electrica', minutesPerBatch: null, unitsPerBatch: null }),
    set('cooking_profiles', 'mc-pollo', { productId: 'mountain-chicken', supplierId: null, equipmentId: 'parrilla-electrica', minutesPerBatch: null, unitsPerBatch: null }),
    set('cooking_profiles', 'mb-dona', { productId: 'mountain-burger', supplierId: 'carniceria-dona', equipmentId: 'parrilla-electrica', minutesPerBatch: null, unitsPerBatch: null })
  ];
}
