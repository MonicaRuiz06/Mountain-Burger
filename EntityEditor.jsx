import React, { useState } from 'react';
import { useOps, toast } from './store.jsx';
import { saveDoc } from './ops.js';
import { useI18n } from './i18n.jsx';
import { Card, Field, NumInput, Select, Modal } from './kit.jsx';

/**
 * Lista + formulario genérico para catálogos.
 * fields: [{ key, label, type: 'text'|'number'|'select'|'bool'|'date', options, hint, required }]
 * Nada se borra: "Desactivar" deja el registro con active=false para no romper el historial.
 */
export function EntityEditor({ col, title, items, fields, columns, newDefaults = {}, renderExtra, addLabel, idFor, noAdd = false }) {
  const { L } = useI18n();
  const { run } = useOps();
  const [editing, setEditing] = useState(null);

  function save() {
    for (const f of fields) if (f.required && (editing[f.key] === '' || editing[f.key] == null)) { toast(L(`Falta: ${f.label}`, `Missing: ${f.label}`), 'error'); return; }
    const { id, ...data } = editing;
    run(ctx => saveDoc(col, id || (idFor ? idFor(data, ctx) : ctx.newId()), { active: true, ...data, createdAt: data.createdAt || ctx.now }, ctx));
    toast(L('Guardado', 'Saved'));
    setEditing(null);
  }
  function deactivate() {
    run(ctx => saveDoc(col, editing.id, { active: false }, ctx));
    toast(L('Desactivado', 'Deactivated'));
    setEditing(null);
  }

  return (
    <>
      <Card title={title} right={!noAdd && <button className="btn secondary" onClick={() => setEditing({ ...newDefaults })}>+ {addLabel || L('Agregar', 'Add')}</button>}>
        {items.length === 0 ? <p className="muted small">{L('Nada todavía.', 'Nothing yet.')}</p> : (
          <div className="scroll-x">
            <table className="list">
              <thead><tr>{columns.map(c => <th key={c.label} className={c.n ? 'n' : ''}>{c.label}</th>)}</tr></thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id} onClick={() => setEditing({ ...it })} style={{ cursor: 'pointer', opacity: it.active === false ? 0.45 : 1 }}>
                    {columns.map(c => <td key={c.label} className={c.n ? 'n' : ''}>{c.render(it)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted">{L('Toca una fila para editarla.', 'Tap a row to edit.')}</p>
      </Card>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? L('Editar', 'Edit') : L('Nuevo', 'New')}>
        {editing && fields.map(f => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            {f.type === 'number' ? <NumInput value={editing[f.key]} onChange={v => setEditing(e => ({ ...e, [f.key]: v }))} step={f.step || 'any'} />
              : f.type === 'select' ? <Select value={editing[f.key]} onChange={v => setEditing(e => ({ ...e, [f.key]: v }))} options={f.options} placeholder={f.required ? undefined : ''} />
              : f.type === 'bool' ? <Select value={editing[f.key] ? 'si' : 'no'} onChange={v => setEditing(e => ({ ...e, [f.key]: v === 'si' }))} options={[{ value: 'no', label: L('No', 'No') }, { value: 'si', label: L('Sí', 'Yes') }]} />
              : <input type={f.type === 'date' ? 'date' : 'text'} value={editing[f.key] ?? ''} onChange={e => setEditing(x => ({ ...x, [f.key]: e.target.value }))} />}
          </Field>
        ))}
        {editing && renderExtra && renderExtra(editing, setEditing)}
        <div className="grid2" style={{ marginTop: 12 }}>
          {editing?.id && editing.active !== false ? <button className="btn secondary" onClick={deactivate}>{L('Desactivar', 'Deactivate')}</button>
            : editing?.id ? <button className="btn secondary" onClick={() => setEditing(e => ({ ...e, active: true }))}>{L('Reactivar', 'Reactivate')}</button> : <span />}
          <button className="btn" onClick={save}>{L('Guardar', 'Save')}</button>
        </div>
      </Modal>
    </>
  );
}
