import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { be, deviceId, newId } from './backend.js';
import { stockKey } from './recipe.js';

/** Suscripción en vivo a una colección. Devuelve [docs, cargando, error]. */
export function useCol(col, q = {}, enabled = true) {
  const key = JSON.stringify(q);
  const [state, setState] = useState({ docs: [], loading: true, error: null });
  useEffect(() => {
    if (!enabled) { setState({ docs: [], loading: false, error: null }); return undefined; }
    return be().subscribe(col, JSON.parse(key), (docs, error) => setState({ docs, loading: false, error }));
  }, [col, key, enabled]);
  return [state.docs, state.loading, state.error];
}

export function useDocLive(col, id) {
  const [d, setD] = useState(undefined);
  useEffect(() => (id ? be().subscribeDoc(col, id, x => setD(x)) : undefined), [col, id]);
  return d;
}

const CatalogCtx = createContext(null);

/**
 * Carga una sola vez los catálogos y saldos que usan todas las pantallas.
 * Si un rol no tiene permiso de leer algo (ej. cocina y precios), queda vacío.
 */
export function CatalogProvider({ user, profile, children }) {
  const role = profile?.role;
  const isAdmin = role === 'admin';
  const canMoney = role === 'admin' || role === 'logistica';
  const [ingredients] = useCol('ingredients');
  const [suppliers] = useCol('suppliers');
  const [products] = useCol('products');
  const [recipes] = useCol('recipes');
  const [variants] = useCol('supplier_ingredient_variants');
  const [channels] = useCol('clients_channels');
  const [prices] = useCol('custom_prices', {}, canMoney);
  const [funds] = useCol('funds', {}, isAdmin || canMoney);
  const [rates] = useCol('commission_rates');
  const [stockDocs] = useCol('stock');
  const [finishedStock] = useCol('finished_stock');
  const [lots] = useCol('finished_lots', { where: [['remaining', '>', 0]] });
  const [users] = useCol('users', {}, canMoney);
  const [equipment] = useCol('equipment');
  const [cookingProfiles] = useCol('cooking_profiles');
  const [settingsDocs] = useCol('settings');

  const value = useMemo(() => {
    const active = list => list.filter(x => x.active !== false);
    const ingredientsById = Object.fromEntries(ingredients.map(i => [i.id, i]));
    const stockMap = Object.fromEntries(stockDocs.map(s => [s.id, Number(s.qtyBase) || 0]));
    const settings = settingsDocs.find(s => s.id === 'app') || {};
    return {
      ingredients: active(ingredients).sort((a, b) => a.name.localeCompare(b.name)),
      ingredientsById, suppliers: active(suppliers), products: active(products), recipes, variants,
      channels: active(channels), prices, funds: [...funds].sort((a, b) => (a.order || 0) - (b.order || 0)),
      rates, stockDocs, stockMap, finishedStock, lots, users, equipment, cookingProfiles, settings,
      stockOf: (ingredientId, supplierId) => stockMap[stockKey(ingredientId, supplierId)] || 0,
      stockTotal: ingredientId => stockDocs.filter(s => s.ingredientId === ingredientId).reduce((a, s) => a + (Number(s.qtyBase) || 0), 0),
      finishedOf: productId => Number(finishedStock.find(f => f.id === productId)?.qty) || 0,
      seeded: settingsDocs.some(s => s.id === 'app')
    };
  }, [ingredients, suppliers, products, recipes, variants, channels, prices, funds, rates, stockDocs, finishedStock, lots, users, equipment, cookingProfiles, settingsDocs]);

  return <CatalogCtx.Provider value={{ ...value, user, profile }}>{children}</CatalogCtx.Provider>;
}

export function useCatalog() {
  return useContext(CatalogCtx);
}

/** Contexto para las operaciones de ops.js y función para guardarlas. */
export function useOps() {
  const cat = useCatalog();
  const ctxFor = useCallback(() => ({ uid: cat.user.uid, deviceId: deviceId(), now: new Date().toISOString(), newId, cat }), [cat]);
  const run = useCallback((build) => {
    const ctx = ctxFor();
    const res = build(ctx);
    // No se espera al servidor: sin señal queda en cola y la pantalla ya lo muestra (RNF-02/03).
    const p = be().commit(res.ops);
    p.catch(err => {
      console.error(err);
      window.dispatchEvent(new CustomEvent('mb-toast', { detail: { kind: 'error', text: 'No se pudo guardar en el servidor: ' + (err.code || err.message) } }));
    });
    return res;
  }, [ctxFor]);
  return { run, ctxFor };
}

export function toast(text, kind = 'ok') {
  window.dispatchEvent(new CustomEvent('mb-toast', { detail: { kind, text } }));
}
