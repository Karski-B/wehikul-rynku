// Aktualizacja HTML na podstawie stanu symulacji. Tu nie ma obliczeń finansowych —
// wszystkie liczby pochodzą z simulation.js i scoring.js.

import {
  formatCompactDate, formatDate, formatMoney, formatNumber, formatPercent, formatSessions, formatSignedMoney, formatWeekday,
} from './format.js';
import { getPortfolio, getPrice, getDate, getStats, priceChangeShare, parseDecimal, ORDER_REASONS } from './simulation.js';
import { REFLECTION_QUESTION, reflectionFeedback, checkOrderReason, decisionMetrics, lessonCheck } from './scoring.js';
import { getStartIndex } from './data.js';

export const BUY_CHIPS = [500, 1000, 2500, 5000];
export const SELL_CHIPS = [0.25, 0.5, 1];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function trendClass(value) {
  if (value > 0.004) return 'is-gain';
  if (value < -0.004) return 'is-loss';
  return 'is-flat';
}

function setTrend(node, value) {
  node.classList.remove('is-gain', 'is-loss', 'is-flat');
  node.classList.add(trendClass(value));
}

// Zmiana ceny jako tekst: procent, a przy cenie ujemnej — różnica w zł.
export function describePriceChange(previous, current) {
  const share = priceChangeShare(previous, current);
  return share === null ? formatSignedMoney(current - previous) : formatPercent(share, true);
}

// Tekst ułamka do pola formularza po polsku (przecinek dziesiętny).
export function toInputValue(value, digits) {
  return value.toFixed(digits).replace('.', ',');
}

export function renderStaticTexts(dom, challenge) {
  const asset = challenge.assets[0];
  const source = challenge.sources[0];
  const random = challenge.mode === 'random';
  dom.challengeTitle.textContent = challenge.title;
  dom.introTitle.textContent = random
    ? 'Masz 10 000 zł wirtualnych. Nie strać więcej niż 10% na nieznanym rynku.'
    : 'Masz 10 000 zł wirtualnych. Przetrwaj krach i nie strać więcej niż 10%.';
  dom.headerEyebrow.dataset.base = random ? 'Tryb ćwiczeniowy · ceny losowe' : 'Wyzwanie historyczne';
  dom.headerEyebrow.textContent = dom.headerEyebrow.dataset.base;
  document.title = `Wehikuł Rynku — ${challenge.title}`;
  dom.introText.textContent = challenge.intro;
  dom.introEyebrow.textContent = random
    ? `Losowy rynek · losowanie nr ${challenge.seed}`
    : `Prawdziwe ceny ropy WTI · start ${formatDate(challenge.timeline.startDate)} r.`;
  dom.assetNote.textContent = random
    ? `Aktywo: ${asset.name}. ${asset.conversion.method} To nie są prawdziwe notowania.`
    : `Aktywo: ${asset.name}. W grze używamy ceny symulacyjnej w zł ` +
      `(${formatDate(asset.conversion.baseDate)} = ${formatMoney(asset.conversion.basePrice)}), która zachowuje ` +
      'historyczne zmiany procentowe. To nie jest rzeczywista cena transakcyjna i nie uwzględnia kursu USD/PLN.';
  dom.sourceNote.textContent = random
    ? `${source.attribution}. To nie są prawdziwe notowania.`
    : `${source.attribution}. Seria RWTC (WTI Cushing, cena spot w USD). ` +
      'Ceny przeliczone przez autorów aplikacji na umowne zł symulacyjne.';
  dom.chartTitle.textContent = `${asset.shortName} · cena ${random ? 'losowa' : 'symulacyjna'}`;
  dom.assetLabel.textContent = asset.shortName;
}

export function renderQuiz(container, legend, question) {
  legend.textContent = `3. ${question.prompt}`;
  container.replaceChildren(...question.options.map((option) => {
    const label = el('label', 'choice');
    const input = el('input');
    input.type = 'radio';
    input.name = 'quizAnswer';
    input.value = option.id;
    const body = el('span', 'choice-body');
    body.append(el('span', 'choice-title', option.text));
    label.append(input, body);
    return label;
  }));
}

export function renderHorizons(container, challenge, selectedId) {
  container.replaceChildren(...challenge.timeline.horizons.map((horizon) => {
    const label = el('label', 'choice');
    const input = el('input');
    input.type = 'radio';
    input.name = 'horizonId';
    input.value = horizon.id;
    input.checked = horizon.id === selectedId;
    const body = el('span', 'choice-body');
    body.append(
      el('span', 'choice-title', horizon.label),
      el('span', 'choice-sub', `${formatSessions(horizon.sessions)} · do ${formatDate(horizon.endDate)}`),
    );
    label.append(input, body);
    return label;
  }));
}

// Pola wyboru w stylu „pigułek” (powód zlecenia, refleksja). Bez domyślnego zaznaczenia.
function renderPills(container, name, options) {
  container.replaceChildren(...options.map((option) => {
    const label = el('label', 'reason');
    const input = el('input');
    input.type = 'radio';
    input.name = name;
    input.value = option.id;
    label.append(input, el('span', '', option.label ?? option.text));
    return label;
  }));
}

// Losowy rynek nie ma wiadomości, więc nie pokazujemy tam powodu „Reaguję na nową informację”.
export function renderReasons(dom, challenge) {
  const hasNews = (challenge.marketEvents ?? []).length > 0;
  renderPills(dom.reasonOptions, 'reason', ORDER_REASONS.filter((r) => hasNews || r.id !== 'news'));
  dom.reasonHelp.textContent = 'Powód sprawdzimy z faktami: „Zgodnie z planem” — zakup w limicie i ze stop lossem z planu' +
    (hasNews ? ', „Reaguję na nową informację” — wiadomość z rynku z ostatnich 5 sesji' : '') +
    ', „Ograniczam ryzyko” — sprzedaż. Wymyślony powód nie da XP. Jeśli powodu nie ma, wybierz szczerze ' +
    '„Bez konkretnego powodu” — to sygnał, żeby jeszcze poczekać.';
  dom.reasonWarning.textContent = '';
}

// Podpowiedź pod „Dlaczego?”: czy wybrany powód zgadza się z faktami (ta sama funkcja co w ocenie XP).
function renderReasonCheck(dom, state, challenge, side, amount, portfolio) {
  const chosen = ORDER_REASONS.find((r) => r.id === dom.orderForm.elements.reason?.value);
  let problem = null;
  if (chosen && chosen.id !== 'impulse' && !state.pendingOrder) {
    problem = checkOrderReason({
      side, reason: chosen.id, amount, date: getDate(challenge, state.index),
      decision: { positionValue: portfolio.positionValue, stopLossPercent: state.stopLossPercent },
    }, state.plan, challenge);
  }
  // Osobny region ogłaszany przez czytnik ekranu tylko wtedy, gdy pojawia się ostrzeżenie.
  const text = problem ? `„${chosen.label}” nie pasuje do sytuacji: ${problem}. Taki powód nie da XP.` : '';
  if (dom.reasonWarning.textContent !== text) dom.reasonWarning.textContent = text;
}

export function renderReflection(dom, state, evaluation) {
  dom.reflectionPrompt.textContent = REFLECTION_QUESTION.prompt;
  renderPills(dom.reflectionOptions, 'reflection', REFLECTION_QUESTION.options);
  const checked = dom.reflectionOptions.querySelector(`input[value="${state.reflection}"]`);
  if (checked) checked.checked = true;
  dom.reflectionFeedback.textContent = reflectionFeedback(state.reflection, evaluation);
  const lesson = lessonCheck(state.lesson, evaluation);
  dom.lessonCheck.hidden = !lesson;
  dom.lessonCheck.textContent = lesson?.text ?? '';
}

// Ekran planu: przypomnienie wniosku z poprzedniej gry (jeśli był).
export function renderLessonNote(dom, choiceId) {
  const option = REFLECTION_QUESTION.options.find((o) => o.id === choiceId);
  dom.lessonNote.hidden = !option;
  dom.lessonNote.textContent = option
    ? `Twój wniosek z poprzedniej gry: „${option.text}”. Na końcu sprawdzimy, czy udało się go dotrzymać.`
    : '';
}

export function renderXpRules(container, categories) {
  const wrapper = el('div', 'xp-rules-table');
  categories.forEach((category) => {
    const block = el('div', 'xp-rule-category');
    const max = category.criteria.reduce((sum, c) => sum + c.maxXp, 0);
    block.append(el('h3', '', `${category.title} — do ${max} XP`));
    category.criteria.forEach((criterion) => {
      const rule = el('div', 'xp-rule');
      rule.append(
        el('p', '', `${criterion.label} (${criterion.maxXp} XP)`),
        el('p', 'muted', `Zdobywasz: ${criterion.gain}`),
        el('p', 'muted', `Tracisz: ${criterion.lose}`),
      );
      block.append(rule);
    });
    wrapper.append(block);
  });
  container.replaceChildren(wrapper);
}

export function showScreen(dom, name, focus = true) {
  const screens = { intro: dom.screenIntro, game: dom.screenGame, results: dom.screenResults };
  Object.entries(screens).forEach(([key, section]) => { section.hidden = key !== name; });
  document.documentElement.dataset.screen = name; // CSS zostawia miejsce na pulpit tylko na ekranie gry
  if (focus) {
    const heading = screens[name].querySelector('[tabindex="-1"]');
    heading?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

export function renderJournal(list, journal) {
  if (journal.length === 0) {
    list.replaceChildren(el('li', 'journal-empty', 'Brak wpisów.'));
    return;
  }
  // Najnowsze wpisy na górze
  list.replaceChildren(...[...journal].reverse().map((entry) => {
    const item = el('li', `kind-${entry.kind}`);
    const head = el('div', 'entry-head');
    head.append(el('span', '', entry.title), el('span', 'entry-date', formatDate(entry.date)));
    item.append(head);
    if (entry.detail) item.append(el('span', 'entry-detail', entry.detail));
    item.append(el('span', 'entry-detail', `Po operacji: gotówka ${formatMoney(entry.cashAfter)}, ` +
      `${formatNumber(entry.unitsAfter, 4)} jedn.`));
    return item;
  }));
}

function flashValue(node, value) {
  const previous = Number(node.dataset.value);
  node.dataset.value = String(value);
  if (Number.isNaN(previous) || Math.abs(previous - value) < 0.005) return;
  node.classList.remove('flash-up', 'flash-down');
  void node.offsetWidth; // restart animacji
  node.classList.add(value > previous ? 'flash-up' : 'flash-down');
}

function buildChartView(state, challenge, portfolio) {
  const sessions = challenge.assets[0].sessions.slice(0, state.index + 1); // tylko odsłonięte
  const indexOf = (date) => challenge.calendar.indexOf(date);
  return {
    dates: sessions.map((s) => s.date),
    prices: sessions.map((s) => s.price),
    stopPrice: portfolio.stopPrice,
    buyIndexes: new Set(state.events.filter((e) => e.type === 'buy_executed').map((e) => indexOf(e.date))),
    sellIndexes: new Set(state.events.filter((e) => e.type === 'sell_executed' || e.type === 'stop_triggered')
      .map((e) => indexOf(e.date))),
  };
}

// Wiadomości z rynku, które już się wydarzyły (do bieżącej sesji włącznie).
export function getRevealedNews(state, challenge) {
  const today = getDate(challenge, state.index);
  return (challenge.marketEvents ?? []).filter((e) => e.date <= today);
}

function renderNews(dom, state, challenge) {
  const news = getRevealedNews(state, challenge);
  dom.newsCard.hidden = news.length === 0;
  dom.newsList.replaceChildren(...[...news].reverse().map((item) => {
    const li = el('li');
    li.append(el('span', 'news-date', formatDate(item.date)), el('strong', '', item.title), el('span', '', item.text));
    return li;
  }));
}

function renderStats(dom, state) {
  const stats = getStats(state);
  const rows = [
    ['Największe obsunięcie portfela', formatPercent(stats.maxDrawdown)],
    ['Najniższa wartość portfela', `${formatMoney(stats.lowest.value)}`],
    ['Kupna / sprzedaże / stop lossy', `${stats.buys} / ${stats.sells} / ${stats.stops}`],
    ['Sesje z otwartą pozycją', `${stats.sessionsWithPosition} z ${stats.sessionsPlayed}`],
  ];
  dom.statsList.replaceChildren(...rows.flatMap(([name, value]) => [el('dt', '', name), el('dd', '', value)]));
}

// ===== Oś czasu: podziałka, położenie „dziś” i znaczniki decyzji =====

const MONTH_SHORT = new Intl.DateTimeFormat('pl-PL', { month: 'short', timeZone: 'UTC' });
const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

// Podziałka zależy tylko od zakresu dat, więc liczymy ją raz na zakres.
function buildTicks(challenge, startIndex, endIndex) {
  const total = endIndex - startIndex;
  const major = total > 400 ? 'year' : 'month';
  const minor = total > 400 ? 'month' : total <= 90 ? 'week' : null;
  const ticks = [];
  for (let i = startIndex + 1; i <= endIndex; i += 1) {
    const date = getDate(challenge, i);
    const previous = getDate(challenge, i - 1);
    const position = ((i - startIndex) / total) * 100;
    const newMonth = date.slice(0, 7) !== previous.slice(0, 7);
    const newYear = date.slice(0, 4) !== previous.slice(0, 4);
    if ((major === 'year' && newYear) || (major === 'month' && newMonth)) {
      const label = major === 'year' ? date.slice(0, 4) : MONTH_SHORT.format(new Date(`${date}T00:00:00Z`));
      ticks.push({ position, label, minor: false });
    } else if ((minor === 'month' && newMonth) || (minor === 'week' && weekday(date) < weekday(previous))) {
      ticks.push({ position, label: null, minor: true });
    }
  }
  // Przy wielu miesiącach podpisujemy co n-ty, żeby napisy nie nachodziły na siebie.
  const labelled = ticks.filter((t) => !t.minor);
  const every = Math.max(1, Math.ceil(labelled.length / 6));
  labelled.forEach((tick, n) => { if (n % every !== 0) tick.label = null; });
  return ticks;
}

function renderTimeline(dom, state, challenge, startIndex) {
  const total = state.endIndex - startIndex;
  const done = state.index - startIndex;
  const at = (index) => `${Math.max(0, Math.min(100, ((index - startIndex) / total) * 100))}%`;

  const key = `${challenge.id}:${startIndex}:${state.endIndex}`;
  if (dom.timelineTicks.dataset.key !== key) {
    dom.timelineTicks.dataset.key = key;
    dom.timelineTicks.replaceChildren(...buildTicks(challenge, startIndex, state.endIndex).map((tick) => {
      const node = el('span', `timeline-tick${tick.minor ? ' is-minor' : ''}`);
      node.style.left = `${tick.position}%`;
      if (tick.label) {
        const label = el('span', 'timeline-tick-label', tick.label);
        if (tick.position < 8) label.classList.add('is-start');
        if (tick.position > 92) label.classList.add('is-end');
        node.append(label);
      }
      return node;
    }));
    dom.timelineStart.textContent = formatCompactDate(getDate(challenge, startIndex));
    dom.timelineEnd.textContent = formatCompactDate(getDate(challenge, state.endIndex));
  }

  // Znaczniki: tylko to, co już się wydarzyło (bez zdradzania przyszłości).
  const marks = [];
  getRevealedNews(state, challenge).forEach((news) => marks.push({ date: news.date, type: 'news' }));
  state.events.forEach((e) => {
    if (e.type === 'buy_executed') marks.push({ date: e.date, type: 'buy' });
    if (e.type === 'sell_executed' || e.type === 'stop_triggered') marks.push({ date: e.date, type: 'sell' });
  });
  dom.timelineMarks.replaceChildren(...marks.map((mark) => {
    const node = el('span', `tl-mark tl-${mark.type}`);
    node.style.left = at(challenge.calendar.indexOf(mark.date));
    return node;
  }));

  dom.sessionProgress.setAttribute('aria-valuemax', String(total));
  dom.sessionProgress.setAttribute('aria-valuenow', String(done));
  dom.sessionProgress.setAttribute('aria-valuetext',
    `${done} z ${total} sesji, ${formatDate(getDate(challenge, state.index))}; ` +
    `kupna: ${marks.filter((m) => m.type === 'buy').length}, sprzedaże: ${marks.filter((m) => m.type === 'sell').length}`);
  dom.sessionProgressFill.style.width = at(state.index);
  dom.timelineNow.style.left = at(state.index);
}

// Tekstowa wersja wykresu: wszystkie odsłonięte sesje i transakcje gracza.
// Budujemy ją tylko wtedy, gdy sekcja jest rozwinięta — przy długiej grze to ponad 1600 wierszy.
const TRADE_LABELS = { buy_executed: 'Kupno', sell_executed: 'Sprzedaż', stop_triggered: 'Stop loss' };
function renderPriceTable(dom, state, view) {
  dom.priceTableCaption.textContent = `Odsłonięte sesje: ${view.dates.length}`;
  if (!dom.tableDetails.open) {
    dom.priceTable.replaceChildren();
    return;
  }
  const trades = new Map();
  state.events.forEach((e) => {
    if (!TRADE_LABELS[e.type]) return;
    trades.set(e.date, [...(trades.get(e.date) ?? []), TRADE_LABELS[e.type]]);
  });
  dom.priceTable.replaceChildren(...view.dates.map((d, i) => {
    const row = el('tr');
    const diff = i === 0 ? null : priceChangeShare(view.prices[i - 1], view.prices[i]);
    const diffText = i === 0 ? '—' : describePriceChange(view.prices[i - 1], view.prices[i]);
    row.append(el('td', '', formatDate(d)), el('td', '', formatMoney(view.prices[i])),
      el('td', diff === null ? '' : trendClass(diff), diffText), el('td', '', (trades.get(d) ?? []).join(', ')));
    return row;
  }));
}

export function renderGame(dom, state, challenge, chart) {
  const portfolio = getPortfolio(state, challenge);
  const capital = challenge.rules.initialCapital;
  const startIndex = getStartIndex(challenge);
  const total = state.endIndex - startIndex;
  const done = state.index - startIndex;
  const date = getDate(challenge, state.index);
  const previousPrice = state.index > 0 ? getPrice(challenge, state.index - 1) : portfolio.price;
  const changeText = describePriceChange(previousPrice, portfolio.price);
  const changeShare = priceChangeShare(previousPrice, portfolio.price);

  dom.gameTitle.textContent = `Symulacja: ${formatDate(date)}`;
  // Nagłówek mówi, do kiedy trwa gra — tytuł „Marzec 2020” to tylko punkt startu.
  dom.headerEyebrow.textContent = `${dom.headerEyebrow.dataset.base} · do ${formatDate(getDate(challenge, state.endIndex))}`;

  // Panele
  dom.portfolioValue.textContent = formatMoney(portfolio.value);
  flashValue(dom.portfolioValue, portfolio.value);
  dom.portfolioProfit.textContent = `${formatSignedMoney(portfolio.profit)} (${formatPercent(portfolio.profitShare, true)}) od startu`;
  setTrend(dom.portfolioProfit, portfolio.profit / capital);

  dom.sessionDate.textContent = formatDate(date);
  dom.sessionProgressText.textContent = (done === 0 ? `Stan na start · 0 z ${total} sesji` : `Sesja ${done} z ${total}`) +
    ` · koniec ${formatDate(getDate(challenge, state.endIndex))}`;
  renderTimeline(dom, state, challenge, startIndex);

  dom.cashValue.textContent = formatMoney(portfolio.cash);
  dom.positionValue.textContent = portfolio.units > 0
    ? `${formatNumber(portfolio.units, 4)} jedn. · ${formatMoney(portfolio.positionValue)} (śr. cena zakupu ${formatMoney(state.avgCost)})`
    : 'Brak pozycji';

  const startMargin = capital - challenge.rules.minPortfolioValue;
  const marginShare = Math.max(0, Math.min(1, portfolio.marginToLimit / startMargin));
  dom.limitMargin.textContent = formatMoney(Math.max(0, portfolio.marginToLimit));
  dom.limitFill.style.width = `${marginShare * 100}%`;
  const level = marginShare >= 0.6 ? ['level-ok', 'Bezpiecznie'] : marginShare >= 0.3 ? ['level-warn', 'Uwaga'] : ['level-danger', 'Blisko limitu'];
  dom.limitFill.className = `meter-fill ${level[0]}`;
  dom.limitLevel.textContent = `${level[1]} · limit: portfel ≥ ${formatMoney(challenge.rules.minPortfolioValue)}`;

  // Wykres i tabela — tylko odsłonięte sesje
  dom.priceNow.textContent = formatMoney(portfolio.price);
  dom.priceChange.textContent = `${changeText} od poprzedniej sesji`;
  const close = challenge.assets[0].sessions[state.index].close;
  dom.priceReal.hidden = challenge.mode === 'random' || close === undefined;
  if (!dom.priceReal.hidden) dom.priceReal.textContent = `Prawdziwa cena WTI tego dnia: ${formatNumber(close)} USD za baryłkę`;

  // Pulpit czasu: zawsze widoczna data, cena i portfel
  dom.dockWeekday.textContent = formatWeekday(date);
  dom.dockDate.textContent = formatCompactDate(date);
  dom.dockSession.textContent = `${done}/${total}`;
  dom.dockPrice.textContent = formatMoney(portfolio.price);
  dom.dockChange.textContent = changeText;
  setTrend(dom.dockChange, changeShare ?? (portfolio.price - previousPrice) / 100);
  dom.dockValue.textContent = formatMoney(portfolio.value);
  setTrend(dom.priceChange, changeShare ?? (portfolio.price - previousPrice) / 100);
  const view = buildChartView(state, challenge, portfolio);
  chart?.update(view);
  dom.priceChart.setAttribute('aria-label',
    `Wykres ceny: ${challenge.assets[0].shortName}, od ${formatDate(view.dates[0])} do ${formatDate(date)}. ` +
    `Ostatnia cena ${formatMoney(portfolio.price)}, zmiana w ostatniej sesji ${changeText}.` +
    (portfolio.stopPrice === null ? '' : ` Poziom stop loss: ${formatMoney(portfolio.stopPrice)}.`));
  renderPriceTable(dom, state, view);

  // Zlecenie oczekujące
  const order = state.pendingOrder;
  dom.pending.hidden = !order;
  if (order) {
    dom.pendingText.textContent = order.side === 'buy'
      ? `Oczekuje: kupno za ${formatMoney(order.amount)}. Wykona się po cenie z następnej sesji.`
      : `Oczekuje: sprzedaż ${formatNumber(order.units, 4)} jedn. Wykona się po cenie z następnej sesji.`;
  }

  // Stop loss
  dom.stopSelect.value = state.stopLossPercent === null ? 'none' : String(state.stopLossPercent);
  if (portfolio.stopPrice !== null) {
    dom.stopInfo.textContent = `Aktywny: sprzedaż całej pozycji, gdy cena zamknięcia ≤ ${formatMoney(portfolio.stopPrice)} ` +
      `(średnia cena zakupu ${formatMoney(state.avgCost)} − ${state.stopLossPercent}%).`;
  } else if (state.stopLossPercent !== null) {
    dom.stopInfo.textContent = `Ustawiony na ${state.stopLossPercent}%. Zacznie działać po otwarciu pozycji.`;
  } else {
    dom.stopInfo.textContent = 'Brak stop lossu — pozycja nie ma zaplanowanego wyjścia.';
  }

  // Plan, dziennik, wiadomości, statystyki
  const plan = state.plan;
  if (plan) {
    dom.planSummary.textContent = `Twój plan: pozycja do ${plan.maxPositionPercent}% kapitału ` +
      `(${formatMoney(capital * plan.maxPositionPercent / 100)}) · ` +
      (plan.stopLossPercent === null ? 'bez stop lossu.' : `stop loss ${plan.stopLossPercent}%.`);
  }
  renderJournal(dom.journal, state.journal);
  renderNews(dom, state, challenge);
  renderStats(dom, state);

  const playing = state.status === 'playing';
  dom.nextSession.disabled = !playing;
  dom.ffWeek.disabled = !playing;
  dom.ffMonth.disabled = !playing;
  dom.finishButton.disabled = !playing;
  dom.stopSelect.disabled = !playing;
  return { date, price: portfolio.price, changeText, value: portfolio.value };
}

// Etykiety, szybkie przyciski i podpowiedź formularza zlecenia.
export function renderOrderControls(dom, state, challenge, side) {
  const portfolio = getPortfolio(state, challenge);
  const capital = challenge.rules.initialCapital;
  const canTrade = state.status === 'playing' && !state.pendingOrder;
  const isBuy = side === 'buy';

  dom.orderLabel.textContent = isBuy ? 'Kwota zakupu' : 'Liczba jednostek do sprzedaży';
  dom.orderSuffix.textContent = isBuy ? 'zł' : 'jedn.';
  dom.orderInput.placeholder = isBuy ? 'np. 1000' : 'np. 2,5';
  dom.orderSubmit.className = `btn btn-block ${isBuy ? 'btn-buy' : 'btn-sell'}`;

  // Przyciski szybkiego wyboru budujemy raz na rodzaj zlecenia, a potem tylko aktualizujemy.
  // Gdyby je podmieniać, kliknięty przycisk znikałby razem z fokusem klawiatury (WCAG 2.4.3).
  const chips = isBuy
    ? BUY_CHIPS.map((amount) => ({
      text: `${formatNumber(amount, 0)} zł`,
      label: `${formatNumber(amount, 0)} zł, ${formatPercent(amount / capital)} kapitału`,
      value: toInputValue(amount, 0),
      disabled: !canTrade || amount > portfolio.cash,
    }))
    : SELL_CHIPS.map((share) => ({
      text: share === 1 ? 'Całość' : formatPercent(share).replace(',0', ''),
      label: share === 1 ? 'Całość (100% pozycji)' : `${share * 100}% pozycji`,
      value: toInputValue(portfolio.units * share, 4),
      disabled: !canTrade || portfolio.units <= 0,
    }));
  if (dom.orderChips.dataset.side !== side) {
    dom.orderChips.dataset.side = side;
    dom.orderChips.replaceChildren(...chips.map(() => {
      const chip = el('button', 'chip');
      chip.type = 'button';
      return chip;
    }));
  }
  [...dom.orderChips.children].forEach((chip, i) => {
    chip.textContent = chips[i].text;
    chip.setAttribute('aria-label', chips[i].label);
    chip.dataset.value = chips[i].value;
    chip.disabled = chips[i].disabled;
  });

  // Podpowiedź liczona z bieżącej ceny (wykonanie nastąpi po cenie następnej sesji)
  const value = parseDecimal(dom.orderInput.value);
  let hint;
  let warning = false;
  if (state.pendingOrder) {
    hint = 'Masz oczekujące zlecenie. Anuluj je albo przejdź do następnej sesji.';
  } else if (isBuy && portfolio.price <= 0) {
    hint = 'Cena jest dziś zerowa lub ujemna. Zlecenie kupna wykona się tylko wtedy, gdy w następnej sesji cena będzie dodatnia.';
    warning = true;
  } else if (isBuy && value > 0) {
    // Te same liczby co w ocenie XP (po dzisiejszej cenie — to jest chwila decyzji).
    const planLimit = capital * state.plan.maxPositionPercent / 100;
    const stop = state.stopLossPercent;
    const { positionAfter, plannedRisk, averagingDown } = decisionMetrics({
      price: portfolio.price, units: portfolio.units, avgCost: state.avgCost, positionValue: portfolio.positionValue,
    }, value, stop);
    hint = `To ${formatPercent(value / capital)} kapitału. Pozycja po zakupie ≈ ${formatMoney(positionAfter)} ` +
      `(limit z planu: ${formatMoney(planLimit)}). Strata do stop lossu ≈ ${formatMoney(plannedRisk)}` +
      (stop === null ? ' — bez stop lossu zagrożona jest cała pozycja.' : ` przy stop lossie ${stop}%.`);
    if (positionAfter > planLimit + 0.005) {
      hint += ' Uwaga: przekroczysz limit ze swojego planu.';
      warning = true;
    }
    if (plannedRisk > portfolio.marginToLimit + 0.005) {
      hint += ` Ta strata jest większa niż zapas do limitu (${formatMoney(portfolio.marginToLimit)}) — ` +
        'zadziałanie stopu zakończyłoby wyzwanie.';
      warning = true;
    }
    if (averagingDown) {
      hint += ' Dokupienie poniżej średniej ceny obniży poziom stop lossu — to też jest oddalanie stopu.';
      warning = true;
    }
  } else if (isBuy) {
    hint = `Dostępna gotówka: ${formatMoney(portfolio.cash)}. Wybierz kwotę albo wpisz własną.`;
  } else if (portfolio.units <= 0) {
    hint = 'Nie masz jeszcze jednostek do sprzedania.';
  } else if (value > 0) {
    hint = `To ${formatPercent(Math.min(1, value / portfolio.units))} pozycji, ≈ ${formatMoney(value * portfolio.price)} ` +
      'po dzisiejszej cenie. Wykonanie nastąpi po cenie następnej sesji.';
  } else {
    hint = `Masz ${formatNumber(portfolio.units, 4)} jedn. (≈ ${formatMoney(portfolio.positionValue)} po dzisiejszej cenie).`;
  }
  dom.orderHint.textContent = hint;
  dom.orderHint.classList.toggle('is-warning', warning);
  renderReasonCheck(dom, state, challenge, side, value > 0 ? value : 0, portfolio);

  dom.orderSubmit.disabled = !canTrade;
  dom.reasonOptions.querySelectorAll('input').forEach((input) => { input.disabled = !canTrade; });
  if (isBuy) {
    dom.orderSubmit.textContent = value > 0 ? `Kup za ${formatMoney(value)}` : 'Kup';
  } else {
    dom.orderSubmit.textContent = value > 0 ? `Sprzedaj ${formatNumber(value, 4)} jedn.` : 'Sprzedaj';
  }
}

function renderExtension(dom, options, failed) {
  dom.extendCard.hidden = failed || options.length === 0;
  dom.extendOptions.replaceChildren(...options.map((option) => {
    const button = el('button', 'btn btn-secondary');
    button.type = 'button';
    button.dataset.index = String(option.index);
    button.append(el('span', '', option.label), el('small', '', `do ${formatDate(option.endDate)} · ${formatSessions(option.sessions)}`));
    return button;
  }));
}

function renderComparison(dom, evaluation, benchmark, capital) {
  const { financial } = evaluation;
  const row = (name, value, note, isYou = false) => {
    const box = el('div', `compare-row${isYou ? ' is-you' : ''}`);
    const valueNode = el('span', 'compare-value', value);
    valueNode.append(el('small', '', note));
    box.append(el('span', 'compare-name', name), valueNode);
    return box;
  };
  const holdNote = `najniżej ${formatMoney(benchmark.lowest.value)} (${formatDate(benchmark.lowest.date)})` +
    (benchmark.breachDate ? ` · limit 10% zakończyłby grę ${formatDate(benchmark.breachDate)}` : '');
  dom.compareGrid.replaceChildren(
    row('Twoja strategia', formatMoney(financial.finalValue), formatPercent(financial.profitShare, true), true),
    row('Tylko gotówka', formatMoney(capital), 'bez ryzyka i bez zysku'),
    row(`Wszystko w surowiec na starcie i trzymanie do ${formatDate(benchmark.endDate)}`,
      formatMoney(benchmark.finalValue), holdNote),
  );
}

export function renderResults(dom, state, challenge, evaluation, extras) {
  const { financial } = evaluation;
  const failed = !financial.limitRespected;

  dom.resultHero.classList.toggle('is-failed', failed);
  dom.resultEyebrow.textContent = failed ? 'Wyzwanie przerwane' : 'Wyzwanie ukończone';
  dom.resultsTitle.textContent = failed ? 'Limit straty przekroczony' : 'Udało się zmieścić w limicie';
  dom.resultSummary.textContent = failed
    ? `${formatDate(financial.endDate)} wartość portfela spadła poniżej ${formatMoney(challenge.rules.minPortfolioValue)}, ` +
      'więc wyzwanie zakończyło się wcześniej. Zobacz, które decyzje do tego doprowadziły.'
    : state.events.at(-1)?.reason === 'ended_early'
      ? `Gra zakończona ${formatDate(financial.endDate)}, a portfel zmieścił się w limicie straty. Ocena obejmuje rozegrane sesje.`
      : `Gra doszła do ${formatDate(financial.endDate)}, a portfel zmieścił się w limicie straty. Zobacz ocenę swojego procesu.`;

  dom.resultValue.textContent = formatMoney(financial.finalValue);
  dom.resultProfit.textContent = `${formatSignedMoney(financial.profit)} (${formatPercent(financial.profitShare, true)})`;
  setTrend(dom.resultProfit, financial.profitShare);
  dom.resultLimit.textContent = failed ? '✗ Przekroczony' : '✓ Dotrzymany';
  dom.resultLimit.className = `stat-value-sm ${failed ? 'is-loss' : 'is-gain'}`;

  dom.xpTotal.textContent = String(evaluation.totalXp);
  dom.xpRing.style.setProperty('--progress', String((evaluation.totalXp / evaluation.maxXp) * 100));
  dom.xpRing.setAttribute('role', 'img');
  dom.xpRing.setAttribute('aria-label', `${evaluation.totalXp} z ${evaluation.maxXp} XP`);

  const item = ({ title, text }) => {
    const li = el('li');
    li.append(el('strong', '', title), el('span', '', text));
    return li;
  };
  dom.strengths.replaceChildren(...(evaluation.strengths.length > 0
    ? evaluation.strengths.map(item)
    : [item({ title: 'Brak zaliczonych kryteriów', text: 'W tej rozgrywce żadne kryterium procesu nie zostało spełnione. Zobacz obok, co poprawić.' })]));
  dom.improvements.replaceChildren(...evaluation.improvements.map(item));

  dom.categories.replaceChildren(...evaluation.categories.map((category) => {
    const box = el('section', 'category');
    const head = el('div', 'category-head');
    head.append(el('h4', '', category.title), el('span', 'category-xp', `${category.xp} / ${category.maxXp} XP`));
    const bar = el('div', 'category-bar');
    const fill = el('span');
    fill.style.width = `${(category.xp / category.maxXp) * 100}%`;
    bar.append(fill);
    box.append(head, bar);
    category.criteria.forEach((criterion) => {
      const status = criterion.passed ? 'passed' : criterion.applicable ? 'failed' : 'na';
      const statusText = { passed: 'zaliczone', failed: 'niezaliczone', na: 'nie dotyczy' }[status];
      const row = el('div', `criterion ${status}`);
      const icon = el('span', 'criterion-status', { passed: '✓', failed: '✗', na: '–' }[status]);
      icon.setAttribute('aria-hidden', 'true');
      const title = el('p', 'criterion-title');
      const label = el('span', '', criterion.label);
      label.append(el('span', 'sr-only', ` (${statusText})`));
      title.append(label, el('span', 'criterion-points',
        status === 'na' ? `nie oceniono · 0 / ${criterion.maxXp} XP` : `${criterion.xp} / ${criterion.maxXp} XP`));
      row.append(icon, title,
        el('p', 'criterion-text', criterion.explanation),
        el('p', 'criterion-rule', criterion.passed ? `Reguła: ${criterion.gain}` : `Reguła: ${criterion.gain} Tracisz: ${criterion.lose}`));
      box.append(row);
    });
    return box;
  }));

  renderReflection(dom, state, evaluation);
  renderExtension(dom, extras.extensionOptions, failed);
  renderComparison(dom, evaluation, extras.benchmark, challenge.rules.initialCapital);
  renderJournal(dom.resultsJournal, state.journal);
}
