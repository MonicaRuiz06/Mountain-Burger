import React from 'react';
import { be } from './backend.js';
import { useCatalog, useOps, toast } from './store.jsx';
import { seedOps } from './seed.js';
import { useI18n, ROLES } from './i18n.jsx';
import { Card, Seg, useConfirm } from './kit.jsx';

export default function Settings() {
  const { L } = useI18n();
  const cat = useCatalog();
  const { run } = useOps();
  const [ask, confirmUi] = useConfirm();
  const p = cat.profile;
  const save = data => be().commit([{ type: 'set', col: 'users', id: cat.user.uid, merge: true, data }]);

  return (
    <>
      <h2>{L('Ajustes', 'Settings')}</h2>
      <Card title={L('Mi cuenta', 'My account')}>
        <p>{p.name} · <span className="muted">{p.email}</span></p>
        <p className="small muted">{L(ROLES[p.role][0], ROLES[p.role][1])}</p>
      </Card>
      <Card title={L('Idioma', 'Language')}>
        <Seg value={p.language || 'es'} onChange={v => save({ language: v })} options={[{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }]} />
      </Card>
      <Card title={L('Visión Clara', 'Clear Vision')}>
        <p className="small muted">{L('Letra grande, botones más altos y alto contraste.', 'Large text, taller buttons, high contrast.')}</p>
        <Seg value={p.clearVision ? 'on' : 'off'} onChange={v => save({ clearVision: v === 'on' })} options={[{ value: 'off', label: L('Normal', 'Normal') }, { value: 'on', label: L('Activada', 'On') }]} />
      </Card>

      {p.role === 'admin' && (
        <Card title={L('Datos iniciales', 'Initial data')}>
          <p className="small muted">{cat.seeded
            ? L('Ya están cargados. Volver a cargarlos no borra lo que agregaste, pero restablece los valores de ejemplo de esos registros.', 'Already loaded.')
            : L('Carga insumos, la receta de la Mountain Burger, carnicerías, canales, fondos y la parrilla. Luego ajustas los gramos y precios.', 'Loads starter catalogs.')}</p>
          <button className={'btn block ' + (cat.seeded ? 'secondary' : '')} onClick={() => ask(L('¿Cargar los datos iniciales?', 'Load starter data?'), () => { run(ctx => ({ ops: seedOps(ctx) })); toast(L('Datos iniciales cargados', 'Loaded')); })}>
            {L('Cargar datos iniciales', 'Load starter data')}
          </button>
        </Card>
      )}

      {be().isDemo && (
        <Card title="Demo">
          <button className="btn danger block" onClick={() => ask(L('¿Borrar todos los datos de la demo?', 'Erase demo data?'), () => { be().resetDemo(); be().auth.signOut(); })}>{L('Borrar datos de la demo', 'Reset demo')}</button>
        </Card>
      )}
      <button className="btn secondary block" style={{ marginTop: 16 }} onClick={() => be().auth.signOut()}>{L('Cerrar sesión', 'Sign out')}</button>
      {confirmUi}
    </>
  );
}
