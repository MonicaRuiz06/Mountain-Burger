import React, { useState } from 'react';
import { useCatalog, useOps, toast } from './store.jsx';
import { saveDoc } from './ops.js';
import { activeRecipe } from './recipe.js';
import { UNITS } from './units.js';
import { currentPrice } from './costing.js';
import { useI18n, ROLES } from './i18n.jsx';
import { Card, Field, NumInput, Select, Tabs, Notice } from './kit.jsx';
import { EntityEditor } from './EntityEditor.jsx';
import { localDay } from './dates.js';

const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function Catalog() {
  const { L } = useI18n();
  const [tab, setTab] = useState('recetas');
  return (
    <>
      <h2>{L('Catálogo', 'Catalog')}</h2>
      <Tabs value={tab} onChange={setTab} options={[
        { value: 'recetas', label: L('Recetas', 'Recipes') },
        { value: 'insumos', label: L('Insumos', 'Ingredients') },
        { value: 'proveedores', label: L('Proveedores', 'Suppliers') },
        { value: 'canales', label: L('Compradores y precios', 'Buyers & prices') },
        { value: 'usuarios', label: L('Usuarios', 'Users') }
      ]} />
      {tab === 'recetas' && <Recipes />}
      {tab === 'insumos' && <Ingredients />}
      {tab === 'proveedores' && <Suppliers />}
      {tab === 'canales' && <Channels />}
      {tab === 'usuarios' && <Users />}
    </>
  );
}

/* ---------- Recetas / BOM (RF-01) ---------- */
function Recipes() {
  const { L, num } = useI18n();
  const cat = useCatalog();
  const { run } = useOps();
  const [productId, setProductId] = useState(cat.settings.burgerProductId || cat.products[0]?.id || '');
  const current = activeRecipe(cat.recipes, productId);
  const [draft, setDraft] = useState(null);
  const items = draft?.items || current?.items || [];
  const edit = (i, patch) => setDraft(d => ({ items: (d?.items || current?.items || []).map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  function saveVersion() {
    const version = (current?.version || 0) + 1;
    run(ctx => ({ ops: [
      ...(current ? saveDoc('recipes', current.id, { active: false, validTo: localDay(ctx.now) }, ctx).ops : []),
      ...saveDoc('recipes', `${productId}-v${version}`, { productId, version, items: items.filter(i => i.ingredientId), yieldQty: 1, validFrom: localDay(ctx.now), active: true, createdAt: ctx.now }, ctx).ops
    ] }));
    toast(L(`Receta guardada como versión ${version}`, `Saved as version ${version}`));
    setDraft(null);
  }

  return (
    <>
      <Field label={L('Producto', 'Product')}><Select value={productId} onChange={v => { setProductId(v); setDraft(null); }} options={cat.products.map(p => ({ value: p.id, label: p.name }))} /></Field>
      <Card title={current ? L(`Receta v${current.version}`, `Recipe v${current.version}`) : L('Sin receta', 'No recipe')} right={draft && <span className="badge warn">{L('Sin guardar', 'Unsaved')}</span>}>
        <p className="small muted">{L('Cantidades por 1 unidad. Las que están en 0 faltan por configurar.', 'Per 1 unit. Zero = not configured.')}</p>
        {items.map((it, i) => {
          const ing = cat.ingredientsById[it.ingredientId];
          const units = ing ? [ing.baseUnit, ...Object.keys(ing.conversions || {}), ...UNITS.filter(u => u.dimension === UNITS.find(x => x.code === ing.baseUnit)?.dimension).map(u => u.code)].filter((v, k, a) => a.indexOf(v) === k) : [];
          return (
            <div key={i} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
              <Select value={it.ingredientId} onChange={v => edit(i, { ingredientId: v, unitCode: cat.ingredientsById[v]?.baseUnit })} placeholder={L('Insumo…', 'Item…')} options={cat.ingredients.map(g => ({ value: g.id, label: g.name }))} />
              <div className="grid3" style={{ marginTop: 6 }}>
                <NumInput value={it.qty} onChange={v => edit(i, { qty: v })} aria-label="cantidad" style={{ borderColor: !Number(it.qty) ? 'var(--warn)' : undefined }} />
                <Select value={it.unitCode} onChange={v => edit(i, { unitCode: v })} options={units.map(u => ({ value: u, label: u }))} />
                <button className="btn ghost" onClick={() => setDraft({ items: items.filter((_, j) => j !== i) })}>{L('Quitar', 'Remove')}</button>
              </div>
              <div className="small muted" style={{ marginTop: 4 }}>{L('Merma %', 'Waste %')}: <input style={{ width: 80, minHeight: 32, display: 'inline-block' }} type="number" value={it.wastePct ?? 0} onChange={e => edit(i, { wastePct: Number(e.target.value) })} /></div>
            </div>
          );
        })}
        <button className="btn secondary block" style={{ marginTop: 10 }} onClick={() => setDraft({ items: [...items, { ingredientId: '', qty: 0, unitCode: '', wastePct: 0 }] })}>+ {L('Insumo', 'Ingredient')}</button>
        <button className="btn block" style={{ marginTop: 8 }} disabled={!draft} onClick={saveVersion}>{L('Guardar como nueva versión', 'Save as new version')}</button>
        <p className="small muted">{L('Las producciones anteriores conservan la versión con la que se hicieron.', 'Past production keeps its version.')}</p>
      </Card>
      <EntityEditor col="products" title={L('Productos', 'Products')} items={cat.products}
        idFor={d => slug(d.name)}
        fields={[
          { key: 'name', label: L('Nombre', 'Name'), required: true },
          { key: 'sku', label: 'SKU' },
          { key: 'kind', label: L('Tipo', 'Type'), type: 'select', required: true, options: [{ value: 'venta', label: L('Se vende', 'For sale') }, { value: 'proceso_interno', label: L('Proceso interno (ej. cierre)', 'Internal process') }] }
        ]}
        newDefaults={{ kind: 'venta' }}
        columns={[{ label: L('Producto', 'Product'), render: p => p.name }, { label: L('Tipo', 'Type'), render: p => (p.kind === 'venta' ? L('Venta', 'Sale') : L('Interno', 'Internal')) }]} />
    </>
  );
}

/* ---------- Insumos y conversiones ---------- */
function Ingredients() {
  const { L, num } = useI18n();
  const cat = useCatalog();
  const unitOpts = UNITS.map(u => ({ value: u.code, label: `${u.code} (${u.name})` }));
  return (
    <EntityEditor col="ingredients" title={L('Insumos', 'Ingredients')} items={[...cat.ingredients]}
      idFor={d => slug(d.name)}
      newDefaults={{ category: 'materia_prima', baseUnit: 'g', purchaseUnit: 'kg', purchaseStep: 1, minStock: 0, trackBySupplier: false, conversions: {} }}
      fields={[
        { key: 'name', label: L('Nombre', 'Name'), required: true },
        { key: 'category', label: L('Categoría', 'Category'), type: 'select', options: ['materia_prima', 'empaque', 'especia', 'limpieza'].map(v => ({ value: v, label: v.replace('_', ' ') })) },
        { key: 'baseUnit', label: L('Unidad de la receta (base)', 'Recipe (base) unit'), type: 'select', options: unitOpts, required: true },
        { key: 'purchaseUnit', label: L('Unidad en que se compra', 'Purchase unit'), type: 'select', options: unitOpts },
        { key: 'purchaseStep', label: L('Se compra de a (redondeo)', 'Buy in steps of'), type: 'number', hint: L('Ej.: 0.5 kg, 1 paquete', 'e.g. 0.5 kg') },
        { key: 'countUnit', label: L('Unidad de conteo físico (opcional)', 'Count unit (optional)'), type: 'select', options: unitOpts, hint: L('Ej.: tomate se compra en kg pero se cuentan tomates', 'e.g. tomatoes counted') },
        { key: 'minStock', label: L('Stock mínimo (en unidad base)', 'Min stock (base unit)'), type: 'number' },
        { key: 'trackBySupplier', label: L('¿Se rastrea por carnicería? (la carne)', 'Track by supplier?'), type: 'bool' }
      ]}
      renderExtra={(e, setE) => <Conversions e={e} setE={setE} />}
      columns={[
        { label: L('Insumo', 'Item'), render: i => i.name },
        { label: L('Base', 'Base'), render: i => i.baseUnit },
        { label: L('Conversiones', 'Conversions'), render: i => Object.entries(i.conversions || {}).filter(([, v]) => v).map(([u, v]) => `1 ${u} = ${num(v, 2)} ${i.baseUnit}`).join(' · ') || <span className="muted">—</span> }
      ]} />
  );
}

function Conversions({ e, setE }) {
  const { L } = useI18n();
  const conv = e.conversions || {};
  const [u, setU] = useState('');
  const [f, setF] = useState('');
  return (
    <Card title={L('Conversiones propias', 'Own conversions')}>
      <p className="small muted">{L(`Cuántas ${e.baseUnit || 'unidades base'} trae 1 unidad. Ej.: 1 tomate = 8 rebanadas; 1 rollo = 3000 cm.`, 'How many base units in 1 unit.')}</p>
      {Object.entries(conv).map(([k, v]) => (
        <div key={k} className="row" style={{ marginBottom: 6 }}>
          <span style={{ width: 90 }}>1 {k} =</span>
          <div className="grow"><NumInput value={v ?? ''} onChange={val => setE(x => ({ ...x, conversions: { ...x.conversions, [k]: val === '' ? null : val } }))} /></div>
          <span>{e.baseUnit}</span>
        </div>
      ))}
      <div className="row">
        <div style={{ width: 110 }}><Select value={u} onChange={setU} placeholder={L('unidad', 'unit')} options={UNITS.map(x => ({ value: x.code, label: x.code }))} /></div>
        <div className="grow"><NumInput value={f} onChange={setF} placeholder={e.baseUnit} /></div>
        <button className="btn secondary" disabled={!u || !(Number(f) > 0)} onClick={() => { setE(x => ({ ...x, conversions: { ...(x.conversions || {}), [u]: Number(f) } })); setU(''); setF(''); }}>+</button>
      </div>
    </Card>
  );
}

/* ---------- Proveedores y variantes (RF-02) ---------- */
function Suppliers() {
  const { L, num } = useI18n();
  const cat = useCatalog();
  const name = id => cat.ingredientsById[id]?.name || id;
  const sup = id => cat.suppliers.find(s => s.id === id)?.name || id;
  const ingOpts = cat.ingredients.map(i => ({ value: i.id, label: i.name }));
  return (
    <>
      <EntityEditor col="suppliers" title={L('Proveedores', 'Suppliers')} items={cat.suppliers} idFor={d => slug(d.name)}
        fields={[{ key: 'name', label: L('Nombre', 'Name'), required: true }, { key: 'phone', label: L('Teléfono', 'Phone') }, { key: 'sellsMeat', label: L('¿Vende carne?', 'Sells meat?'), type: 'bool' }, { key: 'notes', label: L('Notas', 'Notes') }]}
        columns={[{ label: L('Proveedor', 'Supplier'), render: s => s.name }, { label: L('Notas', 'Notes'), render: s => <span className="small muted">{s.notes}</span> }]} />
      <EntityEditor col="supplier_ingredient_variants" title={L('Reglas por proveedor', 'Supplier rules')} items={cat.variants}
        newDefaults={{ triggerIngredientId: 'carne-molida', qtyPerBaseOfTrigger: 0 }}
        fields={[
          { key: 'supplierId', label: L('Proveedor', 'Supplier'), type: 'select', required: true, options: cat.suppliers.map(s => ({ value: s.id, label: s.name })) },
          { key: 'triggerIngredientId', label: L('Cuando se usa', 'When using'), type: 'select', required: true, options: ingOpts },
          { key: 'extraIngredientId', label: L('Descontar también', 'Also deduct'), type: 'select', required: true, options: ingOpts },
          { key: 'qtyPerBaseOfTrigger', label: L('Cantidad por cada unidad base del primero', 'Qty per base unit of the first'), type: 'number', hint: L('Ej.: 0.01 = 10 g de sal por kilo de carne', 'e.g. 0.01 = 10 g per kg') }
        ]}
        columns={[
          { label: L('Proveedor', 'Supplier'), render: v => sup(v.supplierId) },
          { label: L('Regla', 'Rule'), render: v => <span>{name(v.extraIngredientId)}: {Number(v.qtyPerBaseOfTrigger) ? `${num(v.qtyPerBaseOfTrigger * 1000, 2)} ${cat.ingredientsById[v.extraIngredientId]?.baseUnit} / 1000 ${cat.ingredientsById[v.triggerIngredientId]?.baseUnit}` : <span className="badge warn">{L('por configurar', 'to set')}</span>}</span> }
        ]} />
    </>
  );
}

/* ---------- Compradores y precios (RF-03) ---------- */
function Channels() {
  const { L, money, date } = useI18n();
  const cat = useCatalog();
  const types = [{ value: 'parque', label: L('Venta directa / parque', 'Direct') }, { value: 'bote_confianza', label: L('Bote de confianza (QR)', 'Honesty box') }, { value: 'mayorista_vending', label: L('Mayorista / máquinas', 'Wholesale') }];
  const sellable = cat.products.filter(p => p.kind !== 'proceso_interno');
  return (
    <>
      <EntityEditor col="clients_channels" title={L('Compradores y canales', 'Buyers & channels')} items={cat.channels} idFor={d => slug(d.name)} addLabel={L('Comprador', 'Buyer')}
        newDefaults={{ type: 'mayorista_vending', paymentTermsDays: 0 }}
        fields={[
          { key: 'name', label: L('Nombre', 'Name'), required: true },
          { key: 'type', label: L('Tipo', 'Type'), type: 'select', required: true, options: types },
          { key: 'phone', label: L('Teléfono', 'Phone') },
          { key: 'paymentTermsDays', label: L('Días para pagar', 'Payment terms (days)'), type: 'number' }
        ]}
        columns={[
          { label: L('Comprador', 'Buyer'), render: c => c.name },
          { label: L('Tipo', 'Type'), render: c => types.find(t => t.value === c.type)?.label },
          ...sellable.map(p => ({ label: p.name, n: true, render: c => money(currentPrice(cat.prices, p.id, c.id)) }))
        ]} />
      <EntityEditor col="custom_prices" title={L('Precios por comprador', 'Prices by buyer')} items={[...cat.prices].sort((a, b) => (b.validFrom || '').localeCompare(a.validFrom || ''))}
        addLabel={L('Precio', 'Price')}
        newDefaults={{ productId: cat.settings.burgerProductId, validFrom: localDay() }}
        fields={[
          { key: 'productId', label: L('Producto', 'Product'), type: 'select', required: true, options: sellable.map(p => ({ value: p.id, label: p.name })) },
          { key: 'channelId', label: L('Comprador', 'Buyer'), type: 'select', required: true, options: cat.channels.map(c => ({ value: c.id, label: c.name })) },
          { key: 'price', label: L('Precio por unidad', 'Unit price'), type: 'number', step: 100, required: true },
          { key: 'validFrom', label: L('Desde', 'From'), type: 'date', required: true, hint: L('Para cambiar un precio, agrega uno nuevo con fecha de hoy: el historial se conserva.', 'Add a new one to change.') }
        ]}
        columns={[
          { label: L('Comprador', 'Buyer'), render: p => cat.channels.find(c => c.id === p.channelId)?.name || p.channelId },
          { label: L('Desde', 'From'), render: p => date(p.validFrom + 'T12:00:00') },
          { label: L('Precio', 'Price'), n: true, render: p => money(p.price) }
        ]} />
    </>
  );
}

/* ---------- Usuarios y roles ---------- */
function Users() {
  const { L } = useI18n();
  const cat = useCatalog();
  return (
    <>
      <Notice>{L('Cada persona crea su cuenta, verifica su correo y entra una vez a la app; ahí aparece en esta lista y le asignas el rol. Si alguien no aparece, todavía no ha verificado su correo o no ha vuelto a entrar.', 'People sign up and verify their email; then they show up here.')}</Notice>
      <EntityEditor col="users" title={L('Usuarios', 'Users')} items={cat.users} noAdd
        fields={[
          { key: 'name', label: L('Nombre', 'Name'), required: true },
          { key: 'role', label: L('Rol', 'Role'), type: 'select', required: true, options: Object.entries(ROLES).map(([k, v]) => ({ value: k, label: L(v[0], v[1]) })) }
        ]}
        columns={[{ label: L('Nombre', 'Name'), render: u => u.name }, { label: L('Correo', 'Email'), render: u => <span className="small">{u.email}</span> }, { label: L('Rol', 'Role'), render: u => <span className={'badge ' + (u.role === 'pendiente' ? 'warn' : '')}>{L(...(ROLES[u.role] || [u.role]))}</span> }]} />
    </>
  );
}
