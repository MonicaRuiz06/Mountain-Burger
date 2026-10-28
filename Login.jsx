import React, { useState } from 'react';
import { be } from './backend.js';
import { useI18n } from './i18n.jsx';
import { Field, Logo, Notice } from './kit.jsx';

/** Mensajes claros para los errores de Firebase Auth. */
export function authMessage(err, L) {
  const code = err?.code || '';
  const map = {
    'auth/invalid-credential': L('Correo o contraseña incorrectos.', 'Wrong email or password.'),
    'auth/wrong-password': L('Correo o contraseña incorrectos.', 'Wrong email or password.'),
    'auth/user-not-found': L('No hay una cuenta con ese correo.', 'No account with that email.'),
    'auth/email-already-in-use': L('Ese correo ya tiene cuenta. Entra o recupera la contraseña.', 'Email already registered.'),
    'auth/weak-password': L('La contraseña debe tener al menos 6 caracteres.', 'Password needs 6+ characters.'),
    'auth/invalid-email': L('Ese correo no es válido.', 'Invalid email.'),
    'auth/too-many-requests': L('Demasiados intentos. Espera unos minutos y vuelve a intentar.', 'Too many attempts, wait a few minutes.'),
    'auth/network-request-failed': L('Sin conexión. Para entrar la primera vez necesitas internet.', 'No connection.')
  };
  return map[code] || L('No se pudo completar. Intenta de nuevo.', 'Something went wrong.') + (code ? ` (${code})` : '');
}

export default function Login() {
  const { L } = useI18n();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [mode, setMode] = useState('in'); // in | up | reset
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const demo = be().isDemo;

  async function submit(e) {
    e.preventDefault();
    setErr(''); setInfo(''); setBusy(true);
    try {
      if (mode === 'in') await be().auth.signIn(email.trim(), pass);
      else if (mode === 'up') await be().auth.signUp(email.trim(), pass);
      else {
        await be().auth.resetPassword(email.trim());
        setInfo(L('Si el correo tiene cuenta, te llegó un enlace para crear una contraseña nueva. Revisa también la carpeta de spam.', 'If the email has an account, a reset link was sent.'));
      }
    } catch (x) {
      setErr(authMessage(x, L));
    } finally { setBusy(false); }
  }

  const go = m => { setMode(m); setErr(''); setInfo(''); };

  return (
    <div className="login">
      <div className="mark"><Logo size={96} /></div>
      <h2 style={{ marginTop: 4 }}>Mountain Burger</h2>
      <p className="muted">Cali Grill · {L('Producción, inventario y caja', 'Production, stock and cash')}</p>

      {demo && (
        <div className="card" style={{ textAlign: 'left' }}>
          <strong>{L('Modo demo', 'Demo mode')}</strong>
          <p className="small muted">{L('Los datos se guardan solo en este navegador. Entra con un rol:', 'Data stays in this browser. Pick a role:')}</p>
          <div style={{ display: 'grid', gap: 8 }}>
            <button className="btn" onClick={() => be().demoLogin('admin', 'Administración')}>{L('Administración', 'Admin')}</button>
            <button className="btn" onClick={() => be().demoLogin('logistica', 'Logística')}>{L('Logística y compras', 'Logistics')}</button>
            <button className="btn" onClick={() => be().demoLogin('cocina', 'Cocina')}>{L('Cocina y producción', 'Kitchen')}</button>
          </div>
        </div>
      )}

      {!demo && (
        <form onSubmit={submit} style={{ textAlign: 'left' }}>
          <h3>{mode === 'in' ? L('Iniciar sesión', 'Sign in') : mode === 'up' ? L('Crear cuenta', 'Create account') : L('Recuperar contraseña', 'Reset password')}</h3>
          <Field label={L('Correo', 'Email')}>
            <input id="login-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
          </Field>
          {mode !== 'reset' && (
            <Field label={L('Contraseña', 'Password')} hint={mode === 'up' ? L('Mínimo 6 caracteres. Te enviaremos un correo para verificar tu cuenta.', 'Min 6 characters. We will email you a verification link.') : null}>
              <input id="login-pass" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required minLength={6} value={pass} onChange={e => setPass(e.target.value)} />
            </Field>
          )}
          {err && <Notice tone="bad">{err}</Notice>}
          {info && <Notice tone="good">{info}</Notice>}
          <button className="btn block big" type="submit" disabled={busy}>
            {mode === 'in' ? L('Entrar', 'Sign in') : mode === 'up' ? L('Crear cuenta', 'Create account') : L('Enviar enlace', 'Send link')}
          </button>
          <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
            {mode !== 'in' && <button type="button" className="btn ghost block" onClick={() => go('in')}>{L('Ya tengo cuenta', 'I have an account')}</button>}
            {mode !== 'up' && <button type="button" className="btn ghost block" onClick={() => go('up')}>{L('¿No tienes cuenta? Créala', 'No account? Create one')}</button>}
            {mode === 'in' && <button type="button" className="btn ghost block" onClick={() => go('reset')}>{L('Olvidé mi contraseña', 'Forgot password')}</button>}
          </div>
        </form>
      )}
    </div>
  );
}
