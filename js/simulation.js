// Stan i obliczenia symulacji. Ten moduł nie dotyka HTML, dzięki czemu łatwo go testować.
//
// REGUŁA WYKONANIA ZLECEŃ
// Gracz widzi cenę zamknięcia bieżącej sesji (np. 28.02). Zlecenie złożone w tym momencie
// wykonuje się dopiero po cenie NASTĘPNEJ sesji (np. 2.03). Nikt nie handluje więc po cenie,
// którą już zna, ani po cenie z przyszłości.
//
// KOLEJNOŚĆ ZDARZEŃ PO PRZEJŚCIU DO NASTĘPNEJ SESJI
// 1. Odsłaniamy cenę nowej sesji.
// 2. Sprawdzamy stop loss pozycji trzymanej od poprzedniej sesji.
// 3. Wykonujemy oczekujące zlecenie po cenie nowej sesji.
// 4. Liczymy wartość portfela i sprawdzamy limit straty scenariusza.
//
// DŁUGOŚĆ WYZWANIA
// Gracz wybiera wariant długości (np. marzec 2020 albo „bez limitu”) i po dojściu do końca
// może wyzwanie przedłużyć — najdalej do ostatniej sesji w danych. Przekroczenie limitu
// straty kończy rozgrywkę na stałe.
//
// CENY UJEMNE
// 20.04.2020 cena spot ropy WTI była ujemna. Nie zmieniamy danych: trzymane jednostki obniżają
// wtedy wartość portfela, a sprzedaż po cenie ujemnej oznacza dopłatę. Kupno po cenie zerowej
// lub ujemnej jest w grze niemożliwe (zlecenie zostaje anulowane).
//
// UPROSZCZENIA: brak prowizji, brak dźwigni i krótkiej sprzedaży, ułamkowe jednostki są dozwolone.
// Stop loss sprawdzamy tylko na cenie z końca dnia, więc sprzedaż może nastąpić dużo niżej
// niż poziom stop lossu (luka cenowa). Prawdziwe zlecenie też nie gwarantuje ceny wykonania.

import { getStartIndex } from './data.js';
import { formatDate, formatMoney, formatNumber, formatSessions } from './format.js';

export const STATE_VERSION = 4; // 4: zlecenie zapisuje „decyzję” — portfel i cenę z chwili złożenia
export const STOP_LOSS_OPTIONS = [5, 8, 12];          // procent poniżej średniej ceny zakupu
export const POSITION_LIMIT_OPTIONS = [10, 25, 50, 100]; // procent kapitału początkowego
const UNITS_TOLERANCE = 0.00005;                       // połowa najmniejszej wyświetlanej jednostki

// Powody decyzji („Dlaczego?”) — gracz nazywa powód każdego zlecenia, a ocena to sprawdza.
export const ORDER_REASONS = [
  { id: 'plan', label: 'Zgodnie z planem' },
  { id: 'news', label: 'Reaguję na nową informację' },
  { id: 'risk', label: 'Ograniczam ryzyko' },
  { id: 'impulse', label: 'Bez konkretnego powodu' },
];

export function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

// Zamienia tekst z pola formularza na liczbę. Akceptuje „1 000,50” i „1000.5”.
// Minus jest przepuszczany, żeby walidacja mogła wyjaśnić, że liczba musi być dodatnia.
export function parseDecimal(text) {
  const cleaned = String(text ?? '').replace(/[\s ]/g, '').replace(',', '.').replace('−', '-');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

export function getPrice(challenge, index) {
  return challenge.assets[0].sessions[index].price;
}

export function getDate(challenge, index) {
  return challenge.calendar[index];
}

// Ostatnia sesja dostępna w danych.
export function getLastIndex(challenge) {
  return challenge.calendar.length - 1;
}

// Ostatnia sesja bieżącej rozgrywki (zależy od wybranej długości wyzwania).
export function getEndIndex(state) {
  return state.endIndex;
}

export function getHorizon(challenge, horizonId) {
  return challenge.timeline.horizons.find((h) => h.id === horizonId) ?? null;
}

// Zmiana ceny w procentach — tylko gdy obie ceny są dodatnie (przy cenie ujemnej procent nie ma sensu).
export function priceChangeShare(previous, current) {
  return previous > 0 && current > 0 ? current / previous - 1 : null;
}

// Płytka kopia stanu: zapisane już wpisy (historia, dziennik) nigdy nie są zmieniane,
// więc wystarczy skopiować tablice, a nie każdy element. Dzięki temu długie gry są szybkie.
function cloneState(state) {
  return {
    ...state,
    plan: state.plan ? { ...state.plan } : null,
    pendingOrder: state.pendingOrder ? { ...state.pendingOrder } : null,
    journal: [...state.journal],
    events: [...state.events],
    history: [...state.history],
    analytics: { ...state.analytics },
  };
}

// Cena, po której zadziała stop loss (null, gdy nie ma pozycji albo stop lossu).
export function getStopPrice(state) {
  if (state.units <= 0 || state.stopLossPercent === null) return null;
  return state.avgCost * (1 - state.stopLossPercent / 100);
}

// Wszystko, co trzeba pokazać o portfelu w bieżącej sesji.
export function getPortfolio(state, challenge) {
  const price = getPrice(challenge, state.index);
  const capital = challenge.rules.initialCapital;
  const positionValue = state.units * price;
  const value = state.cash + positionValue;
  return {
    price,
    cash: state.cash,
    units: state.units,
    positionValue,
    value,
    profit: value - capital,
    profitShare: (value - capital) / capital,
    limitValue: challenge.rules.minPortfolioValue,
    marginToLimit: value - challenge.rules.minPortfolioValue,
    stopPrice: getStopPrice(state),
  };
}

function makeSnapshot(state, challenge, heldUnits, stopDuringSession) {
  const price = getPrice(challenge, state.index);
  return {
    index: state.index,
    date: getDate(challenge, state.index),
    price,
    heldUnits,                 // jednostki trzymane w trakcie tej sesji (przed zleceniem)
    stopDuringSession,         // stop loss aktywny w trakcie tej sesji
    cash: state.cash,
    units: state.units,
    value: roundMoney(state.cash + state.units * price),
  };
}

// Stan przed rozpoczęciem wyzwania (ekran planu).
export function createIntroState(challenge) {
  const defaultHorizon = getHorizon(challenge, challenge.timeline.defaultHorizon);
  const state = {
    version: STATE_VERSION,
    challengeId: challenge.id,
    runId: null,
    status: 'intro',
    endReason: null,
    plan: null,
    index: getStartIndex(challenge),
    endIndex: challenge.calendar.indexOf(defaultHorizon.endDate),
    cash: challenge.rules.initialCapital,
    units: 0,
    avgCost: 0,
    stopLossPercent: null,
    pendingOrder: null,
    journal: [],
    events: [],
    history: [],
    reflection: null,
    analytics: { startedSent: false, completedSent: false },
  };
  state.history.push(makeSnapshot(state, challenge, 0, null));
  return state;
}

// Zwraca listę błędów planu (pusta lista = plan poprawny).
export function validatePlan(plan, quizOptionIds, horizonIds) {
  const errors = [];
  if (!POSITION_LIMIT_OPTIONS.includes(plan.maxPositionPercent)) {
    errors.push({ field: 'maxPositionPercent', message: 'Wybierz maksymalną wielkość pozycji.' });
  }
  // null oznacza świadomy wybór „bez stop loss”; undefined — brak wyboru
  if (plan.stopLossPercent !== null && !STOP_LOSS_OPTIONS.includes(plan.stopLossPercent)) {
    errors.push({ field: 'stopLossPercent', message: 'Wybierz poziom stop lossu albo „bez stop lossu”.' });
  }
  if (!quizOptionIds.includes(plan.quizAnswer)) {
    errors.push({ field: 'quizAnswer', message: 'Odpowiedz na pytanie o dywersyfikację.' });
  }
  if (!horizonIds.includes(plan.horizonId)) {
    errors.push({ field: 'horizonId', message: 'Wybierz długość wyzwania.' });
  }
  return errors;
}

export function startChallenge(challenge, plan, runId) {
  const state = createIntroState(challenge);
  const horizon = getHorizon(challenge, plan.horizonId);
  state.status = 'playing';
  state.runId = runId;
  state.plan = { ...plan };
  state.endIndex = challenge.calendar.indexOf(horizon.endDate);
  state.stopLossPercent = plan.stopLossPercent;
  const date = getDate(challenge, state.index);
  state.events.push({ type: 'plan_set', date, ...plan });
  state.journal.push({
    date,
    kind: 'start',
    title: 'Start wyzwania',
    detail: `Plan: pozycja do ${plan.maxPositionPercent}% kapitału, ` +
      (plan.stopLossPercent === null ? 'bez stop lossu' : `stop loss ${plan.stopLossPercent}%`) +
      `. Długość: ${horizon.label.toLowerCase()} (do ${formatDate(horizon.endDate)}).`,
    cashAfter: state.cash,
    unitsAfter: 0,
  });
  return state;
}

function checkCanTrade(state) {
  if (state.status !== 'playing') return 'Wyzwanie nie trwa.';
  if (state.pendingOrder) return 'Masz już oczekujące zlecenie. Anuluj je albo przejdź do następnej sesji.';
  return null;
}

export function validateBuy(state, amount) {
  const blocked = checkCanTrade(state);
  if (blocked) return blocked;
  if (!Number.isFinite(amount)) return 'Wpisz kwotę samymi cyframi, np. 1000 albo 1000,50.';
  if (amount <= 0) return 'Kwota musi być większa od zera.';
  if (Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) return 'Podaj kwotę z dokładnością do 1 grosza.';
  if (amount > state.cash + 1e-9) {
    return state.cash > 0
      ? `Nie masz tyle gotówki. Dostępne: ${formatMoney(state.cash)}.`
      : 'Nie masz wolnej gotówki.';
  }
  return null;
}

export function validateSell(state, units) {
  const blocked = checkCanTrade(state);
  if (blocked) return blocked;
  if (!Number.isFinite(units)) return 'Wpisz liczbę jednostek samymi cyframi, np. 5 albo 5,25.';
  if (units <= 0) return 'Liczba jednostek musi być większa od zera.';
  if (state.units <= 0) return 'Nie masz jednostek do sprzedania.';
  if (units > state.units + UNITS_TOLERANCE) {
    return `Masz tylko ${formatNumber(state.units, 4)} jedn. Nie możesz sprzedać więcej.`;
  }
  return null;
}

// Składa zlecenie, które wykona się po cenie następnej sesji. Zwraca { state, error }.
export function placeOrder(state, challenge, order) {
  const error = order.side === 'buy' ? validateBuy(state, order.amount) : validateSell(state, order.units);
  if (error) return { state, error };

  const next = cloneState(state);
  const date = getDate(challenge, next.index);
  const reason = ORDER_REASONS.find((r) => r.id === order.reason) ?? null;
  // „Decyzja” = to, co gracz widział w chwili złożenia zlecenia. Z niej liczymy XP,
  // więc późniejszy ruch ceny (wykonanie po cenie następnej sesji) nie zmienia oceny.
  const before = getPortfolio(state, challenge);
  const decision = {
    price: before.price,
    units: state.units,
    avgCost: state.avgCost,
    positionValue: before.positionValue,
    margin: before.marginToLimit,
    stopLossPercent: state.stopLossPercent,
  };
  if (order.side === 'buy') {
    next.pendingOrder = { side: 'buy', amount: order.amount, placedOn: date, reason: reason?.id ?? null, decision };
  } else {
    // Liczba w granicach tolerancji oznacza „sprzedaj wszystko” (bez okruchów jednostek).
    const sellAll = Math.abs(order.units - next.units) <= UNITS_TOLERANCE;
    next.pendingOrder = {
      side: 'sell', units: sellAll ? next.units : order.units, sellAll, placedOn: date, reason: reason?.id ?? null, decision,
    };
  }
  next.events.push({ type: 'order_placed', date, ...next.pendingOrder });
  next.journal.push({
    date,
    kind: 'order',
    title: order.side === 'buy' ? 'Zlecenie kupna (oczekuje)' : 'Zlecenie sprzedaży (oczekuje)',
    detail: (order.side === 'buy'
      ? `Kwota ${formatMoney(order.amount)}.`
      : `${formatNumber(next.pendingOrder.units, 4)} jedn.`) + ' Wykona się po cenie z następnej sesji. ' +
      (reason ? `Powód: ${reason.label.toLowerCase()}.` : 'Bez podanego powodu.'),
    cashAfter: next.cash,
    unitsAfter: next.units,
  });
  return { state: next, error: null };
}

export function cancelOrder(state, challenge) {
  if (!state.pendingOrder || state.status !== 'playing') return state;
  const next = cloneState(state);
  const date = getDate(challenge, next.index);
  next.events.push({ type: 'order_cancelled', date, side: next.pendingOrder.side });
  next.journal.push({ date, kind: 'cancel', title: 'Zlecenie anulowane', cashAfter: next.cash, unitsAfter: next.units });
  next.pendingOrder = null;
  return next;
}

export function setStopLoss(state, challenge, percent) {
  if (state.status !== 'playing' || percent === state.stopLossPercent) return state;
  if (percent !== null && !STOP_LOSS_OPTIONS.includes(percent)) return state;

  const next = cloneState(state);
  const date = getDate(challenge, next.index);
  const price = getPrice(challenge, next.index);
  next.events.push({
    type: 'stop_changed',
    date,
    from: next.stopLossPercent,
    to: percent,
    hasPosition: next.units > 0,
    positionInLoss: next.units > 0 && price < next.avgCost,
  });
  next.journal.push({
    date,
    kind: 'stop-change',
    title: percent === null ? 'Stop loss wyłączony' : `Stop loss ustawiony na ${percent}%`,
    detail: next.stopLossPercent === null ? 'Wcześniej: brak.' : `Wcześniej: ${next.stopLossPercent}%.`,
    cashAfter: next.cash,
    unitsAfter: next.units,
  });
  next.stopLossPercent = percent;
  return next;
}

function sellUnits(state, units, price) {
  const amount = roundMoney(units * price);
  state.cash = roundMoney(state.cash + amount);
  state.units = Math.max(0, state.units - units);
  if (state.units <= UNITS_TOLERANCE) {
    state.units = 0;
    state.avgCost = 0;
  }
  return amount;
}

function negativePriceNote(price) {
  return price < 0 ? ' Cena była ujemna, więc sprzedaż oznaczała dopłatę — gotówka zmalała.' : '';
}

// Przejście do następnej sesji. Zwraca nowy stan (stary pozostaje bez zmian).
export function advance(state, challenge) {
  if (state.status !== 'playing') return state;
  const next = cloneState(state);
  const previousPrice = getPrice(challenge, next.index);

  // 1. Nowa sesja
  next.index += 1;
  const date = getDate(challenge, next.index);
  const price = getPrice(challenge, next.index);
  const heldUnits = next.units;
  const stopDuringSession = next.stopLossPercent;

  // 2. Stop loss pozycji trzymanej od poprzedniej sesji
  const stopPrice = getStopPrice(next);
  if (stopPrice !== null && price <= stopPrice) {
    const units = next.units;
    const amount = sellUnits(next, units, price);
    next.events.push({
      type: 'stop_triggered', date, stopPrice, price, units, amount,
      gapShare: (stopPrice - price) / stopPrice,
    });
    next.journal.push({
      date,
      kind: 'stop',
      title: 'Stop loss: sprzedaż całej pozycji',
      detail: `Cena spadła do ${formatMoney(price)}, poniżej poziomu stop loss ${formatMoney(stopPrice)}. ` +
        'Symulacja używa cen z końca dnia, więc sprzedaż nastąpiła po cenie sesji, a nie dokładnie na poziomie stop loss.' +
        negativePriceNote(price),
      price,
      units,
      amount,
      cashAfter: next.cash,
      unitsAfter: next.units,
    });
  }

  // 3. Oczekujące zlecenie po cenie nowej sesji
  const order = next.pendingOrder;
  next.pendingOrder = null;
  if (order?.side === 'buy' && price <= 0) {
    next.events.push({ type: 'order_skipped', date, side: 'buy', reason: 'non_positive_price' });
    next.journal.push({
      date, kind: 'cancel', title: 'Zlecenie kupna anulowane',
      detail: `Cena sesji wyniosła ${formatMoney(price)}. W grze nie można kupić po cenie zerowej lub ujemnej.`,
      cashAfter: next.cash, unitsAfter: next.units,
    });
  } else if (order?.side === 'buy') {
    const amount = Math.min(order.amount, next.cash);
    const units = amount / price;
    next.avgCost = (next.avgCost * next.units + amount) / (next.units + units);
    next.units += units;
    next.cash = roundMoney(next.cash - amount);
    const positionValue = next.units * price;
    const stopAfter = getStopPrice(next);
    next.events.push({
      type: 'buy_executed', date, price, amount, units,
      positionValueAfter: positionValue,
      stopLossPercent: next.stopLossPercent,
      placedOn: order.placedOn,
      decision: order.decision,
      // Planowane ryzyko: ile stracisz, jeśli stop zadziała dokładnie na swoim poziomie.
      // Bez stop lossu zagrożona jest cała pozycja.
      plannedRisk: stopAfter === null ? positionValue : next.units * Math.max(0, price - stopAfter),
    });
    next.journal.push({
      date, kind: 'buy', title: 'Kupno wykonane',
      detail: `${formatNumber(units, 4)} jedn. po ${formatMoney(price)} za ${formatMoney(amount)}.`,
      price, units, amount, cashAfter: next.cash, unitsAfter: next.units,
    });
  } else if (order?.side === 'sell') {
    if (next.units <= 0) {
      next.events.push({ type: 'order_skipped', date, side: 'sell', reason: 'no_units' });
      next.journal.push({
        date, kind: 'cancel', title: 'Zlecenie sprzedaży anulowane',
        detail: 'Pozycja została wcześniej zamknięta przez stop loss.',
        cashAfter: next.cash, unitsAfter: next.units,
      });
    } else {
      const units = order.sellAll ? next.units : Math.min(order.units, next.units);
      const amount = sellUnits(next, units, price);
      next.events.push({ type: 'sell_executed', date, price, units, amount });
      next.journal.push({
        date, kind: 'sell', title: 'Sprzedaż wykonana',
        detail: `${formatNumber(units, 4)} jedn. po ${formatMoney(price)} za ${formatMoney(amount)}.` + negativePriceNote(price),
        price, units, amount, cashAfter: next.cash, unitsAfter: next.units,
      });
    }
  }

  // 4. Wartość portfela i limit straty
  const snapshot = makeSnapshot(next, challenge, heldUnits, stopDuringSession);
  next.history.push(snapshot);

  if (snapshot.value < challenge.rules.minPortfolioValue) {
    next.status = 'finished';
    next.endReason = 'limit_breached';
    next.events.push({
      type: 'limit_breached', date, value: snapshot.value, units: heldUnits,
      previousPrice, price, sessionChangeShare: priceChangeShare(previousPrice, price),
    });
    next.journal.push({
      date, kind: 'limit', title: 'Limit straty przekroczony — koniec wyzwania',
      detail: `Wartość portfela: ${formatMoney(snapshot.value)}, limit: ${formatMoney(challenge.rules.minPortfolioValue)}.`,
      cashAfter: next.cash, unitsAfter: next.units,
    });
  } else if (next.index >= next.endIndex) {
    next.status = 'finished';
    next.endReason = 'completed';
    next.journal.push({
      date, kind: 'end', title: 'Koniec wyzwania',
      detail: `Wartość portfela: ${formatMoney(snapshot.value)}.`,
      cashAfter: next.cash, unitsAfter: next.units,
    });
  }
  if (next.status === 'finished') {
    next.events.push({ type: 'challenge_finished', date, reason: next.endReason });
  }
  return next;
}

export const FAST_FORWARD_STOPS = {
  bigMoveShare: 0.05,  // ruch ceny ≥ 5% w jednej sesji przy otwartej pozycji
  limitMargin: 300,    // wejście w strefę: mniej niż 300 zł do limitu straty
};

// Przewija kilka sesji naraz. Zatrzymuje się wcześniej, gdy wydarzy się coś ważnego.
// Zwraca { state, steps, stopReason }: 'action' (transakcja, stop loss, anulowanie), 'news',
// 'big_move', 'near_limit', 'finished' albo null (przewinięto wszystkie sesje).
export function advanceMany(state, challenge, maxSteps) {
  const eventDates = new Set((challenge.marketEvents ?? []).map((e) => e.date));
  const limit = challenge.rules.minPortfolioValue;
  let current = state;
  let steps = 0;
  while (steps < maxSteps && current.status === 'playing') {
    const journalBefore = current.journal.length;
    current = advance(current, challenge);
    steps += 1;
    if (current.status !== 'playing') return { state: current, steps, stopReason: 'finished' };
    if (current.journal.slice(journalBefore).length > 0) return { state: current, steps, stopReason: 'action' };
    if (eventDates.has(getDate(challenge, current.index))) return { state: current, steps, stopReason: 'news' };
    const [previous, today] = current.history.slice(-2);
    const move = priceChangeShare(previous.price, today.price);
    if (today.heldUnits > 0 && (move === null || Math.abs(move) >= FAST_FORWARD_STOPS.bigMoveShare)) {
      return { state: current, steps, stopReason: 'big_move' };
    }
    if (previous.value - limit >= FAST_FORWARD_STOPS.limitMargin && today.value - limit < FAST_FORWARD_STOPS.limitMargin) {
      return { state: current, steps, stopReason: 'near_limit' };
    }
  }
  return { state: current, steps, stopReason: null };
}

// Kończy grę na życzenie gracza (np. w długim wariancie). Ocena obejmuje rozegrane sesje;
// później wciąż można „Graj dalej”. Oczekujące zlecenie zostaje anulowane.
export function finishEarly(state, challenge) {
  if (state.status !== 'playing') return state;
  const next = cloneState(state);
  const date = getDate(challenge, next.index);
  if (next.pendingOrder) {
    next.events.push({ type: 'order_cancelled', date, side: next.pendingOrder.side });
    next.journal.push({ date, kind: 'cancel', title: 'Zlecenie anulowane (koniec gry)', cashAfter: next.cash, unitsAfter: next.units });
    next.pendingOrder = null;
  }
  const value = roundMoney(next.cash + next.units * getPrice(challenge, next.index));
  next.status = 'finished';
  next.endReason = 'completed';
  next.endIndex = next.index;
  next.events.push({ type: 'challenge_finished', date, reason: 'ended_early' });
  next.journal.push({
    date, kind: 'end', title: 'Gra zakończona przez gracza',
    detail: `Wartość portfela: ${formatMoney(value)}.`, cashAfter: next.cash, unitsAfter: next.units,
  });
  return next;
}

// Warianty przedłużenia po ukończeniu wyzwania: +1 miesiąc, +3 miesiące, +1 rok, do końca danych.
export function getExtensionOptions(state, challenge) {
  if (state.status !== 'finished' || state.endReason !== 'completed') return [];
  const lastIndex = getLastIndex(challenge);
  if (state.endIndex >= lastIndex) return [];
  const current = new Date(`${getDate(challenge, state.endIndex)}T00:00:00Z`);
  const indexAtMonths = (months) => {
    // Ten sam dzień miesiąca, ale nie dalej niż ostatni dzień docelowego miesiąca (31.03 + 1 mies. = 30.04).
    const year = current.getUTCFullYear();
    const month = current.getUTCMonth() + months;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const target = new Date(Date.UTC(year, month, Math.min(current.getUTCDate(), lastDay)));
    const iso = target.toISOString().slice(0, 10);
    let index = state.endIndex;
    while (index < lastIndex && challenge.calendar[index + 1] <= iso) index += 1;
    return index;
  };
  const options = [
    { id: 'month', label: '+1 miesiąc', index: indexAtMonths(1) },
    { id: 'quarter', label: '+3 miesiące', index: indexAtMonths(3) },
    { id: 'year', label: '+1 rok', index: indexAtMonths(12) },
    { id: 'all', label: 'Do najnowszych danych', index: lastIndex },
  ];
  const seen = new Set();
  return options
    .filter((o) => o.index > state.endIndex && !seen.has(o.index) && seen.add(o.index))
    .map((o) => ({ ...o, endDate: getDate(challenge, o.index), sessions: o.index - state.endIndex }));
}

// Przedłuża ukończone wyzwanie. Portfel, plan i dziennik zostają bez zmian.
export function extendHorizon(state, challenge, targetIndex) {
  if (state.status !== 'finished' || state.endReason !== 'completed') return state;
  if (!Number.isInteger(targetIndex) || targetIndex <= state.endIndex || targetIndex > getLastIndex(challenge)) return state;
  const next = cloneState(state);
  const date = getDate(challenge, next.index);
  next.status = 'playing';
  next.endReason = null;
  next.events.push({ type: 'horizon_extended', date, from: getDate(challenge, next.endIndex), to: getDate(challenge, targetIndex) });
  next.journal.push({
    date, kind: 'start', title: 'Wyzwanie przedłużone',
    detail: `Nowy koniec: ${formatDate(getDate(challenge, targetIndex))} (${formatSessions(targetIndex - next.endIndex)} więcej).`,
    cashAfter: next.cash, unitsAfter: next.units,
  });
  next.endIndex = targetIndex;
  return next;
}

// Statystyki rozgrywki (bez wpływu na XP).
export function getStats(state) {
  let peak = -Infinity;
  let maxDrawdown = 0;
  for (const snapshot of state.history) {
    peak = Math.max(peak, snapshot.value);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - snapshot.value) / peak);
  }
  const lowest = state.history.reduce((a, b) => (b.value < a.value ? b : a));
  const count = (type) => state.events.filter((e) => e.type === type).length;
  return {
    maxDrawdown,
    lowest,
    buys: count('buy_executed'),
    sells: count('sell_executed'),
    stops: count('stop_triggered'),
    sessionsPlayed: state.history.length - 1,
    sessionsWithPosition: state.history.slice(1).filter((s) => s.heldUnits > 0).length,
  };
}

// Strategia porównawcza: cały kapitał w surowiec na starcie (wykonanie po cenie pierwszej sesji)
// i trzymanie do podanej sesji — bez stop lossu i bez limitu straty. Pokazujemy wartość końcową,
// najniższą wartość i datę, kiedy limit 10% zakończyłby taką grę. Nie wpływa na XP.
export function buyAndHoldPath(challenge, endIndex) {
  const capital = challenge.rules.initialCapital;
  const firstIndex = getStartIndex(challenge) + 1;
  if (endIndex < firstIndex) {
    const date = getDate(challenge, endIndex);
    return { finalValue: capital, endDate: date, lowest: { value: capital, date }, breachDate: null };
  }
  const units = capital / getPrice(challenge, firstIndex);
  let lowest = null;
  let breachDate = null;
  for (let i = firstIndex; i <= endIndex; i += 1) {
    const value = roundMoney(units * getPrice(challenge, i));
    const date = getDate(challenge, i);
    if (!lowest || value < lowest.value) lowest = { value, date };
    if (breachDate === null && value < challenge.rules.minPortfolioValue) breachDate = date;
  }
  return {
    finalValue: roundMoney(units * getPrice(challenge, endIndex)),
    endDate: getDate(challenge, endIndex),
    lowest,
    breachDate,
  };
}

// Odpowiedź na pytanie refleksyjne po grze (bez wpływu na XP).
export function setReflection(state, choiceId) {
  return { ...state, reflection: choiceId };
}

// Sprawdza, czy zapisany stan pasuje do danych (np. po odświeżeniu strony).
// Zapis mógł zostać zmieniony ręcznie albo pochodzić ze starej wersji, więc sprawdzamy też pola w środku.
export function isRestorable(saved, challenge) {
  const isAmount = (value) => Number.isFinite(value) && value >= 0;
  return Boolean(saved)
    && saved.version === STATE_VERSION
    && saved.challengeId === challenge.id
    && Number.isInteger(saved.index)
    && Number.isInteger(saved.endIndex)
    && saved.index >= getStartIndex(challenge)
    && saved.endIndex <= getLastIndex(challenge)
    && saved.index <= saved.endIndex
    && ['intro', 'playing', 'finished'].includes(saved.status)
    // Gotówka może być ujemna: stop loss przy ujemnej cenie (20.04.2020) oznacza dopłatę.
    && Number.isFinite(saved.cash) && isAmount(saved.units) && isAmount(saved.avgCost)
    && (saved.stopLossPercent === null || Number.isFinite(saved.stopLossPercent))
    && (saved.pendingOrder === null || ['buy', 'sell'].includes(saved.pendingOrder?.side))
    && Array.isArray(saved.events) && Array.isArray(saved.journal) && Array.isArray(saved.history)
    && saved.history.length > 0
    && (saved.status === 'intro' || (typeof saved.plan === 'object' && saved.plan !== null));
}
