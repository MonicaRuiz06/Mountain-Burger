import { initializeApp } from 'firebase/app';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, writeBatch, onSnapshot, query, where, orderBy, limit, increment
} from 'firebase/firestore';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut as fbSignOut,
  sendEmailVerification, sendPasswordResetEmail
} from 'firebase/auth';
import { newId } from './backend.js';

export function createFirebaseBackend() {
  const env = import.meta.env || {};
  // Configuración web del proyecto mountain-burger-5c3a4 (no es secreta: la protección está en firestore.rules).
  // Las variables VITE_FIREBASE_* la reemplazan si existen.
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyDulP5ELp6erd614QQvswE4BFuuiizO-OY',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'mountain-burger-5c3a4.firebaseapp.com',
    projectId: env.VITE_FIREBASE_PROJECT_ID || 'mountain-burger-5c3a4',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'mountain-burger-5c3a4.firebasestorage.app',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '558072990768',
    appId: env.VITE_FIREBASE_APP_ID || '1:558072990768:web:d4dd8d6b35c3c3a661f1f5'
  };
  if (!config.apiKey || !config.projectId) {
    throw new Error('Falta la configuración de Firebase. Copia .env.example como .env.local y llénalo.');
  }
  const app = initializeApp(config);
  // Persistencia offline: lo que se escribe sin señal queda en el celular y se sube solo (RNF-03).
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
  const auth = getAuth(app);
  auth.languageCode = 'es'; // los correos de verificación y de clave llegan en español
  const asUser = u => (u ? { uid: u.uid, email: u.email, emailVerified: u.emailVerified } : null);
  // Al verificar, vuelve a la app (el dominio debe estar en Authentication → Authorized domains).
  const linkBack = () => ({ url: window.location.origin, handleCodeInApp: false });

  function buildQuery(col, q = {}) {
    const parts = [];
    for (const [f, op, v] of q.where || []) parts.push(where(f, op, v));
    if (q.orderBy) parts.push(orderBy(q.orderBy[0], q.orderBy[1] || 'asc'));
    if (q.limit) parts.push(limit(q.limit));
    return query(collection(db, col), ...parts);
  }

  return {
    isDemo: false,
    newId,
    subscribe(col, q, cb) {
      return onSnapshot(
        buildQuery(col, q),
        snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })), null, snap.metadata.hasPendingWrites),
        err => cb([], err)
      );
    },
    subscribeDoc(col, id, cb) {
      return onSnapshot(doc(db, col, id), d => cb(d.exists() ? { id: d.id, ...d.data() } : null), err => cb(null, err));
    },
    commit(ops) {
      const b = writeBatch(db);
      for (const op of ops) {
        const ref = doc(db, op.col, op.id);
        if (op.type === 'set') b.set(ref, op.data, { merge: !!op.merge });
        else if (op.type === 'update') b.update(ref, op.data);
        else if (op.type === 'inc') {
          const data = { ...(op.base || {}) };
          for (const [k, v] of Object.entries(op.fields)) data[k] = increment(v);
          b.set(ref, data, { merge: true });
        } else if (op.type === 'delete') b.delete(ref);
      }
      // Sin señal esta promesa queda pendiente hasta que vuelva la red,
      // pero los datos ya están en la caché local y la pantalla los muestra.
      return b.commit();
    },
    auth: {
      onAuth(cb) {
        return onAuthStateChanged(auth, u => cb(asUser(u)));
      },
      signIn: (email, pass) => signInWithEmailAndPassword(auth, email, pass),
      // Cuenta nueva: se envía el correo de verificación de una vez.
      async signUp(email, pass) {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await sendEmailVerification(cred.user, linkBack());
        return cred;
      },
      resendVerification: () => sendEmailVerification(auth.currentUser, linkBack()),
      // Después de tocar el enlace del correo: recarga el usuario y renueva el token
      // para que las reglas de Firestore vean email_verified = true.
      async reload() {
        if (!auth.currentUser) return null;
        await auth.currentUser.reload();
        await auth.currentUser.getIdToken(true);
        return asUser(auth.currentUser);
      },
      resetPassword: email => sendPasswordResetEmail(auth, email, linkBack()),
      signOut: () => fbSignOut(auth)
    }
  };
}
