import React, { useMemo, useState } from 'react';
import { useCatalog, useOps, useCol, toast } from './store.jsx';
import { registerProduction } from './ops.js';
import { activeRecipe } from './recipe.js';
import { openCommissions } from './production.js';
import { useI18n } from './i18n.jsx';
import { Card, Seg, Stepper, Notice, Stat, useConfirm } from './kit.jsx';
import { localDay } from './dates.js';

export default function Produce() {
  const { L, money, time } = useI18n();
  const cat = useCatalog();
  const { run } = useOps();
  const [ask, confirmUi] = useConfirm();
  // Si administración o logística registran por el cocinero, la comisión queda a nombre de él.
  const uid = cat.profile.role === 'cocina' ? cat.user.uid : (cat.users.find(u => u.role === 'cocina' && u.active !== false)?.id || cat.user.uid);
  const products = cat.products.filter(p => p.kind !== 'proceso_interno');
  const [productId, setProductId] = useState(cat.settings.burgerProductId || products[0]?.id || '');
  const lastSupplier = (() => { try { return localStorage.getItem('mb-last-supplier') || ''; } catch { return ''; } })();
  const [supplierId, setSupplierId] = useState(lastSupplier);
  const [qty, setQty] = useState(10);
  const [dest, setDest] = useState('nevera');
  const [err, setErr] = useState('');
  const today = localDay();
  const [mine] = useCol('productions', { where: [['cookId', '==', uid], ['settled', '==', false]] });
  const comm = useMemo(() => openCommissions(mine, uid, today), [mine, uid, today]);
  const todays = mine.filter(p => p.day === today && p.kind !== 'cierre').sort((a, b) => b.producedAt.localeCompare(a.producedAt));

  const recipe = activeRecipe(cat.recipes, productId);
  const needsMeat = recipe?.items?.some(i => cat.ingredientsById[i.ingredientId]?.trackBySupplier);
  const meatSuppliers = cat.suppliers.filter(s => s.sellsMeat);

  function save() {
    setErr('');
    try {
      const res = run(ctx => registerProduction({ productId, qty, meatSupplierId: needsMeat ? supplierId : null, destination: dest, cookId: uid }, ctx));
      try { localStorage.setItem('mb-last-supplier', supplierId); } catch { /* */ }
      toast(L(`Listo: ${qty} registradas · +${money(res.commission)}`, `Saved ${qty} · +${money(res.commission)}`));
      for (const w of res.warnings) toast(w, 'error');
    } catch (e) { setErr(e.message); }
  }

  function closeDay() {
    try {
      run(ctx => registerProduction({ productId: cat.settings.cierreProductId || 'cierre-jornada', qty: 1, cookId: uid }, ctx));
      toast(L('Cierre de jornada registrado (limpieza descontada)', 'Day closed'));
    } catch (e) { toast(e.message, 'error'); }
  }

  if (!cat.seeded) return <Notice tone="warn">{L('Falta cargar los datos iniciales (Administración → Ajustes).', 'Starter data missing.')}</Notice>;

  return (
    <>
      <h2>{L('Registrar producción', 'Log production')}</h2>
      <div className="grid2">
        <Stat k={L('Hoy', 'Today')} v={`${comm.todayUnits} · ${money(comm.todayAmount)}`} />
        <Stat k={L('Por cobrar', 'Unpaid')} v={money(comm.openAmount)} tone="good" />
      </div>

      <Card>
        {products.length > 1 && <Seg value={productId} onChange={setProductId} options={products.map(p => ({ value: p.id, label: p.name }))} />}
        {needsMeat && (
          <>
            <p className="small muted" style={{ marginTop: 4 }}>{L('¿De qué carnicería es la carne?', 'Which butcher?')}</p>
            <Seg value={supplierId} onChange={setSupplierId} options={meatSuppliers.map(s => ({ value: s.id, label: s.name.replace('Carnicería de ', '') }))} />
          </>
        )}
        <p className="small muted" style={{ marginTop: 12 }}>{L('¿Cuántas hiciste?', 'How many?')}</p>
        <Stepper value={qty} onChange={setQty} min={1} />
        <div className="seg" style={{ marginTop: 8 }}>
          {[10, 20, 30, 40].map(n => <button key={n} className="btn secondary" onClick={() => setQty(n)}>{n}</button>)}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>{L('¿A dónde van?', 'Where do they go?')}</p>
        <Seg value={dest} onChange={setDest} options={[{ value: 'nevera', label: L('Nevera', 'Fridge') }, { value: 'despacho_inmediato', label: L('Salen ya', 'Out now') }]} />
        {err && <Notice tone="bad">{err}</Notice>}
        <button className="btn block big" style={{ marginTop: 14 }} disabled={!(qty > 0) || (needsMeat && !supplierId)} onClick={save}>
          {L(`Registrar ${qty || 0}`, `Log ${qty || 0}`)}
        </button>
      </Card>

      <h3>{L('Hoy', 'Today')}</h3>
      <Card>
        {todays.length === 0 ? <p className="muted small">{L('Aún no hay producción hoy.', 'Nothing yet today.')}</p> : (
          <table className="list"><tbody>
            {todays.map(p => (
              <tr key={p.id}><td>{time(p.producedAt)}</td><td>{cat.suppliers.find(s => s.id === p.meatSupplierId)?.name.replace('Carnicería de ', '') || ''}</td><td className="n"><strong>{p.qty}</strong></td><td className="n">{money(p.qty * p.commissionSnapshot)}</td></tr>
            ))}
          </tbody></table>
        )}
      </Card>

      <button className="btn secondary block" onClick={() => ask(L('¿Terminaron y limpiaron? Se descuentan los productos de limpieza del día.', 'Finished and cleaned?'), closeDay)}>
        {L('Cerrar jornada (limpieza)', 'Close the day (cleaning)')}
      </button>
      {confirmUi}
    </>
  );
}
