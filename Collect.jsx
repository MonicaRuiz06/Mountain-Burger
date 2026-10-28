import React, { useMemo, useState } from 'react';
import { useCatalog, useOps, useCol, toast } from './store.jsx';
import { registerPayment, closePosSession } from './ops.js';
import { useCostModel } from './costs.js';
import { reconcilePos } from './production.js';
import { currentPrice } from './costing.js';
import { useI18n } from './i18n.jsx';
import { Card, Field, NumInput, Seg, Stepper, Notice, Tabs } from './kit.jsx';

/** Cobros: cuadre del bote de confianza y pagos de clientes (RF-05). */
export default function Collect() {
  const { L } = useI18n();
  const cat = useCatalog();
  const [tab, setTab] = useState('bote');
  const [unpaid] = useCol('dispatches', { where: [['paid', '==', false]] });
  return (
    <>
      <h2>{L('Cobros', 'Collections')}</h2>
      <Tabs value={tab} onChange={setTab} options={[{ value: 'bote', label: L('Cuadre del bote', 'Honesty box') }, { value: 'pago', label: L('Pago de cliente', 'Customer payment') }]} />
      {tab === 'bote' ? <Bote unpaid={unpaid} /> : <Pago unpaid={unpaid} />}
    </>
  );
}

function Bote({ unpaid }) {
  const { L, money, date } = useI18n();
  const cat = useCatalog();
  const { run } = useOps();
  const costs = useCostModel();
  const boxes = cat.channels.filter(c => c.type === 'bote_confianza');
  const [channelId, setChannelId] = useState(boxes[0]?.id || '');
  const products = cat.products.filter(p => p.kind !== 'proceso_interno');
  const [productId, setProductId] = useState(cat.settings.burgerProductId || products[0]?.id || '');
  // Cada producto se cuadra aparte porque tiene su propio precio.
  const open = unpaid.filter(d => d.channelId === channelId && d.items[0]?.productId === productId).sort((a, b) => a.dispatchedAt.localeCompare(b.dispatchedAt));
  const placed = open.reduce((s, d) => s + d.items.reduce((a, i) => a + i.qty, 0), 0);
  const price = open[0]?.items[0]?.unitPrice ?? currentPrice(cat.prices, productId, channelId) ?? 0;
  const [returned, setReturned] = useState(0);
  const [received, setReceived] = useState('');
  const rec = reconcilePos({ unitsPlaced: placed, unitsReturned: returned, unitPrice: price, receivedAmount: received });
  const [err, setErr] = useState('');
  const [sessions] = useCol('pos_sessions', { where: [['channelId', '==', channelId]] });

  function save() {
    setErr('');
    try {
      const sold = Math.max(0, placed - returned);
      const costInfo = costs.costInfoForDispatches([{ items: [{ productId, qty: sold }] }]);
      const res = run(ctx => closePosSession({ channelId, dispatches: open, unitsReturned: returned, receivedAmount: Number(received) || 0, unitPrice: price }, ctx, costInfo));
      toast(res.rec.difference > 0 ? L(`Cuadre guardado. Faltaron ${money(res.rec.difference)}`, 'Saved with shortfall') : L('Cuadre guardado. ¡Cuadró!', 'Saved. Balanced!'));
      setReturned(0); setReceived('');
    } catch (e) { setErr(e.message); }
  }

  if (!boxes.length) return <Notice>{L('No hay canales tipo bote. Créalo en Catálogo → Canales.', 'No honesty-box channel.')}</Notice>;
  return (
    <>
      <Card>
        {boxes.length > 1 && <Seg value={channelId} onChange={setChannelId} options={boxes.map(b => ({ value: b.id, label: b.name }))} />}
        {products.length > 1 && <div style={{ marginTop: 8 }}><Seg value={productId} onChange={v => { setProductId(v); setReturned(0); setReceived(''); }} options={products.map(p => ({ value: p.id, label: p.name }))} /></div>}
        <p>{L('Dejadas en el bote sin cuadrar', 'Placed, not yet reconciled')}: <strong>{placed}</strong> · {money(price)} c/u</p>
        {placed === 0 ? <p className="muted small">{L('Primero registra el despacho al bote.', 'Dispatch to the box first.')}</p> : (
          <>
            <Field label={L('¿Cuántas quedaron sin vender? (conteo)', 'How many left unsold?')}><Stepper value={returned} onChange={setReturned} /></Field>
            <Field label={L('¿Cuánto llegó por Nequi?', 'How much arrived via Nequi?')} hint={L('Revisa el extracto de Nequi del periodo.', 'Check the Nequi statement.')}>
              <NumInput value={received} onChange={setReceived} step="500" placeholder="$" />
            </Field>
            <div className="grid2">
              <div className="stat"><div className="k">{L('Debía llegar', 'Expected')}</div><div className="v">{money(rec.expected)}</div></div>
              <div className="stat"><div className="k">{L('Diferencia', 'Difference')}</div><div className="v" style={{ color: rec.difference > 0 ? 'var(--bad)' : 'var(--good)' }}>{money(rec.difference)}</div></div>
            </div>
            {rec.missingUnits > 0 && <Notice tone="warn">{L(`Se registrarán ${rec.missingUnits} como merma "Faltante del bote".`, `${rec.missingUnits} will be logged as shortfall.`)}</Notice>}
            {err && <Notice tone="bad">{err}</Notice>}
            <button className="btn block big" disabled={received === ''} onClick={save}>{L('Guardar cuadre', 'Save')}</button>
          </>
        )}
      </Card>
      <h3>{L('Cuadres anteriores', 'Past reconciliations')}</h3>
      <Card>
        {sessions.length === 0 ? <p className="muted small">{L('Aún no hay cuadres.', 'None yet.')}</p> : (
          <table className="list"><tbody>
            {[...sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10).map(s => (
              <tr key={s.id}><td>{date(s.createdAt)}</td><td>{s.unitsPlaced - s.unitsReturned} {L('vendidas', 'sold')}</td><td className="n">{money(s.receivedAmount)}</td>
                <td className="n">{s.difference > 0 ? <span className="badge bad">−{money(s.difference)}</span> : <span className="badge good">OK</span>}</td></tr>
            ))}
          </tbody></table>
        )}
      </Card>
    </>
  );
}

function Pago({ unpaid }) {
  const { L, money, date } = useI18n();
  const cat = useCatalog();
  const { run } = useOps();
  const costs = useCostModel();
  const others = cat.channels.filter(c => c.type !== 'bote_confianza');
  const [channelId, setChannelId] = useState(others[0]?.id || '');
  const open = useMemo(() => unpaid.filter(d => d.channelId === channelId), [unpaid, channelId]);
  const [sel, setSel] = useState({});
  const chosen = open.filter(d => sel[d.id]);
  const due = chosen.reduce((s, d) => s + (d.total || 0), 0);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('nequi');
  const [err, setErr] = useState('');

  function save() {
    setErr('');
    try {
      const value = amount === '' ? due : Number(amount);
      const costInfo = costs.costInfoForDispatches(chosen);
      const res = run(ctx => registerPayment({ channelId, amount: value, method, dispatchIds: chosen.map(d => d.id) }, ctx, costInfo));
      toast(L(`Pago guardado: ${money(value)}`, 'Payment saved'));
      if (res.mode === 'fijo' && cat.settings.fundMode === 'costo_real') toast(L('Faltan costos de compra: se repartió por porcentaje fijo', 'Missing costs: split by fixed %'), 'error');
      setSel({}); setAmount('');
    } catch (e) { setErr(e.message); }
  }

  return (
    <Card>
      <Seg value={channelId} onChange={v => { setChannelId(v); setSel({}); }} options={others.map(c => ({ value: c.id, label: c.name }))} />
      <h3>{L('Despachos por cobrar', 'Unpaid dispatches')}</h3>
      {open.length === 0 ? <p className="muted small">{L('Nada pendiente con este cliente.', 'Nothing pending.')}</p> : open.map(d => (
        <label key={d.id} className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <input type="checkbox" style={{ width: 28, minHeight: 28 }} checked={!!sel[d.id]} onChange={e => setSel(s => ({ ...s, [d.id]: e.target.checked }))} />
          <span className="grow">{date(d.dispatchedAt)} · {d.items.reduce((s, i) => s + i.qty, 0)} {L('und', 'pcs')}</span>
          <strong>{money(d.total)}</strong>
        </label>
      ))}
      <div className="grid2" style={{ marginTop: 10 }}>
        <Field label={L('Monto recibido', 'Amount received')}><NumInput value={amount} onChange={setAmount} placeholder={String(due || '')} step="500" /></Field>
        <Field label={L('Medio', 'Method')}>
          <select value={method} onChange={e => setMethod(e.target.value)}>
            <option value="nequi">Nequi</option><option value="efectivo">{L('Efectivo', 'Cash')}</option><option value="transferencia">{L('Transferencia', 'Transfer')}</option>
          </select>
        </Field>
      </div>
      {err && <Notice tone="bad">{err}</Notice>}
      <button className="btn block big" disabled={!(amount !== '' ? Number(amount) > 0 : due > 0)} onClick={save}>{L('Guardar pago', 'Save payment')}</button>
      <p className="small muted">{L('Cada pago se reparte solo en los 4 fondos.', 'Each payment is split into the 4 funds.')}</p>
    </Card>
  );
}
