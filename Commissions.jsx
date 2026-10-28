import React, { useMemo } from 'react';
import { useCatalog, useCol } from './store.jsx';
import { openCommissions, commissionRateFor } from './production.js';
import { useI18n } from './i18n.jsx';
import { Card, Stat } from './kit.jsx';
import { localDay } from './dates.js';

/** Contador de comisiones en tiempo real (RF-14). */
export default function Commissions() {
  const { L, money, date } = useI18n();
  const cat = useCatalog();
  // Si administración o logística registran por el cocinero, la comisión queda a nombre de él.
  const uid = cat.profile.role === 'cocina' ? cat.user.uid : (cat.users.find(u => u.role === 'cocina' && u.active !== false)?.id || cat.user.uid);
  const today = localDay();
  const [open] = useCol('productions', { where: [['cookId', '==', uid], ['settled', '==', false]] });
  const [paid] = useCol('payroll_settlements', { where: [['userId', '==', uid]] });
  const c = useMemo(() => openCommissions(open, uid, today), [open, uid, today]);
  const rate = commissionRateFor(cat.rates, uid, Number(cat.settings.defaultCommission) || 1000);
  const history = [...paid].sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || '')).slice(0, 15);

  return (
    <>
      <h2>{L('Mis comisiones', 'My earnings')}</h2>
      <div className="grid2">
        <Stat k={L('Hoy', 'Today')} v={money(c.todayAmount)} tone="good" />
        <Stat k={L('Hamburguesas hoy', 'Burgers today')} v={c.todayUnits} />
        <Stat k={L('Sin liquidar', 'Unpaid')} v={money(c.openAmount)} />
        <Stat k={L('Pago por hamburguesa', 'Per burger')} v={money(rate)} />
      </div>
      <h3>{L('Liquidaciones', 'Payouts')}</h3>
      <Card>
        {history.length === 0 ? <p className="muted small">{L('Todavía no hay liquidaciones.', 'No payouts yet.')}</p> : (
          <table className="list"><tbody>
            {history.map(s => <tr key={s.id}><td>{date(s.paidAt)}</td><td>{s.units} {L('und', 'pcs')}</td><td className="n"><strong>{money(s.amount)}</strong></td></tr>)}
          </tbody></table>
        )}
      </Card>
    </>
  );
}
