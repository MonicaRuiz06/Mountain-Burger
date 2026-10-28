// Fechas en hora local del celular (Cali, UTC−5). toISOString() daría el día UTC,
// y una producción a las 8 p. m. quedaría registrada al día siguiente.
const pad = n => String(n).padStart(2, '0');

export function localDay(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function addDaysLocal(days, d = new Date()) {
  return localDay(new Date(new Date(d).getTime() + days * 864e5));
}
