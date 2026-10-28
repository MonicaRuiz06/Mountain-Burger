import React from 'react';
import { useCatalog, useCol } from './store.jsx';
import { useCostModel } from './costs.js';
import { lotStatus } from './production.js';
import { useI18n, REASONS } from './i18n.jsx';
import { Card, Stat, Notice } from './kit.jsx';
import { localDay } from './dates.js';

export default function Dashboard({ go }) {
  const { L, money, num, date } = useI18n();
  const cat = useCatalog();
  const cm = useCostModel();
  const today = localDay();
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const [balances] = useCol('fund_balances');
  const [payments] = useCol('payments', { where: [['receivedAt', '>=', weekAgo]] });
  const [dispatches] = useCol('dispatches', { where: [['dispatchedAt', '>=', weekAgo]] });
  const [waste] = useCol('waste_logs', { where: [['loggedAt', '>=', weekAgo]] });

  if (!cat.seeded) {
    return (
      <>
        <h2>{L('Bienvenida', 'Welcome')}</h2>
        <Notice tone="warn">{L('Primero carga los datos iniciales en Ajustes. Luego configura gramos y precios en Catálogo.', 'Load starter data in Settings first.')}</Notice>
        <button className="btn block" onClick={() => go('settings')}>{L('Ir a Ajustes', 'Go to Settings')}</button>
      </>
    );
  }

  const prodToday = cm.productions.filter(p => p.day === today && p.kind !== 'cierre').reduce((s, p) => s + p.qty, 0);
  const prodWeek = cm.productions.filter(p => p.producedAt >= weekAgo && p.kind !== 'cierre').reduce((s, p) => s + p.qty, 0);
  const sold = dispatches.reduce((s, d) => s + d.items.reduce((a, i) => a + i.qty, 0), 0);
  const income = payments.reduce((s, p) => s + p.amount, 0);
  const unpaid = dispatches.filter(d => !d.paid).reduce((s, d) => s + (d.total || 0), 0);
  const shelf = Number(cat.settings.shelfLifeDays) || 3;
  const expired = cat.lots.filter(l => lotStatus(l, shelf).expired).reduce((s, l) => s + l.remaining, 0);
  const low = cat.ingredients.filter(i => Number(i.minStock) > 0 && cat.stockTotal(i.id) < i.minStock);
  const negative = cat.ingredients.filter(i => cat.stockTotal(i.id) < 0);
  const uc = cm.unitCost(cm.burgerId, cat.suppliers.find(s => s.sellsMeat)?.id);
  const toConfigure = [
    ...cat.recipes.filter(r => r.active !== false).flatMap(r => (r.items || []).filter(i => !Number(i.qty)).map(i => cat.ingredientsById[i.ingredientId]?.name)),
    ...cat.variants.filter(v => !Number(v.qtyPerBaseOfTrigger)).map(v => `${cat.ingredientsById[v.extraIngredientId]?.name} (${L('regla La Abuela', 'butcher rule')})`),
    ...cat.cookingProfiles.filter(p => !p.minutesPerBatch || !p.unitsPerBatch).map(() => L('Tiempo de cocción', 'Cook time'))
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  return (
    <>
      <h2>{L('Resumen', 'Overview')}</h2>
      <div className="grid2">
        <Stat k={L('Producidas hoy', 'Made today')} v={prodToday} />
        <Stat k={L('En nevera', 'In fridge')} v={cat.finishedStock.reduce((s, f) => s + (Number(f.qty) || 0), 0)} />
        <Stat k={L('Producidas 7 días', 'Made 7 days')} v={prodWeek} />
        <Stat k={L('Despachadas 7 días', 'Dispatched 7 days')} v={sold} />
        <Stat k={L('Cobrado 7 días', 'Collected 7 days')} v={money(income)} tone="good" />
        <Stat k={L('Por cobrar', 'Receivable')} v={money(unpaid)} tone={unpaid ? 'warn' : undefined} />
      </div>

      {(expired > 0 || negative.length > 0 || low.length > 0) && (
        <Card title={L('Alertas', 'Alerts')}>
          {expired > 0 && <Notice tone="bad">{L(`${expired} hamburguesas con ${shelf}+ días en nevera.`, `${expired} burgers past shelf life.`)}</Notice>}
          {negative.length > 0 && <Notice tone="bad">{L('Stock negativo (falta registrar compra o conteo)', 'Negative stock')}: {negative.map(i => i.name).join(', ')}</Notice>}
          {low.length > 0 && <Notice tone="warn">{L('Bajo el mínimo', 'Below minimum')}: {low.map(i => i.name).join(', ')}</Notice>}
        </Card>
      )}

      {toConfigure.length > 0 && (
        <Card title={L('Por configurar', 'To configure')}>
          <p className="small">{toConfigure.join(' · ')}</p>
          <button className="btn secondary" onClick={() => go('catalog')}>{L('Ir a Catálogo', 'Go to Catalog')}</button>
        </Card>
      )}

      <Card title={L('Fondos', 'Funds')}>
        <table className="list"><tbody>
          {cat.funds.map(f => <tr key={f.id}><td>{f.name}</td><td className="n">{money(balances.find(b => b.id === f.id)?.balance || 0)}</td></tr>)}
        </tbody></table>
      </Card>

      {uc && (
        <Card title={L('Costo por hamburguesa', 'Cost per burger')} right={<button className="btn ghost" onClick={() => go('costs')}>{L('Detalle', 'Detail')}</button>}>
          <div className="big-number">{money(uc.total)}</div>
          <p className="small muted">{L('Insumos', 'Ingredients')} {money(uc.materials)} · {L('comisión', 'commission')} {money(uc.commission)} · {L('luz', 'power')} {money(uc.energy)} · {L('limpieza', 'cleaning')} {money(uc.cleaning)} · {L('casa', 'house')} {money(uc.overhead)}</p>
        </Card>
      )}

      <Card title={L('Mermas de la semana', 'Waste this week')}>
        {waste.length === 0 ? <p className="muted small">{L('Sin mermas.', 'None.')}</p> : (
          <table className="list"><tbody>
            {[...waste].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)).slice(0, 8).map(w => (
              <tr key={w.id}><td>{date(w.loggedAt)}</td><td><span className="badge warn">{L(...(REASONS[w.reason] || [w.reason]))}</span><div className="small muted">{w.note}</div></td><td className="n">{num(w.qty)}</td></tr>
            ))}
          </tbody></table>
        )}
      </Card>
    </>
  );
}
