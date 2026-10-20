// Ocena procesu decyzyjnego i XP. Ten moduł nie dotyka HTML.
//
// ZASADY OCENY
// - XP liczymy wyłącznie z decyzji zapisanych w trakcie gry (state.events i state.history),
//   ocenianych na podstawie tego, co gracz wiedział w chwili decyzji. Późniejszy przebieg cen,
//   końcowy zysk ani stopa zwrotu nie zmieniają XP — pokazujemy je osobno.
// - Progi (50% kapitału, 5% ryzyka) to reguły tej gry edukacyjnej, a nie uniwersalne
//   zalecenia inwestycyjne.
// - Kryterium, którego nie dało się sprawdzić (np. nie było żadnej pozycji), daje 0 XP
//   z wyjaśnieniem. Nie przyznajemy punktów za coś, czego gracz nie zrobił.
// - Ocena jest deterministyczna: te same decyzje zawsze dają ten sam wynik.

import { formatDate, formatMoney, formatPercent } from './format.js';

export const GAME_RULES = {
  maxPositionShare: 0.5,      // pozycja po zakupie najwyżej 50% kapitału początkowego
  maxPlannedRiskShare: 0.05,  // planowane ryzyko najwyżej 5% kapitału (połowa limitu straty)
  minPositionShare: 0.05,     // zarządzanie pozycją oceniamy od pozycji ≥ 5% kapitału (mniejsza to „próba”)
};

export const DIVERSIFICATION_QUESTION = {
  prompt: 'W tym wyzwaniu możesz trzymać tylko gotówkę albo jedno aktywo (surowiec). Co to oznacza dla dywersyfikacji?',
  options: [
    {
      id: 'split-orders',
      text: 'Mogę zdywersyfikować portfel, kupując ten sam surowiec w kilku mniejszych transakcjach.',
      feedback: 'Kilka zakupów tego samego aktywa to nadal jedno ryzyko — wszystkie części tracą jednocześnie.',
    },
    {
      id: 'one-asset',
      text: 'Nie rozłożę ryzyka na różne aktywa. Ryzyko ograniczam gotówką, wielkością pozycji i stop lossem.',
      feedback: 'Dywersyfikacja wymaga kilku różnych aktywów. Przy jednym aktywie zostaje kontrola wielkości pozycji i gotówka.',
    },
    {
      id: 'safe-asset',
      text: 'Dywersyfikacja nie jest potrzebna, bo surowców świat zawsze potrzebuje, więc nie mogą mocno stanieć.',
      feedback: 'Nawet potrzebny surowiec może gwałtownie tanieć — cena zależy od bieżącej podaży i popytu.',
    },
  ],
  correctId: 'one-asset',
};

// Jawny opis kryteriów: wyświetlany przed startem i na ekranie wyników.
export const CATEGORIES = [
  {
    id: 'loss',
    title: 'Kontrola straty',
    criteria: [{
      id: 'loss-buffer', maxXp: 20, label: 'Strata do stop lossu mieściła się w zapasie do limitu',
      gain: 'Przy każdym zakupie możliwa strata do poziomu stop lossu (bez stopu: cała pozycja) była nie większa ' +
        'niż zapas do limitu straty. Zadziałanie stopu nie kończyłoby więc wyzwania. Bez zakupów cały kapitał jest bezpieczny.',
      lose: 'Przy którymś zakupie strata do stop lossu (albo cała pozycja bez stopu) była większa niż zapas do limitu — ' +
        'zadziałanie stopu zakończyłoby wyzwanie. Liczymy po cenie z dnia decyzji, a nie po tym, co potem zrobiła cena.',
    }],
  },
  {
    id: 'stop',
    title: 'Stop loss',
    criteria: [{
      id: 'stop-planned', maxXp: 10, label: 'Stop loss zaplanowany przed startem',
      gain: 'Plan zawierał poziom stop loss.',
      lose: 'Plan był „bez stop lossu”.',
    }, {
      id: 'stop-always', maxXp: 10, label: 'Każda pozycja chroniona stop lossem',
      gain: 'W każdej sesji z otwartą pozycją stop loss był aktywny.',
      lose: 'Co najmniej jedna sesja z pozycją bez stop lossu albo brak pozycji co najmniej 5% kapitału.',
    }, {
      id: 'stop-not-widened', maxXp: 5, label: 'Stop loss nie był oddalany',
      gain: 'Przy otwartej pozycji poziom stop lossu ani razu nie przesunął się niżej.',
      lose: 'Oddalenie stopu przy otwartej pozycji: większy procent (np. z 5% na 12%, także przez chwilowe wyłączenie) ' +
        'albo dokupienie poniżej średniej ceny, które obniża poziom stopu. Brak pozycji ze stop lossem — nie oceniono.',
    }],
  },
  {
    id: 'size',
    title: 'Wielkość pozycji',
    criteria: [{
      id: 'size-cap', maxXp: 10, label: 'Pozycja najwyżej 50% kapitału',
      gain: 'Po każdym zakupie pozycja (po cenie z dnia decyzji) była warta najwyżej 5000 zł.',
      lose: 'Po którymś zakupie pozycja przekraczała 5000 zł albo nie było pozycji co najmniej 500 zł (5% kapitału).',
    }, {
      id: 'size-risk', maxXp: 15, label: 'Planowane ryzyko najwyżej 5% kapitału',
      gain: 'Po każdym zakupie możliwa strata do poziomu stop lossu (po cenie z dnia decyzji) wynosiła najwyżej 500 zł. Bez stop lossu liczymy całą pozycję.',
      lose: 'Po którymś zakupie planowane ryzyko przekraczało 500 zł albo nie było pozycji co najmniej 500 zł (5% kapitału).',
    }],
  },
  {
    id: 'diversification',
    title: 'Dywersyfikacja',
    criteria: [{
      id: 'div-understanding', maxXp: 10, label: 'Rozumiesz, czy możesz dywersyfikować',
      gain: 'Poprawna odpowiedź na pytanie przed startem.',
      lose: 'Błędna odpowiedź. W tym wyzwaniu jest jedno aktywo, więc nie punktujemy podziału portfela.',
    }],
  },
  {
    id: 'discipline',
    title: 'Dyscyplina',
    criteria: [{
      id: 'plan-size', maxXp: 10, label: 'Zakupy zgodne z limitem z Twojego planu',
      gain: 'Po każdym zakupie pozycja (po cenie z dnia decyzji) mieściła się w limicie zadeklarowanym przed startem.',
      lose: 'Któryś zakup przekroczył Twój limit, plan nie miał limitu (100%) albo nie było żadnego zakupu.',
    }, {
      id: 'plan-stop', maxXp: 5, label: 'Stop loss zgodny z Twoim planem',
      gain: 'Przy każdym zakupie stop loss był taki jak w planie albo ciaśniejszy.',
      lose: 'Zakup ze stop lossem luźniejszym niż w planie lub bez niego, plan bez stop lossu albo brak zakupu.',
    }, {
      id: 'reasons', maxXp: 5, label: 'Powody zleceń zgodne z faktami',
      gain: 'Każde zlecenie miało powód, który zgadzał się z sytuacją: „Zgodnie z planem” — zakup w limicie i ze stop lossem z planu; ' +
        '„Reaguję na nową informację” — wiadomość z rynku z ostatnich 5 sesji; „Ograniczam ryzyko” — sprzedaż.',
      lose: 'Zlecenie bez konkretnego powodu albo z powodem niezgodnym z faktami. Szczere „bez konkretnego powodu” ' +
        'jest lepsze niż wymyślony powód — powody sprawdzamy. Bez zleceń — nie oceniono.',
    }],
  },
];

export const MAX_XP = CATEGORIES.flatMap((c) => c.criteria).reduce((sum, c) => sum + c.maxXp, 0);

const EPSILON = 0.005;
const NEWS_WINDOW = 5; // wiadomość z ostatnich 5 sesji uzasadnia „Reaguję na nową informację”

// Sprawdza, czy powód zlecenia zgadza się z faktami w chwili decyzji.
// Zwraca null (zgodny) albo krótki opis niezgodności. Używa jej ocena i podpowiedź w formularzu.
export function checkOrderReason(order, plan, challenge) {
  if (!order.reason || order.reason === 'impulse') return 'bez konkretnego powodu';
  if (order.reason === 'risk') {
    return order.side === 'sell' ? null : 'kupno zwiększa ryzyko, a nie je ogranicza';
  }
  if (order.reason === 'news') {
    const index = challenge.calendar.indexOf(order.date);
    const recent = (challenge.marketEvents ?? []).some((news) => {
      const newsIndex = challenge.calendar.indexOf(news.date);
      return newsIndex <= index && newsIndex >= index - NEWS_WINDOW;
    });
    return recent ? null : `brak wiadomości z rynku w ostatnich ${NEWS_WINDOW} sesjach`;
  }
  if (order.reason === 'plan' && order.side === 'buy') {
    const limit = challenge.rules.initialCapital * plan.maxPositionPercent / 100;
    const stop = order.decision.stopLossPercent;
    if (order.decision.positionValue + order.amount > limit + EPSILON) return 'zakup ponad limit z planu';
    if (plan.stopLossPercent !== null && (stop === null || stop > plan.stopLossPercent)) {
      return 'stop loss luźniejszy niż w planie albo wyłączony';
    }
  }
  return null;
}

// Liczby zakupu „w chwili decyzji”: po cenie z dnia złożenia zlecenia, a nie po cenie wykonania.
// decision = { price, units, avgCost, positionValue } z chwili decyzji; stopLossPercent = stop przy wejściu.
// Tej samej funkcji używa ocena XP i podpowiedź w formularzu zlecenia.
export function decisionMetrics(decision, amount, stopLossPercent) {
  const { price, units, avgCost, positionValue } = decision;
  const positionAfter = positionValue + amount;
  if (!(price > 0)) return { positionAfter, plannedRisk: positionAfter, averagingDown: false }; // cena ≤ 0: cała pozycja zagrożona
  const unitsAfter = units + amount / price;
  const avgAfter = (avgCost * units + amount) / unitsAfter;
  const stopPrice = stopLossPercent === null ? null : avgAfter * (1 - stopLossPercent / 100);
  return {
    positionAfter,
    // Planowane ryzyko: strata, jeśli stop zadziała dokładnie na swoim poziomie. Bez stopu: cała pozycja.
    plannedRisk: stopPrice === null ? positionAfter : unitsAfter * Math.max(0, price - stopPrice),
    // Dokupienie poniżej średniej ceny obniża poziom stopu w zł („uśrednianie w dół”).
    averagingDown: units > 0 && stopLossPercent !== null && price < avgCost - EPSILON,
  };
}

// Zakup wykonany, ale oceniany według liczb z chwili decyzji.
function asDecision(buy) {
  const metrics = decisionMetrics(buy.decision, buy.amount, buy.stopLossPercent);
  return {
    ...buy,
    date: buy.placedOn,
    price: buy.decision.price,
    avgCostBefore: buy.decision.avgCost,
    margin: buy.decision.margin,
    positionValueAfter: metrics.positionAfter,
    plannedRisk: metrics.plannedRisk,
    averagingDown: metrics.averagingDown,
  };
}

function pass(explanation) {
  return { passed: true, applicable: true, explanation, tip: '' };
}

function fail(explanation, tip) {
  return { passed: false, applicable: true, explanation, tip };
}

function notApplicable(explanation, tip) {
  return { passed: false, applicable: false, explanation, tip };
}

function stopText(percent) {
  return percent === null ? 'bez stop lossu' : `ze stop lossem ${percent}%`;
}

// Każda funkcja zwraca wynik jednego kryterium na podstawie faktów z gry.
function evaluateCriteria(facts) {
  const { state, challenge, capital, plan, buys, heldSessions, breach } = facts;
  const results = {};
  const noBuyText = 'Bez zakupów nie było czego ocenić.';
  const noBuyTip = 'Pozostanie w gotówce jest dozwolone, ale ta kategoria punktuje dobór pozycji — spróbuj zagrać ponownie z małą pozycją.';

  // Kontrola straty: czy zadziałanie stopu (strata do stopu, bez stopu — cała pozycja) mieściło się w zapasie.
  // Liczymy po cenie z dnia decyzji, więc późniejszy przebieg cen nie zmienia oceny.
  const beyondBuffer = buys.find((b) => b.plannedRisk > b.margin + EPSILON);
  if (beyondBuffer) {
    results['loss-buffer'] = fail(
      `${formatDate(beyondBuffer.date)} strata do ${beyondBuffer.stopLossPercent === null ? 'zera (bez stop lossu cała pozycja)' : 'poziomu stop lossu'} ` +
      `wynosiłaby ok. ${formatMoney(beyondBuffer.plannedRisk)}, a zapas do limitu straty to ${formatMoney(beyondBuffer.margin)}. ` +
      'Zadziałanie stopu zakończyłoby wyzwanie.',
      'Zanim kupisz, porównaj planowane ryzyko z „Zapasem do limitu straty”. Zmniejsz pozycję albo ustaw ciaśniejszy stop.',
    );
  } else {
    results['loss-buffer'] = pass(buys.length === 0
      ? 'Bez zakupów cały kapitał był poza ryzykiem.'
      : `Przy wszystkich zakupach (${buys.length}) strata do stop lossu mieściła się w zapasie do limitu.` +
        (breach ? ` ${formatDate(breach.date)} limit przebiła jednak luka cenowa albo cena ujemna — stop loss nie chroni ` +
          'przed skokiem ceny, dlatego warto zostawić zapas także na luki.' : ''));
  }

  // Stop loss
  results['stop-planned'] = plan.stopLossPercent !== null
    ? pass(`Plan zakładał stop loss ${plan.stopLossPercent}% poniżej średniej ceny zakupu.`)
    : fail('Plan był „bez stop lossu”, więc nie było z góry ustalonego poziomu wyjścia.',
      'Przed startem zdecyduj, przy jakim spadku zamykasz pozycję — wtedy decyzja nie zapada pod wpływem emocji.');

  if (heldSessions.length === 0) {
    results['stop-always'] = notApplicable(
      'Bez otwartej pozycji stop loss nie miał czego chronić.',
      'Punkty dostajesz za faktyczne stosowanie stop lossu przy otwartej pozycji.',
    );
  } else {
    const unprotected = heldSessions.filter((s) => s.stopDuringSession === null);
    results['stop-always'] = unprotected.length === 0
      ? pass(`Sesje z otwartą pozycją: ${heldSessions.length}. W każdej był aktywny stop loss.`)
      : fail(`W ${unprotected.length} z ${heldSessions.length} sesji z otwartą pozycją nie było stop lossu (pierwsza: ${formatDate(unprotected[0].date)}).`,
        'Ustaw stop loss przed złożeniem zlecenia kupna i nie wyłączaj go, dopóki trzymasz pozycję.');
  }

  const protectedSessions = heldSessions.filter((s) => s.stopDuringSession !== null);
  // Oddalenie porównujemy z ostatnim ustawionym (niepustym) poziomem — zamyka lukę „5% → brak → 12%”.
  // Przy każdym zakupie punktem odniesienia staje się stop aktywny w chwili wejścia w pozycję.
  const widened = [];
  let lastStop = null;
  state.events.forEach((e) => {
    // Decyzja o dokupieniu poniżej średniej ceny przy aktywnym stopie obniża jego poziom w zł — to też oddalenie.
    if (e.type === 'buy_executed') {
      const buy = asDecision(e);
      if (buy.averagingDown) widened.push({ ...buy, averagedDown: true });
    }
    if (e.type === 'buy_executed') lastStop = e.stopLossPercent;
    if (e.type !== 'stop_changed' || e.to === null) return;
    if (e.hasPosition && lastStop !== null && e.to > lastStop) widened.push({ ...e, from: lastStop });
    lastStop = e.to;
  });
  if (protectedSessions.length === 0) {
    results['stop-not-widened'] = notApplicable(
      heldSessions.length === 0
        ? 'Nie było pozycji, więc nie było stop lossu do stosowania konsekwentnie.'
        : 'Twoja pozycja nie miała stop lossu, więc nie było czego stosować konsekwentnie.',
      'Konsekwencję oceniamy tylko wtedy, gdy pozycja ma stop loss.',
    );
  } else if (widened.length > 0) {
    const first = widened[0];
    results['stop-not-widened'] = fail(first.averagedDown
      ? `${formatDate(first.date)} decyzja o dokupieniu po ${formatMoney(first.price)}, czyli poniżej średniej ceny ` +
        `(${formatMoney(first.avgCostBefore)}), obniżała poziom stop lossu.`
      : `${formatDate(first.date)} stop loss został oddalony z ${first.from}% na ${first.to}% przy otwartej pozycji` +
        `${first.positionInLoss ? ', która była na minusie' : ''}.`,
    'Oddalanie stopu, gdy cena spada, zwiększa stratę ponad plan — także przez „uśrednianie w dół”. Stop możesz zacieśniać, ale nie oddalać.',
    );
  } else {
    results['stop-not-widened'] = pass('Przy otwartej pozycji stop loss ani razu nie został oddalony.');
  }

  // Wielkość pozycji (reguły gry)
  if (buys.length === 0) {
    results['size-cap'] = notApplicable(noBuyText, noBuyTip);
    results['size-risk'] = notApplicable(noBuyText, noBuyTip);
  } else {
    const maxPosition = capital * GAME_RULES.maxPositionShare;
    const biggest = buys.reduce((a, b) => (b.positionValueAfter > a.positionValueAfter ? b : a));
    const tooBig = buys.find((b) => b.positionValueAfter > maxPosition + EPSILON);
    results['size-cap'] = tooBig
      ? fail(`${formatDate(tooBig.date)} pozycja po zakupie byłaby warta ${formatMoney(tooBig.positionValueAfter)} ` +
        `(${formatPercent(tooBig.positionValueAfter / capital)} kapitału), czyli więcej niż ${formatMoney(maxPosition)}.`,
      'W tej grze pozycja powyżej połowy kapitału jest uznawana za zbyt dużą przy tak zmiennym aktywie.')
      : pass(`Największa pozycja po zakupie: ${formatMoney(biggest.positionValueAfter)} ` +
        `(${formatPercent(biggest.positionValueAfter / capital)} kapitału).`);

    const maxRisk = capital * GAME_RULES.maxPlannedRiskShare;
    const riskiest = buys.reduce((a, b) => (b.plannedRisk > a.plannedRisk ? b : a));
    const tooRisky = buys.find((b) => b.plannedRisk > maxRisk + EPSILON);
    results['size-risk'] = tooRisky
      ? fail(`${formatDate(tooRisky.date)} pozycja ${formatMoney(tooRisky.positionValueAfter)} ${stopText(tooRisky.stopLossPercent)} ` +
        `oznaczała planowane ryzyko ${formatMoney(tooRisky.plannedRisk)} — więcej niż ${formatMoney(maxRisk)}.`,
      'Planowane ryzyko = wartość pozycji × odległość do stop lossu. Zmniejsz pozycję albo ustaw ciaśniejszy stop.')
      : pass(`Największe planowane ryzyko: ${formatMoney(riskiest.plannedRisk)} ` +
        `(${formatDate(riskiest.date)}, pozycja ${formatMoney(riskiest.positionValueAfter)} ${stopText(riskiest.stopLossPercent)}).`);
  }

  // Dywersyfikacja: tylko jedno aktywo, więc oceniamy zrozumienie, a nie podział portfela
  const answer = DIVERSIFICATION_QUESTION.options.find((o) => o.id === plan.quizAnswer);
  results['div-understanding'] = plan.quizAnswer === DIVERSIFICATION_QUESTION.correctId
    ? pass(`Poprawnie: ${answer.feedback}`)
    : fail(`Twoja odpowiedź: „${answer.text}” ${answer.feedback}`,
      'Przy kilku różnych aktywach można rozłożyć ryzyko. W tym wyzwaniu jest tylko jeden surowiec i gotówka.');

  // Dyscyplina: zgodność z własnym planem
  if (buys.length === 0) {
    results['plan-size'] = notApplicable(noBuyText, noBuyTip);
    results['plan-stop'] = notApplicable(noBuyText, noBuyTip);
  } else {
    const planLimit = capital * plan.maxPositionPercent / 100;
    const overPlan = buys.find((b) => b.positionValueAfter > planLimit + EPSILON);
    results['plan-size'] = plan.maxPositionPercent >= 100
      ? notApplicable('Plan nie ograniczał wielkości pozycji (100% = bez limitu), więc nie było czego przestrzegać.',
        'Ustal w planie limit poniżej 100% kapitału — wtedy sprawdzimy, czy go trzymasz.')
      : overPlan
      ? fail(`${formatDate(overPlan.date)} pozycja ${formatMoney(overPlan.positionValueAfter)} przekroczyła Twój limit z planu ` +
        `(${plan.maxPositionPercent}% = ${formatMoney(planLimit)}).`,
      'Plan ma sens tylko wtedy, gdy go przestrzegasz. Jeśli limit był za mały, zmień go w następnej rozgrywce przed startem.')
      : pass(`Każdy zakup mieścił się w Twoim limicie z planu (${plan.maxPositionPercent}% = ${formatMoney(planLimit)}).`);

    if (plan.stopLossPercent === null) {
      results['plan-stop'] = notApplicable(
        'Plan nie określał stop lossu, więc nie było czego przestrzegać.',
        'Dodaj stop loss do planu — wtedy sprawdzimy, czy go trzymasz.',
      );
    } else {
      const looser = buys.find((b) => b.stopLossPercent === null || b.stopLossPercent > plan.stopLossPercent);
      results['plan-stop'] = looser
        ? fail(`${formatDate(looser.date)} zakup ${stopText(looser.stopLossPercent)}, choć plan zakładał ${plan.stopLossPercent}%.`,
          'Przed każdym zakupem sprawdź, czy stop loss jest taki jak w planie.')
        : pass(`Przy każdym zakupie stop loss był taki jak w planie (${plan.stopLossPercent}%) albo ciaśniejszy.`);
    }
  }

  // Uzasadnienie decyzji: każde zlecenie ma powód zgodny z faktami w chwili decyzji.
  const orders = state.events.filter((e) => e.type === 'order_placed');
  const checked = orders.map((o) => ({ order: o, problem: checkOrderReason(o, plan, challenge) }));
  const wrong = checked.filter((c) => c.problem !== null);
  const impulsive = wrong.filter((c) => c.problem === 'bez konkretnego powodu').length;
  if (orders.length === 0) {
    results.reasons = notApplicable('Bez zleceń nie było czego uzasadniać.',
      'Przy następnym zleceniu wybierz powód w polu „Dlaczego?”.');
  } else if (wrong.length > 0) {
    const first = wrong.find((c) => c.problem !== 'bez konkretnego powodu') ?? wrong[0];
    results.reasons = fail(`${wrong.length} z ${orders.length} zleceń bez powodu zgodnego z faktami` +
      (impulsive > 0 ? ` (w tym ${impulsive} szczerze „bez konkretnego powodu” — to cenna informacja o sobie)` : '') +
      `. Przykład: ${formatDate(first.order.date)} — ${first.problem}.`,
    'Zanim klikniesz „Kup” lub „Sprzedaj”, nazwij prawdziwy powód. Jeśli go nie ma, to sygnał, żeby poczekać.');
  } else {
    results.reasons = pass(`Wszystkie zlecenia (${orders.length}) miały powód zgodny z sytuacją.`);
  }

  // Bardzo mała pozycja (np. 1 zł) nie sprawdza zarządzania ryzykiem — nie dajemy za nią punktów.
  const minPosition = capital * GAME_RULES.minPositionShare;
  const biggestPosition = Math.max(0, ...buys.map((b) => b.positionValueAfter));
  if (buys.length > 0 && biggestPosition < minPosition - EPSILON) {
    const text = `Twoja największa pozycja (${formatMoney(biggestPosition)}) była mniejsza niż ${formatMoney(minPosition)} ` +
      '(5% kapitału), więc w tej grze nie oceniamy jej zarządzania.';
    const tip = 'To reguła gry: zarządzanie pozycją oceniamy od 5% kapitału. Spróbuj z pozycją 5–25% i stop lossem.';
    ['stop-always', 'stop-not-widened', 'size-cap', 'size-risk', 'plan-size', 'plan-stop'].forEach((id) => {
      results[id] = notApplicable(text, tip);
    });
  }
  return results;
}

// Gdy wszystko się udało, wskazujemy konkretną lekcję z gry: największą stratę w jednej sesji
// przy otwartej pozycji (liczoną w zł, więc działa także przy cenie ujemnej).
function findOpportunity(state) {
  let worst = null;
  for (let i = 1; i < state.history.length; i += 1) {
    const session = state.history[i];
    if (session.heldUnits <= 0) continue;
    const previous = state.history[i - 1].price;
    const loss = session.heldUnits * (session.price - previous);
    if (!worst || loss < worst.loss) worst = { date: session.date, loss, previous, price: session.price };
  }
  if (!worst || worst.loss >= 0) return null;
  const describeChange = (previous) => (previous > 0 && worst.price > 0
    ? `zmieniła się o ${formatPercent(worst.price / previous - 1, true)}`
    : `spadła z ${formatMoney(previous)} do ${formatMoney(worst.price)}`);
  return {
    title: 'Lekcja z największego spadku',
    text: `${formatDate(worst.date)} cena ${describeChange(worst.previous)} w jednej sesji. ` +
      `Twoja pozycja straciła wtedy ${formatMoney(Math.abs(worst.loss))}. Przy pozycji dwa razy większej ` +
      `byłoby to ${formatMoney(Math.abs(worst.loss) * 2)} — tak duże luki są powodem, by pozycje były małe.`,
  };
}

export function evaluateProcess(state, challenge) {
  const capital = challenge.rules.initialCapital;
  const sessions = state.history.slice(1);
  const facts = {
    state,
    challenge,
    capital,
    plan: state.plan,
    buys: state.events.filter((e) => e.type === 'buy_executed').map(asDecision),
    heldSessions: sessions.filter((s) => s.heldUnits > 0),
    breach: state.events.find((e) => e.type === 'limit_breached'),
  };
  const results = evaluateCriteria(facts);

  const categories = CATEGORIES.map((category) => {
    const criteria = category.criteria.map((criterion) => {
      const result = results[criterion.id];
      return { ...criterion, ...result, xp: result.passed ? criterion.maxXp : 0 };
    });
    return {
      ...category,
      criteria,
      xp: criteria.reduce((sum, c) => sum + c.xp, 0),
      maxXp: criteria.reduce((sum, c) => sum + c.maxXp, 0),
    };
  });
  const all = categories.flatMap((c) => c.criteria);
  const byWeight = (a, b) => b.maxXp - a.maxXp;

  const strengths = all.filter((c) => c.passed).sort(byWeight).slice(0, 3)
    .map((c) => ({ title: c.label, text: c.explanation }));
  let improvements = all.filter((c) => c.applicable && !c.passed).sort(byWeight).slice(0, 3)
    .map((c) => ({ title: c.label, text: `${c.explanation} ${c.tip}` }));
  if (improvements.length === 0) {
    improvements = all.filter((c) => !c.applicable).sort(byWeight).slice(0, 2)
      .map((c) => ({ title: `Niewykorzystana okazja: ${c.label.toLowerCase()}`, text: `${c.explanation} ${c.tip}` }));
  }
  if (improvements.length === 0) {
    const opportunity = findOpportunity(state);
    if (opportunity) improvements = [opportunity];
  }

  const last = state.history[state.history.length - 1];
  return {
    totalXp: all.reduce((sum, c) => sum + c.xp, 0),
    maxXp: MAX_XP,
    categories,
    strengths,
    improvements,
    financial: {
      finalValue: last.value,
      profit: last.value - capital,
      profitShare: (last.value - capital) / capital,
      limitRespected: !facts.breach,
      endDate: last.date,
    },
  };
}

// Pytanie refleksyjne po grze (bez XP): co zrobisz inaczej? Odpowiedź porównujemy z oceną.
export const REFLECTION_QUESTION = {
  prompt: 'Co zrobisz inaczej w następnej grze?',
  options: [
    { id: 'smaller', text: 'Wezmę mniejszą pozycję', criteria: ['loss-buffer', 'size-cap', 'size-risk', 'plan-size'] },
    { id: 'stop', text: 'Ustawię stop loss i nie będę go oddalać', criteria: ['stop-planned', 'stop-always', 'stop-not-widened', 'plan-stop'] },
    { id: 'plan', text: 'Będę ściślej trzymać się planu i uzasadniać decyzje', criteria: ['plan-size', 'plan-stop', 'reasons'] },
    { id: 'same', text: 'Nic — mój proces był dobry', criteria: [] },
  ],
};

// Czy wniosek z poprzedniej gry został dotrzymany? Sprawdzamy kryteria powiązane z odpowiedzią
// („Nic — proces był dobry” = wszystkie kryteria). Zwraca null, gdy wniosku nie ma.
export function lessonCheck(choiceId, evaluation) {
  const option = REFLECTION_QUESTION.options.find((o) => o.id === choiceId);
  if (!option) return null;
  const all = evaluation.categories.flatMap((c) => c.criteria);
  const related = option.criteria.length > 0 ? all.filter((c) => option.criteria.includes(c.id)) : all;
  const rated = related.filter((c) => c.applicable);
  const failed = rated.filter((c) => !c.passed);
  if (rated.length === 0) {
    return { kept: null, text: `Wniosek z poprzedniej gry: „${option.text}”. W tej grze nie dało się go sprawdzić (np. bez zakupu).` };
  }
  return failed.length === 0
    ? { kept: true, text: `Wniosek z poprzedniej gry dotrzymany: „${option.text}”. Powiązane kryteria zaliczone: ${rated.length}.` }
    : { kept: false, text: `Wniosek z poprzedniej gry jeszcze niedotrzymany: „${option.text}”. Do poprawy: „${failed[0].label}”.` };
}

export function reflectionFeedback(choiceId, evaluation) {
  const option = REFLECTION_QUESTION.options.find((o) => o.id === choiceId);
  if (!option) return '';
  const all = evaluation.categories.flatMap((c) => c.criteria);
  const failed = all.filter((c) => c.applicable && !c.passed).sort((a, b) => b.maxXp - a.maxXp);
  const notRated = all.filter((c) => !c.applicable);
  const matching = failed.filter((c) => option.criteria.includes(c.id));
  if (matching.length > 0) {
    return `Trafny wniosek: właśnie tu zabrakło punktów („${matching[0].label}”). W kolejnej grze sprawdź, czy ten wniosek działa.`;
  }
  if (failed.length > 0) {
    return `Ocena wskazuje jednak, że najwięcej punktów zabrało kryterium „${failed[0].label}”. ${failed[0].tip}`;
  }
  if (notRated.length > 0) {
    return `Żadne kryterium nie zostało oblane, ale części nie dało się ocenić ` +
      `(np. „${notRated[0].label}”). Zagraj dłużej z pozycją, żeby sprawdzić cały proces.`;
  }
  return option.id === 'same'
    ? 'Zgadza się — w tej grze proces był bez zarzutu. Spróbuj dłuższego wyzwania albo losowego rynku.'
    : 'W tej grze to kryterium było zaliczone — to dobra zasada na przyszłość. Spróbuj dłuższego wyzwania albo losowego rynku.';
}
