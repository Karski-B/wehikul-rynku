// Ocena procesu decyzyjnego i XP. Ten moduł nie dotyka HTML.
//
// ZASADY OCENY
// - XP liczymy wyłącznie z zachowań zapisanych w trakcie gry (state.events i state.history).
//   Końcowy zysk ani stopa zwrotu nie zmieniają XP — pokazujemy je osobno.
// - Progi (50% kapitału, 5% ryzyka) to reguły tej gry edukacyjnej, a nie uniwersalne
//   zalecenia inwestycyjne.
// - Kryterium, którego nie dało się sprawdzić (np. nie było żadnej pozycji), daje 0 XP
//   z wyjaśnieniem. Nie przyznajemy punktów za coś, czego gracz nie zrobił.
// - Ocena jest deterministyczna: te same decyzje zawsze dają ten sam wynik.

import { formatDate, formatMoney, formatNumber, formatPercent } from './format.js';

export const GAME_RULES = {
  maxPositionShare: 0.5,      // pozycja po zakupie najwyżej 50% kapitału początkowego
  maxPlannedRiskShare: 0.05,  // planowane ryzyko najwyżej 5% kapitału (połowa limitu straty)
};

export const DIVERSIFICATION_QUESTION = {
  prompt: 'W tym wyzwaniu możesz trzymać tylko gotówkę albo ropę WTI. Co to oznacza dla dywersyfikacji?',
  options: [
    {
      id: 'split-orders',
      text: 'Mogę zdywersyfikować portfel, kupując ropę w kilku mniejszych transakcjach.',
      feedback: 'Kilka zakupów tego samego aktywa to nadal jedno ryzyko — wszystkie części tracą jednocześnie.',
    },
    {
      id: 'one-asset',
      text: 'Nie rozłożę ryzyka na różne aktywa. Ryzyko ograniczam gotówką, wielkością pozycji i stop lossem.',
      feedback: 'Dywersyfikacja wymaga kilku różnych aktywów. Przy jednym aktywie zostaje kontrola wielkości pozycji i gotówka.',
    },
    {
      id: 'safe-asset',
      text: 'Dywersyfikacja nie jest potrzebna, bo ropy świat zawsze potrzebuje, więc nie może mocno stanieć.',
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
      id: 'loss-limit', maxXp: 25, label: 'Portfel nie spadł poniżej limitu scenariusza',
      gain: 'Na koniec każdej sesji portfel był wart co najmniej 9 000 zł (strata najwyżej 10%).',
      lose: 'Na koniec którejś sesji portfel był wart mniej niż 9 000 zł. Wyzwanie kończy się wtedy od razu.',
    }],
  },
  {
    id: 'stop',
    title: 'Stop loss',
    criteria: [{
      id: 'stop-planned', maxXp: 10, label: 'Stop loss zaplanowany przed startem',
      gain: 'W planie wybrałeś poziom stop loss.',
      lose: 'W planie wybrałeś „bez stop loss”.',
    }, {
      id: 'stop-always', maxXp: 10, label: 'Każda pozycja chroniona stop lossem',
      gain: 'W każdej sesji, w której trzymałeś ropę, stop loss był aktywny.',
      lose: 'Choć jedna sesja z pozycją bez stop lossu albo brak jakiejkolwiek pozycji.',
    }, {
      id: 'stop-not-widened', maxXp: 5, label: 'Stop loss nie był oddalany',
      gain: 'Przy otwartej pozycji nie zmieniłeś stop lossu na większy procent.',
      lose: 'Oddalenie stop lossu przy otwartej pozycji (np. z 5% na 12%) albo brak pozycji ze stop lossem.',
    }],
  },
  {
    id: 'size',
    title: 'Wielkość pozycji',
    criteria: [{
      id: 'size-cap', maxXp: 10, label: 'Pozycja najwyżej 50% kapitału',
      gain: 'Po każdym zakupie pozycja była warta najwyżej 5 000 zł.',
      lose: 'Po którymś zakupie pozycja przekroczyła 5 000 zł albo nie było żadnego zakupu.',
    }, {
      id: 'size-risk', maxXp: 15, label: 'Planowane ryzyko najwyżej 5% kapitału',
      gain: 'Po każdym zakupie możliwa strata do poziomu stop lossu wynosiła najwyżej 500 zł. Bez stop lossu liczymy całą pozycję.',
      lose: 'Po którymś zakupie planowane ryzyko przekroczyło 500 zł albo nie było żadnego zakupu.',
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
      gain: 'Po każdym zakupie pozycja mieściła się w limicie zadeklarowanym przed startem.',
      lose: 'Któryś zakup przekroczył Twój limit, plan nie miał limitu (100%) albo nie było żadnego zakupu.',
    }, {
      id: 'plan-stop', maxXp: 5, label: 'Stop loss zgodny z Twoim planem',
      gain: 'Przy każdym zakupie stop loss był taki jak w planie albo ciaśniejszy.',
      lose: 'Zakup ze stop lossem luźniejszym niż w planie lub bez niego, plan bez stop lossu albo brak zakupu.',
    }],
  },
];

export const MAX_XP = CATEGORIES.flatMap((c) => c.criteria).reduce((sum, c) => sum + c.maxXp, 0);

const EPSILON = 0.005;

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
  const { state, capital, limit, plan, buys, heldSessions, breach, lowest } = facts;
  const results = {};
  const noBuyText = 'Nie kupiłeś ani razu, więc nie było czego ocenić.';
  const noBuyTip = 'Pozostanie w gotówce jest dozwolone, ale ta kategoria punktuje dobór pozycji — spróbuj zagrać ponownie z małą pozycją.';

  // Kontrola straty
  if (breach) {
    const snapshot = state.history.find((s) => s.date === breach.date);
    results['loss-limit'] = fail(
      `${formatDate(breach.date)} portfel był wart ${formatMoney(breach.value)}, poniżej limitu ${formatMoney(limit)}. ` +
      `Trzymałeś wtedy ${formatNumber(snapshot.heldUnits, 4)} jedn. ropy, a cena w tej jednej sesji zmieniła się o ${formatPercent(breach.sessionChangeShare, true)}.`,
      'Dobieraj pozycję tak, aby nawet bardzo duży spadek w jednej sesji nie przebił limitu. Stop loss nie chroni przed luką cenową.',
    );
  } else {
    results['loss-limit'] = pass(
      `Najniższa wartość portfela: ${formatMoney(lowest.value)} (${formatDate(lowest.date)}), ` +
      `czyli ${formatMoney(lowest.value - limit)} nad limitem.`,
    );
  }

  // Stop loss
  results['stop-planned'] = plan.stopLossPercent !== null
    ? pass(`W planie ustawiłeś stop loss ${plan.stopLossPercent}% poniżej średniej ceny zakupu.`)
    : fail('W planie wybrałeś „bez stop loss”, więc nie miałeś z góry ustalonego poziomu wyjścia.',
      'Przed startem zdecyduj, przy jakim spadku zamykasz pozycję — wtedy decyzja nie zapada pod wpływem emocji.');

  if (heldSessions.length === 0) {
    results['stop-always'] = notApplicable(
      'Nie miałeś otwartej pozycji, więc stop loss nie miał czego chronić.',
      'Punkty dostajesz za faktyczne stosowanie stop lossu przy otwartej pozycji.',
    );
  } else {
    const unprotected = heldSessions.filter((s) => s.stopDuringSession === null);
    results['stop-always'] = unprotected.length === 0
      ? pass(`Pozycja była otwarta przez ${heldSessions.length} sesji i w każdej miała aktywny stop loss.`)
      : fail(`W ${unprotected.length} z ${heldSessions.length} sesji z otwartą pozycją nie było stop lossu (pierwsza: ${formatDate(unprotected[0].date)}).`,
        'Ustaw stop loss przed złożeniem zlecenia kupna i nie wyłączaj go, dopóki trzymasz pozycję.');
  }

  const protectedSessions = heldSessions.filter((s) => s.stopDuringSession !== null);
  const widened = state.events.filter((e) => e.type === 'stop_changed' && e.hasPosition
    && e.from !== null && e.to !== null && e.to > e.from);
  if (protectedSessions.length === 0) {
    results['stop-not-widened'] = notApplicable(
      heldSessions.length === 0
        ? 'Nie było pozycji, więc nie było stop lossu do stosowania konsekwentnie.'
        : 'Twoja pozycja nie miała stop lossu, więc nie było czego stosować konsekwentnie.',
      'Konsekwencję oceniamy tylko wtedy, gdy pozycja ma stop loss.',
    );
  } else if (widened.length > 0) {
    const first = widened[0];
    results['stop-not-widened'] = fail(
      `${formatDate(first.date)} oddaliłeś stop loss z ${first.from}% na ${first.to}% przy otwartej pozycji` +
      `${first.positionInLoss ? ', która była na minusie' : ''}.`,
      'Oddalanie stop lossu, gdy cena spada, zwiększa stratę ponad plan. Stop możesz zacieśniać, ale nie oddalać.',
    );
  } else {
    results['stop-not-widened'] = pass('Przy otwartej pozycji ani razu nie oddaliłeś stop lossu.');
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
      ? fail(`${formatDate(tooBig.date)} po zakupie pozycja była warta ${formatMoney(tooBig.positionValueAfter)} ` +
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
    : fail(`Wybrałeś: „${answer.text}” ${answer.feedback}`,
      'Przy kilku różnych aktywach można rozłożyć ryzyko. W tym wyzwaniu jest tylko ropa i gotówka.');

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
        ? fail(`${formatDate(looser.date)} kupiłeś ${stopText(looser.stopLossPercent)}, choć plan zakładał ${plan.stopLossPercent}%.`,
          'Przed każdym zakupem sprawdź, czy stop loss jest taki jak w planie.')
        : pass(`Przy każdym zakupie stop loss był taki jak w planie (${plan.stopLossPercent}%) albo ciaśniejszy.`);
    }
  }
  return results;
}

// Gdy wszystko się udało, wskazujemy konkretną lekcję z gry: największy spadek przy otwartej pozycji.
function findOpportunity(state) {
  let worst = null;
  for (let i = 1; i < state.history.length; i += 1) {
    const session = state.history[i];
    if (session.heldUnits <= 0) continue;
    const change = session.price / state.history[i - 1].price - 1;
    if (!worst || change < worst.change) {
      worst = { date: session.date, change, loss: session.heldUnits * (session.price - state.history[i - 1].price) };
    }
  }
  if (!worst || worst.change >= 0) return null;
  return {
    title: 'Lekcja z największego spadku',
    text: `${formatDate(worst.date)} cena zmieniła się o ${formatPercent(worst.change, true)} w jednej sesji. ` +
      `Twoja pozycja straciła wtedy ${formatMoney(Math.abs(worst.loss))}. Przy pozycji dwa razy większej ` +
      `byłoby to ${formatMoney(Math.abs(worst.loss) * 2)} — tak duże luki są powodem, by pozycje były małe.`,
  };
}

export function evaluateProcess(state, challenge) {
  const capital = challenge.rules.initialCapital;
  const sessions = state.history.slice(1);
  const lowest = state.history.reduce((a, b) => (b.value < a.value ? b : a));
  const facts = {
    state,
    capital,
    limit: challenge.rules.minPortfolioValue,
    plan: state.plan,
    buys: state.events.filter((e) => e.type === 'buy_executed'),
    heldSessions: sessions.filter((s) => s.heldUnits > 0),
    breach: state.events.find((e) => e.type === 'limit_breached'),
    lowest,
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
