import React, { createContext, useContext } from 'react';

// Idioma (RF-15): cada texto se escribe en los dos idiomas junto a donde se usa: L('Producir', 'Produce').
const LangCtx = createContext({ lang: 'es' });

export function LangProvider({ lang = 'es', children }) {
  return <LangCtx.Provider value={{ lang }}>{children}</LangCtx.Provider>;
}

export function useI18n() {
  const { lang } = useContext(LangCtx);
  const L = (es, en) => (lang === 'en' && en ? en : es);
  const locale = lang === 'en' ? 'en-US' : 'es-CO';
  const money = n => (n == null || !Number.isFinite(Number(n)) ? '—' : '$' + Math.round(Number(n)).toLocaleString(locale));
  const num = (n, d = 2) => (n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString(locale, { maximumFractionDigits: d }));
  const date = iso => (iso ? new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : '—');
  const time = iso => (iso ? new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) : '');
  return { lang, L, money, num, date, time };
}

export const REASONS = {
  regalo: ['Regalo', 'Gift'],
  consumo_interno: ['Consumo interno', 'Staff meal'],
  danado: ['Dañado', 'Damaged'],
  vencido: ['Vencido', 'Expired'],
  faltante_confianza: ['Faltante del bote', 'Honesty-box shortfall']
};

export const ROLES = {
  admin: ['Administración', 'Admin'],
  logistica: ['Logística y compras', 'Logistics'],
  cocina: ['Cocina y producción', 'Kitchen'],
  pendiente: ['Sin rol asignado', 'No role yet']
};
