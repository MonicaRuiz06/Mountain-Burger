import React, { useEffect, useState } from 'react';
import { be } from './backend.js';
import { CatalogProvider, useDocLive } from './store.jsx';
import { LangProvider, useI18n, ROLES } from './i18n.jsx';
import { Toasts, Icon, Logo, Select } from './kit.jsx';
import Login from './Login.jsx';
import VerifyEmail from './VerifyEmail.jsx';
import Settings from './Settings.jsx';
import Waste from './Waste.jsx';
import Produce from './Produce.jsx';
import Fridge from './Fridge.jsx';
import Commissions from './Commissions.jsx';
import Order from './Order.jsx';
import Purchase from './Purchase.jsx';
import Dispatch from './Dispatch.jsx';
import Collect from './Collect.jsx';
import Stock from './Stock.jsx';
import Dashboard from './Dashboard.jsx';
import Catalog from './Catalog.jsx';
import Costs from './Costs.jsx';
import Finance from './Finance.jsx';

// Pantallas de cada interfaz (stakeholders del documento).
const NAV = {
  cocina: [
    { id: 'produce', icon: 'produce', es: 'Producir', en: 'Produce', C: Produce },
    { id: 'fridge', icon: 'fridge', es: 'Nevera', en: 'Fridge', C: Fridge },
    { id: 'commissions', icon: 'coins', es: 'Comisiones', en: 'Earnings', C: Commissions },
    { id: 'waste', icon: 'trash', es: 'Merma', en: 'Waste', C: Waste },
    { id: 'settings', icon: 'gear', es: 'Ajustes', en: 'Settings', C: Settings }
  ],
  logistica: [
    { id: 'order', icon: 'list', es: 'Comanda', en: 'Plan', C: Order },
    { id: 'purchase', icon: 'cart', es: 'Compra', en: 'Buy', C: Purchase },
    { id: 'dispatch', icon: 'truck', es: 'Despacho', en: 'Dispatch', C: Dispatch },
    { id: 'collect', icon: 'cash', es: 'Cobros', en: 'Collect', C: Collect },
    { id: 'stock', icon: 'box', es: 'Más', en: 'More', C: Stock }
  ],
  admin: [
    { id: 'dash', icon: 'home', es: 'Inicio', en: 'Home', C: Dashboard },
    { id: 'catalog', icon: 'book', es: 'Catálogo', en: 'Catalog', C: Catalog },
    { id: 'costs', icon: 'chart', es: 'Costos', en: 'Costs', C: Costs },
    { id: 'finance', icon: 'bank', es: 'Finanzas', en: 'Finance', C: Finance },
    { id: 'settings', icon: 'gear', es: 'Ajustes', en: 'Settings', C: Settings }
  ]
};

export default function App() {
  const [user, setUser] = useState(undefined);
  useEffect(() => be().auth.onAuth(u => setUser(u)), []);
  if (user === undefined) return <Splash />;
  if (!user) return <LangProvider lang={guessLang()}><Login /><Toasts /></LangProvider>;
  // Sin correo verificado no se entra (la demo los da por verificados).
  if (!user.emailVerified && !be().isDemo) {
    return <LangProvider lang={guessLang()}><VerifyEmail user={user} onVerified={setUser} /><Toasts /></LangProvider>;
  }
  return <WithProfile user={user} />;
}

function guessLang() {
  try { return localStorage.getItem('mb-lang') || 'es'; } catch { return 'es'; }
}

function Splash() {
  return <div className="login"><div className="mark"><Logo size={96} /></div><p className="muted">Mountain Burger…</p></div>;
}

function WithProfile({ user }) {
  const profile = useDocLive('users', user.uid);
  useEffect(() => {
    // Primer ingreso: se crea el perfil sin rol; la administración lo asigna.
    if (profile === null) {
      const data = { email: user.email, name: user.email.split('@')[0], role: 'pendiente', language: 'es', clearVision: false, active: true, createdAt: new Date().toISOString() };
      const create = () => be().commit([{ type: 'set', col: 'users', id: user.uid, data }]);
      // Si la sesión venía de antes de verificar el correo, el permiso todavía dice "sin verificar":
      // se renueva la sesión y se intenta otra vez.
      create().catch(async () => {
        try { await be().auth.reload(); await create(); } catch (e) { console.error('No se pudo crear el perfil', e); }
      });
    }
  }, [profile, user]);
  useEffect(() => {
    document.body.classList.toggle('clear', !!profile?.clearVision);
    try { localStorage.setItem('mb-lang', profile?.language || 'es'); } catch { /* */ }
  }, [profile?.clearVision, profile?.language]);

  if (!profile) return <Splash />;
  return (
    <LangProvider lang={profile.language || 'es'}>
      {profile.role === 'pendiente' || !NAV[profile.role]
        ? <Pending profile={profile} />
        : <CatalogProvider user={user} profile={profile}><Shell profile={profile} /></CatalogProvider>}
      <Toasts />
    </LangProvider>
  );
}

function Pending({ profile }) {
  const { L } = useI18n();
  return (
    <div className="login">
      <div className="mark"><Logo size={96} /></div>
      <h2>{L('Cuenta creada', 'Account created')}</h2>
      <p>{L('Pídele a la administración que te asigne un rol.', 'Ask the admin to assign you a role.')}</p>
      <p className="muted small">{profile.email}</p>
      <button className="btn secondary" onClick={() => be().auth.signOut()}>{L('Salir', 'Sign out')}</button>
    </div>
  );
}

function Shell({ profile }) {
  const { L } = useI18n();
  const [viewAs, setViewAs] = useState(profile.role);
  const role = profile.role === 'admin' ? viewAs : profile.role;
  const items = NAV[role];
  const [tab, setTab] = useState(items[0].id);
  const current = items.find(i => i.id === tab) || items[0];
  const online = useOnline();
  const Screen = current.C;

  return (
    <>
      <header className="topbar">
        <div className="logo"><Logo size={34} /></div>
        <div>
          <h1>Mountain Burger</h1>
          <small>{L(ROLES[role][0], ROLES[role][1])}{be().isDemo ? ' · demo' : ''}</small>
        </div>
        <div className="spacer" />
        <span className="sync">{online ? L('En línea', 'Online') : L('Sin señal · se guarda en el celular', 'Offline · saved on device')}</span>
      </header>
      <main className="app">
        {profile.role === 'admin' && (
          <div className="row small" style={{ marginTop: 10 }}>
            <span className="muted">{L('Ver como', 'View as')}</span>
            <div className="grow">
              <Select value={viewAs} onChange={v => { setViewAs(v); setTab(NAV[v][0].id); }}
                options={['admin', 'logistica', 'cocina'].map(r => ({ value: r, label: L(ROLES[r][0], ROLES[r][1]) }))} />
            </div>
          </div>
        )}
        <Screen key={role + current.id} go={setTab} />
      </main>
      <nav className="bottomnav">
        <div className="inner">
          {items.map(i => (
            <button key={i.id} className={i.id === current.id ? 'on' : ''} onClick={() => setTab(i.id)} aria-current={i.id === current.id}>
              <Icon name={i.icon} />{L(i.es, i.en)}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

function useOnline() {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false);
    window.addEventListener('online', a); window.addEventListener('offline', b);
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b); };
  }, []);
  return on;
}
