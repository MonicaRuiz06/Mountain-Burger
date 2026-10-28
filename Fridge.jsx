import React from 'react';
import { useCatalog } from './store.jsx';
import { lotStatus } from './production.js';
import { useI18n } from './i18n.jsx';
import { Card, Stat, Empty } from './kit.jsx';

/** Stock armado en nevera por lote, el más viejo primero (RF-12). */
export default function Fridge() {
  const { L, date, time } = useI18n();
  const cat = useCatalog();
  const shelf = Number(cat.settings.shelfLifeDays) || 3;
  const products = cat.products.filter(p => p.kind !== 'proceso_interno');
  const lots = [...cat.lots].sort((a, b) => (a.producedAt || '').localeCompare(b.producedAt || ''));
  const expired = lots.filter(l => lotStatus(l, shelf).expired).reduce((s, l) => s + l.remaining, 0);

  return (
    <>
      <h2>{L('Nevera', 'Fridge')}</h2>
      <div className="grid2">
        {products.map(p => <Stat key={p.id} k={p.name} v={cat.finishedOf(p.id)} />)}
        <Stat k={L(`Con ${shelf}+ días`, `${shelf}+ days old`)} v={expired} tone={expired ? 'bad' : undefined} />
      </div>
      <h3>{L('Lotes (sale primero el más viejo)', 'Batches (oldest first)')}</h3>
      <Card>
        {lots.length === 0 ? <Empty>{L('La nevera está vacía.', 'Fridge is empty.')}</Empty> : (
          <table className="list">
            <thead><tr><th>{L('Hecho', 'Made')}</th><th>{L('Vence', 'Expires')}</th><th className="n">{L('Quedan', 'Left')}</th><th></th></tr></thead>
            <tbody>
              {lots.map(l => {
                const st = lotStatus(l, shelf);
                return (
                  <tr key={l.id}>
                    <td>{products.length > 1 && <div><strong>{products.find(p => p.id === l.productId)?.name}</strong></div>}{date(l.producedAt)} {time(l.producedAt)}</td>
                    <td>{date(st.expiresAt.toISOString())}</td>
                    <td className="n"><strong>{l.remaining}</strong></td>
                    <td className="n">{st.expired ? <span className="badge bad">{L('Vencido', 'Expired')}</span> : st.dueSoon ? <span className="badge warn">{L('Último día', 'Last day')}</span> : <span className="badge good">OK</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      {expired > 0 && <p className="small muted">{L('Las vencidas se despachan ya o se registran como merma "Vencido".', 'Dispatch now or log as expired waste.')}</p>}
    </>
  );
}
