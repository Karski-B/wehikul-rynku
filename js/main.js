// Punkt wejścia aplikacji: łączy dane, symulację, ocenę i interfejs.
// Jeden obiekt `state` jest jedynym źródłem prawdy dla wykresu, daty, portfela i dziennika.

import { loadChallenge } from './data.js';
import {
  createIntroState, startChallenge, placeOrder, cancelOrder, advance, setStopLoss,
  validatePlan, parseDecimal, isRestorable,
} from './simulation.js';
import { evaluateProcess, CATEGORIES, DIVERSIFICATION_QUESTION } from './scoring.js';
import { loadState, saveState, clearState } from './storage.js';
import { createPriceChart } from './chart.js';
import { initAnalytics, track, EVENTS, getAnalyticsMode, onTestEvent } from './analytics.js';
import { initSignupForm } from './signup.js';
import { CONFIG } from './config.js';
import {
  renderStaticTexts, renderQuiz, renderXpRules, showScreen, renderGame, renderOrderControls, renderResults,
} from './render.js';
import { formatDate, formatMoney, formatPercent } from './format.js';

const $ = (selector) => document.querySelector(selector);
const dom = {
  loadError: $('#load-error'),
  challengeTitle: $('#challenge-title'),
  introText: $('#intro-text'),
  assetNote: $('#asset-note'),
  sourceNote: $('#source-note'),
  dataAttribution: $('#data-attribution'),
  screenIntro: $('#screen-intro'),
  screenGame: $('#screen-game'),
  screenResults: $('#screen-results'),
  planForm: $('#plan-form'),
  quizOptions: $('#quiz-options'),
  quizLegend: $('#quiz-legend'),
  xpRules: $('#xp-rules'),
  gameTitle: $('#game-title'),
  sessionAnnouncer: $('#session-announcer'),
  portfolioValue: $('#portfolio-value'),
  portfolioProfit: $('#portfolio-profit'),
  sessionDate: $('#session-date'),
  sessionProgressText: $('#session-progress-text'),
  sessionProgress: $('#session-progress'),
  sessionProgressFill: $('#session-progress-fill'),
  cashValue: $('#cash-value'),
  positionValue: $('#position-value'),
  limitMargin: $('#limit-margin'),
  limitFill: $('#limit-fill'),
  priceNow: $('#price-now'),
  priceChange: $('#price-change'),
  priceChart: $('#price-chart'),
  chartFallback: $('#chart-fallback'),
  priceTable: $('#price-table'),
  notice: $('#notice'),
  orderForm: $('#order-form'),
  orderLabel: $('#order-label'),
  orderInput: $('#order-input'),
  orderSuffix: $('#order-suffix'),
  orderChips: $('#order-chips'),
  orderHint: $('#order-hint'),
  orderError: $('#order-error'),
  orderSubmit: $('#order-submit'),
  pending: $('#pending'),
  pendingText: $('#pending-text'),
  cancelOrder: $('#cancel-order'),
  stopSelect: $('#stop-select'),
  stopInfo: $('#stop-info'),
  nextSession: $('#next-session'),
  planSummary: $('#plan-summary'),
  journal: $('#journal'),
  resetButton: $('#reset-button'),
  resultHero: $('#result-hero'),
  resultEyebrow: $('#result-eyebrow'),
  resultsTitle: $('#results-title'),
  resultSummary: $('#result-summary'),
  resultValue: $('#result-value'),
  resultProfit: $('#result-profit'),
  resultLimit: $('#result-limit'),
  xpRing: $('#xp-ring'),
  xpTotal: $('#xp-total'),
  strengths: $('#strengths'),
  improvements: $('#improvements'),
  categories: $('#categories'),
  resultsJournal: $('#results-journal'),
  replayButton: $('#replay-button'),
  signupSection: $('#signup-section'),
  signupForm: $('#signup-form'),
  courseButton: $('#course-button'),
  courseDialog: $('#course-dialog'),
  analyticsNote: $('#analytics-note'),
  analyticsDebug: $('#analytics-debug'),
  analyticsDebugList: $('#analytics-debug-list'),
};

let challenge;
let state;
let chart = null;
let orderSide = 'buy';

function persist() {
  saveState(state);
}

function showNotice(type, title, text) {
  dom.notice.className = `notice notice-${type}`;
  dom.notice.replaceChildren();
  const strong = document.createElement('strong');
  strong.textContent = title;
  dom.notice.append(strong, document.createTextNode(text));
  dom.notice.hidden = false;
}

function hideNotice() {
  dom.notice.hidden = true;
}

function setOrderError(message) {
  dom.orderError.textContent = message;
  dom.orderError.hidden = !message;
  dom.orderInput.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function refreshOrderControls() {
  renderOrderControls(dom, state, challenge, orderSide);
}

function refreshGame() {
  const info = renderGame(dom, state, challenge, chart);
  refreshOrderControls();
  return info;
}

// ===== Ekran planu =====

function readPlan() {
  const data = new FormData(dom.planForm);
  const stop = data.get('stopLossPercent');
  return {
    maxPositionPercent: data.has('maxPositionPercent') ? Number(data.get('maxPositionPercent')) : undefined,
    stopLossPercent: stop === null ? undefined : stop === 'none' ? null : Number(stop),
    quizAnswer: data.get('quizAnswer') ?? undefined,
  };
}

function handlePlanSubmit(event) {
  event.preventDefault();
  if (state.status !== 'intro') return;
  const plan = readPlan();
  const errors = validatePlan(plan, DIVERSIFICATION_QUESTION.options.map((o) => o.id));
  ['maxPositionPercent', 'stopLossPercent', 'quizAnswer'].forEach((field) => {
    const error = errors.find((e) => e.field === field);
    const node = document.getElementById(`error-${field}`);
    node.textContent = error ? error.message : '';
    node.hidden = !error;
  });
  if (errors.length > 0) {
    dom.planForm.querySelector(`input[name="${errors[0].field}"]`).focus();
    return;
  }

  const runId = window.crypto?.randomUUID?.() ?? String(Date.now());
  state = startChallenge(challenge, plan, runId);
  // Rozpoczęcie liczymy dokładnie raz na rozgrywkę — po kliknięciu „Rozpocznij wyzwanie”.
  if (!state.analytics.startedSent) {
    track(EVENTS.STARTED);
    state.analytics.startedSent = true;
  }
  persist();
  orderSide = 'buy';
  dom.orderInput.value = '';
  setOrderError('');
  showNotice('info', 'Start! ', `Widzisz notowania do ${formatDate(challenge.timeline.startDate)} r. ` +
    'Złóż zlecenie albo przejdź do następnej sesji.');
  refreshGame();
  showScreen(dom, 'game');
}

// ===== Ekran gry =====

function handleOrderSubmit(event) {
  event.preventDefault();
  const value = parseDecimal(dom.orderInput.value);
  const order = orderSide === 'buy' ? { side: 'buy', amount: value } : { side: 'sell', units: value };
  if (dom.orderInput.value.trim() === '') {
    setOrderError(orderSide === 'buy' ? 'Wpisz kwotę zakupu.' : 'Wpisz liczbę jednostek do sprzedaży.');
    dom.orderInput.focus();
    return;
  }
  const result = placeOrder(state, challenge, order);
  if (result.error) {
    setOrderError(result.error);
    dom.orderInput.focus();
    return;
  }
  state = result.state;
  persist();
  setOrderError('');
  dom.orderInput.value = '';
  showNotice('info', 'Zlecenie przyjęte. ', 'Wykona się po cenie z następnej sesji — kliknij „Następna sesja”.');
  refreshGame();
  dom.nextSession.focus();
}

function handleCancelOrder() {
  state = cancelOrder(state, challenge);
  persist();
  showNotice('info', 'Zlecenie anulowane. ', 'Możesz złożyć nowe.');
  refreshGame();
  dom.orderInput.focus();
}

function handleStopChange() {
  const value = dom.stopSelect.value;
  state = setStopLoss(state, challenge, value === 'none' ? null : Number(value));
  persist();
  refreshGame();
}

function describeSession(info) {
  return `${formatDate(info.date)}: cena ${formatMoney(info.price)} (${formatPercent(info.change, true)}). ` +
    `Wartość portfela ${formatMoney(info.value)}.`;
}

function handleNextSession() {
  if (state.status !== 'playing') return;
  const journalBefore = state.journal.length;
  state = advance(state, challenge);
  persist();
  setOrderError('');

  const fresh = state.journal.slice(journalBefore);
  const stop = fresh.find((e) => e.kind === 'stop');
  const skipped = fresh.find((e) => e.kind === 'cancel');
  const trade = fresh.find((e) => e.kind === 'buy' || e.kind === 'sell');
  if (stop) {
    showNotice('warn', 'Zadziałał stop loss. ', stop.detail);
  } else if (skipped) {
    showNotice('warn', `${skipped.title}. `, skipped.detail ?? '');
  } else if (trade) {
    showNotice('info', `${trade.title}. `, trade.detail);
  } else {
    hideNotice();
  }

  if (state.status === 'finished') {
    showResults();
    return;
  }
  const info = refreshGame();
  dom.sessionAnnouncer.textContent = describeSession(info);
}

// ===== Ekran wyników =====

function showResults() {
  renderGame(dom, state, challenge, chart);
  renderResults(dom, state, challenge, evaluateProcess(state, challenge));
  // Ukończenie liczymy raz na rozgrywkę — także po przerwaniu przez limit straty,
  // bo użytkownik faktycznie dotarł do ekranu końcowego.
  if (!state.analytics.completedSent) {
    track(EVENTS.COMPLETED);
    state = { ...state, analytics: { ...state.analytics, completedSent: true } };
    persist();
  }
  showScreen(dom, 'results');
}

function resetToIntro() {
  clearState();
  state = createIntroState(challenge);
  dom.planForm.reset();
  dom.planForm.querySelectorAll('.field-error').forEach((node) => { node.hidden = true; });
  hideNotice();
  showScreen(dom, 'intro');
}

function handleReset() {
  // Natywne okno potwierdzenia jest dostępne z klawiatury i na telefonie.
  if (window.confirm('Zresetować wyzwanie? Bieżąca rozgrywka zostanie usunięta.')) resetToIntro();
}

// ===== Przycisk kursu =====

let lastCourseClick = 0;
function handleCourseClick() {
  const now = Date.now();
  // Jedno kliknięcie = jedno zdarzenie (ochrona przed podwójnym kliknięciem).
  if (dom.courseDialog.open || now - lastCourseClick < 800) return;
  lastCourseClick = now;
  track(EVENTS.COURSE_CLICKED);
  dom.courseDialog.showModal();
}

function closeDialogOnBackdrop(event) {
  // Drugie kliknięcie z podwójnego kliknięcia nie może od razu zamknąć okna.
  if (event.target !== dom.courseDialog || Date.now() - lastCourseClick < 600) return;
  const box = dom.courseDialog.getBoundingClientRect();
  const inside = event.clientX >= box.left && event.clientX <= box.right
    && event.clientY >= box.top && event.clientY <= box.bottom;
  if (!inside) dom.courseDialog.close();
}

// ===== Analityka =====

function setupAnalyticsInfo() {
  const mode = initAnalytics();
  dom.analyticsNote.textContent = mode === 'umami'
    ? 'Pomiar: liczymy anonimowo rozpoczęcia i ukończenia wyzwań oraz kliknięcia przycisku kursu (Umami, bez cookies, bez danych osobowych). Szczegóły w polityce prywatności.'
    : 'Pomiar: tryb testowy — zdarzenia (rozpoczęcie, ukończenie, kliknięcie kursu) nie są nigdzie wysyłane.';
  if (mode === 'test' && new URLSearchParams(window.location.search).has('debug')) {
    dom.analyticsDebug.hidden = false;
    onTestEvent((_, log) => {
      dom.analyticsDebugList.replaceChildren(...log.map((entry) => {
        const li = document.createElement('li');
        li.textContent = `${entry.time} — ${entry.name}`;
        return li;
      }));
    });
  }
}

// ===== Start aplikacji =====

function bindEvents() {
  dom.planForm.addEventListener('submit', handlePlanSubmit);
  dom.orderForm.addEventListener('submit', handleOrderSubmit);
  dom.orderForm.addEventListener('change', (event) => {
    if (event.target.name !== 'side') return;
    orderSide = event.target.value;
    dom.orderInput.value = '';
    setOrderError('');
    refreshOrderControls();
  });
  dom.orderInput.addEventListener('input', () => {
    setOrderError('');
    refreshOrderControls();
  });
  dom.orderChips.addEventListener('click', (event) => {
    const chip = event.target.closest('button[data-value]');
    if (!chip || chip.disabled) return;
    dom.orderInput.value = chip.dataset.value;
    setOrderError('');
    refreshOrderControls();
  });
  dom.cancelOrder.addEventListener('click', handleCancelOrder);
  dom.stopSelect.addEventListener('change', handleStopChange);
  dom.nextSession.addEventListener('click', handleNextSession);
  dom.resetButton.addEventListener('click', handleReset);
  dom.replayButton.addEventListener('click', resetToIntro);
  dom.courseButton.addEventListener('click', handleCourseClick);
  dom.courseDialog.addEventListener('click', closeDialogOnBackdrop);
  if (CONFIG.signupEnabled) {
    dom.signupSection.hidden = false;
    initSignupForm(dom.signupForm);
  }
}

async function init() {
  setupAnalyticsInfo();
  try {
    challenge = await loadChallenge();
  } catch (error) {
    dom.loadError.textContent = `Nie udało się uruchomić wyzwania. ${error.message} ` +
      'Upewnij się, że strona jest otwarta przez serwer (np. python3 -m http.server), a nie z pliku.';
    dom.loadError.hidden = false;
    return;
  }

  renderStaticTexts(dom, challenge);
  renderQuiz(dom.quizOptions, dom.quizLegend, DIVERSIFICATION_QUESTION);
  renderXpRules(dom.xpRules, CATEGORIES);
  chart = createPriceChart(dom.priceChart);
  dom.chartFallback.hidden = chart !== null;
  bindEvents();

  const saved = loadState();
  state = isRestorable(saved, challenge) ? saved : createIntroState(challenge);
  if (state.status === 'playing') {
    refreshGame();
    showScreen(dom, 'game', false);
  } else if (state.status === 'finished') {
    showResults();
  } else {
    showScreen(dom, 'intro', false);
  }
}

init();
