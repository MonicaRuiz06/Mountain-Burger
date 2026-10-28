import { useMemo } from 'react';
import { useCatalog, useCol } from './store.jsx';
import { activeRecipe, explodeRecipe } from './recipe.js';
import { averageCosts, costOfLines, energyCostPerUnit, wattsFrom, overheadPerUnit, currentPrice } from './costing.js';
import { commissionRateFor } from './production.js';
import { localDay } from './dates.js';

/**
 * Modelo de costos en vivo (solo admin y logística pueden leer compras).
 * Devuelve el costo completo por unidad, por carnicería, y lo necesario
 * para repartir los pagos por "costo real".
 */
export function useCostModel(enabled = true) {
  const cat = useCatalog();
  const windowDays = Number(cat.settings.costWindowDays) || 30;
  const since = useMemo(() => new Date(Date.now() - Math.max(windowDays, 60) * 864e5).toISOString(), [windowDays]);
  const sinceWindow = useMemo(() => new Date(Date.now() - windowDays * 864e5).toISOString(), [windowDays]);
  const [purchases] = useCol('purchases', { where: [['purchasedAt', '>=', since]] }, enabled);
  const [productions] = useCol('productions', { where: [['producedAt', '>=', sinceWindow]] }, enabled);
  const [rates] = useCol('utility_rates', {}, enabled);
  const [expenses] = useCol('overhead_expenses', {}, enabled);

  return useMemo(() => {
    const avg = averageCosts(purchases, { windowDays });
    const burgerId = cat.settings.burgerProductId || 'mountain-burger';
    const cierreId = cat.settings.cierreProductId || 'cierre-jornada';
    const elec = rates.filter(r => r.resource === 'electricidad').sort((a, b) => (b.validFrom || '').localeCompare(a.validFrom || ''))[0];

    const sales = productions.filter(p => p.kind !== 'cierre');
    const unitsInPeriod = sales.reduce((s, p) => s + (Number(p.qty) || 0), 0);
    const days = new Set(sales.map(p => p.day)).size;
    const unitsPerDay = days ? unitsInPeriod / days : 0;

    // Limpieza de cierre: costo de la receta "Cierre de jornada" ÷ hamburguesas promedio por día.
    const cierreRecipe = activeRecipe(cat.recipes, cierreId);
    const cierreCost = cierreRecipe ? costOfLines(explodeRecipe(cierreRecipe, 1, { ingredientsById: cat.ingredientsById }).lines, avg).total : 0;
    const cleaningPerUnit = unitsPerDay > 0 ? cierreCost / unitsPerDay : null;

    // Gastos indirectos del periodo (agua, aporte a la casa, otros).
    const today = localDay();
    const sinceDay = sinceWindow.slice(0, 10);
    const exp = expenses.filter(e => (e.periodEnd || today) >= sinceDay);
    const overhead = overheadPerUnit(exp, { unitsInPeriod, batchesInPeriod: sales.length, unitsPerBatch: unitsInPeriod / (sales.length || 1) });

    const commission = commissionRateFor(cat.rates, cat.users.find(u => u.role === 'cocina')?.id, Number(cat.settings.defaultCommission) || 1000);

    function unitCost(productId = burgerId, supplierId = null) {
      const recipe = activeRecipe(cat.recipes, productId);
      if (!recipe) return null;
      const { lines, errors } = explodeRecipe(recipe, 1, { ingredientsById: cat.ingredientsById, variants: cat.variants, meatSupplierId: supplierId });
      const mat = costOfLines(lines, avg);
      const prof = cat.cookingProfiles.find(c => c.productId === productId && c.supplierId === supplierId) || cat.cookingProfiles.find(c => c.productId === productId);
      const eq = prof && cat.equipment.find(e => e.id === prof.equipmentId);
      const energy = eq && prof ? energyCostPerUnit({ watts: wattsFrom(eq), minutesPerBatch: prof.minutesPerBatch, unitsPerBatch: prof.unitsPerBatch, pricePerKwh: elec?.pricePerUnit }) : null;
      const parts = { materials: mat.total, commission, energy: energy ?? 0, cleaning: cleaningPerUnit ?? 0, overhead };
      return {
        ...parts,
        total: Object.values(parts).reduce((s, v) => s + v, 0),
        lines, errors, missing: mat.missing,
        pending: { energy: energy == null, cleaning: cleaningPerUnit == null, prices: mat.missing.length > 0 }
      };
    }

    /** Para repartir un pago por costo real: costo de insumos y comisión de lo vendido. */
    function costInfoForDispatches(dispatches) {
      // Usa lo que se sabe: insumos sin compra registrada cuentan como 0 hasta que se compren.
      let costOfGoods = 0, comm = 0;
      for (const d of dispatches) for (const it of d.items || []) {
        const uc = unitCost(it.productId, cat.settings.defaultMeatSupplierId || null);
        costOfGoods += (uc?.materials || 0) * it.qty;
        comm += commission * it.qty;
      }
      return { costOfGoods: Math.round(costOfGoods), commission: Math.round(comm), costsKnown: dispatches.length > 0 && Object.keys(avg).length > 0 };
    }

    return {
      avg, unitCost, costInfoForDispatches, elecRate: elec, cierreCost, cleaningPerUnit, unitsPerDay, overhead,
      unitsInPeriod, commission, burgerId, purchases, productions, expenses,
      price: (productId, channelId) => currentPrice(cat.prices, productId, channelId)
    };
  }, [purchases, productions, rates, expenses, cat, windowDays, sinceWindow]);
}
