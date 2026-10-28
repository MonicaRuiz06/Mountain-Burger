import React, { useState } from 'react';
import { useCatalog, useOps, useCol, toast } from './store.jsx';
import { registerWaste } from './ops.js';
import { validWasteNote } from './production.js';
import { useI18n, REASONS } from './i18n.jsx';
import { Card, Field, NumInput, Select, Seg, Stepper, Notice } from './kit.jsx';

export default function Waste() {
  const { L, date, num } = useI18n();
  const cat = useCatalog();
  const { run } = useOps();
  const [kind, setKind] = useState('producto');
  const [productId, setProductId] = useState(cat.settings.burgerProductId || 'mountain-burger');
  const [ingredientId, setIngredientId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [qty, setQty] = useState(1);
  const [unitCode, setUnitCode] = useState('');
  const [reason, setReason] = useState('danado');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [recent] = useCol('waste_logs', { orderBy: ['loggedAt', 'desc'], limit: 10 });
  const ing = cat.ingredientsById[ingredientId];

  function save() {
    setErr('');
    try {
      run(ctx => registerWaste({ itemKind: kind, productId, ingredientId, supplierId: supplierId || null, qty, unitCode: unitCode || ing?.baseUnit, reason, note }, ctx));
      toast(L('Merma registrada', 'Waste logged'));
      setNote(''); setQty(1);
    } catch (e) { setErr(e.message); }
  }

  const sellable = cat.products.filter(p => p.kind !== 'proceso_interno');
  return (
    <>
      <h2>{L('Registrar merma', 'Log waste')}</h2>
      <p className="small muted">{L('Todo lo que sale sin venderse: regalos, consumo interno, dañado o vencido.', 'Anything that leaves without a sale.')}</p>
      <Card>
        <Seg value={kind} onChange={setKind} options={[{ value: 'producto', label: L('Hamburguesa armada', 'Finished burger') }, { value: 'insumo', label: L('Insumo', 'Ingredient') }]} />
        {kind === 'producto' ? (
          <>
            {sellable.length > 1 && <Field label={L('Producto', 'Product')}><Select value={productId} onChange={setProductId} options={sellable.map(p => ({ value: p.id, label: p.name }))} /></Field>}
            <Field label={L('Cantidad', 'Quantity')}><Stepper value={qty} onChange={setQty} min={1} /></Field>
            <p className="small muted">{L('En nevera', 'In fridge')}: {cat.finishedOf(productId)}</p>
          </>
        ) : (
          <>
            <Field label={L('Insumo', 'Ingredient')}><Select value={ingredientId} onChange={v => { setIngredientId(v); setUnitCode(''); }} placeholder={L('Elige…', 'Choose…')} options={cat.ingredients.map(i => ({ value: i.id, label: i.name }))} /></Field>
            {ing?.trackBySupplier && <Field label={L('Carnicería', 'Butcher')}><Select value={supplierId} onChange={setSupplierId} placeholder={L('Elige…', 'Choose…')} options={cat.suppliers.map(s => ({ value: s.id, label: s.name }))} /></Field>}
            <div className="grid2">
              <Field label={L('Cantidad', 'Quantity')}><NumInput value={qty} onChange={setQty} /></Field>
              <Field label={L('Unidad', 'Unit')}><Select value={unitCode || ing?.baseUnit || ''} onChange={setUnitCode} options={[ing?.baseUnit, ing?.purchaseUnit, ...Object.keys(ing?.conversions || {})].filter((v, i, a) => v && a.indexOf(v) === i).map(u => ({ value: u, label: u }))} /></Field>
            </div>
          </>
        )}
        <Field label={L('Motivo', 'Reason')}>
          <Select value={reason} onChange={setReason} options={Object.entries(REASONS).filter(([k]) => k !== 'faltante_confianza').map(([k, v]) => ({ value: k, label: L(v[0], v[1]) }))} />
        </Field>
        <Field label={L('Nota (obligatoria)', 'Note (required)')} hint={L('Mínimo 10 letras: qué pasó y por qué.', 'At least 10 characters.')}>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder={L('Ej.: se quemaron 2 en la parrilla', 'e.g. burned 2 on the grill')} />
        </Field>
        {err && <Notice tone="bad">{err}</Notice>}
        <button className="btn block big" disabled={!validWasteNote(note)} onClick={save}>{L('Guardar merma', 'Save')}</button>
      </Card>

      <h3>{L('Últimas mermas', 'Recent waste')}</h3>
      <Card>
        {recent.length === 0 ? <p className="muted small">{L('Nada registrado.', 'Nothing yet.')}</p> : (
          <table className="list"><tbody>
            {recent.map(w => (
              <tr key={w.id}>
                <td>{date(w.loggedAt)}</td>
                <td>{w.itemKind === 'producto' ? (cat.products.find(p => p.id === w.productId)?.name || '') : cat.ingredientsById[w.ingredientId]?.name}<div className="small muted">{w.note}</div></td>
                <td className="n">{num(w.qty)} {w.unitCode || ''}<div><span className="badge warn">{L(...(REASONS[w.reason] || [w.reason]))}</span></div></td>
              </tr>
            ))}
          </tbody></table>
        )}
      </Card>
    </>
  );
}
