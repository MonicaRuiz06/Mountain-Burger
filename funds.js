// Reparto de cada pago en los 4 fondos (RF-05). Montos en pesos enteros.
export const FUND_CODES = ['resurtido', 'nomina', 'operativos', 'utilidad'];

/** Reparte `amount` según pesos relativos, sin perder pesos por redondeo. */
export function splitByWeights(amount, weighted) {
  const total = weighted.reduce((s, w) => s + Math.max(0, Number(w.weight) || 0), 0);
  if (amount <= 0 || total <= 0) return weighted.map(w => ({ ...w, amount: 0 }));
  const raw = weighted.map(w => ({ ...w, exact: (amount * Math.max(0, Number(w.weight) || 0)) / total }));
  const out = raw.map(r => ({ ...r, amount: Math.floor(r.exact) }));
  let rest = amount - out.reduce((s, r) => s + r.amount, 0);
  const order = [...out].sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)));
  for (const r of order) { if (rest <= 0) break; r.amount += 1; rest -= 1; }
  return out.map(({ exact, weight, ...r }) => r);
}

/**
 * funds: [{id, code, pct}]
 * mode: 'fijo' | 'costo_real'
 * costOfGoods / commission: pesos de lo vendido (solo para 'costo_real').
 * Devuelve [{fundId, code, amount}] que suma exactamente `amount`.
 */
export function allocatePayment(amount, funds, mode = 'costo_real', { costOfGoods = 0, commission = 0 } = {}) {
  const total = Math.round(Number(amount) || 0);
  const byCode = Object.fromEntries(funds.map(f => [f.code, f]));
  const result = Object.fromEntries(funds.map(f => [f.code, 0]));

  if (mode === 'costo_real' && byCode.resurtido && byCode.nomina) {
    let rest = total;
    const r = Math.min(rest, Math.max(0, Math.round(costOfGoods))); result.resurtido += r; rest -= r;
    const n = Math.min(rest, Math.max(0, Math.round(commission))); result.nomina += n; rest -= n;
    const others = funds.filter(f => f.code === 'operativos' || f.code === 'utilidad');
    const parts = splitByWeights(rest, others.map(f => ({ code: f.code, weight: f.pct || 0 })));
    if (parts.every(p => p.amount === 0) && rest > 0) {
      // Sin porcentajes configurados: todo a utilidad.
      result[byCode.utilidad ? 'utilidad' : funds[0].code] += rest;
    } else for (const p of parts) result[p.code] += p.amount;
  } else {
    const parts = splitByWeights(total, funds.map(f => ({ code: f.code, weight: f.pct || 0 })));
    if (parts.every(p => p.amount === 0) && total > 0) result[funds[0].code] += total;
    else for (const p of parts) result[p.code] += p.amount;
  }
  return funds.map(f => ({ fundId: f.id, code: f.code, amount: result[f.code] }));
}

export function pctTotal(funds) {
  return funds.reduce((s, f) => s + (Number(f.pct) || 0), 0);
}
