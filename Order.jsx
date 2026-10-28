import React, { useMemo, useState } from 'react';
import { useCatalog, useCol, useOps, toast } from './store.jsx';
import { saveDoc } from './ops.js';
import { activeRecipe, stockByIngredient } from './recipe.js';
import { shoppingListMulti, shoppingSentence } from './shopping.js';
import { useI18n } from './i18n.jsx';
import { Card, Seg, Stepper, Notice } from './kit.jsx';
import { addDaysLocal } from './dates.js';

/** Comanda del día siguiente por producto (RF-07) y una sola lista de compras (RF-08). */
export default function Order({ go }) {
  const { L, num } = useI18n();
  const cat = useCatalog();
  const { run } = useOps();
  const tomorrow = addDaysLocal(1);
  const [orders] = useCol('production_orders', { where: [['forDate', '==', tomorrow]] });
  const products = cat.products.filter(p => p.kind !== 'proceso_interno');
  const meatSuppliers = cat.suppliers.filter(s => s.sellsMeat);
  const [edits, setEdits] = useState({});

  const usesMeat = pid => (activeRecipe(cat.recipes, pid)?.items || []).some(i => cat.ingredientsById[i.ingredientId]?.trackBySupplier);
  const plan = products.map(p => {
    const saved = orders.find(o => o.productId === p.id);
    const e = edits[p.id] || {};
    const isMain = p.id === (cat.settings.burgerProductId || 'mountain-burger');
    return {
      product: p, saved,
      planned: e.planned ?? saved?.qtyPlanned ?? (isMain ? 40 : 0),
      meatSupplierId: e.meatSupplierId ?? saved?.meatSupplierId ?? meatSuppliers[0]?.id ?? null,
      needsMeat: usesMeat(p.id)
    };
  });
  const set = (pid, patch) => setEdits(x => ({ ...x, [pid]: { ...(x[pid] || {}), ...patch } }));

  const res = useMemo(() => shoppingListMulti({
    plans: plan.map(p => ({ productId: p.product.id, planned: p.planned, finishedOnHand: cat.finishedOf(p.product.id), recipe: activeRecipe(cat.recipes, p.product.id), meatSupplierId: p.needsMeat ? p.meatSupplierId : null })),
    ingredientsById: cat.ingredientsById, variants: cat.variants, stock: stockByIngredient(cat.stockDocs)
  }), [JSON.stringify(plan.map(p => [p.product.id, p.planned, p.meatSupplierId])), cat]);

  function saveOrders() {
    run(ctx => ({ ops: plan.flatMap(p => saveDoc('production_orders', `${tomorrow}__${p.product.id}`, {
      forDate: tomorrow, productId: p.product.id, qtyPlanned: Number(p.planned) || 0, meatSupplierId: p.needsMeat ? p.meatSupplierId : null,
      status: 'abierta', createdAt: p.saved?.createdAt || ctx.now
    }, ctx).ops) }));
    setEdits({});
    toast(L('Comanda guardada', 'Plan saved'));
  }

  const toBuy = res.lines.filter(l => l.shortBase > 0);
  return (
    <>
      <h2>{L('Comanda de mañana', "Tomorrow's plan")}</h2>
      {plan.map((p, i) => (
        <Card key={p.product.id} title={p.product.name} right={<span className="small muted">{L('En nevera', 'In fridge')}: {cat.finishedOf(p.product.id)}</span>}>
          <Stepper value={p.planned} onChange={v => set(p.product.id, { planned: v })} step={5} />
          <div className="seg" style={{ marginTop: 8 }}>{[0, 20, 40, 60].map(n => <button key={n} className="btn secondary" onClick={() => set(p.product.id, { planned: n })}>{n}</button>)}</div>
          {p.needsMeat && (
            <>
              <p className="small muted" style={{ marginTop: 12 }}>{L('Carne de', 'Meat from')}</p>
              <Seg value={p.meatSupplierId} onChange={v => set(p.product.id, { meatSupplierId: v })} options={meatSuppliers.map(s => ({ value: s.id, label: s.name.replace('Carnicería de ', '') }))} />
            </>
          )}
          <p className="small muted" style={{ marginTop: 8 }}>{L(`Hay que hacer ${res.plans[i]?.toProduce ?? 0}`, `To make ${res.plans[i]?.toProduce ?? 0}`)}</p>
        </Card>
      ))}
      <button className="btn block" onClick={saveOrders}>{orders.length ? L('Actualizar comanda', 'Update plan') : L('Guardar comanda', 'Save plan')}</button>

      <Card title={L('Lista de compras', 'Shopping list')}>
        <div className={'notice ' + (toBuy.length ? 'warn' : 'good')} style={{ fontSize: '1.1em', fontWeight: 600 }}>{shoppingSentence(res.lines)}</div>
        {res.errors.length > 0 && <Notice tone="bad">{res.errors.join('. ')}</Notice>}
        <div className="scroll-x">
          <table className="list">
            <thead><tr><th>{L('Insumo', 'Item')}</th><th className="n">{L('Necesito', 'Need')}</th><th className="n">{L('Hay', 'Have')}</th><th className="n">{L('Comprar', 'Buy')}</th></tr></thead>
            <tbody>
              {res.lines.map(l => (
                <tr key={l.ingredientId}>
                  <td>{l.name}</td>
                  <td className="n">{num(l.needBase, 1)} {l.baseUnit}</td>
                  <td className="n">{num(l.onHand, 1)}</td>
                  <td className="n">{l.shortBase > 0 ? <strong>{num(l.buyQty ?? l.fallbackQty, 2)} {l.buyUnit}</strong> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {toBuy.length > 0 && <button className="btn block" style={{ marginTop: 12 }} onClick={() => go('purchase')}>{L('Registrar la compra', 'Log the purchase')}</button>}
      </Card>
    </>
  );
}
