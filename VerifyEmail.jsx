import React, { useEffect, useState } from 'react';
import { be } from './backend.js';
import { useI18n } from './i18n.jsx';
import { Logo, Notice } from './kit.jsx';
import { authMessage } from './Login.jsx';

/**
 * Nadie entra hasta verificar su correo. Las reglas de Firestore también lo exigen,
 * así que aunque alguien se salte esta pantalla no puede leer ni escribir nada.
 */
export default function VerifyEmail({ user, onVerified }) {
  const { L } = useI18n();
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  // Al volver a la pestaña después de tocar el enlace, revisa solo.
  useEffect(() => {
    const h = () => { if (document.visibilityState === 'visible') check(true); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, []);

  async function check(silent = false) {
    setBusy(true);
    try {
      const u = await be().auth.reload();
      if (u?.emailVerified) onVerified(u);
      else if (!silent) setMsg({ tone: 'warn', text: L('Todavía no aparece verificado. Toca el enlace del correo y vuelve aquí.', 'Not verified yet. Tap the link in the email.') });
    } catch (x) { if (!silent) setMsg({ tone: 'bad', text: authMessage(x, L) }); }
    finally { setBusy(false); }
  }

  async function resend() {
    setBusy(true);
    try {
      await be().auth.resendVerification();
      setMsg({ tone: 'good', text: L('Listo, te enviamos otro correo. Revisa también spam o promociones.', 'Sent again. Check spam too.') });
      setWait(60);
    } catch (x) { setMsg({ tone: 'bad', text: authMessage(x, L) }); }
    finally { setBusy(false); }
  }

  return (
    <div className="login">
      <div className="mark"><Logo size={96} /></div>
      <h2>{L('Verifica tu correo', 'Verify your email')}</h2>
      <p>{L('Te enviamos un enlace a', 'We sent a link to')} <strong>{user.email}</strong>.</p>
      <p className="muted small">{L('Ábrelo, toca el enlace y luego vuelve aquí.', 'Open it, tap the link, then come back.')}</p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        <button className="btn big" disabled={busy} onClick={() => check(false)}>{L('Ya lo verifiqué', 'I verified it')}</button>
        <button className="btn secondary" disabled={busy || wait > 0} onClick={resend}>
          {wait > 0 ? L(`Reenviar en ${wait} s`, `Resend in ${wait}s`) : L('Reenviar correo', 'Resend email')}
        </button>
        <button className="btn ghost" onClick={() => be().auth.signOut()}>{L('Usar otro correo', 'Use another email')}</button>
      </div>
    </div>
  );
}
