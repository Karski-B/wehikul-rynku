// Wykres ceny (Chart.js z CDN, globalny obiekt window.Chart).
// Dostaje WYŁĄCZNIE sesje już odsłonięte — przyszłych cen i dat tu nie ma.
// Oś Y skaluje się tylko do widocznych danych, więc nie zdradza przyszłych minimów.

import { formatDate, formatMoney, formatMonthYear, formatShortDate } from './format.js';

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function createPriceChart(canvas) {
  if (typeof window.Chart === 'undefined') return null;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let currentDates = []; // pełne daty do podpowiedzi (oś może pokazywać tylko miesiąc)
  const colors = {
    accent: cssVar('--accent'),
    gain: cssVar('--gain'),
    loss: cssVar('--loss'),
    muted: cssVar('--muted'),
    grid: cssVar('--border'),
  };

  const chart = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Cena',
          data: [],
          borderColor: colors.accent,
          borderWidth: 2.5,
          tension: 0.25,
          fill: true,
          backgroundColor(context) {
            const { ctx, chartArea } = context.chart;
            if (!chartArea) return 'transparent';
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(255, 181, 71, 0.28)');
            gradient.addColorStop(1, 'rgba(255, 181, 71, 0)');
            return gradient;
          },
          // Wyróżniamy tylko ostatnią (dzisiejszą) sesję
          pointRadius: (ctx) => (ctx.dataIndex === ctx.dataset.data.length - 1 ? 5 : 0),
          pointHoverRadius: 6,
          pointBackgroundColor: colors.accent,
          pointBorderColor: '#0b0f1a',
          pointBorderWidth: 2,
        },
        {
          label: 'Stop loss',
          data: [],
          borderColor: colors.loss,
          borderDash: [6, 5],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
        {
          label: 'Kupno',
          data: [],
          showLine: false,
          pointStyle: 'triangle',
          pointRadius: 7,
          pointHoverRadius: 8,
          pointBackgroundColor: colors.gain,
          pointBorderColor: colors.gain,
        },
        {
          label: 'Sprzedaż',
          data: [],
          showLine: false,
          pointStyle: 'triangle',
          pointRotation: 180,
          pointRadius: 7,
          pointHoverRadius: 8,
          pointBackgroundColor: colors.loss,
          pointBorderColor: colors.loss,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: reducedMotion.matches ? false : { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: (item) => item.raw !== null,
          callbacks: {
            title: (items) => (items.length > 0 ? formatDate(currentDates[items[0].dataIndex]) : ''),
            label: (item) => `${item.dataset.label}: ${formatMoney(item.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: colors.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
        },
        y: {
          grid: { color: colors.grid },
          border: { display: false },
          ticks: { color: colors.muted, maxTicksLimit: 6, callback: (value) => `${value} zł` },
        },
      },
    },
  });

  return {
    // view: { dates, prices, stopPrice, buyIndexes: Set, sellIndexes: Set }
    update(view) {
      const [price, stop, buys, sells] = chart.data.datasets;
      // Przy długich okresach (ponad pół roku) oś pokazuje miesiąc i rok zamiast dnia.
      const longRange = view.dates.length > 130;
      currentDates = view.dates;
      chart.data.labels = view.dates.map(longRange ? formatMonthYear : formatShortDate);
      price.data = view.prices;
      stop.data = view.stopPrice === null ? [] : view.prices.map(() => view.stopPrice);
      buys.data = view.prices.map((p, i) => (view.buyIndexes.has(i) ? p : null));
      sells.data = view.prices.map((p, i) => (view.sellIndexes.has(i) ? p : null));
      // Bez animacji przy ograniczeniu ruchu w systemie i przy bardzo długich wykresach.
      chart.options.animation = reducedMotion.matches || view.dates.length > 150 ? false : { duration: 400 };
      chart.update();
    },
  };
}
