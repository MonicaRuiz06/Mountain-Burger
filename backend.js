// Punto único de acceso a datos. La app nunca llama a Firebase directamente:
// usa esta interfaz, que en producción es Firestore y en modo demo es memoria local.
//
// Interfaz del backend:
//   subscribe(col, { where: [[campo, op, valor]], orderBy: [campo, 'asc'|'desc'], limit }, cb) → unsubscribe
//   commit(ops) → Promise   (ops: set | update | inc, se aplican juntas o ninguna)
//   newId() → string
//   auth: onAuth(cb), signIn(email, pass), signUp(email, pass), signOut()
//   isDemo: boolean

let impl = null;

export async function initBackend() {
  if (impl) return impl;
  const demo = import.meta.env && import.meta.env.VITE_DEMO === 'true';
  if (demo) {
    const { createMemoryBackend } = await import('./memoryAdapter.js');
    impl = createMemoryBackend();
  } else {
    const { createFirebaseBackend } = await import('./firebaseAdapter.js');
    impl = createFirebaseBackend();
  }
  return impl;
}

export function be() {
  if (!impl) throw new Error('Backend sin iniciar');
  return impl;
}

export function deviceId() {
  try {
    let id = localStorage.getItem('mb-device');
    if (!id) { id = 'dev-' + Math.random().toString(36).slice(2, 10); localStorage.setItem('mb-device', id); }
    return id;
  } catch { return 'dev-sin-storage'; }
}

export function newId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Solo para pruebas automáticas: usa un backend dado. */
export function setBackendForTests(b) { impl = b; }
