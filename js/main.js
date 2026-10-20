// Punkt wejścia aplikacji: łączy dane, symulację, ocenę i interfejs.
// Jeden obiekt `state` jest jedynym źródłem prawdy dla wykresu, daty, portfela i dziennika.

import { loadChallenge } from './data.js';
import {
  createIntroState, startChallenge, placeOrder, cancelOrder, advance, advanceMany, setStopLoss,
  validatePlan, parseDecimal, isRestorable, getExtensionOptions, extendHorizon, buyAndHoldPath, getDate, finishEarly,
  setReflection,
} from './simulation.js';
import { createRandomChallenge, newSeed } from './random-market.js';
import { evaluateProcess, reflectionFeedback, CATEGORIES, DIVERSIFICATION_QUESTION } from './scoring.js';
import { loadState, saveState, clearState, loadLesson, saveLesson } from './storage.js';
import { createPriceChart } from './chart.js';
import { initAnalytics, track, EVENTS, onTestEvent } from './analytics.js';
import { initSignupForm } from './signup.js';
import { CONFIG } from './config.js';
import {
  renderStaticTexts, renderQuiz, renderHorizons, renderXpRules, showScreen, renderGame, renderOrderControls, renderResults,
  renderReasons, renderLessonNote,
} from './render.js';
import { formatDate, formatMoney, formatPercent, formatSessions } from './format.js';

const $ = (selector) => document.querySelector(selector);
const dom = {
  loading: $('#loading'),
  loadError: $('#load-error'),
  challengeTitle: $('#challenge-title'),
  headerEyebrow: $('#header-eyebrow'),
  introEyebrow: $('#intro-eyebrow'),
  introTitle: $('#intro-title'),
  introText: $('#intro-text'),
  assetNote: $('#asset-note'),
  sourceNote: $('#source-note'),
  dataAttribution: $('#data-attribution'),
  screenIntro: $('#screen-intro'),
  screenGame: $('#screen-game'),
  screenResults: $('#screen-results'),
  planForm: $('#plan-form'),
  marketHelp: $('#market-help'),
  rerollButton: $('#reroll-button'),
  quizOptions: $('#quiz-options'),
  quizLegend: $('#quiz-legend'),
  horizonOptions: $('#horizon-options'),
  xpRules: $('#xp-rules'),
  gameTitle: $('#game-title'),
  portfolioValue: $('#portfolio-value'),
  portfolioProfit: $('#portfolio-profit'),
  sessionDate: $('#session-date'),
  sessionProgressText: $('#session-progress-text'),
  sessionProgress: $('#session-progress'),
  sessionProgressFill: $('#session-progress-fill'),
  timelineTicks: $('#timeline-ticks'),
  timelineMarks: $('#timeline-marks'),
  timelineNow: $('#timeline-now'),
  timelineStart: $('#timeline-start'),
  timelineEnd: $('#timeline-end'),
  cashValue: $('#cash-value'),
  assetLabel: $('#asset-label'),
  positionValue: $('#position-value'),
  limitMargin: $('#limit-margin'),
  limitFill: $('#limit-fill'),
  limitLevel: $('#limit-level'),
  chartTitle: $('#chart-title'),
  priceNow: $('#price-now'),
  priceChange: $('#price-change'),
  priceReal: $('#price-real'),
  priceChart: $('#price-chart'),
  chartFallback: $('#chart-fallback'),
  priceTable: $('#price-table'),
  tableDetails: $('.table-details'),
  priceTableCaption: $('#price-table-caption'),
  notice: $('#notice'),
  orderForm: $('#order-form'),
  orderLabel: $('#order-label'),
  orderInput: $('#order-input'),
  orderSuffix: $('#order-suffix'),
  orderChips: $('#order-chips'),
  orderHint: $('#order-hint'),
  orderError: $('#order-error'),
  orderSubmit: $('#order-submit'),
  reasonOptions: $('#reason-options'),
  reasonHelp: $('#reason-help'),
  reasonWarning: $('#reason-warning'),
  confirmDialog: $('#confirm-dialog'),
  confirmTitle: $('#confirm-title'),
  confirmText: $('#confirm-text'),
  confirmOk: $('#confirm-ok'),
  confirmCancel: $('#confirm-cancel'),
  pending: $('#pending'),
  pendingText: $('#pending-text'),
  cancelOrder: $('#cancel-order'),
  stopSelect: $('#stop-select'),
  stopInfo: $('#stop-info'),
  nextSession: $('#next-session'),
  ffWeek: $('#ff-week'),
  ffMonth: $('#ff-month'),
  finishButton: $('#finish-button'),
  disclaimer: $('.disclaimer'),
  dock: $('#dock'),
  dockWeekday: $('#dock-weekday'),
  dockDate: $('#dock-date'),
  dockSession: $('#dock-session'),
  dockPrice: $('#dock-price'),
  dockChange: $('#dock-change'),
  dockValue: $('#dock-value'),
  dockEvent: $('#dock-event'),
  newsCard: $('#news-card'),
  newsList: $('#news-list'),
  statsList: $('#stats-list'),
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
  extendCard: $('#extend-card'),
  extendOptions: $('#extend-options'),
  compareGrid: $('#compare-grid'),
  xpRing: $('#xp-ring'),
  xpTotal: $('#xp-total'),
  strengths: $('#strengths'),
  improvements: $('#improvements'),
  reflectionPrompt: $('#reflection-prompt'),
  reflectionOptions: $('#reflection-options'),
  reflectionFeedback: $('#reflection-feedback'),
  lessonCheck: $('#lesson-check'),
  lessonNote: $('#lesson-note'),
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

const FAST_FORWARD = { week: 5, month: 21 };

let historical;   // dane historyczne (zawsze wczytane — tryb losowy korzysta z ich dziennych zmian)
let challenge;    // bieżące wyzwanie: historyczne albo losowe
let state;
let chart = null;
let orderSide = 'buy';

function persist() {
  saveState(state);
}

// Pełna treść zdarzenia (karta nad formularzem zlecenia). Dla czytnika ekranu ogłaszamy
// zdarzenia tylko w jednym miejscu — w linii pulpitu (announce).
function showNotice(type, title, text) {
  dom.notice.hidden = false;
  dom.notice.className = `notice notice-${type}`;
  dom.notice.replaceChildren();
  const strong = document.createElement('strong');
  strong.textContent = title;
  dom.notice.append(strong, document.createTextNode(text));
}

function hideNotice() {
  dom.notice.hidden = true;
}

// Linia zdarzenia w pulpicie (aria-live). Czytnik słyszy też datę, cenę i portfel,
// a na ekranie widać tylko krótkie zdarzenie albo oczekujące zlecenie.
function announce(info, event) {
  const summary = document.createElement('span');
  summary.className = 'sr-only';
  summary.textContent = `${formatDate(info.date)}: cena ${formatMoney(info.price)} (${info.changeText}), ` +
    `portfel ${formatMoney(info.value)}. `;
  const parts = [summary];
  const order = state.pendingOrder;
  if (event) {
    const strong = document.createElement('strong');
    strong.textContent = event.title;
    parts.push(strong, document.createTextNode(` ${event.text}`));
  } else if (order) {
    parts.push(document.createTextNode(order.side === 'buy'
      ? `Oczekuje: kupno za ${formatMoney(order.amount)} — wykona się w następnej sesji.`
      : 'Oczekuje: sprzedaż — wykona się w następnej sesji.'));
  }
  dom.dockEvent.replaceChildren(...parts);
  updateBarHeights();
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

// ===== Wybór rynku (historia albo losowy) =====

function seedFromUrl() {
  const seed = Number(new URLSearchParams(window.location.search).get('seed'));
  return Number.isInteger(seed) && seed > 0 ? seed : null;
}

function useChallenge(next) {
  challenge = next;
  renderStaticTexts(dom, challenge);
  renderHorizons(dom.horizonOptions, challenge, challenge.timeline.defaultHorizon);
  renderReasons(dom, challenge);
  const random = challenge.mode === 'random';
  dom.rerollButton.hidden = !random;
  dom.marketHelp.textContent = random
    ? `Ceny są losowe (losowanie nr ${challenge.seed}) i nie są prawdziwymi notowaniami. ` +
      `Ten sam numer daje te same ceny — dopisz ?seed=${challenge.seed} do adresu strony, aby zagrać jeszcze raz.`
    : 'Prawdziwe ceny ropy WTI od marca 2020 r. (dane EIA) — z prawdziwymi wydarzeniami rynkowymi.';
}

function handleModeChange(mode) {
  if (state.status !== 'intro') return;
  useChallenge(mode === 'random' ? createRandomChallenge(historical, seedFromUrl() ?? newSeed()) : historical);
  state = createIntroState(challenge);
}

function handleReroll() {
  if (challenge.mode !== 'random' || state.status !== 'intro') return;
  useChallenge(createRandomChallenge(historical, newSeed()));
  state = createIntroState(challenge);
}

// ===== Ekran planu =====

function readPlan() {
  const data = new FormData(dom.planForm);
  const stop = data.get('stopLossPercent');
  return {
    maxPositionPercent: data.has('maxPositionPercent') ? Number(data.get('maxPositionPercent')) : undefined,
    stopLossPercent: stop === null ? undefined : stop === 'none' ? null : Number(stop),
    quizAnswer: data.get('quizAnswer') ?? undefined,
    horizonId: data.get('horizonId') ?? undefined,
  };
}

function handlePlanSubmit(event) {
  event.preventDefault();
  if (state.status !== 'intro') return;
  const plan = readPlan();
  const errors = validatePlan(plan, DIVERSIFICATION_QUESTION.options.map((o) => o.id),
    challenge.timeline.horizons.map((h) => h.id));
  ['maxPositionPercent', 'stopLossPercent', 'quizAnswer', 'horizonId'].forEach((field) => {
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
  // Wniosek z poprzedniej gry zapisujemy w nowej rozgrywce — na końcu sprawdzimy, czy został dotrzymany.
  state = { ...startChallenge(challenge, plan, runId), lesson: loadLesson() };
  // Rozpoczęcie liczymy dokładnie raz na rozgrywkę — po kliknięciu „Rozpocznij wyzwanie”.
  if (!state.analytics.startedSent) {
    track(EVENTS.STARTED);
    state.analytics.startedSent = true;
  }
  persist();
  orderSide = 'buy';
  dom.orderInput.value = '';
  setOrderError('');
  const startText = `Widzisz notowania do ${formatDate(challenge.timeline.startDate)} r. ` +
    'Złóż zlecenie albo przejdź do następnej sesji.';
  showNotice('info', 'Start! ', startText);
  const info = refreshGame();
  show('game');
  // Ogłaszamy dopiero, gdy ekran gry jest widoczny — komunikat w ukrytej sekcji by przepadł.
  setTimeout(() => announce(info, { title: 'Start!', text: startText }), 100);
}

// ===== Ekran gry =====

function handleOrderSubmit(event) {
  event.preventDefault();
  const value = parseDecimal(dom.orderInput.value);
  const reason = dom.orderForm.elements.reason.value || null;
  const order = orderSide === 'buy' ? { side: 'buy', amount: value, reason } : { side: 'sell', units: value, reason };
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
  clearReason(); // każde zlecenie ma własny powód
  refreshOrderControls();
  showNotice('info', 'Zlecenie przyjęte. ', 'Wykona się po cenie z następnej sesji — kliknij „Następna sesja”.');
  announce(refreshGame(), null);
  dom.nextSession.focus();
}

function clearReason() {
  dom.reasonOptions.querySelectorAll('input').forEach((input) => { input.checked = false; });
}

function handleCancelOrder() {
  state = cancelOrder(state, challenge);
  persist();
  showNotice('info', 'Zlecenie anulowane. ', 'Możesz złożyć nowe.');
  announce(refreshGame(), { title: 'Zlecenie anulowane.', text: 'Możesz złożyć nowe.' });
  dom.orderInput.focus();
}

function handleStopChange() {
  const value = dom.stopSelect.value;
  state = setStopLoss(state, challenge, value === 'none' ? null : Number(value));
  persist();
  refreshGame();
}

// Po przejściu do przodu: komunikat o najważniejszym zdarzeniu, odświeżenie albo ekran wyniku.
function describeAdvance(journalBefore, dateBefore, steps, stopReason) {
  const fresh = state.journal.slice(journalBefore);
  const stop = fresh.find((e) => e.kind === 'stop');
  const skipped = fresh.find((e) => e.kind === 'cancel');
  const trade = fresh.find((e) => e.kind === 'buy' || e.kind === 'sell');
  const today = getDate(challenge, state.index);
  const news = (challenge.marketEvents ?? []).filter((e) => e.date > dateBefore && e.date <= today);
  const skippedText = steps > 1 ? ` (przewinięto ${formatSessions(steps)})` : '';
  if (stop) return { type: 'warn', title: 'Zadziałał stop loss.', text: stop.detail + skippedText };
  if (skipped) return { type: 'warn', title: `${skipped.title}.`, text: (skipped.detail ?? '') + skippedText };
  if (trade) return { type: 'info', title: `${trade.title}.`, text: trade.detail + skippedText };
  if (news.length > 0) {
    const latest = news[news.length - 1];
    return { type: 'info', title: `Wiadomość z rynku: ${latest.title}.`, text: latest.text + skippedText };
  }
  if (stopReason === 'big_move') {
    const [previous, current] = state.history.slice(-2);
    const move = previous.price > 0 && current.price > 0 ? formatPercent(current.price / previous.price - 1, true) : 'bardzo duży';
    return { type: 'warn', title: 'Przewijanie zatrzymane: duży ruch ceny.', text: `Cena zmieniła się o ${move}, a masz otwartą pozycję${skippedText}.` };
  }
  if (stopReason === 'near_limit') {
    return { type: 'warn', title: 'Przewijanie zatrzymane: blisko limitu.', text: `Do limitu straty zostało mniej niż 300 zł${skippedText}.` };
  }
  if (steps > 1) return { type: 'info', title: `Przewinięto ${formatSessions(steps)}.`, text: `Jest ${formatDate(today)}.` };
  return null;
}

function afterAdvance(journalBefore, dateBefore, steps, stopReason = null) {
  persist();
  setOrderError('');
  const event = describeAdvance(journalBefore, dateBefore, steps, stopReason);
  if (event) showNotice(event.type, `${event.title} `, event.text);
  else hideNotice();

  if (state.status === 'finished') {
    showResults();
    return;
  }
  announce(refreshGame(), event);
}

function handleNextSession() {
  if (state.status !== 'playing') return;
  const journalBefore = state.journal.length;
  const dateBefore = getDate(challenge, state.index);
  state = advance(state, challenge);
  afterAdvance(journalBefore, dateBefore, 1);
}

function handleFastForward(steps) {
  if (state.status !== 'playing') return;
  const journalBefore = state.journal.length;
  const dateBefore = getDate(challenge, state.index);
  const result = advanceMany(state, challenge, steps);
  state = result.state;
  afterAdvance(journalBefore, dateBefore, result.steps, result.stopReason);
}

// ===== Ekran wyników =====

function showResults() {
  renderGame(dom, state, challenge, chart);
  renderResults(dom, state, challenge, evaluateProcess(state, challenge), {
    extensionOptions: getExtensionOptions(state, challenge),
    benchmark: buyAndHoldPath(challenge, state.index),
  });
  // Ukończenie liczymy raz na rozgrywkę — także po przerwaniu przez limit straty,
  // bo użytkownik faktycznie dotarł do ekranu końcowego. Przedłużenie nie liczy się ponownie.
  if (!state.analytics.completedSent) {
    track(EVENTS.COMPLETED);
    state = { ...state, analytics: { ...state.analytics, completedSent: true } };
    persist();
  }
  show('results');
}

function handleReflection(event) {
  if (event.target.name !== 'reflection') return;
  state = setReflection(state, event.target.value);
  persist();
  saveLesson(state.reflection);
  // Aktualizujemy tylko tekst — przyciski zostają, więc fokus nie znika.
  dom.reflectionFeedback.textContent = reflectionFeedback(state.reflection, evaluateProcess(state, challenge));
}

function handleExtend(event) {
  const button = event.target.closest('button[data-index]');
  if (!button) return;
  const extended = extendHorizon(state, challenge, Number(button.dataset.index));
  if (extended === state) return;
  state = extended;
  persist();
  const text = `Nowy koniec: ${formatDate(getDate(challenge, state.endIndex))}. Portfel i plan zostają bez zmian.`;
  showNotice('info', 'Wyzwanie przedłużone. ', text);
  const info = refreshGame();
  show('game');
  setTimeout(() => announce(info, { title: 'Wyzwanie przedłużone.', text }), 100);
}

// Okno potwierdzenia w stronie. Zwraca Promise<boolean>. Esc i „Wróć…” = nie.
function askConfirm({ title, text, ok, cancel }) {
  dom.confirmTitle.textContent = title;
  dom.confirmText.textContent = text;
  dom.confirmOk.textContent = ok;
  dom.confirmCancel.textContent = cancel;
  return new Promise((resolve) => {
    const finish = (answer) => {
      dom.confirmOk.removeEventListener('click', onOk);
      dom.confirmCancel.removeEventListener('click', onCancel);
      dom.confirmDialog.removeEventListener('close', onClose);
      if (dom.confirmDialog.open) dom.confirmDialog.close();
      resolve(answer);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    const onClose = () => finish(false);
    dom.confirmOk.addEventListener('click', onOk);
    dom.confirmCancel.addEventListener('click', onCancel);
    dom.confirmDialog.addEventListener('close', onClose);
    dom.confirmDialog.showModal();
  });
}

async function handleFinish() {
  if (state.status !== 'playing') return;
  const confirmed = await askConfirm({
    title: 'Zakończyć grę teraz?',
    text: 'Ocenimy rozegrane sesje.' + (state.pendingOrder ? ' Oczekujące zlecenie zostanie anulowane.' : '') +
      ' Potem możesz grę przedłużyć w sekcji „Graj dalej”.',
    ok: 'Zakończ i pokaż ocenę',
    cancel: 'Wróć do gry',
  });
  if (!confirmed || state.status !== 'playing') return;
  state = finishEarly(state, challenge);
  persist();
  hideNotice();
  showResults();
}

function resetToIntro() {
  clearState();
  renderLessonNote(dom, loadLesson());
  const mode = challenge.mode === 'random' ? 'random' : 'history';
  // Nowa gra w trybie losowym = nowe losowanie cen.
  useChallenge(mode === 'random' ? createRandomChallenge(historical, newSeed()) : historical);
  state = createIntroState(challenge);
  dom.planForm.reset();
  dom.planForm.querySelector(`input[name="mode"][value="${mode}"]`).checked = true;
  renderHorizons(dom.horizonOptions, challenge, challenge.timeline.defaultHorizon);
  dom.planForm.querySelectorAll('.field-error').forEach((node) => { node.hidden = true; });
  hideNotice();
  show('intro');
}

async function handleReset() {
  const confirmed = await askConfirm({
    title: 'Zacząć od nowa?',
    text: 'Bieżąca rozgrywka zostanie usunięta i wrócisz do planu.',
    ok: 'Usuń grę i zacznij od nowa',
    cancel: 'Wróć do gry',
  });
  if (confirmed) resetToIntro();
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
    ? 'Pomiar: liczymy rozpoczęcia i ukończenia wyzwań oraz kliknięcia przycisku kursu (Umami, bez cookies). Umami otrzymuje przy tym dane techniczne, m.in. adres IP i adres strony. Szczegóły w polityce prywatności.'
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

// Mierzy pasek „edukacja, nie porada” i pulpit. CSS używa tych liczb jako zapasu przewijania,
// żeby element z fokusem nie schował się pod nimi (przy tekście 200% pasek ma ok. 170 px zamiast 52 px).
function updateBarHeights() {
  const root = document.documentElement;
  root.style.setProperty('--bar-h', `${Math.ceil(dom.disclaimer.getBoundingClientRect().height)}px`);
  const dock = Math.ceil(dom.dock.getBoundingClientRect().height);
  if (dock > 0) root.style.setProperty('--dock-h', `${dock}px`); // 0 = pulpit ukryty (inny ekran)
}

function trackBarHeights() {
  updateBarHeights();
  // Zmiana rozmiaru okna lub tekstu — przeglądarka sama powiadomi.
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(updateBarHeights);
    observer.observe(dom.disclaimer);
    observer.observe(dom.dock);
  }
}

// Zmiana ekranu + od razu nowy pomiar (pulpit pojawia się tylko na ekranie gry).
function show(name, focus = true) {
  showScreen(dom, name, focus);
  updateBarHeights();
}

// ===== Start aplikacji =====

function bindEvents() {
  dom.planForm.addEventListener('submit', handlePlanSubmit);
  dom.planForm.addEventListener('change', (event) => {
    if (event.target.name === 'mode') handleModeChange(event.target.value);
  });
  dom.rerollButton.addEventListener('click', handleReroll);
  dom.orderForm.addEventListener('submit', handleOrderSubmit);
  dom.orderForm.addEventListener('change', (event) => {
    if (event.target.name === 'reason') {
      refreshOrderControls(); // sprawdź, czy powód pasuje do sytuacji
      return;
    }
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
  dom.ffWeek.addEventListener('click', () => handleFastForward(FAST_FORWARD.week));
  dom.ffMonth.addEventListener('click', () => handleFastForward(FAST_FORWARD.month));
  dom.finishButton.addEventListener('click', handleFinish);
  dom.extendOptions.addEventListener('click', handleExtend);
  dom.reflectionOptions.addEventListener('change', handleReflection);
  dom.tableDetails.addEventListener('toggle', () => { if (state.status !== 'intro') refreshGame(); });
  dom.resetButton.addEventListener('click', handleReset);
  dom.replayButton.addEventListener('click', resetToIntro);
  dom.courseButton.addEventListener('click', handleCourseClick);
  dom.courseDialog.addEventListener('click', closeDialogOnBackdrop);
  if (CONFIG.signupEnabled) {
    dom.signupSection.hidden = false;
    initSignupForm(dom.signupForm);
  }
}

// Przywraca zapisaną rozgrywkę (także losową — ceny odtwarzamy z numeru losowania).
function restoreSavedState() {
  const saved = loadState();
  const id = saved?.challengeId ?? '';
  const candidate = id.startsWith('random-') ? createRandomChallenge(historical, Number(id.slice(7))) : historical;
  return isRestorable(saved, candidate) ? { saved, candidate } : null;
}

async function init() {
  setupAnalyticsInfo();
  try {
    historical = { ...(await loadChallenge()), mode: 'history' };
  } catch (error) {
    dom.loading.hidden = true;
    dom.loadError.textContent = 'Nie udało się wczytać danych wyzwania. Sprawdź połączenie z internetem i odśwież stronę.';
    console.error('Wehikuł Rynku: błąd wczytywania danych (przy pracy lokalnej uruchom stronę przez serwer, nie z pliku).', error);
    dom.loadError.hidden = false;
    return;
  }

  dom.loading.hidden = true;
  dom.dataAttribution.textContent = `Dane historyczne: ${historical.sources[0].attribution.replace(/^Źródło: /, '')}, ` +
    'domena publiczna. Przeliczenie na zł symulacyjne i ceny trybu losowego przygotowali autorzy aplikacji.';
  renderQuiz(dom.quizOptions, dom.quizLegend, DIVERSIFICATION_QUESTION);
  renderXpRules(dom.xpRules, CATEGORIES);
  chart = createPriceChart(dom.priceChart);
  dom.chartFallback.hidden = chart !== null;
  bindEvents();
  trackBarHeights();

  const restored = restoreSavedState();
  const urlSeed = seedFromUrl();
  if (restored) {
    useChallenge(restored.candidate);
    state = restored.saved;
  } else {
    useChallenge(urlSeed ? createRandomChallenge(historical, urlSeed) : historical);
    state = createIntroState(challenge);
  }
  dom.planForm.querySelector(`input[name="mode"][value="${challenge.mode === 'random' ? 'random' : 'history'}"]`).checked = true;

  if (state.status === 'playing') {
    announce(refreshGame(), null);
    show('game', false);
  } else if (state.status === 'finished') {
    showResults();
  } else {
    renderLessonNote(dom, loadLesson());
    show('intro', false);
  }
}

init();
