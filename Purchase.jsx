import React, { useState } from 'react';
import { useCatalog, useOps, useCol, toast } from './store.jsx';
import { registerPurchase } from './ops.js';
import { useI18n } from './i18n.jsx';
import { Card, Field, NumInput, Select, Notice } from './kit.jsx';

const blank = () => ({ ingredientId: '', qty: '', unitCode: '', lineTotal: '', unitsCounted: '' });

/** Registro rápido de compras (RF-09), con conteo físico de unidades. */
export default function Purchase() {
  const { L, money, date } = useI18n();
  const cat = useCatalog();
  const { run } = useOps();
  const [supplierId, setSupplierId] = useState('');
  const [items, setItems] = useState([blank()]);
  const [err, setErr] = useState('');
  const [recent] = useCol('purchases', { orderBy: ['purchasedAt', 'desc'], limit: 8 });

  const upd = (i, patch) => setItems(list => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const total = items.reduce((s, x) => s + (Number(x.lineTotal) || 0), 0);
  const unitsFor = ing => [ing.purchaseUnit, ing.baseUnit, ing.countUnit, ...Object.keys(ing.conversions || {}), 'kg', 'g', 'lb']
    .filter((v, i, a) => v && a.indexOf(v) === i)
    .filter(u => ['kg', 'g', 'lb'].includes(u) ? ['g', 'kg', 'lb'].includes(ing.baseUnit) || ing.conversions?.[u] || ing.countUnit : true);

  function save() {
    setErr('');
    try {
      const clean = items.filter(x => x.ingredientId);
      const res = run(ctx => registerPurchase({ supplierId, items: clean.map(x => ({ ...x, unitCode: x.unitCode || cat.ingredientsById[x.ingredientId].purchaseUnit || cat.ingredientsById[x.ingredientId].baseUnit })) }, ctx));
      toast(L(`Compra guardada: ${money(res.total)}`, `Saved: ${money(res.total)}`));
      setItems([blank()]);
    } catch (e) { setErr(e.message); }
  }

  return (
    <>
      <h2>{L('Registrar compra', 'Log purchase')}</h2>
      <Card>
        <Field label={L('¿Dónde compraste?', 'Where?')}>
          <Select value={supplierId} onChange={setSupplierId} placeholder={L('Elige…', 'Choose…')} options={cat.suppliers.map(s => ({ value: s.id, label: s.name }))} />
        </Field>
      </Card>

      {items.map((x, i) => {
        const ing = cat.ingredientsById[x.ingredientId];
        const unit = x.unitCode || ing?.purchaseUnit || ing?.baseUnit || '';
        return (
          <Card key={i} title={`${L('Insumo', 'Item')} ${i + 1}`} right={items.length > 1 && <button className="btn ghost" onClick={() => setItems(l => l.filter((_, j) => j !== i))}>{L('Quitar', 'Remove')}</button>}>
            <Field label={L('Qué', 'What')}>
              <Select value={x.ingredientId} onChange={v => upd(i, { ingredientId: v, unitCode: '' })} placeholder={L('Elige…', 'Choose…')} options={cat.ingredients.map(g => ({ value: g.id, label: g.name }))} />
            </Field>
            {ing && (
              <>
                <div className="grid2">
                  <Field label={L('Cantidad', 'Qty')}><NumInput value={x.qty} onChange={v => upd(i, { qty: v })} /></Field>
                  <Field label={L('Unidad', 'Unit')}><Select value={unit} onChange={v => upd(i, { unitCode: v })} options={unitsFor(ing).map(u => ({ value: u, label: u }))} /></Field>
                </div>
                <Field label={L('Precio total pagado', 'Total paid')}><NumInput value={x.lineTotal} onChange={v => upd(i, { lineTotal: v })} step="50" placeholder="$" /></Field>
                {ing.countUnit && unit !== ing.countUnit && (
                  <Field label={L(`¿Cuántos ${ing.countUnit} salieron? (conteo)`, `How many ${ing.countUnit}? (count)`)} hint={L('Ej.: 1 kg de tomate = 7 tomates. Así se calcula el costo real por rebanada.', 'Physical count for real unit cost.')}>
                    <NumInput value={x.unitsCounted} onChange={v => upd(i, { unitsCounted: v })} step="1" />
                  </Field>
                )}
              </>
            )}
          </Card>
        );
      })}
      <button className="btn secondary block" onClick={() => setItems(l => [...l, blank()])}>+ {L('Otro insumo', 'Another item')}</button>

      <Card>
        <div className="row"><span className="grow">{L('Total', 'Total')}</span><span className="big-number">{money(total)}</span></div>
        <p className="small muted">{L('Sale del fondo de Resurtido.', 'Paid from the Restock fund.')}</p>
        {err && <Notice tone="bad">{err}</Notice>}
        <button className="btn block big" disabled={!items.some(x => x.ingredientId && x.qty)} onClick={save}>{L('Guardar compra', 'Save purchase')}</button>
      </Card>

      <h3>{L('Compras recientes', 'Recent purchases')}</h3>
      <Card>
        {recent.length === 0 ? <p className="muted small">{L('Aún no hay compras.', 'None yet.')}</p> : (
          <table className="list"><tbody>
            {recent.map(p => (
              <tr key={p.id}>
                <td>{date(p.purchasedAt)}</td>
                <td>{cat.suppliers.find(s => s.id === p.supplierId)?.name || '—'}<div className="small muted">{p.items.map(i => cat.ingredientsById[i.ingredientId]?.name).join(', ')}</div></td>
                <td className="n">{money(p.total)}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </Card>
    </>
  );
}
