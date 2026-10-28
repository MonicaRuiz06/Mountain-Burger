import React, { useState } from 'react';
import { useCatalog, useOps, useCol, toast } from './store.jsx';
import { saveDoc, transferFunds, settlePayroll, registerCapital } from './ops.js';
import { pctTotal } from './funds.js';
import { useI18n } from './i18n.jsx';
import { Card, Field, NumInput, Select, Seg, Stat, Tabs, Notice, Modal } from './kit.jsx';
import { KitchenPay } from './Stock.jsx';

/** Fondos (RF-05), movimientos de caja y nómina (RF-06). */
export default function Finance() {
  const { L } = useI18n();
  const [tab, setTab] = useState('funds');
  return (
    <>
      <h2>{L('Finanzas', 'Finance')}</h2>
      <Tabs value={tab} onChange={setTab} options={[
        { value: 'funds', label: L('Fondos', 'Funds') },
        { value: 'moves', label: L('Movimientos', 'Ledger') },
        { value: 'payroll', label: L('Nómina', 'Payroll') }
      ]} />
      {tab === 'funds' && <Funds />}
      {tab === 'moves' && <Moves />}
      {tab === 'payroll' && <Payroll />}
    </>
  );
}

function Funds() {
  const { L, money } = useI18n();
  const cat = useCatalog();
  const { run } = useOps();
  const [balances] = useCol('fund_balances');
  const [pcts, setPcts] = useState(null);
  const [mv, setMv] = useState(null);
  const [cap, setCap] = useState(null);
  const values = pcts || Object.fromEntries(cat.funds.map(f => [f.id, f.pct || 0]));
  const total = Object.values(values).reduce((s, v) => s + (Number(v) || 0), 0);
  const mode = cat.settings.fundMode || 'costo_real';
  const bal = id => balances.find(b => b.id === id)?.balance || 0;

  function savePcts() {
    run(ctx => ({ ops: cat.funds.flatMap(f => saveDoc('funds', f.id, { pct: Number(values[f.id]) || 0 }, ctx).ops) }));
    toast(L('Porcentajes guardados', 'Saved')); setPcts(null);
  }
  function move() {
    try { run(ctx => transferFunds(mv, ctx)); toast(L('Traslado hecho', 'Moved')); setMv(null); } catch (e) { toast(e.message, 'error'); }
  }

  return (
    <>
      <div className="grid2">
        {cat.funds.map(f => <Stat key={f.id} k={f.name} v={money(bal(f.id))} tone={bal(f.id) < 0 ? 'bad' : undefined} />)}
      </div>
      <div className="grid2" style={{ marginTop: 10 }}>
        <button className="btn secondary" onClick={() => setMv({ fromCode: 'utilidad', toCode: 'resurtido', amount: '' })}>{L('Trasladar', 'Move')}</button>
        <button className="btn secondary" onClick={() => setCap({ fundCode: 'resurtido', amount: '', description: 'Aporte de capital' })}>{L('Aporte de capital', 'Add capital')}</button>
      </div>

      <Card title={L('Cómo se reparte cada pago', 'How payments are split')}>
        <Seg value={mode} onChange={v => run(ctx => saveDoc('settings', 'app', { fundMode: v }, ctx))} options={[{ value: 'costo_real', label: L('Costo real', 'Real cost') }, { value: 'fijo', label: L('Porcentaje fijo', 'Fixed %') }]} />
        <p className="small muted" style={{ marginTop: 8 }}>{mode === 'costo_real'
          ? L('Resurtido recibe lo que costaron los insumos de lo vendido y Nómina la comisión; el resto se divide entre Operativos y Utilidad con estos porcentajes.', 'Restock gets the cost of goods, Payroll the commission; the rest is split by %.')
          : L('Cada pago se divide con estos porcentajes. Deben sumar 100 %.', 'Split by these %; must total 100.')}</p>
        {cat.funds.filter(f => mode === 'fijo' || ['operativos', 'utilidad'].includes(f.code)).map(f => (
          <div className="row" key={f.id} style={{ marginBottom: 6 }}>
            <span className="grow">{f.name}</span>
            <div style={{ width: 110 }}><NumInput value={values[f.id]} onChange={v => setPcts({ ...values, [f.id]: v })} /></div><span>%</span>
          </div>
        ))}
        {mode === 'fijo' && total !== 100 && <Notice tone="warn">{L(`Suman ${total} %, deben sumar 100 %.`, `Total ${total}%, must be 100.`)}</Notice>}
        <button className="btn block" disabled={!pcts || (mode === 'fijo' && total !== 100)} onClick={savePcts}>{L('Guardar porcentajes', 'Save %')}</button>
      </Card>

      <Modal open={!!cap} onClose={() => setCap(null)} title={L('Aporte de capital', 'Add capital')}>
        {cap && <>
          <p className="small muted">{L('Plata que entra al negocio sin ser venta (ej. el capital con que se arranca).', 'Money in that is not a sale.')}</p>
          <Field label={L('Fondo', 'Fund')}><Select value={cap.fundCode} onChange={v => setCap(c => ({ ...c, fundCode: v }))} options={cat.funds.map(f => ({ value: f.code, label: f.name }))} /></Field>
          <Field label={L('Monto', 'Amount')}><NumInput value={cap.amount} onChange={v => setCap(c => ({ ...c, amount: v }))} step="1000" /></Field>
          <Field label={L('Descripción', 'Description')}><input value={cap.description} onChange={e => setCap(c => ({ ...c, description: e.target.value }))} /></Field>
          <button className="btn block" onClick={() => { try { run(ctx => registerCapital(cap, ctx)); toast(L('Aporte registrado', 'Saved')); setCap(null); } catch (e) { toast(e.message, 'error'); } }}>{L('Guardar', 'Save')}</button>
        </>}
      </Modal>
      <Modal open={!!mv} onClose={() => setMv(null)} title={L('Trasladar', 'Move')}>
        {mv && <>
          <Field label={L('De', 'From')}><Select value={mv.fromCode} onChange={v => setMv(m => ({ ...m, fromCode: v }))} options={cat.funds.map(f => ({ value: f.code, label: f.name }))} /></Field>
          <Field label={L('A', 'To')}><Select value={mv.toCode} onChange={v => setMv(m => ({ ...m, toCode: v }))} options={cat.funds.map(f => ({ value: f.code, label: f.name }))} /></Field>
          <Field label={L('Monto', 'Amount')}><NumInput value={mv.amount} onChange={v => setMv(m => ({ ...m, amount: v }))} step="1000" /></Field>
          <button className="btn block" onClick={move}>{L('Trasladar', 'Move')}</button>
        </>}
      </Modal>
    </>
  );
}

function Moves() {
  const { L, money, date } = useI18n();
  const cat = useCatalog();
  const [list] = useCol('cash_movements', { orderBy: ['occurredAt', 'desc'], limit: 60 });
  const name = id => cat.funds.find(f => f.id === id)?.name || id;
  return (
    <Card>
      {list.length === 0 ? <p className="muted small">{L('Sin movimientos.', 'No movements.')}</p> : (
        <table className="list"><tbody>
          {list.map(m => (
            <tr key={m.id}><td>{date(m.occurredAt)}</td><td>{m.description}<div className="small muted">{name(m.fundId)}</div></td>
              <td className="n" style={{ color: m.amount < 0 ? 'var(--bad)' : 'var(--good)' }}>{money(m.amount)}</td></tr>
          ))}
        </tbody></table>
      )}
    </Card>
  );
}

function Payroll() {
  const { L, money, date } = useI18n();
  const cat = useCatalog();
  const { run } = useOps();
  const [list] = useCol('payroll_settlements', { orderBy: ['paidAt', 'desc'], limit: 30 });
  const [fee, setFee] = useState('');
  const uname = id => cat.users.find(u => u.id === id)?.name || id;
  function payFee() {
    try { run(ctx => settlePayroll({ userId: cat.user.uid, productions: [], kind: 'honorario', fixedAmount: fee }, ctx)); toast(L('Honorarios registrados', 'Saved')); setFee(''); } catch (e) { toast(e.message, 'error'); }
  }
  return (
    <>
      <KitchenPay />
      <Card title={L('Honorarios de administración', 'Admin fees')}>
        <div className="row"><div className="grow"><NumInput value={fee} onChange={setFee} step="1000" placeholder="$" /></div><button className="btn" disabled={!(Number(fee) > 0)} onClick={payFee}>{L('Registrar', 'Log')}</button></div>
        <p className="small muted">{L('Sale del fondo de Nómina.', 'Paid from Payroll fund.')}</p>
      </Card>
      <Card title={L('Historial', 'History')}>
        {list.length === 0 ? <p className="muted small">{L('Sin liquidaciones.', 'None yet.')}</p> : (
          <table className="list"><tbody>
            {list.map(s => <tr key={s.id}><td>{date(s.paidAt)}</td><td>{uname(s.userId)}<div className="small muted">{s.kind === 'comision' ? `${s.units} ${L('hamburguesas', 'burgers')}` : L('Honorarios', 'Fees')}</div></td><td className="n">{money(s.amount)}</td></tr>)}
          </tbody></table>
        )}
      </Card>
    </>
  );
}
