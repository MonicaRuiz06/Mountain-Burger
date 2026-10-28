import React, { useState } from 'react';
import { useCatalog, useOps, useCol, toast } from './store.jsx';
import { registerDispatch } from './ops.js';
import { currentPrice } from './costing.js';
import { useI18n } from './i18n.jsx';
import { Card, Seg, Stepper, Notice } from './kit.jsx';

/** Salida de hamburguesas de la nevera a un canal (RF-10). */
export default function Dispatch() {
  const { L, money, date, time } = useI18n();
  const cat = useCatalog();
  const { run } = useOps();
  const products = cat.products.filter(p => p.kind !== 'proceso_interno');
  const [productId, setProductId] = useState(cat.settings.burgerProductId || products[0]?.id || '');
  const [channelId, setChannelId] = useState(cat.channels[0]?.id || '');
  const [qty, setQty] = useState(10);
  const [err, setErr] = useState('');
  const [recent] = useCol('dispatches', { orderBy: ['dispatchedAt', 'desc'], limit: 10 });
  const onHand = cat.finishedOf(productId);
  const price = currentPrice(cat.prices, productId, channelId);

  function save() {
    setErr('');
    try {
      const res = run(ctx => registerDispatch({ channelId, items: [{ productId, qty }] }, ctx));
      toast(L(`Despachadas ${qty} · ${money(res.total)}`, `Dispatched ${qty}`));
      if (res.missingPrice) toast(L('Este canal no tiene precio configurado', 'No price set for this channel'), 'error');
    } catch (e) { setErr(e.message); }
  }

  return (
    <>
      <h2>{L('Despachar', 'Dispatch')}</h2>
      <Card>
        <p className="small muted">{L('¿Para quién?', 'For whom?')}</p>
        <Seg value={channelId} onChange={setChannelId} options={cat.channels.map(c => ({ value: c.id, label: c.name }))} />
        {products.length > 1 && <><p className="small muted" style={{ marginTop: 12 }}>{L('¿Cuál?', 'Which?')}</p>
        <Seg value={productId} onChange={setProductId} options={products.map(p => ({ value: p.id, label: p.name }))} /></>}
        <p className="small muted" style={{ marginTop: 12 }}>{L(`¿Cuántas? (en nevera: ${onHand})`, `How many? (in fridge: ${onHand})`)}</p>
        <Stepper value={qty} onChange={setQty} min={1} />
        <div className="row" style={{ marginTop: 10 }}>
          <span className="grow muted">{price == null ? L('Sin precio para este canal', 'No price') : `${money(price)} × ${qty || 0}`}</span>
          <strong style={{ fontSize: '1.3em' }}>{money((price || 0) * (qty || 0))}</strong>
        </div>
        {err && <Notice tone="bad">{err}</Notice>}
        <button className="btn block big" style={{ marginTop: 10 }} disabled={!channelId || !(qty > 0) || qty > onHand} onClick={save}>{L('Registrar despacho', 'Log dispatch')}</button>
      </Card>

      <h3>{L('Últimos despachos', 'Recent dispatches')}</h3>
      <Card>
        {recent.length === 0 ? <p className="muted small">{L('Aún no hay despachos.', 'None yet.')}</p> : (
          <table className="list"><tbody>
            {recent.map(d => (
              <tr key={d.id}>
                <td>{date(d.dispatchedAt)} {time(d.dispatchedAt)}</td>
                <td>{cat.channels.find(c => c.id === d.channelId)?.name}<div className="small muted">{d.items.map(i => cat.products.find(p => p.id === i.productId)?.name).join(', ')}</div></td>
                <td className="n">{d.items.reduce((s, i) => s + i.qty, 0)}</td>
                <td className="n">{d.paid ? <span className="badge good">{L('Pagado', 'Paid')}</span> : <span className="badge warn">{L('Por cobrar', 'Unpaid')}</span>}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </Card>
    </>
  );
}
