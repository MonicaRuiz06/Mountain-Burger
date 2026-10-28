import React, { useMemo, useState } from 'react';
import { useCatalog, useOps, useCol, toast } from './store.jsx';
import { adjustStock, settlePayroll, saveDoc } from './ops.js';
import { commissionRateFor } from './production.js';
import { fromBase, toBase } from './units.js';
import { useI18n } from './i18n.jsx';
import { Card, Field, NumInput, Select, Tabs, Modal, useConfirm } from './kit.jsx';
import Waste from './Waste.jsx';
import Settings from './Settings.jsx';

/** "Más" de logística: stock y conteos, pago al cocinero, mermas y ajustes. */
export default function Stock() {
  const { L } = useI18n();
  const [tab, setTab] = useState('stock');
  return (
    <>
      <Tabs value={tab} onChange={setTab} options={[
        { value: 'stock', label: L('Stock', 'Stock') },
        { value: 'pay', label: L('Pago cocina', 'Kitchen pay') },
        { value: 'waste', label: L('Merma', 'Waste') },
        { value: 'settings', label: L('Ajustes', 'Settings') }
      ]} />
      {tab === 'stock' && <StockList />}
      {tab === 'pay' && <KitchenPay />}
      {tab === 'waste' && <Waste />}
      {tab === 'settings' && <Settings />}
    </>
  );
}

export function StockList() {
  const { L, num } = useI18n();
  const cat = useCatalog();
  const { run } = useOps();
  const [count, setCount] = useState(null);
  const [counted, setCounted] = useState('');
  const [unit, setUnit] = useState('');

  const rows = useMemo(() => cat.stockDocs.map(s => {
    const ing = cat.ingredientsById[s.ingredientId];
    if (!ing) return null;
    return { ...s, ing, sup: cat.suppliers.find(x => x.id === s.supplierId) };
  }).filter(Boolean).concat(
    cat.ingredients.filter(i => !cat.stockDocs.some(s => s.ingredientId === i.id)).map(ing => ({ id: ing.id, ingredientId: ing.id, qtyBase: 0, ing }))
  ).sort((a, b) => a.ing.name.localeCompare(b.ing.name)), [cat]);

  function saveCount() {
    const base = toBase(Number(counted), unit || count.ing.baseUnit, count.ing);
    if (base == null) { toast(L('Unidad no convertible', 'Unit not convertible'), 'error'); return; }
    run(ctx => adjustStock({ ingredientId: count.ingredientId, supplierId: count.supplierId || null, countedBase: base, currentBase: count.qtyBase }, ctx));
    toast(L('Conteo guardado', 'Count saved'));
    setCount(null); setCounted(''); setUnit('');
  }

  return (
    <>
      <h2>{L('Stock de insumos', 'Ingredient stock')}</h2>
      <Card>
        <table className="list">
          <thead><tr><th>{L('Insumo', 'Item')}</th><th className="n">{L('Hay', 'On hand')}</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => {
              const low = Number(r.ing.minStock) > 0 && r.qtyBase < r.ing.minStock;
              const pu = r.ing.purchaseUnit && r.ing.purchaseUnit !== r.ing.baseUnit ? fromBase(r.qtyBase, r.ing.purchaseUnit, r.ing) : null;
              return (
                <tr key={r.id}>
                  <td>{r.ing.name}{r.sup && <div className="small muted">{r.sup.name}</div>}</td>
                  <td className="n" style={{ color: r.qtyBase < 0 || low ? 'var(--bad)' : undefined }}>
                    {num(r.qtyBase, 1)} {r.ing.baseUnit}{pu != null && <div className="small muted">≈ {num(pu, 2)} {r.ing.purchaseUnit}</div>}
                  </td>
                  <td className="n"><button className="btn ghost" onClick={() => setCount(r)}>{L('Contar', 'Count')}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <Modal open={!!count} onClose={() => setCount(null)} title={L(`Conteo: ${count?.ing.name}`, `Count: ${count?.ing.name}`)}>
        <p className="small muted">{L('Escribe lo que hay de verdad. La diferencia queda como ajuste.', 'Enter the real amount.')}</p>
        <div className="grid2">
          <Field label={L('Cantidad', 'Qty')}><NumInput value={counted} onChange={setCounted} /></Field>
          <Field label={L('Unidad', 'Unit')}><Select value={unit || count?.ing.baseUnit} onChange={setUnit} options={[count?.ing.baseUnit, count?.ing.purchaseUnit, count?.ing.countUnit].filter((v, i, a) => v && a.indexOf(v) === i).map(u => ({ value: u, label: u }))} /></Field>
        </div>
        <button className="btn block" disabled={counted === ''} onClick={saveCount}>{L('Guardar conteo', 'Save count')}</button>
      </Modal>
    </>
  );
}

/** Tarifa por hamburguesa y liquidación diaria del cocinero (RF-06). */
export function KitchenPay() {
  const { L, money, date } = useI18n();
  const cat = useCatalog();
  const { run } = useOps();
  const [ask, confirmUi] = useConfirm();
  const cooks = cat.users.filter(u => u.role === 'cocina' && u.active !== false);
  const [cookId, setCookId] = useState(cooks[0]?.id || '');
  const [open] = useCol('productions', { where: [['cookId', '==', cookId || '-'], ['settled', '==', false]] });
  const pending = open.filter(p => p.kind !== 'cierre');
  const amount = pending.reduce((s, p) => s + p.qty * p.commissionSnapshot, 0);
  const units = pending.reduce((s, p) => s + p.qty, 0);
  const rate = commissionRateFor(cat.rates, cookId, Number(cat.settings.defaultCommission) || 1000);
  const [newRate, setNewRate] = useState('');

  function setRate() {
    run(ctx => saveDoc('commission_rates', ctx.newId(), { userId: cookId, amountPerUnit: Number(newRate), validFrom: ctx.now, createdAt: ctx.now }, ctx));
    toast(L('Tarifa actualizada', 'Rate updated'));
    setNewRate('');
  }
  function settle() {
    try {
      const res = run(ctx => settlePayroll({ userId: cookId, productions: pending }, ctx));
      toast(L(`Liquidado: ${money(res.amount)}`, `Paid: ${money(res.amount)}`));
    } catch (e) { toast(e.message, 'error'); }
  }

  if (!cooks.length) return <Card><p className="muted">{L('No hay usuarios de cocina. La administración asigna el rol en Catálogo → Usuarios.', 'No kitchen users yet.')}</p></Card>;
  return (
    <>
      <h2>{L('Pago a cocina', 'Kitchen pay')}</h2>
      {cooks.length > 1 && <Field label={L('Cocinero', 'Cook')}><Select value={cookId} onChange={setCookId} options={cooks.map(c => ({ value: c.id, label: c.name }))} /></Field>}
      <Card title={L('Por liquidar hoy', 'To pay')}>
        <div className="row"><span className="grow">{units} {L('hamburguesas', 'burgers')}</span><span className="big-number">{money(amount)}</span></div>
        <p className="small muted">{[...new Set(pending.map(p => p.day))].map(d => date(d + 'T12:00:00')).join(', ')}</p>
        <button className="btn block big" disabled={!amount} onClick={() => ask(L(`¿Pagar ${money(amount)}? Sale del fondo de Nómina.`, `Pay ${money(amount)}?`), settle)}>{L('Liquidar y pagar', 'Settle and pay')}</button>
      </Card>
      <Card title={L('Pago por hamburguesa', 'Pay per burger')}>
        <p>{L('Actual', 'Current')}: <strong>{money(rate)}</strong></p>
        <div className="row">
          <div className="grow"><NumInput value={newRate} onChange={setNewRate} step="50" placeholder={String(rate)} /></div>
          <button className="btn" disabled={!(Number(newRate) > 0)} onClick={setRate}>{L('Cambiar', 'Change')}</button>
        </div>
        <p className="small muted">{L('Aplica desde ahora; lo ya producido conserva su tarifa.', 'Applies from now on.')}</p>
      </Card>
      {confirmUi}
    </>
  );
}
