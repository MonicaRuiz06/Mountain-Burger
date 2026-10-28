// Backend de demostración: guarda todo en memoria y en este navegador.
// Implementa la misma interfaz que el adaptador de Firebase.
import { newId } from './backend.js';

const KEY = 'mb-demo-db';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save(store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* sin storage: solo memoria */ }
}

function cmp(a, op, b) {
  switch (op) {
    case '==': return a === b;
    case '!=': return a !== b;
    case '>': return a > b;
    case '>=': return a >= b;
    case '<': return a < b;
    case '<=': return a <= b;
    case 'in': return Array.isArray(b) && b.includes(a);
    default: return false;
  }
}

// Igual que set(..., {merge:true}) de Firestore: los mapas se combinan, los arreglos se reemplazan.
function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])
      ? deepMerge(a[k], v) : structuredClone(v);
  }
  return out;
}

export function createMemoryBackend() {
  let store = load();
  const listeners = new Set();
  let authUser = null;
  try { authUser = JSON.parse(localStorage.getItem(KEY + '-auth')); } catch { /* */ }
  const authListeners = new Set();

  function run(col, q = {}) {
    let docs = Object.entries(store[col] || {}).map(([id, d]) => ({ id, ...d }));
    for (const [f, op, v] of q.where || []) docs = docs.filter(d => cmp(d[f] ?? null, op, v));
    if (q.orderBy) {
      const [f, dir] = q.orderBy;
      docs.sort((a, b) => ((a[f] ?? '') > (b[f] ?? '') ? 1 : (a[f] ?? '') < (b[f] ?? '') ? -1 : 0) * (dir === 'desc' ? -1 : 1));
    }
    if (q.limit) docs = docs.slice(0, q.limit);
    return docs;
  }

  function notify() {
    save(store);
    for (const l of listeners) l();
  }

  const api = {
    isDemo: true,
    newId,
    subscribe(col, q, cb) {
      const fire = () => cb(run(col, q), null, false);
      listeners.add(fire);
      queueMicrotask(fire);
      return () => listeners.delete(fire);
    },
    subscribeDoc(col, id, cb) {
      const fire = () => { const d = (store[col] || {})[id]; cb(d ? { id, ...d } : null); };
      listeners.add(fire);
      queueMicrotask(fire);
      return () => listeners.delete(fire);
    },
    async commit(ops) {
      const next = structuredClone(store);
      for (const op of ops) {
        const c = (next[op.col] ||= {});
        if (op.type === 'set') c[op.id] = op.merge ? deepMerge(c[op.id] || {}, op.data) : structuredClone(op.data);
        else if (op.type === 'update') {
          if (!c[op.id]) throw new Error(`No existe ${op.col}/${op.id}`);
          c[op.id] = { ...c[op.id], ...op.data };
        } else if (op.type === 'inc') {
          const d = { ...(c[op.id] || {}), ...(op.base || {}) };
          for (const [k, v] of Object.entries(op.fields)) d[k] = (Number(d[k]) || 0) + v;
          c[op.id] = d;
        } else if (op.type === 'delete') delete c[op.id];
      }
      store = next;
      notify();
    },
    auth: {
      onAuth(cb) {
        authListeners.add(cb);
        queueMicrotask(() => cb(authUser));
        return () => authListeners.delete(cb);
      },
      async signIn(email) {
        const users = Object.entries(store.users || {});
        const found = users.find(([, u]) => u.email === email);
        const uid = found ? found[0] : 'u-' + email.replace(/[^a-z0-9]/gi, '');
        authUser = { uid, email, emailVerified: true };
        try { localStorage.setItem(KEY + '-auth', JSON.stringify(authUser)); } catch { /* */ }
        for (const l of authListeners) l(authUser);
      },
      async signUp(email) { return api.auth.signIn(email); },
      // En la demo los correos se dan por verificados.
      async resendVerification() {},
      async reload() { return authUser; },
      async resetPassword() {},
      async signOut() {
        authUser = null;
        try { localStorage.removeItem(KEY + '-auth'); } catch { /* */ }
        for (const l of authListeners) l(null);
      }
    },
    /** Solo demo: entra con un rol fijo y crea el usuario si no existe. */
    async demoLogin(role, name) {
      const uid = 'demo-' + role;
      // Crea los tres usuarios de prueba para que se vean entre sí (ej. pago a cocina).
      const people = { admin: 'Administración', logistica: 'Logística', cocina: 'Cocina' };
      const missing = Object.keys(people).filter(r => !(store.users || {})['demo-' + r]);
      if (missing.length) {
        await api.commit(missing.map(r => ({ type: 'set', col: 'users', id: 'demo-' + r, data: { name: people[r], email: `${r}@demo`, role: r, language: 'es', clearVision: false, active: true, createdAt: new Date().toISOString() } })));
      }
      authUser = { uid, email: `${role}@demo`, emailVerified: true };
      try { localStorage.setItem(KEY + '-auth', JSON.stringify(authUser)); } catch { /* */ }
      for (const l of authListeners) l(authUser);
    },
    resetDemo() {
      store = {};
      notify();
    }
  };
  return api;
}
