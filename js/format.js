// Formatowanie liczb i dat po polsku. Strefa UTC, żeby data z pliku nie przesunęła się o dzień.

const moneyFormat = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });
const percentFormat = new Intl.NumberFormat('pl-PL', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const longDate = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function formatMoney(value) {
  return moneyFormat.format(value);
}

// Kwota ze znakiem, np. „+120,00 zł” albo „−80,00 zł”.
export function formatSignedMoney(value) {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) return moneyFormat.format(0);
  return (rounded > 0 ? '+' : '−') + moneyFormat.format(Math.abs(rounded));
}

// Ułamek jako procent: 0.05 → „5,0%”. Opcjonalnie ze znakiem.
export function formatPercent(fraction, signed = false) {
  const rounded = Math.round(fraction * 1000) / 1000;
  const text = percentFormat.format(Math.abs(rounded));
  if (!signed || rounded === 0) return rounded < 0 ? `−${text}` : text;
  return (rounded > 0 ? '+' : '−') + text;
}

export function formatNumber(value, digits = 2) {
  return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatDate(isoDate) {
  return longDate.format(new Date(`${isoDate}T00:00:00Z`));
}

export function formatShortDate(isoDate) {
  return shortDate.format(new Date(`${isoDate}T00:00:00Z`));
}

const monthYear = new Intl.DateTimeFormat('pl-PL', { month: 'short', year: 'numeric', timeZone: 'UTC' });

// Krótki zapis miesiąca i roku, np. „kwi 2020” — do osi wykresu przy długich okresach.
export function formatMonthYear(isoDate) {
  return monthYear.format(new Date(`${isoDate}T00:00:00Z`));
}

// Polska odmiana: 1 sesja, 2–4 sesje (bez 12–14), 5+ sesji.
export function formatSessions(count) {
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  let word = 'sesji';
  if (count === 1) word = 'sesja';
  else if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) word = 'sesje';
  return `${count} ${word}`;
}

const weekdayShort = new Intl.DateTimeFormat('pl-PL', { weekday: 'short', timeZone: 'UTC' });
const compactDate = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Dzień tygodnia, np. „pt.” — do pulpitu czasu.
export function formatWeekday(isoDate) {
  return weekdayShort.format(new Date(`${isoDate}T00:00:00Z`));
}

// Data z krótkim miesiącem, np. „6 mar 2020”.
export function formatCompactDate(isoDate) {
  return compactDate.format(new Date(`${isoDate}T00:00:00Z`));
}
