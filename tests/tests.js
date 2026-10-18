// Testy obliczeń. Uruchamiane w przeglądarce przez tests/index.html (bez npm).

import { loadChallenge, validateChallenge, getStartIndex } from '../js/data.js';
import {
  createIntroState, startChallenge, placeOrder, cancelOrder, advance, setStopLoss,
  validateBuy, validateSell, parseDecimal, getPortfolio, getPrice, getLastIndex, validatePlan,
} from '../js/simulation.js';
import { evaluateProcess, MAX_XP, DIVERSIFICATION_QUESTION } from '../js/scoring.js';
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
const GOOD_PLAN = { maxPositionPercent: 25, stopLossPercent: 8, quizAnswer: DIVERSIFICATION_QUESTION.correctId };
const quizIds = DIVERSIFICATION_QUESTION.options.map((o) => o.id);

// Pomocnik: przechodzi do sesji o podanej dacie (data = ostatnia znana sesja).
function goTo(state, date) {
  let current = state;
  while (challenge.calendar[current.index] < date && current.status === 'playing') current = advance(current, challenge);
  return current;
}
function buy(state, amount) {
  const result = placeOrder(state, challenge, { side: 'buy', amount });
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
  const errors = validatePlan({ maxPositionPercent: undefined, stopLossPercent: undefined, quizAnswer: undefined }, quizIds);
  assert(errors.length === 3, `oczekiwano 3 błędów, jest ${errors.length}`);
  assert(validatePlan({ ...GOOD_PLAN, stopLossPercent: null }, quizIds).length === 0, '„bez stop loss” to poprawny wybór');
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
test('Rozgrywka bez transakcji kończy się w ostatniej sesji z 10 000 zł', () => {
  const state = finish(startChallenge(challenge, GOOD_PLAN, 'test'));
  assert(state.endReason === 'completed' && state.index === getLastIndex(challenge), 'zły koniec');
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
  const riskyPlan = { maxPositionPercent: 100, stopLossPercent: null, quizAnswer: 'safe-asset' };
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
  assert(score.totalXp === 45, `oczekiwano 45 XP (limit 25 + plan stop 10 + quiz 10), jest ${score.totalXp}`);
  assert(score.improvements.length > 0, 'powinna być informacja o niewykorzystanej okazji');
});
test('Naruszenie limitu: 0 XP za kontrolę straty z konkretną datą', () => {
  const plan = { ...GOOD_PLAN, maxPositionPercent: 100, stopLossPercent: null };
  const score = evaluateProcess(finish(buy(startChallenge(challenge, plan, 'x'), 10000)), challenge);
  const loss = score.categories.find((c) => c.id === 'loss');
  assert(loss.xp === 0, 'kontrola straty powinna mieć 0 XP');
  assert(loss.criteria[0].explanation.includes('6 marca 2020'), 'wyjaśnienie powinno wskazać datę');
  assert(!score.financial.limitRespected, 'limit oznaczony jako nieprzestrzegany');
});
test('Plan bez limitu (100%) i bez stop lossu nie daje punktów za dyscyplinę', () => {
  const plan = { maxPositionPercent: 100, stopLossPercent: null, quizAnswer: DIVERSIFICATION_QUESTION.correctId };
  const score = evaluateProcess(finish(buy(startChallenge(challenge, plan, 'p'), 10000)), challenge);
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
