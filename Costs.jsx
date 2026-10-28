import React, { useState } from 'react';
import { useCatalog, useOps, useCol, toast } from './store.jsx';
import { registerExpense } from './ops.js';
import { useCostModel } from './costs.js';
import { wattsFrom, currentPrice } from './costing.js';
import { useI18n } from './i18n.jsx';
import { Card, Field, NumInput, Select, Seg, Tabs, Notice, Modal } from './kit.jsx';
import { activeRecipe } from './recipe.js';
import { EntityEditor } from './EntityEditor.jsx';
import { localDay } from './dates.js';

/** Costo completo por hamburguesa (RF-17) y costos indirectos. */
export default function Costs() {
  const { L } = useI18n();
  const [tab, setTab] = useState('unit');
  return (
    <>
      <h2>{L('Costos', 'Costs')}</h2>
      <Tabs value={tab} onChange={setTab} options={[
        { value: 'unit', label: L('Costo por hamburguesa', 'Unit cost') },
        { value: 'energy', label: L('Parrilla y luz', 'Grill & power') },
        { value: 'expenses', label: L('Gastos de la casa', 'House expenses') }
      ]} />
      {tab === 'unit' && <UnitCost />}
      {tab === 'energy' && <Energy />}
      {tab === 'expenses' && <Expenses />}
    </>
  );
}

function UnitCost() {
  const { L, money, num } = useI18n();
  const cat = useCatalog();
  const cm = useCostModel();
  const products = cat.products.filter(p => p.kind !== 'proceso_interno');
  const [productId, setProductId] = useState(cm.burgerId);
  const recipe = activeRecipe(cat.recipes, productId);
  const usesMeat = (recipe?.items || []).some(i => cat.ingredientsById[i.ingredientId]?.trackBySupplier);
  // Con carne de res: una columna por carnicería. Sin ella (ej. pollo): una sola columna.
  const meat = usesMeat ? cat.suppliers.filter(s => s.sellsMeat) : [{ id: null, name: L('Costo', 'Cost') }];
  const rows = meat.map(s => ({ s, c: cm.unitCost(productId, s.id) })).filter(r => r.c);
  const [open, setOpen] = useState(null);
  const picker = products.length > 1 && <Seg value={productId} onChange={setProductId} options={products.map(p => ({ value: p.id, label: p.name }))} />;
  if (!rows.length) return <>{picker}<Notice tone="warn">{L('Este producto no tiene receta todavía.', 'No recipe yet.')}</Notice></>;
  const ref = rows[0].c;
  const parts = [
    ['materials', L('Insumos y empaque', 'Ingredients & packaging')],
    ['commission', L('Comisión cocina', 'Kitchen commission')],
    ['energy', L('Luz de la parrilla', 'Grill power')],
    ['cleaning', L('Limpieza de cierre', 'Closing clean-up')],
    ['overhead', L('Gastos de la casa', 'House expenses')]
  ];

  return (
    <>
      {picker}
      <Card title={L('Costo completo por unidad', 'Full unit cost')}>
        <div className="scroll-x">
          <table className="list">
            <thead><tr><th></th>{rows.map(r => <th key={r.s.id} className="n">{r.s.name.replace('Carnicería de ', '')}</th>)}</tr></thead>
            <tbody>
              {parts.map(([k, label]) => (
                <tr key={k}><td>{label}{k === 'energy' && ref.pending.energy && <div><span className="badge warn">{L('falta tiempo de cocción', 'cook time missing')}</span></div>}{k === 'cleaning' && ref.pending.cleaning && <div><span className="badge warn">{L('se calcula con la producción', 'needs production data')}</span></div>}</td>
                  {rows.map(r => <td key={r.s.id} className="n">{money(r.c[k])}</td>)}</tr>
              ))}
              <tr><td><strong>{L('Total', 'Total')}</strong></td>{rows.map(r => <td key={r.s.id} className="n"><strong>{money(r.c.total)}</strong></td>)}</tr>
            </tbody>
          </table>
        </div>
        {ref.missing.length > 0 && <Notice tone="warn">{L('Sin precio de compra todavía', 'No purchase price yet')}: {ref.missing.map(id => cat.ingredientsById[id]?.name).join(', ')}. {L('Se llena solo al registrar compras.', 'Fills in with purchases.')}</Notice>}
        <button className="btn ghost" onClick={() => setOpen(rows[0])}>{L('Ver detalle de insumos', 'Ingredient detail')}</button>
      </Card>

      <Card title={L('Margen por comprador', 'Margin by buyer')}>
        <table className="list">
          <thead><tr><th>{L('Comprador', 'Buyer')}</th><th className="n">{L('Precio', 'Price')}</th><th className="n">{L('Margen', 'Margin')}</th></tr></thead>
          <tbody>
            {cat.channels.map(ch => {
              const p = currentPrice(cat.prices, productId, ch.id);
              const worst = Math.max(...rows.map(r => r.c.total));
              const m = p == null ? null : p - worst;
              return <tr key={ch.id}><td>{ch.name}</td><td className="n">{money(p)}</td>
                <td className="n" style={{ color: m == null ? undefined : m < 0 ? 'var(--bad)' : 'var(--good)' }}>{m == null ? '—' : `${money(m)} · ${num((m / p) * 100, 0)}%`}</td></tr>;
            })}
          </tbody>
        </table>
        <p className="small muted">{L('Calculado con la carnicería más cara.', 'Using the most expensive butcher.')}</p>
      </Card>

      <Modal open={!!open} onClose={() => setOpen(null)} title={L('Insumos por unidad', 'Per-unit ingredients')}>
        {open && <table className="list"><tbody>
          {open.c.lines.map(l => {
            const ing = cat.ingredientsById[l.ingredientId];
            return <tr key={l.ingredientId}><td>{ing?.name}</td><td className="n">{num(l.qtyBase, 2)} {ing?.baseUnit}</td><td className="n">{money(l.qtyBase * (cm.avg[l.ingredientId] ?? NaN))}</td></tr>;
          })}
        </tbody></table>}
      </Modal>
    </>
  );
}

function Energy() {
  const { L, money, num } = useI18n();
  const cat = useCatalog();
  const cm = useCostModel();
  const [rates] = useCol('utility_rates');
  const eqName = id => cat.equipment.find(e => e.id === id)?.name || id;
  return (
    <>
      <Notice>{L('La luz por hamburguesa = vatios × minutos por tanda ÷ hamburguesas por tanda × precio del kWh.', 'Power per burger = W × minutes ÷ burgers per batch × kWh price.')}</Notice>
      <EntityEditor col="equipment" title={L('Equipos', 'Equipment')} items={cat.equipment}
        newDefaults={{ resource: 'electricidad', volts: 110 }}
        fields={[
          { key: 'name', label: L('Nombre', 'Name'), required: true },
          { key: 'watts', label: L('Vatios (W)', 'Watts'), type: 'number', hint: L('Si la etiqueta trae amperios, deja esto vacío y llena voltios y amperios.', 'Or fill volts and amps.') },
          { key: 'volts', label: L('Voltios', 'Volts'), type: 'number' },
          { key: 'amps', label: L('Amperios', 'Amps'), type: 'number' }
        ]}
        columns={[{ label: L('Equipo', 'Equipment'), render: e => e.name }, { label: 'W', n: true, render: e => num(wattsFrom(e)) }]} />
      <EntityEditor col="cooking_profiles" title={L('Tiempo de cocción por carne', 'Cook time by meat')} items={cat.cookingProfiles}
        newDefaults={{ productId: cm.burgerId, equipmentId: cat.equipment[0]?.id }}
        fields={[
          { key: 'productId', label: L('Producto', 'Product'), type: 'select', required: true, options: cat.products.filter(p => p.kind !== 'proceso_interno').map(p => ({ value: p.id, label: p.name })) },
          { key: 'supplierId', label: L('Carne de (si aplica)', 'Meat from (if any)'), type: 'select', options: cat.suppliers.filter(s => s.sellsMeat).map(s => ({ value: s.id, label: s.name })) },
          { key: 'equipmentId', label: L('Equipo', 'Equipment'), type: 'select', required: true, options: cat.equipment.map(e => ({ value: e.id, label: e.name })) },
          { key: 'minutesPerBatch', label: L('Minutos por tanda', 'Minutes per batch'), type: 'number' },
          { key: 'unitsPerBatch', label: L('Hamburguesas por tanda', 'Burgers per batch'), type: 'number' }
        ]}
        columns={[
          { label: L('Producto', 'Product'), render: p => <>{cat.products.find(x => x.id === p.productId)?.name}{p.supplierId && <div className="small muted">{cat.suppliers.find(s => s.id === p.supplierId)?.name.replace('Carnicería de ', '')}</div>}</> },
          { label: L('Equipo', 'Equip.'), render: p => eqName(p.equipmentId) },
          { label: L('Tanda', 'Batch'), n: true, render: p => (p.minutesPerBatch && p.unitsPerBatch ? `${p.minutesPerBatch} min · ${p.unitsPerBatch}` : <span className="badge warn">{L('por llenar', 'to fill')}</span>) }
        ]} />
      <EntityEditor col="utility_rates" title={L('Tarifas', 'Rates')} items={[...rates].sort((a, b) => (b.validFrom || '').localeCompare(a.validFrom || ''))}
        newDefaults={{ resource: 'electricidad', unit: 'kWh', validFrom: localDay() }}
        fields={[
          { key: 'resource', label: L('Servicio', 'Utility'), type: 'select', required: true, options: [{ value: 'electricidad', label: L('Electricidad', 'Electricity') }, { value: 'agua', label: L('Agua', 'Water') }, { value: 'gas', label: 'Gas' }] },
          { key: 'unit', label: L('Unidad', 'Unit'), type: 'select', options: [{ value: 'kWh', label: 'kWh' }, { value: 'm3', label: 'm³' }] },
          { key: 'pricePerUnit', label: L('Precio por unidad', 'Price per unit'), type: 'number', required: true },
          { key: 'validFrom', label: L('Desde', 'From'), type: 'date', required: true },
          { key: 'notes', label: L('Notas', 'Notes') }
        ]}
        columns={[
          { label: L('Servicio', 'Utility'), render: r => r.resource },
          { label: L('Precio', 'Price'), n: true, render: r => <>{money(r.pricePerUnit)}/{r.unit}{r.approx && <div><span className="badge warn">{L('aprox.', 'approx.')}</span></div>}</> }
        ]} />
    </>
  );
}

function Expenses() {
  const { L, money, date } = useI18n();
  const { run } = useOps();
  const [list] = useCol('overhead_expenses');
  const [form, setForm] = useState(null);
  const month = localDay().slice(0, 7);
  const monthEnd = localDay(new Date(new Date(month + '-01T12:00:00').setMonth(new Date(month + '-01T12:00:00').getMonth() + 1) - 864e5));

  function save() {
    try {
      run(ctx => registerExpense(form, ctx));
      toast(L('Gasto registrado', 'Expense saved'));
      setForm(null);
    } catch (e) { toast(e.message, 'error'); }
  }

  return (
    <>
      <Notice>
        <strong>{L('Recomendación para casa compartida', 'Tip for a shared house')}</strong>
        <p className="small" style={{ margin: '6px 0 0' }}>{L(
          'Como la factura es de toda la casa, no la uses completa. Acuerda un aporte mensual fijo por servicios (agua y lo que no sea la parrilla) y regístralo aquí como gasto "por unidad": la app lo divide entre las hamburguesas del mes. La luz de la parrilla ya se calcula aparte con sus vatios. Los productos de limpieza se compran como insumos y se descuentan al cerrar la jornada.',
          'Agree a fixed monthly utilities contribution and log it here; the grill power is computed separately.')}</p>
      </Notice>
      <Card title={L('Gastos registrados', 'Expenses')} right={<button className="btn secondary" onClick={() => setForm({ concept: 'Aporte servicios casa', amount: '', allocation: 'por_unidad', periodStart: month + '-01', periodEnd: monthEnd })}>+ {L('Gasto', 'Expense')}</button>}>
        {list.length === 0 ? <p className="muted small">{L('Nada todavía.', 'Nothing yet.')}</p> : (
          <table className="list"><tbody>
            {[...list].sort((a, b) => (b.periodStart || '').localeCompare(a.periodStart || '')).map(e => (
              <tr key={e.id}><td>{e.concept}<div className="small muted">{date(e.periodStart + 'T12:00:00')} – {date(e.periodEnd + 'T12:00:00')}</div></td><td className="n">{money(e.amount)}</td></tr>
            ))}
          </tbody></table>
        )}
      </Card>
      <Modal open={!!form} onClose={() => setForm(null)} title={L('Nuevo gasto', 'New expense')}>
        {form && <>
          <Field label={L('Concepto', 'Concept')}>
            <Select value={form.concept} onChange={v => setForm(f => ({ ...f, concept: v }))} options={['Aporte servicios casa', 'Agua', 'Gas', 'Transporte', 'Otros'].map(v => ({ value: v, label: v }))} />
          </Field>
          <Field label={L('Monto', 'Amount')}><NumInput value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} step="1000" /></Field>
          <div className="grid2">
            <Field label={L('Desde', 'From')}><input type="date" value={form.periodStart} onChange={e => setForm(f => ({ ...f, periodStart: e.target.value }))} /></Field>
            <Field label={L('Hasta', 'To')}><input type="date" value={form.periodEnd} onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))} /></Field>
          </div>
          <Field label={L('Repartir', 'Allocate')}>
            <Select value={form.allocation} onChange={v => setForm(f => ({ ...f, allocation: v }))} options={[{ value: 'por_unidad', label: L('Entre las hamburguesas del periodo', 'Per burger') }, { value: 'por_lote', label: L('Entre las tandas', 'Per batch') }]} />
          </Field>
          <p className="small muted">{L('Sale del fondo de Gastos operativos.', 'Paid from Operating fund.')}</p>
          <button className="btn block" disabled={!(Number(form.amount) > 0)} onClick={save}>{L('Guardar', 'Save')}</button>
        </>}
      </Modal>
    </>
  );
}
