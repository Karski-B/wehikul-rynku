// Testy obliczeń. Uruchamiane w przeglądarce przez tests/index.html (bez npm).

import { loadChallenge, validateChallenge, getStartIndex } from '../js/data.js';
import {
  createIntroState, startChallenge, placeOrder, cancelOrder, advance, setStopLoss,
  validateBuy, validateSell, parseDecimal, getPortfolio, getPrice, getLastIndex, validatePlan,
  advanceMany, getExtensionOptions, extendHorizon, getStats, buyAndHoldPath, isRestorable, getDate, finishEarly,
} from '../js/simulation.js';
import { createRandomChallenge, RANDOM_RULES } from '../js/random-market.js';
import { evaluateProcess, MAX_XP, DIVERSIFICATION_QUESTION, reflectionFeedback, lessonCheck } from '../js/scoring.js';
import { handleSubscribe } from '../api/subscribe.js';
import { CONFIG } from '../js/config.js';
import { initAnalytics, track, EVENTS } from '../js/analytics.js';

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function assertClose(actual, expected, message, epsilon = 0.005) {
  if (Math.abs(actual - expected) > epsilon) throw new Error(`${message}: oczekiwano ${expected}, jest ${actual}`);
}

const challenge = await loadChallenge();
const START = getStartIndex(challenge);
const GOOD_PLAN = {
  maxPositionPercent: 25, stopLossPercent: 8, quizAnswer: DIVERSIFICATION_QUESTION.correctId, horizonId: 'march-2020',
};
const quizIds = DIVERSIFICATION_QUESTION.options.map((o) => o.id);
const horizonIds = challenge.timeline.horizons.map((h) => h.id);

// Pomocnik: przechodzi do sesji o podanej dacie (data = ostatnia znana sesja).
function goTo(state, date) {
  let current = state;
  while (challenge.calendar[current.index] < date && current.status === 'playing') current = advance(current, challenge);
  return current;
}
// Zakup z powodem „zgodnie z planem” (tak jak gracz, który uzasadnia decyzje).
function buy(state, amount, reason = 'plan') {
  const result = placeOrder(state, challenge, { side: 'buy', amount, reason });
  if (result.error) throw new Error(result.error);
  return result.state;
}
function finish(state) {
  let current = state;
  while (current.status === 'playing') current = advance(current, challenge);
  return current;
}

// --- Dane ---
test('Dane wyzwania przechodzą walidację', () => {
  assert(validateChallenge(challenge).length === 0, 'walidacja zwróciła błędy');
});
test('Kalendarz bez weekendów i bez 17.02.2020 (brak notowania)', () => {
  assert(!challenge.calendar.includes('2020-02-17'), '17.02 nie powinno być w danych');
  assert(challenge.calendar.filter((d) => d.startsWith('2020-03')).length === 22, 'marzec powinien mieć 22 sesje');
});

// --- Start ---
test('Wyzwanie startuje z 10 000 zł gotówki i bez jednostek', () => {
  const state = startChallenge(challenge, GOOD_PLAN, 'test');
  assert(state.cash === 10000 && state.units === 0, 'zły stan początkowy');
  assert(getPortfolio(state, challenge).value === 10000, 'wartość portfela ≠ 10 000');
  assert(state.index === START, 'start nie jest na 28.02');
});
test('Plan bez wyborów jest odrzucany', () => {
  const empty = { maxPositionPercent: undefined, stopLossPercent: undefined, quizAnswer: undefined, horizonId: undefined };
  const errors = validatePlan(empty, quizIds, horizonIds);
  assert(errors.length === 4, `oczekiwano 4 błędów, jest ${errors.length}`);
  assert(validatePlan({ ...GOOD_PLAN, stopLossPercent: null }, quizIds, horizonIds).length === 0, '„bez stop loss” to poprawny wybór');
});

// --- Dane wejściowe ---
test('parseDecimal akceptuje polski zapis i odrzuca śmieci', () => {
  assert(parseDecimal('1 000,50') === 1000.5, '1 000,50');
  assert(parseDecimal('250') === 250, '250');
  assert(parseDecimal('-5') === -5, '-5 przechodzi do walidacji jako liczba ujemna');
  assert(Number.isNaN(parseDecimal('abc')), 'abc');
  assert(Number.isNaN(parseDecimal('')), 'pusty tekst');
  assert(Number.isNaN(parseDecimal('1e3')), '1e3');
});
test('Blokada: zakup za więcej niż dostępna gotówka', () => {
  const state = startChallenge(challenge, GOOD_PLAN, 'test');
  assert(validateBuy(state, 10000.01) !== null, 'powinien być błąd');
  const result = placeOrder(state, challenge, { side: 'buy', amount: 20000 });
  assert(result.error && result.state.pendingOrder === null, 'zlecenie nie powinno powstać');
});
test('Blokada: kwota zerowa, ujemna, niepoprawna, ułamek grosza', () => {
  const state = startChallenge(challenge, GOOD_PLAN, 'test');
  assert(validateBuy(state, 0) !== null, '0');
  assert(validateBuy(state, -100) !== null, '-100');
  assert(validateBuy(state, NaN) !== null, 'NaN');
  assert(validateBuy(state, 10.001) !== null, '10,001');
  assert(validateBuy(state, 1000.1) === null, '1000,10 jest poprawne');
});
test('Blokada: sprzedaż bez jednostek i ponad posiadane jednostki', () => {
  let state = startChallenge(challenge, GOOD_PLAN, 'test');
  assert(validateSell(state, 1) !== null, 'sprzedaż bez jednostek');
  state = advance(buy(state, 1000), challenge);
  assert(validateSell(state, state.units + 1) !== null, 'sprzedaż ponad stan');
  assert(validateSell(state, 0) !== null, 'zero jednostek');
  assert(validateSell(state, state.units) === null, 'sprzedaż całości jest dozwolona');
});
test('Blokada: drugie zlecenie, gdy pierwsze oczekuje; anulowanie działa', () => {
  let state = buy(startChallenge(challenge, GOOD_PLAN, 'test'), 500);
  assert(validateBuy(state, 500) !== null, 'drugie zlecenie powinno być zablokowane');
  state = cancelOrder(state, challenge);
  assert(state.pendingOrder === null && validateBuy(state, 500) === null, 'anulowanie nie zadziałało');
});

// --- Wykonanie zleceń ---
test('Zlecenie wykonuje się po cenie NASTĘPNEJ sesji, nie bieżącej', () => {
  let state = buy(startChallenge(challenge, GOOD_PLAN, 'test'), 1000);
  assert(state.cash === 10000 && state.units === 0, 'przed następną sesją nic nie powinno się wykonać');
  state = advance(state, challenge);
  const execPrice = getPrice(challenge, START + 1);  // 2.03.2020
  assertClose(state.units, 1000 / execPrice, 'liczba jednostek', 1e-9);
  assert(state.cash === 9000, 'gotówka po zakupie');
  assertClose(getPortfolio(state, challenge).value, 10000, 'wartość w dniu zakupu');
});
test('Wartość portfela zmienia się razem z ceną kolejnej sesji', () => {
  let state = advance(buy(startChallenge(challenge, GOOD_PLAN, 'test'), 1000), challenge);
  const units = state.units;
  state = advance(state, challenge);
  const expected = 9000 + units * getPrice(challenge, START + 2);
  assertClose(getPortfolio(state, challenge).value, expected, 'wartość po kolejnej sesji');
  assertClose(state.history[state.history.length - 1].value, expected, 'historia wartości');
});
test('Stop loss sprzedaje całą pozycję po cenie sesji (z luką cenową)', () => {
  let state = advance(buy(startChallenge(challenge, GOOD_PLAN, 'test'), 1000), challenge);
  const avgCost = state.avgCost;
  state = goTo(state, '2020-03-06');
  const price = getPrice(challenge, state.index);
  assert(state.units === 0, 'pozycja powinna być zamknięta');
  assert(price < avgCost * 0.92, 'w tym teście cena jest poniżej poziomu stop');
  assertClose(state.cash, 9000 + Math.round(1000 / avgCost * price * 100) / 100, 'gotówka po stop loss');
  const entry = state.journal.find((j) => j.kind === 'stop');
  assert(entry && entry.detail.includes('końca dnia'), 'dziennik powinien wyjaśniać uproszczenie');
});
test('Sprzedaż oczekująca po zadziałaniu stop loss jest anulowana', () => {
  let state = advance(buy(startChallenge(challenge, GOOD_PLAN, 'test'), 1000), challenge);
  state = goTo(state, '2020-03-05');
  state = placeOrder(state, challenge, { side: 'sell', units: state.units }).state;
  state = advance(state, challenge);  // 6.03 – stop loss zadziała pierwszy
  assert(state.units === 0, 'pozycja zamknięta');
  assert(state.events.some((e) => e.type === 'order_skipped'), 'zlecenie powinno być pominięte');
});
test('Przekroczenie limitu 10% kończy wyzwanie', () => {
  const plan = { ...GOOD_PLAN, maxPositionPercent: 100, stopLossPercent: null };
  let state = buy(startChallenge(challenge, plan, 'test'), 10000);
  state = finish(state);
  assert(state.status === 'finished' && state.endReason === 'limit_breached', 'powinien być koniec z naruszeniem');
  assert(challenge.calendar[state.index] === '2020-03-06', `koniec 6.03, jest ${challenge.calendar[state.index]}`);
  assert(state.history[state.history.length - 1].value < 9000, 'wartość poniżej limitu');
});
test('Rozgrywka bez transakcji kończy się w ostatniej sesji wybranej długości z 10 000 zł', () => {
  const state = finish(startChallenge(challenge, GOOD_PLAN, 'test'));
  assert(state.endReason === 'completed' && getDate(challenge, state.index) === '2020-03-31', 'zły koniec');
  assert(getPortfolio(state, challenge).value === 10000, 'wartość ≠ 10 000');
});
test('Dziennik zgadza się ze stanem portfela', () => {
  let state = advance(buy(startChallenge(challenge, GOOD_PLAN, 'test'), 2000), challenge);
  state = placeOrder(state, challenge, { side: 'sell', units: state.units / 2 }).state;
  state = finish(state);
  const last = state.journal[state.journal.length - 1];
  assertClose(last.cashAfter, state.cash, 'gotówka w dzienniku');
  assertClose(last.unitsAfter, state.units, 'jednostki w dzienniku', 1e-9);
});
test('Stan nie zawiera cen z przyszłości (historia kończy się na bieżącej sesji)', () => {
  const state = advance(startChallenge(challenge, GOOD_PLAN, 'test'), challenge);
  const lastSnapshot = state.history[state.history.length - 1];
  assert(lastSnapshot.index === state.index, 'historia wybiega w przyszłość');
});

// --- Ocena procesu ---
test('Suma maksymalnych XP to 100', () => {
  assert(MAX_XP === 100, `MAX_XP = ${MAX_XP}`);
});
test('Ten sam proces, inny zysk → to samo XP', () => {
  // A: zakup 1000 zł na starcie — stop loss zadziała ze stratą.
  const a = finish(buy(startChallenge(challenge, GOOD_PLAN, 'a'), 1000));
  // B: zakup 1000 zł 27.03 (wykonanie 30.03) — kończy się zyskiem.
  const b = finish(buy(goTo(startChallenge(challenge, GOOD_PLAN, 'b'), '2020-03-27'), 1000));
  const scoreA = evaluateProcess(a, challenge);
  const scoreB = evaluateProcess(b, challenge);
  assert(scoreA.financial.profit < 0 && scoreB.financial.profit > 0, 'scenariusze powinny mieć różny wynik');
  assert(scoreA.totalXp === scoreB.totalXp, `XP: ${scoreA.totalXp} vs ${scoreB.totalXp}`);
  assert(scoreA.totalXp === 100, `oczekiwano 100 XP, jest ${scoreA.totalXp}`);
});
test('Ryzykowna gra z zyskiem dostaje mniej XP niż ostrożna ze stratą', () => {
  const riskyPlan = { ...GOOD_PLAN, maxPositionPercent: 100, stopLossPercent: null, quizAnswer: 'safe-asset' };
  const risky = finish(buy(goTo(startChallenge(challenge, riskyPlan, 'r'), '2020-03-27'), 10000));
  const careful = finish(buy(startChallenge(challenge, GOOD_PLAN, 'c'), 1000));
  const riskyScore = evaluateProcess(risky, challenge);
  const carefulScore = evaluateProcess(careful, challenge);
  assert(riskyScore.financial.profit > 3000, 'ryzykowna gra powinna mieć duży zysk');
  assert(carefulScore.financial.profit < 0, 'ostrożna gra powinna mieć stratę');
  assert(riskyScore.totalXp < carefulScore.totalXp, `ryzykowna ${riskyScore.totalXp} vs ostrożna ${carefulScore.totalXp}`);
});
test('Brak transakcji: punkty tylko za to, co faktycznie oceniono', () => {
  const score = evaluateProcess(finish(startChallenge(challenge, GOOD_PLAN, 'n')), challenge);
  assert(score.totalXp === 40, `oczekiwano 40 XP (limit 20 + plan stop 10 + quiz 10), jest ${score.totalXp}`);
  assert(score.improvements.length > 0, 'powinna być informacja o niewykorzystanej okazji');
});
test('Zakup większy niż zapas do limitu: 0 XP za kontrolę straty z datą decyzji', () => {
  const plan = { ...GOOD_PLAN, maxPositionPercent: 100, stopLossPercent: null };
  const score = evaluateProcess(finish(buy(startChallenge(challenge, plan, 'x'), 10000)), challenge);
  const loss = score.categories.find((c) => c.id === 'loss');
  assert(loss.xp === 0, 'kontrola straty powinna mieć 0 XP');
  assert(loss.criteria[0].explanation.includes('28 lutego 2020'), loss.criteria[0].explanation);
  assert(!score.financial.limitRespected, 'limit oznaczony jako nieprzestrzegany');
});
test('Kontrola straty ocenia decyzję, nie wynik: zakup bez stopu ponad zapas traci XP nawet z zyskiem', () => {
  // 2500 zł bez stop lossu przy zapasie 1000 zł, kupione 27.03.2020 — gra kończy się zyskiem, a XP i tak jest odjęte.
  const state = finish(buy(goTo(startChallenge(challenge, { ...GOOD_PLAN, stopLossPercent: null }, 'bz'), '2020-03-27'), 2500));
  const score = evaluateProcess(state, challenge);
  assert(score.financial.profit > 0, 'scenariusz powinien skończyć się zyskiem');
  const criterion = score.categories.find((c) => c.id === 'loss').criteria[0];
  assert(!criterion.passed && criterion.explanation.includes('zapas do limitu'), criterion.explanation);
});
test('Plan 25% i zakup 2500 zł ze stopem 8% „zgodnie z planem” → 100 XP (plan nie kłóci się z zapasem)', () => {
  const score = evaluateProcess(finish(buy(startChallenge(challenge, GOOD_PLAN, 'p25'), 2500)), challenge);
  assert(score.totalXp === 100, score.categories.flatMap((c) => c.criteria).filter((c) => !c.passed).map((c) => c.id).join(', '));
});

// Rynek z cenami ustawionymi ręcznie: priceAt(k), gdzie k = numer sesji od startu (k ≤ 0 to historia).
function syntheticMarket(seed, priceAt) {
  const market = createRandomChallenge(challenge, seed);
  const start = getStartIndex(market);
  market.assets[0].sessions.forEach((s, i) => { s.price = priceAt(i - start); });
  return market;
}
function playTo(state, market, steps) {
  let current = state;
  for (let i = 0; i < steps; i += 1) current = advance(current, market);
  return current;
}
function buyOn(state, market, amount) {
  return placeOrder(state, market, { side: 'buy', amount, reason: 'plan' }).state;
}
function finishOn(state, market) {
  let current = state;
  while (current.status === 'playing') current = advance(current, market);
  return current;
}
test('Skok ceny między decyzją a wykonaniem nie zabiera XP za limit z planu', () => {
  // Decyzja: 1500 + 1000 zł przy cenie 100 = 2500 zł (limit planu 25%). Wykonanie po 110 → wycena 2650 zł.
  const market = syntheticMarket(11, (k) => (k <= 1 ? 100 : 110));
  let state = startChallenge(market, { ...GOOD_PLAN, horizonId: 'month' }, 'gap-up');
  state = playTo(buyOn(state, market, 1500), market, 1);
  state = finishOn(buyOn(state, market, 1000), market);
  const score = evaluateProcess(state, market);
  const planSize = score.categories.find((c) => c.id === 'discipline').criteria.find((c) => c.id === 'plan-size');
  assert(planSize.passed, planSize.explanation);
  assert(score.totalXp === 100, `oczekiwano 100 XP, jest ${score.totalXp}`);
});
test('Dokupienie powyżej średniej, wykonane po spadku, nie jest „uśrednianiem w dół”', () => {
  // Średnia 100; decyzja przy 102 (powyżej średniej), wykonanie po 95.
  const market = syntheticMarket(12, (k) => (k <= 1 ? 100 : k === 2 ? 102 : 95));
  let state = startChallenge(market, { ...GOOD_PLAN, horizonId: 'month' }, 'gap-down');
  state = playTo(buyOn(state, market, 1500), market, 2);
  state = finishOn(buyOn(state, market, 950), market);
  const criterion = evaluateProcess(state, market).categories.find((c) => c.id === 'stop').criteria.find((c) => c.id === 'stop-not-widened');
  assert(criterion.passed, criterion.explanation);
});
test('Ten sam proces w różnych datach (także tuż przed ceną ujemną) → to samo XP', () => {
  const plan = { ...GOOD_PLAN, horizonId: 'q2-2020' };
  const scores = ['2020-03-02', '2020-03-16', '2020-04-16', '2020-04-21', '2020-05-15'].map((date) => {
    const state = finish(buy(goTo(startChallenge(challenge, plan, date), date), 1000));
    return { date, xp: evaluateProcess(state, challenge).totalXp, profit: Math.round(state.history.at(-1).value - 10000) };
  });
  assert(scores.every((s) => s.xp === 100), scores.map((s) => `${s.date}: ${s.xp} XP (${s.profit} zł)`).join(', '));
  assert(new Set(scores.map((s) => s.profit)).size > 1, 'wyniki finansowe powinny się różnić');
});
test('Plan bez limitu (100%) i bez stop lossu nie daje punktów za dyscyplinę', () => {
  const plan = { ...GOOD_PLAN, maxPositionPercent: 100, stopLossPercent: null };
  const score = evaluateProcess(finish(buy(startChallenge(challenge, plan, 'p'), 10000, null)), challenge);
  const discipline = score.categories.find((c) => c.id === 'discipline');
  assert(discipline.xp === 0, `dyscyplina powinna mieć 0 XP, ma ${discipline.xp}`);
  assert(score.totalXp === 10, `oczekiwano 10 XP (tylko quiz), jest ${score.totalXp}`);
});
test('Oddalenie stop lossu przy otwartej pozycji odbiera punkty', () => {
  let state = advance(buy(startChallenge(challenge, { ...GOOD_PLAN, stopLossPercent: 5 }, 'w'), 1000), challenge);
  state = setStopLoss(state, challenge, 12);
  const score = evaluateProcess(finish(state), challenge);
  const criterion = score.categories.find((c) => c.id === 'stop').criteria.find((c) => c.id === 'stop-not-widened');
  assert(!criterion.passed && criterion.explanation.includes('z 5% na 12%'), 'oddalenie nie zostało wykryte');
});
test('Każde kryterium ma opis zdobycia, utraty i wyjaśnienie', () => {
  const score = evaluateProcess(finish(startChallenge(challenge, GOOD_PLAN, 'd')), challenge);
  score.categories.flatMap((c) => c.criteria).forEach((c) => {
    assert(c.gain && c.lose && c.explanation, `brak opisu w ${c.id}`);
  });
});

// --- Funkcja serwerowa zapisu (bez prawdziwego wysyłania) ---
function postRequest(body) {
  return new Request('https://example.test/api/subscribe', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}
const FULL_ENV = {
  BREVO_API_KEY: 'test-key', BREVO_LIST_ID: '3', BREVO_DOI_TEMPLATE_ID: '7',
  BREVO_DOI_REDIRECT_URL: 'https://example.test/potwierdzono.html',
};
test('API: brak konfiguracji → 503 not_configured (bez wysyłki)', async () => {
  let called = false;
  const response = await handleSubscribe(postRequest({ email: 'jan@example.com', consent: true }), {}, () => { called = true; });
  const body = await response.json();
  assert(response.status === 503 && body.error === 'not_configured', `status ${response.status}`);
  assert(!called, 'nie powinno być połączenia z dostawcą');
});
test('API: błędny e-mail i brak zgody → 400', async () => {
  const bad = await handleSubscribe(postRequest({ email: 'jan@', consent: true }), FULL_ENV, () => {});
  assert(bad.status === 400 && (await bad.json()).error === 'invalid_email', 'zły e-mail');
  const noConsent = await handleSubscribe(postRequest({ email: 'jan@example.com', consent: false }), FULL_ENV, () => {});
  assert(noConsent.status === 400 && (await noConsent.json()).error === 'consent_required', 'brak zgody');
});
test('API: metoda GET → 405', async () => {
  const response = await handleSubscribe(new Request('https://example.test/api/subscribe'), FULL_ENV, () => {});
  assert(response.status === 405, `status ${response.status}`);
});
test('API: poprawne dane → zapytanie double opt-in do Brevo i status confirmation_sent', async () => {
  let sent = null;
  const fakeFetch = async (url, options) => { sent = { url, options }; return new Response('{}', { status: 201 }); };
  const response = await handleSubscribe(postRequest({ email: ' jan@example.com ', consent: true }), FULL_ENV, fakeFetch);
  const body = await response.json();
  assert(response.status === 200 && body.status === 'confirmation_sent', `status ${response.status}`);
  assert(sent.url.endsWith('/v3/contacts/doubleOptinConfirmation'), 'zły adres Brevo');
  const payload = JSON.parse(sent.options.body);
  assert(payload.email === 'jan@example.com' && payload.includeListIds[0] === 3 && payload.templateId === 7, 'złe dane');
  assert(sent.options.headers['api-key'] === 'test-key', 'klucz powinien iść tylko w nagłówku do Brevo');
  assert(!JSON.stringify(body).includes('test-key'), 'klucz nie może wrócić do przeglądarki');
});
test('API: błąd dostawcy → 502, bez fałszywego sukcesu', async () => {
  const fakeFetch = async () => new Response('{"code":"unauthorized"}', { status: 401 });
  const originalError = console.error;
  console.error = () => {};
  const response = await handleSubscribe(postRequest({ email: 'jan@example.com', consent: true }), FULL_ENV, fakeFetch);
  console.error = originalError;
  assert(response.status === 502, `status ${response.status}`);
});

// --- Długość wyzwania i przedłużanie ---
test('Długość „do końca czerwca 2020” kończy grę 30.06.2020', () => {
  const state = finish(startChallenge(challenge, { ...GOOD_PLAN, horizonId: 'q2-2020' }, 'h'));
  assert(getDate(challenge, state.index) === '2020-06-30', `koniec: ${getDate(challenge, state.index)}`);
});
test('Ukończone wyzwanie można przedłużyć; portfel zostaje bez zmian', () => {
  let state = advance(buy(startChallenge(challenge, GOOD_PLAN, 'e'), 1000), challenge);
  state = finish(state);
  const options = getExtensionOptions(state, challenge);
  assert(options.length > 0 && options[0].endDate === '2020-04-30', `pierwsza opcja: ${options[0]?.endDate}`);
  const cashBefore = state.cash;
  const extended = extendHorizon(state, challenge, options[0].index);
  assert(extended.status === 'playing' && extended.cash === cashBefore, 'przedłużenie nie zadziałało');
  const next = advance(extended, challenge);
  assert(getDate(challenge, next.index) === '2020-04-01', 'gra nie idzie dalej');
});
test('Po przekroczeniu limitu nie da się przedłużyć', () => {
  const state = finish(buy(startChallenge(challenge, { ...GOOD_PLAN, maxPositionPercent: 100, stopLossPercent: null }, 'x'), 10000));
  assert(getExtensionOptions(state, challenge).length === 0, 'nie powinno być opcji');
  assert(extendHorizon(state, challenge, state.index + 10) === state, 'stan nie powinien się zmienić');
});
test('Przewijanie zatrzymuje się przy wiadomości z rynku', () => {
  const result = advanceMany(startChallenge(challenge, GOOD_PLAN, 'f'), challenge, 21);
  assert(getDate(challenge, result.state.index) === '2020-03-06' && result.steps === 5, `stop: ${getDate(challenge, result.state.index)}`);
});

// --- Cena ujemna (20.04.2020) ---
const LONG_PLAN = { ...GOOD_PLAN, horizonId: 'q2-2020', stopLossPercent: null };
test('Kupno po cenie ujemnej jest anulowane', () => {
  let state = goTo(startChallenge(challenge, LONG_PLAN, 'n1'), '2020-04-17');
  state = advance(buy(state, 1000), challenge); // wykonanie 20.04.2020 (cena ujemna)
  assert(getDate(challenge, state.index) === '2020-04-20', 'zła data');
  assert(state.cash === 10000 && state.units === 0, 'zakup nie powinien się wykonać');
  assert(state.events.some((e) => e.reason === 'non_positive_price'), 'brak informacji o anulowaniu');
});
test('Pozycja przy cenie ujemnej obniża portfel poniżej limitu', () => {
  let state = goTo(startChallenge(challenge, LONG_PLAN, 'n2'), '2020-04-16');
  state = finish(buy(state, 500));
  assert(state.endReason === 'limit_breached' && getDate(challenge, state.index) === '2020-04-20', 'limit powinien paść 20.04');
  const score = evaluateProcess(state, challenge);
  // Zakup 500 zł mieścił się w zapasie (1000 zł) — limit przebiła dopiero cena ujemna, więc decyzja jest zaliczona.
  const criterion = score.categories[0].criteria[0];
  assert(criterion.passed && criterion.explanation.includes('cena ujemna'), criterion.explanation);
});
test('Gra z ujemną gotówką (dopłata przy cenie ujemnej) daje się wczytać po odświeżeniu', () => {
  let state = goTo(startChallenge(challenge, { ...LONG_PLAN, maxPositionPercent: 100, stopLossPercent: 12 }, 'neg'), '2020-04-16');
  state = finish(buy(state, state.cash));
  assert(state.cash < 0, `gotówka powinna być ujemna, jest ${state.cash}`);
  assert(isRestorable(JSON.parse(JSON.stringify(state)), challenge), 'zapis z ujemną gotówką został odrzucony');
});
test('Stop loss przy cenie ujemnej sprzedaje z dopłatą', () => {
  let state = goTo(startChallenge(challenge, { ...LONG_PLAN, stopLossPercent: 8 }, 'n3'), '2020-04-16');
  state = finish(buy(state, 500));
  const stop = state.journal.find((j) => j.kind === 'stop');
  assert(stop && stop.amount < 0 && stop.detail.includes('dopłat'), 'stop loss powinien sprzedać z dopłatą');
});

// --- Statystyki i porównanie ---
test('Statystyki: obsunięcie po naruszeniu limitu jest większe niż 10%', () => {
  const state = finish(buy(startChallenge(challenge, { ...GOOD_PLAN, maxPositionPercent: 100, stopLossPercent: null }, 's'), 10000));
  const stats = getStats(state);
  assert(stats.maxDrawdown > 0.1 && stats.buys === 1, `obsunięcie ${stats.maxDrawdown}`);
});
test('Porównanie „kup i trzymaj”: data przekroczenia limitu i najniższa wartość (także ujemna)', () => {
  const end = challenge.calendar.indexOf('2020-06-30');
  const benchmark = buyAndHoldPath(challenge, end);
  assert(benchmark.breachDate === '2020-03-06', `limit: ${benchmark.breachDate}`);
  assert(benchmark.lowest.date === '2020-04-20' && benchmark.lowest.value < 0, `najniżej: ${benchmark.lowest.date}`);
  assert(benchmark.endDate === '2020-06-30', 'zła data końca');
});

// --- Uszczelnienie XP (etap studia) ---
test('XP: zakup za 1% kapitału nie daje punktów za zarządzanie pozycją', () => {
  const score = evaluateProcess(finish(buy(startChallenge(challenge, GOOD_PLAN, 't'), 100)), challenge);
  assert(score.totalXp === 45, `oczekiwano 45 XP (limit 20 + plan stop 10 + quiz 10 + uzasadnienie 5), jest ${score.totalXp}`);
  const stop = score.categories.find((c) => c.id === 'stop').criteria.find((c) => c.id === 'stop-always');
  assert(!stop.applicable && stop.explanation.includes('5% kapitału'), 'brak wyjaśnienia progu 5%');
});
test('XP: oddalenie stopu przez chwilowe wyłączenie (5% → brak → 12%) jest wykryte', () => {
  let state = advance(buy(startChallenge(challenge, { ...GOOD_PLAN, stopLossPercent: 5 }, 'w2'), 1000), challenge);
  state = setStopLoss(state, challenge, null);
  state = setStopLoss(state, challenge, 12);
  const score = evaluateProcess(finish(state), challenge);
  const criterion = score.categories.find((c) => c.id === 'stop').criteria.find((c) => c.id === 'stop-not-widened');
  assert(!criterion.passed && criterion.explanation.includes('z 5% na 12%'), criterion.explanation);
});
test('XP: zmiana stopu bez pozycji nie jest „oddaleniem” przy nowej pozycji', () => {
  let state = startChallenge(challenge, { ...GOOD_PLAN, stopLossPercent: 5 }, 'w3');
  state = setStopLoss(state, challenge, 12);          // brak pozycji — wolno
  state = advance(buy(state, 1000), challenge);       // wejście ze stopem 12%
  const score = evaluateProcess(finish(state), challenge);
  const criterion = score.categories.find((c) => c.id === 'stop').criteria.find((c) => c.id === 'stop-not-widened');
  assert(criterion.passed, criterion.explanation);
});

test('Zapis gry z uszkodzonymi polami nie jest wczytywany', () => {
  const good = advance(buy(startChallenge(challenge, GOOD_PLAN, 'rs'), 1000), challenge);
  assert(isRestorable(JSON.parse(JSON.stringify(good)), challenge), 'poprawny zapis powinien się wczytać');
  [{ cash: 'brak' }, { units: -1 }, { units: 'dużo' }, { events: null }, { plan: null }, { pendingOrder: { side: 'hold' } }, { version: 2 }]
    .forEach((broken) => assert(!isRestorable({ ...good, ...broken }, challenge), `przyjęto zły zapis: ${JSON.stringify(broken)}`));
});

// --- „Dlaczego?”: powód zlecenia i refleksja ---
test('Powód zlecenia trafia do zdarzenia i dziennika', () => {
  const state = buy(startChallenge(challenge, GOOD_PLAN, 'why'), 1000, 'news');
  const event = state.events.find((e) => e.type === 'order_placed');
  assert(event.reason === 'news', `powód w zdarzeniu: ${event.reason}`);
  assert(state.journal.at(-1).detail.includes('Powód: reaguję na nową informację'), state.journal.at(-1).detail);
});
test('Powód niezgodny z faktami nie daje XP: „ograniczam ryzyko” przy kupnie, „plan” ponad limit, „wiadomość” bez wiadomości', () => {
  const reasonsOf = (state) => evaluateProcess(finish(state), challenge).categories
    .find((c) => c.id === 'discipline').criteria.find((c) => c.id === 'reasons');
  const risky = reasonsOf(buy(startChallenge(challenge, GOOD_PLAN, 'r1'), 1000, 'risk'));
  assert(!risky.passed && risky.explanation.includes('kupno zwiększa ryzyko'), risky.explanation);
  const overPlan = reasonsOf(buy(startChallenge(challenge, { ...GOOD_PLAN, maxPositionPercent: 10 }, 'r2'), 2000, 'plan'));
  assert(!overPlan.passed && overPlan.explanation.includes('limit z planu'), overPlan.explanation);
  const noNews = reasonsOf(buy(startChallenge(challenge, GOOD_PLAN, 'r3'), 1000, 'news')); // 28.02 — brak wiadomości
  assert(!noNews.passed && noNews.explanation.includes('brak wiadomości'), noNews.explanation);
  const withNews = reasonsOf(buy(goTo(startChallenge(challenge, GOOD_PLAN, 'r4'), '2020-03-10'), 1000, 'news'));
  assert(withNews.passed, `wiadomość z 9.03 powinna uzasadniać zakup 10.03: ${withNews.explanation}`);
});
test('Uśrednianie w dół obniża poziom stopu i jest wykryte jako oddalenie', () => {
  const market = createRandomChallenge(challenge, 7);
  const start = getStartIndex(market);
  // Cena: 100, potem −1% dziennie (stop 8% nie zadziała przez kilka sesji).
  market.assets[0].sessions.forEach((s, i) => { s.price = i <= start ? 100 : 100 * 0.99 ** (i - start); });
  const plan = { ...GOOD_PLAN, horizonId: 'month' };
  let state = advance(placeOrder(startChallenge(market, plan, 'avg'), market, { side: 'buy', amount: 1000, reason: 'plan' }).state, market);
  state = advance(advance(state, market), market);
  state = advance(placeOrder(state, market, { side: 'buy', amount: 500, reason: 'plan' }).state, market); // dokupienie niżej
  while (state.status === 'playing') state = advance(state, market);
  const criterion = evaluateProcess(state, market).categories.find((c) => c.id === 'stop').criteria.find((c) => c.id === 'stop-not-widened');
  assert(!criterion.passed && criterion.explanation.includes('poniżej średniej ceny'), criterion.explanation);
});
test('Zlecenie „bez konkretnego powodu” lub bez powodu nie daje XP za uzasadnienie', () => {
  [null, 'impulse', 'nieznany'].forEach((reason) => {
    const score = evaluateProcess(finish(buy(startChallenge(challenge, GOOD_PLAN, 'imp'), 1000, reason)), challenge);
    const criterion = score.categories.find((c) => c.id === 'discipline').criteria.find((c) => c.id === 'reasons');
    assert(criterion.applicable && !criterion.passed, `powód ${reason}: ${criterion.explanation}`);
    assert(score.totalXp === 95, `powód ${reason}: oczekiwano 95 XP, jest ${score.totalXp}`);
  });
});
test('Bez zleceń uzasadnienie jest „nie oceniono”, a nie zaliczone', () => {
  const score = evaluateProcess(finish(startChallenge(challenge, GOOD_PLAN, 'nr')), challenge);
  const criterion = score.categories.find((c) => c.id === 'discipline').criteria.find((c) => c.id === 'reasons');
  assert(!criterion.applicable && criterion.xp === 0, criterion.explanation);
});
test('Refleksja: wniosek zgodny z utraconymi punktami jest potwierdzony', () => {
  const plan = { ...GOOD_PLAN, maxPositionPercent: 100, stopLossPercent: null };
  const score = evaluateProcess(finish(buy(startChallenge(challenge, plan, 'rf'), 6000)), challenge);
  assert(reflectionFeedback('smaller', score).startsWith('Trafny wniosek'), reflectionFeedback('smaller', score));
  assert(reflectionFeedback('same', score).startsWith('Ocena wskazuje'), reflectionFeedback('same', score));
  const perfect = evaluateProcess(finish(buy(startChallenge(challenge, GOOD_PLAN, 'rp'), 1000)), challenge);
  assert(reflectionFeedback('same', perfect).startsWith('Zgadza się'), reflectionFeedback('same', perfect));
  assert(reflectionFeedback('xyz', perfect) === '', 'nieznana odpowiedź powinna dać pusty tekst');
  const cashOnly = evaluateProcess(finish(startChallenge(challenge, GOOD_PLAN, 'rc')), challenge);
  assert(reflectionFeedback('same', cashOnly).includes('nie dało się ocenić'), reflectionFeedback('same', cashOnly));
});

test('Wniosek z poprzedniej gry: dotrzymany, niedotrzymany albo nie do sprawdzenia', () => {
  const good = evaluateProcess(finish(buy(startChallenge(challenge, GOOD_PLAN, 'l1'), 1000)), challenge);
  assert(lessonCheck('smaller', good).kept === true, lessonCheck('smaller', good).text);
  const tooBig = evaluateProcess(finish(buy(startChallenge(challenge, { ...GOOD_PLAN, maxPositionPercent: 100 }, 'l2'), 6000)), challenge);
  assert(lessonCheck('smaller', tooBig).kept === false, lessonCheck('smaller', tooBig).text);
  const cashOnly = evaluateProcess(finish(startChallenge(challenge, GOOD_PLAN, 'l3')), challenge);
  assert(lessonCheck('smaller', cashOnly).kept === null || lessonCheck('smaller', cashOnly).kept === true, 'bez zakupu wniosek nie może być „niedotrzymany”');
  assert(lessonCheck(null, good) === null, 'brak wniosku = brak sprawdzenia');
});

// --- Wcześniejsze zakończenie i zatrzymania przewijania ---
test('Zakończenie gry wcześniej: ocena, anulowane zlecenie i możliwość „Graj dalej”', () => {
  let state = buy(startChallenge(challenge, { ...GOOD_PLAN, horizonId: 'all' }, 'fe'), 1000);
  state = finishEarly(state, challenge);
  assert(state.status === 'finished' && state.pendingOrder === null, 'gra powinna się zakończyć bez zlecenia');
  assert(getExtensionOptions(state, challenge).length > 0, 'powinno dać się przedłużyć');
  assert(evaluateProcess(state, challenge).maxXp === 100, 'ocena powinna działać');
});
test('Przewijanie zatrzymuje się przy dużym ruchu ceny z otwartą pozycją', () => {
  let state = advance(buy(startChallenge(challenge, { ...GOOD_PLAN, stopLossPercent: null, horizonId: 'q2-2020' }, 'bm'), 1000), challenge);
  state = goTo(state, '2020-03-13');
  const result = advanceMany(state, challenge, 21);
  assert(result.stopReason === 'big_move' && getDate(challenge, result.state.index) === '2020-03-16',
    `zatrzymanie: ${result.stopReason} ${getDate(challenge, result.state.index)}`);
});
test('Przewijanie zatrzymuje się raz przy wejściu w strefę blisko limitu', () => {
  const market = createRandomChallenge(challenge, 1);
  const prices = market.assets[0].sessions;
  const start = getStartIndex(market);
  prices.forEach((s, i) => { s.price = i <= start ? 100 : 100 * 0.98 ** (i - start - 1); }); // −2% dziennie
  let state = advance(placeOrder(startChallenge(market, { ...GOOD_PLAN, maxPositionPercent: 100, stopLossPercent: null, horizonId: 'year' }, 'nl'), market,
    { side: 'buy', amount: 8000 }).state, market);
  const result = advanceMany(state, market, 21);
  const margin = result.state.history.at(-1).value - 9000;
  assert(result.stopReason === 'near_limit' && margin < 300 && margin >= 0, `zatrzymanie: ${result.stopReason}, zapas ${margin}`);
});

// --- Losowy rynek ---
test('Losowy rynek: ten sam numer = te same ceny, inny numer = inne ceny', () => {
  const a = createRandomChallenge(challenge, 123456).assets[0].sessions.map((s) => s.price);
  const b = createRandomChallenge(challenge, 123456).assets[0].sessions.map((s) => s.price);
  const c = createRandomChallenge(challenge, 654321).assets[0].sessions.map((s) => s.price);
  assert(a.join() === b.join(), 'ten sam seed powinien dać te same ceny');
  assert(a.join() !== c.join(), 'inny seed powinien dać inne ceny');
});
test('Losowy rynek: poprawne dane, ceny dodatnie, dzienne zmiany najwyżej ±6%', () => {
  const random = createRandomChallenge(challenge, 777);
  assert(validateChallenge(random).length === 0, validateChallenge(random).join(' '));
  const prices = random.assets[0].sessions.map((s) => s.price);
  assert(prices.every((p) => p > 0), 'ceny muszą być dodatnie');
  const worst = Math.max(...prices.slice(1).map((p, i) => Math.abs(p / prices[i] - 1)));
  assert(worst <= RANDOM_RULES.maxDailyMove + 0.0005, `największa zmiana ${worst}`);
  assert(random.assets[0].sessions[getStartIndex(random)].price === 100, 'cena startowa ≠ 100');
});
test('Losowy rynek: pełna gra działa i daje się odtworzyć po odświeżeniu', () => {
  const random = createRandomChallenge(challenge, 2468);
  const plan = { ...GOOD_PLAN, horizonId: 'month' };
  let state = advance(placeOrder(startChallenge(random, plan, 'r'), random, { side: 'buy', amount: 1000 }).state, random);
  state = finish2(state, random);
  assert(state.status === 'finished', 'gra powinna się zakończyć');
  const restored = JSON.parse(JSON.stringify(state));
  assert(isRestorable(restored, createRandomChallenge(challenge, 2468)), 'stan powinien dać się przywrócić');
});
function finish2(state, market) {
  let current = state;
  while (current.status === 'playing') current = advance(current, market);
  return current;
}

// --- Analityka (bez połączenia z prawdziwym Umami: skrypt zastępujemy lokalną atrapą) ---
test('Analityka: w trybie Umami wysyłana jest tylko nazwa dozwolonego zdarzenia', async () => {
  window.umamiCalls = [];
  CONFIG.analytics.provider = 'umami';
  CONFIG.analytics.umamiWebsiteId = 'test-id';
  CONFIG.analytics.umamiScriptUrl = 'data:text/javascript,window.umami={track:(...args)=>window.umamiCalls.push(args)}';
  initAnalytics();
  track(EVENTS.STARTED);          // przed wczytaniem skryptu — trafia do kolejki
  await new Promise((resolve) => setTimeout(resolve, 300));
  track(EVENTS.COMPLETED);
  const rejected = track('email_entered');
  assert(!rejected, 'nieznane zdarzenie powinno być odrzucone');
  assert(window.umamiCalls.length === 2, `oczekiwano 2 wywołań, jest ${window.umamiCalls.length}`);
  assert(window.umamiCalls.every((args) => args.length === 1), 'wysyłamy tylko nazwę, bez dodatkowych danych');
  const script = document.querySelector('script[data-website-id="test-id"]');
  assert(script.dataset.autoPageview === 'false' && script.dataset.doNotTrack === 'true', 'zła konfiguracja skryptu');
});

// --- Uruchomienie ---
const list = document.querySelector('#results');
let passed = 0;
for (const { name, fn } of tests) {
  const item = document.createElement('li');
  try {
    await fn();
    passed += 1;
    item.textContent = `✓ ${name}`;
    item.className = 'ok';
  } catch (error) {
    item.textContent = `✗ ${name} — ${error.message}`;
    item.className = 'error';
  }
  list.append(item);
}
const summary = `${passed} z ${tests.length} testów zaliczonych`;
document.querySelector('#summary').textContent = summary;
document.querySelector('#summary').className = passed === tests.length ? 'ok' : 'error';
window.testSummary = { passed, total: tests.length };
