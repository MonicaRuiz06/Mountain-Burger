// Comisiones, lotes en nevera (PEPS) y vencimientos.
import { localDay } from './dates.js';

/** Tarifa vigente de comisión de un usuario (o la de referencia). */
export function commissionRateFor(rates, userId, fallback = 1000, at = new Date().toISOString()) {
  const list = rates
    .filter(r => r.userId === userId && (r.validFrom || '') <= at)
    .sort((a, b) => (b.validFrom || '').localeCompare(a.validFrom || ''));
  return list.length ? Number(list[0].amountPerUnit) : fallback;
}

/** Comisiones sin liquidar de un cocinero: total del día y del periodo abierto. */
export function openCommissions(productions, cookId, today = localDay()) {
  const mine = productions.filter(p => p.cookId === cookId && !p.settlementId && p.kind !== 'cierre');
  const sum = list => list.reduce((s, p) => s + (Number(p.qty) || 0) * (Number(p.commissionSnapshot) || 0), 0);
  const units = list => list.reduce((s, p) => s + (Number(p.qty) || 0), 0);
  const todays = mine.filter(p => (p.day || (p.producedAt ? localDay(p.producedAt) : '')) === today);
  return { todayAmount: sum(todays), todayUnits: units(todays), openAmount: sum(mine), openUnits: units(mine), productions: mine };
}

/**
 * Toma `qty` unidades de los lotes con saldo, el más viejo primero.
 * lots: [{id, productId, remaining, producedAt}]
 * Devuelve { picks:[{lotId, qty}], missing }.
 */
export function pickFifo(lots, productId, qty) {
  let need = Number(qty);
  const picks = [];
  const sorted = lots
    .filter(l => l.productId === productId && Number(l.remaining) > 0)
    .sort((a, b) => (a.producedAt || '').localeCompare(b.producedAt || ''));
  for (const l of sorted) {
    if (need <= 0) break;
    const take = Math.min(need, Number(l.remaining));
    picks.push({ lotId: l.id, qty: take });
    need -= take;
  }
  return { picks, missing: Math.max(0, need) };
}

/** Edad en días de un lote y si ya llegó a la vida útil. */
export function lotStatus(lot, shelfLifeDays = 3, now = new Date()) {
  const ageDays = (now.getTime() - new Date(lot.producedAt).getTime()) / 864e5;
  const expiresAt = new Date(new Date(lot.producedAt).getTime() + shelfLifeDays * 864e5);
  return { ageDays, expiresAt, expired: ageDays >= shelfLifeDays, dueSoon: ageDays >= shelfLifeDays - 1 && ageDays < shelfLifeDays };
}

/** Cuadre del sistema de confianza (bote de Alórica). */
export function reconcilePos({ unitsPlaced, unitsReturned, unitPrice, receivedAmount }) {
  const sold = Math.max(0, Number(unitsPlaced) - Number(unitsReturned || 0));
  const expected = sold * Number(unitPrice || 0);
  const received = Number(receivedAmount) || 0;
  const difference = expected - received; // > 0 = faltó plata
  const missingUnits = unitPrice > 0 ? Math.max(0, Math.round(difference / unitPrice)) : 0;
  return { sold, expected, received, difference, missingUnits };
}

/** Valida la nota obligatoria de mermas (RNF-04). */
export function validWasteNote(note) {
  return typeof note === 'string' && note.trim().length >= 10;
}
