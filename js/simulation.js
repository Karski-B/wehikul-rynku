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
// UPROSZCZENIA: brak prowizji, brak dźwigni i krótkiej sprzedaży, ułamkowe jednostki są dozwolone.
// Stop loss sprawdzamy tylko na cenie z końca dnia, więc sprzedaż może nastąpić dużo niżej
// niż poziom stop lossu (luka cenowa). Prawdziwe zlecenie też nie gwarantuje ceny wykonania.

import { getStartIndex } from './data.js';
import { formatMoney, formatNumber } from './format.js';

export const STATE_VERSION = 1;
export const STOP_LOSS_OPTIONS = [5, 8, 12];          // procent poniżej średniej ceny zakupu
export const POSITION_LIMIT_OPTIONS = [10, 25, 50, 100]; // procent kapitału początkowego
const UNITS_TOLERANCE = 0.00005;                       // połowa najmniejszej wyświetlanej jednostki

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

export function getLastIndex(challenge) {
  return challenge.calendar.length - 1;
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
  const state = {
    version: STATE_VERSION,
    challengeId: challenge.id,
    runId: null,
    status: 'intro',
    endReason: null,
    plan: null,
    index: getStartIndex(challenge),
    cash: challenge.rules.initialCapital,
    units: 0,
    avgCost: 0,
    stopLossPercent: null,
    pendingOrder: null,
    journal: [],
    events: [],
    history: [],
    analytics: { startedSent: false, completedSent: false },
  };
  state.history.push(makeSnapshot(state, challenge, 0, null));
  return state;
}

// Zwraca listę błędów planu (pusta lista = plan poprawny).
export function validatePlan(plan, quizOptionIds) {
  const errors = [];
  if (!POSITION_LIMIT_OPTIONS.includes(plan.maxPositionPercent)) {
    errors.push({ field: 'maxPositionPercent', message: 'Wybierz maksymalną wielkość pozycji.' });
  }
  // null oznacza świadomy wybór „bez stop loss”; undefined — brak wyboru
  if (plan.stopLossPercent !== null && !STOP_LOSS_OPTIONS.includes(plan.stopLossPercent)) {
    errors.push({ field: 'stopLossPercent', message: 'Wybierz poziom stop loss albo „bez stop loss”.' });
  }
  if (!quizOptionIds.includes(plan.quizAnswer)) {
    errors.push({ field: 'quizAnswer', message: 'Odpowiedz na pytanie o dywersyfikację.' });
  }
  return errors;
}

export function startChallenge(challenge, plan, runId) {
  const state = createIntroState(challenge);
  state.status = 'playing';
  state.runId = runId;
  state.plan = { ...plan };
  state.stopLossPercent = plan.stopLossPercent;
  const date = getDate(challenge, state.index);
  state.events.push({ type: 'plan_set', date, ...plan });
  state.journal.push({
    date,
    kind: 'start',
    title: 'Start wyzwania',
    detail: `Plan: pozycja do ${plan.maxPositionPercent}% kapitału, ` +
      (plan.stopLossPercent === null ? 'bez stop loss.' : `stop loss ${plan.stopLossPercent}%.`),
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
  if (amount > state.cash + 1e-9) return `Nie masz tyle gotówki. Dostępne: ${formatMoney(state.cash)}.`;
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

  const next = structuredClone(state);
  const date = getDate(challenge, next.index);
  if (order.side === 'buy') {
    next.pendingOrder = { side: 'buy', amount: order.amount, placedOn: date };
  } else {
    // Liczba w granicach tolerancji oznacza „sprzedaj wszystko” (bez okruchów jednostek).
    const sellAll = Math.abs(order.units - next.units) <= UNITS_TOLERANCE;
    next.pendingOrder = { side: 'sell', units: sellAll ? next.units : order.units, sellAll, placedOn: date };
  }
  next.events.push({ type: 'order_placed', date, ...next.pendingOrder });
  next.journal.push({
    date,
    kind: 'order',
    title: order.side === 'buy' ? 'Zlecenie kupna (oczekuje)' : 'Zlecenie sprzedaży (oczekuje)',
    detail: (order.side === 'buy'
      ? `Kwota ${formatMoney(order.amount)}.`
      : `${formatNumber(next.pendingOrder.units, 4)} jedn.`) + ' Wykona się po cenie z następnej sesji.',
    cashAfter: next.cash,
    unitsAfter: next.units,
  });
  return { state: next, error: null };
}

export function cancelOrder(state, challenge) {
  if (!state.pendingOrder || state.status !== 'playing') return state;
  const next = structuredClone(state);
  const date = getDate(challenge, next.index);
  next.events.push({ type: 'order_cancelled', date, side: next.pendingOrder.side });
  next.journal.push({ date, kind: 'cancel', title: 'Zlecenie anulowane', cashAfter: next.cash, unitsAfter: next.units });
  next.pendingOrder = null;
  return next;
}

export function setStopLoss(state, challenge, percent) {
  if (state.status !== 'playing' || percent === state.stopLossPercent) return state;
  if (percent !== null && !STOP_LOSS_OPTIONS.includes(percent)) return state;

  const next = structuredClone(state);
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

// Przejście do następnej sesji. Zwraca nowy stan (stary pozostaje bez zmian).
export function advance(state, challenge) {
  if (state.status !== 'playing') return state;
  const next = structuredClone(state);
  const lastIndex = getLastIndex(challenge);
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
        'Symulacja używa cen z końca dnia, więc sprzedaż nastąpiła po cenie sesji, a nie dokładnie na poziomie stop loss.',
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
  if (order?.side === 'buy') {
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
        detail: `${formatNumber(units, 4)} jedn. po ${formatMoney(price)} za ${formatMoney(amount)}.`,
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
      sessionChangeShare: price / previousPrice - 1,
    });
    next.journal.push({
      date, kind: 'limit', title: 'Limit straty przekroczony — koniec wyzwania',
      detail: `Wartość portfela: ${formatMoney(snapshot.value)}, limit: ${formatMoney(challenge.rules.minPortfolioValue)}.`,
      cashAfter: next.cash, unitsAfter: next.units,
    });
  } else if (next.index === lastIndex) {
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

// Sprawdza, czy zapisany stan pasuje do danych (np. po odświeżeniu strony).
export function isRestorable(saved, challenge) {
  return Boolean(saved)
    && saved.version === STATE_VERSION
    && saved.challengeId === challenge.id
    && Number.isInteger(saved.index)
    && saved.index >= getStartIndex(challenge)
    && saved.index <= getLastIndex(challenge)
    && ['intro', 'playing', 'finished'].includes(saved.status);
}
