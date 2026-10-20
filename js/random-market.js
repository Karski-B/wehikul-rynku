// Tryb „Losowy rynek”: ceny są inne w każdej grze, ale realistyczne. Ten moduł nie dotyka HTML.
//
// JAK POWSTAJĄ CENY
// 1. Bierzemy prawdziwe dzienne zmiany ceny ropy WTI z danych EIA (2020–2026).
// 2. Odejmujemy średnią zmianę, żeby rynek nie miał z góry ustalonego trendu (ani w górę, ani w dół).
// 3. Losujemy kolejne zmiany blokami po kilka sesji — dzięki temu spokojne i nerwowe okresy
//    przeplatają się podobnie jak na prawdziwym rynku.
// 4. Każdą dzienną zmianę ograniczamy do ±6% („normalne wahania”, bez skrajnych krachów).
//
// Ten sam numer losowania (seed) zawsze daje te same ceny, więc grę można powtórzyć.
// Ceny są LOSOWE i nie są prawdziwymi notowaniami — interfejs zawsze to zaznacza.

export const RANDOM_RULES = {
  maxDailyMove: 0.06,       // największa dzienna zmiana ceny (±6%)
  blockLength: 5,           // długość losowanego bloku zmian (jeden tydzień sesji)
  historySessions: 20,      // sesje widoczne przed startem
  totalSessions: 1260,      // ok. 5 lat sesji po starcie
  startPrice: 100,          // cena w dniu startu (zł symulacyjne)
  calendarStart: '2030-01-07', // fikcyjny kalendarz (poniedziałek) — żeby nikt nie wziął cen za prawdziwe
};

// Prosty generator liczb pseudolosowych z ziarnem (mulberry32): ten sam seed = ten sam ciąg liczb.
// Math.random() tego nie umie (za każdym razem daje inne liczby), a my chcemy móc odtworzyć grę z numeru.
// Jak czytać kod poniżej: to gotowy, znany przepis na mieszanie bitów liczby.
// - `>>> 0` zamienia liczbę na 32-bitową liczbę bez znaku (0 … 4 294 967 295),
// - `^` to XOR (bitowe „albo-albo”), `>>>` przesuwa bity w prawo,
// - Math.imul mnoży jak w języku C (wynik obcięty do 32 bitów), więc wszędzie działa tak samo.
// Na końcu dzielimy przez 2^32 i dostajemy liczbę z przedziału [0, 1) — jak z Math.random().
export function createRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newSeed() {
  return Math.floor(Math.random() * 900000) + 100000; // sześć cyfr — łatwo przepisać
}

// Dzienne zmiany logarytmiczne z danych historycznych (pomijamy dni z ceną ≤ 0).
export function historicalLogReturns(historical) {
  const prices = historical.assets[0].sessions.map((s) => s.close);
  const returns = [];
  for (let i = 1; i < prices.length; i += 1) {
    if (prices[i - 1] > 0 && prices[i] > 0) returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  return returns.map((r) => r - mean); // bez trendu
}

// Kolejne dni robocze (pon–pt) od podanej daty.
function businessDays(startIso, count) {
  const dates = [];
  const day = new Date(`${startIso}T00:00:00Z`);
  while (dates.length < count) {
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) dates.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return dates;
}

// Tworzy obiekt wyzwania w tym samym formacie co plik JSON, więc silnik gry działa bez zmian.
export function createRandomChallenge(historical, seed, rules = RANDOM_RULES) {
  const random = createRandom(seed);
  const returns = historicalLogReturns(historical);
  const limit = Math.log(1 + rules.maxDailyMove);
  const count = rules.historySessions + rules.totalSessions;
  const calendar = businessDays(rules.calendarStart, count);

  const logPath = [0];
  while (logPath.length < count) {
    const blockStart = Math.floor(random() * (returns.length - rules.blockLength));
    for (let k = 0; k < rules.blockLength && logPath.length < count; k += 1) {
      const step = Math.max(-limit, Math.min(limit, returns[blockStart + k]));
      logPath.push(logPath[logPath.length - 1] + step);
    }
  }
  const startIndex = rules.historySessions - 1;
  const base = logPath[startIndex];
  const sessions = calendar.map((date, i) => ({
    date,
    price: Math.round(rules.startPrice * Math.exp(logPath[i] - base) * 10000) / 10000,
  }));

  const horizonAt = (id, label, sessionsAfterStart) => {
    const endIndex = Math.min(startIndex + sessionsAfterStart, count - 1);
    return { id, label, endDate: calendar[endIndex], sessions: endIndex - startIndex };
  };
  const source = historical.sources[0];

  return {
    schemaVersion: 2,
    id: `random-${seed}`,
    mode: 'random',
    seed,
    title: 'Losowy rynek: Surowiec X',
    goal: historical.goal,
    intro: 'Ceny w tym trybie są losowe — w każdej grze inne. Zachowują typowe dzienne wahania ropy, ' +
      'ale nie są prawdziwymi notowaniami. Nie wiesz, co będzie dalej — widzisz tylko dane do dziś.',
    rules: historical.rules,
    timeline: {
      historyStart: calendar[0],
      startDate: calendar[startIndex],
      endDate: calendar[count - 1],
      defaultHorizon: 'month',
      horizons: [
        horizonAt('month', '1 miesiąc', 21),
        horizonAt('quarter', '3 miesiące', 63),
        horizonAt('year', '1 rok', 252),
        horizonAt('all', 'Bez limitu (do 5 lat)', rules.totalSessions),
      ],
    },
    calendar,
    assets: [{
      id: 'x',
      name: 'Surowiec X (ceny losowe)',
      shortName: 'Surowiec X',
      priceIsSimulated: true,
      priceIsRandom: true,
      conversion: {
        method: `Losowa ścieżka cen (losowanie nr ${seed}). Dzienne zmiany losowane blokami po ` +
          `${rules.blockLength} sesji z prawdziwych zmian ropy WTI (EIA, 2020–2026), bez trendu, ` +
          `ograniczone do ±${Math.round(rules.maxDailyMove * 100)}% dziennie.`,
        baseDate: calendar[startIndex],
        basePrice: rules.startPrice,
      },
      sessions,
    }],
    marketEvents: [],
    sources: [{
      ...source,
      attribution: `Ceny losowe wygenerowane w aplikacji (losowanie nr ${seed}). ` +
        `Rozkład dziennych zmian na podstawie: ${source.attribution.replace(/^Źródło: /, '')}`,
    }],
  };
}
