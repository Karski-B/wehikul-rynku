// Aktualizacja HTML na podstawie stanu symulacji. Tu nie ma obliczeń finansowych —
// wszystkie liczby pochodzą z simulation.js i scoring.js.

import { formatDate, formatMoney, formatNumber, formatPercent, formatSignedMoney } from './format.js';
import { getPortfolio, getPrice, getDate, getLastIndex, parseDecimal } from './simulation.js';
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

// Tekst ułamka do pola formularza po polsku (przecinek dziesiętny).
export function toInputValue(value, digits) {
  return value.toFixed(digits).replace('.', ',');
}

export function renderStaticTexts(dom, challenge) {
  const asset = challenge.assets[0];
  const source = challenge.sources[0];
  dom.challengeTitle.textContent = challenge.title;
  dom.introText.textContent = challenge.intro;
  dom.assetNote.textContent = `Aktywo: ${asset.name}. W grze używamy ceny symulacyjnej w zł ` +
    `(${formatDate(asset.conversion.baseDate)} = ${formatMoney(asset.conversion.basePrice)}), która zachowuje ` +
    'historyczne zmiany procentowe. To nie jest rzeczywista cena transakcyjna i nie uwzględnia kursu USD/PLN.';
  dom.sourceNote.textContent = `${source.attribution}. Seria RWTC (WTI Cushing, cena spot w USD). ` +
    'Ceny przeliczone przez autorów aplikacji na umowne zł symulacyjne.';
  dom.dataAttribution.textContent = `Dane historyczne: ${source.attribution}, domena publiczna. ` +
    'Przeliczenie na zł symulacyjne wykonali autorzy aplikacji.';
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

export function renderXpRules(container, categories) {
  const wrapper = el('div', 'xp-rules-table');
  categories.forEach((category) => {
    const block = el('div', 'xp-rule-category');
    const max = category.criteria.reduce((sum, c) => sum + c.maxXp, 0);
    block.append(el('h4', '', `${category.title} — do ${max} XP`));
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

export function renderGame(dom, state, challenge, chart) {
  const portfolio = getPortfolio(state, challenge);
  const capital = challenge.rules.initialCapital;
  const startIndex = getStartIndex(challenge);
  const total = getLastIndex(challenge) - startIndex;
  const done = state.index - startIndex;
  const date = getDate(challenge, state.index);
  const previousPrice = state.index > 0 ? getPrice(challenge, state.index - 1) : portfolio.price;
  const change = portfolio.price / previousPrice - 1;

  dom.gameTitle.textContent = `Symulacja: ${formatDate(date)}`;

  // Panele
  dom.portfolioValue.textContent = formatMoney(portfolio.value);
  flashValue(dom.portfolioValue, portfolio.value);
  dom.portfolioProfit.textContent = `${formatSignedMoney(portfolio.profit)} (${formatPercent(portfolio.profitShare, true)}) od startu`;
  setTrend(dom.portfolioProfit, portfolio.profit / capital);

  dom.sessionDate.textContent = formatDate(date);
  dom.sessionProgressText.textContent = done === 0
    ? `Stan na start · 0 z ${total} sesji`
    : `Sesja ${done} z ${total}`;
  dom.sessionProgress.setAttribute('aria-valuemax', String(total));
  dom.sessionProgress.setAttribute('aria-valuenow', String(done));
  dom.sessionProgress.setAttribute('aria-valuetext', `${done} z ${total} sesji`);
  dom.sessionProgressFill.style.width = `${(done / total) * 100}%`;

  dom.cashValue.textContent = formatMoney(portfolio.cash);
  dom.positionValue.textContent = portfolio.units > 0
    ? `${formatNumber(portfolio.units, 4)} jedn. · ${formatMoney(portfolio.positionValue)} (śr. cena zakupu ${formatMoney(state.avgCost)})`
    : 'Brak pozycji';

  const startMargin = capital - challenge.rules.minPortfolioValue;
  const marginShare = Math.max(0, Math.min(1, portfolio.marginToLimit / startMargin));
  dom.limitMargin.textContent = formatMoney(Math.max(0, portfolio.marginToLimit));
  dom.limitFill.style.width = `${marginShare * 100}%`;
  dom.limitFill.className = `meter-fill ${marginShare >= 0.6 ? 'level-ok' : marginShare >= 0.3 ? 'level-warn' : 'level-danger'}`;

  // Wykres i tabela — tylko odsłonięte sesje
  dom.priceNow.textContent = formatMoney(portfolio.price);
  dom.priceChange.textContent = `${formatPercent(change, true)} vs poprzednia sesja`;
  setTrend(dom.priceChange, change);
  const view = buildChartView(state, challenge, portfolio);
  chart?.update(view);
  dom.priceChart.setAttribute('aria-label',
    `Wykres ceny symulacyjnej ropy WTI od ${formatDate(view.dates[0])} do ${formatDate(date)}. ` +
    `Ostatnia cena ${formatMoney(portfolio.price)}, zmiana w ostatniej sesji ${formatPercent(change, true)}.` +
    (portfolio.stopPrice === null ? '' : ` Poziom stop loss: ${formatMoney(portfolio.stopPrice)}.`));
  dom.priceTable.replaceChildren(...view.dates.map((d, i) => {
    const row = el('tr');
    const diff = i === 0 ? null : view.prices[i] / view.prices[i - 1] - 1;
    row.append(el('td', '', formatDate(d)), el('td', '', formatMoney(view.prices[i])),
      el('td', diff === null ? '' : trendClass(diff), diff === null ? '—' : formatPercent(diff, true)));
    return row;
  }));

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

  // Plan i dziennik
  const plan = state.plan;
  if (plan) {
    dom.planSummary.textContent = `Twój plan: pozycja do ${plan.maxPositionPercent}% kapitału ` +
      `(${formatMoney(capital * plan.maxPositionPercent / 100)}) · ` +
      (plan.stopLossPercent === null ? 'bez stop loss.' : `stop loss ${plan.stopLossPercent}%.`);
  }
  renderJournal(dom.journal, state.journal);

  const playing = state.status === 'playing';
  dom.nextSession.disabled = !playing;
  dom.stopSelect.disabled = !playing;
  return { date, price: portfolio.price, change, value: portfolio.value };
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

  dom.orderChips.replaceChildren(...(isBuy ? BUY_CHIPS.map((amount) => {
    const chip = el('button', 'chip', `${formatNumber(amount, 0)} zł`);
    chip.type = 'button';
    chip.dataset.value = toInputValue(amount, 0);
    chip.setAttribute('aria-label', `${formatNumber(amount, 0)} zł, ${formatPercent(amount / capital)} kapitału`);
    chip.disabled = !canTrade || amount > portfolio.cash;
    return chip;
  }) : SELL_CHIPS.map((share) => {
    const chip = el('button', 'chip', share === 1 ? 'Całość' : formatPercent(share).replace(',0', ''));
    chip.type = 'button';
    chip.dataset.value = toInputValue(portfolio.units * share, 4);
    chip.setAttribute('aria-label', share === 1 ? 'Sprzedaj całą pozycję' : `${share * 100}% pozycji`);
    chip.disabled = !canTrade || portfolio.units <= 0;
    return chip;
  })));

  // Podpowiedź liczona z bieżącej ceny (wykonanie nastąpi po cenie następnej sesji)
  const value = parseDecimal(dom.orderInput.value);
  let hint;
  let warning = false;
  if (state.pendingOrder) {
    hint = 'Masz oczekujące zlecenie. Anuluj je albo przejdź do następnej sesji.';
  } else if (isBuy && value > 0) {
    const position = portfolio.positionValue + value;
    const planLimit = capital * state.plan.maxPositionPercent / 100;
    const stop = state.stopLossPercent;
    const risk = stop === null ? position : position * stop / 100;
    hint = `To ${formatPercent(value / capital)} kapitału. Pozycja po zakupie ≈ ${formatMoney(position)} ` +
      `(limit z planu: ${formatMoney(planLimit)}). Planowane ryzyko ≈ ${formatMoney(risk)}` +
      (stop === null ? ' — bez stop lossu zagrożona jest cała pozycja.' : ` przy stop lossie ${stop}%.`);
    if (position > planLimit + 0.005) {
      hint += ' Uwaga: przekroczysz limit ze swojego planu.';
      warning = true;
    }
  } else if (isBuy) {
    hint = `Dostępna gotówka: ${formatMoney(portfolio.cash)}. Wybierz kwotę albo wpisz własną.`;
  } else if (portfolio.units <= 0) {
    hint = 'Nie masz jeszcze jednostek ropy do sprzedania.';
  } else if (value > 0) {
    hint = `To ${formatPercent(Math.min(1, value / portfolio.units))} pozycji, ≈ ${formatMoney(value * portfolio.price)} ` +
      'po dzisiejszej cenie. Wykonanie nastąpi po cenie następnej sesji.';
  } else {
    hint = `Masz ${formatNumber(portfolio.units, 4)} jedn. (≈ ${formatMoney(portfolio.positionValue)} po dzisiejszej cenie).`;
  }
  dom.orderHint.textContent = hint;
  dom.orderHint.classList.toggle('is-warning', warning);

  dom.orderSubmit.disabled = !canTrade;
  if (isBuy) {
    dom.orderSubmit.textContent = value > 0 ? `Kup za ${formatMoney(value)}` : 'Kup';
  } else {
    dom.orderSubmit.textContent = value > 0 ? `Sprzedaj ${formatNumber(value, 4)} jedn.` : 'Sprzedaj';
  }
}

export function renderResults(dom, state, challenge, evaluation) {
  const { financial } = evaluation;
  const failed = !financial.limitRespected;

  dom.resultHero.classList.toggle('is-failed', failed);
  dom.resultEyebrow.textContent = failed ? 'Wyzwanie przerwane' : 'Wyzwanie ukończone';
  dom.resultsTitle.textContent = failed ? 'Limit straty przekroczony' : 'Przetrwałeś marzec 2020';
  dom.resultSummary.textContent = failed
    ? `${formatDate(financial.endDate)} wartość portfela spadła poniżej ${formatMoney(challenge.rules.minPortfolioValue)}, ` +
      'więc wyzwanie zakończyło się wcześniej. Zobacz, które decyzje do tego doprowadziły.'
    : `Doszedłeś do ${formatDate(financial.endDate)} i zmieściłeś się w limicie straty. Zobacz ocenę swojego procesu.`;

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
      title.append(label, el('span', 'criterion-points', `${criterion.xp} / ${criterion.maxXp} XP`));
      row.append(icon, title,
        el('p', 'criterion-text', criterion.explanation),
        el('p', 'criterion-rule', criterion.passed ? `Reguła: ${criterion.gain}` : `Reguła: ${criterion.gain} Tracisz: ${criterion.lose}`));
      box.append(row);
    });
    return box;
  }));

  renderJournal(dom.resultsJournal, state.journal);
}
