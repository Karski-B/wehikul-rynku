// Wczytywanie i sprawdzanie danych wyzwania. Ten moduł nie dotyka HTML.

// Adres liczony względem tego pliku, więc działa z każdej strony projektu.
export const CHALLENGE_URL = new URL('../data/challenge-march-2020.json', import.meta.url);

export async function loadChallenge(url = CHALLENGE_URL) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Nie udało się wczytać danych wyzwania (HTTP ${response.status}).`);
  }
  const challenge = await response.json();
  const errors = validateChallenge(challenge);
  if (errors.length > 0) {
    throw new Error(`Dane wyzwania są niepoprawne: ${errors.join(' ')}`);
  }
  return challenge;
}

// Zwraca listę błędów (pusta lista = dane są poprawne).
export function validateChallenge(challenge) {
  const errors = [];
  const calendar = challenge?.calendar;

  if (!Array.isArray(calendar) || calendar.length < 2) {
    return ['Brak kalendarza sesji.'];
  }
  if (!(challenge.rules?.initialCapital > 0)) {
    errors.push('Kapitał początkowy musi być dodatni.');
  }

  calendar.forEach((date, i) => {
    const day = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(day.getTime())) errors.push(`Niepoprawna data: ${date}.`);
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) errors.push(`Sesja w weekend: ${date}.`);
    if (i > 0 && date <= calendar[i - 1]) errors.push(`Daty nie rosną: ${calendar[i - 1]} → ${date}.`);
  });

  const { startDate, endDate, horizons, defaultHorizon } = challenge.timeline ?? {};
  if (!calendar.includes(startDate)) errors.push('Data startu nie jest w kalendarzu.');
  if (!calendar.includes(endDate)) errors.push('Data końca nie jest w kalendarzu.');
  if (!Array.isArray(horizons) || horizons.length === 0) {
    errors.push('Brak wariantów długości wyzwania.');
  } else {
    horizons.forEach((h) => {
      if (!calendar.includes(h.endDate) || h.endDate <= startDate) errors.push(`Zły koniec wariantu ${h.id}.`);
    });
    if (!horizons.some((h) => h.id === defaultHorizon)) errors.push('Brak domyślnego wariantu długości.');
  }

  if (!Array.isArray(challenge.assets) || challenge.assets.length === 0) {
    errors.push('Brak aktywów.');
    return errors;
  }

  challenge.assets.forEach((asset) => {
    const sessions = asset.sessions ?? [];
    if (sessions.length !== calendar.length) {
      errors.push(`Aktywo ${asset.id}: liczba sesji różni się od kalendarza.`);
      return;
    }
    sessions.forEach((session, i) => {
      if (session.date !== calendar[i]) errors.push(`Aktywo ${asset.id}: data ${session.date} nie pasuje do kalendarza.`);
      // Cena może być ujemna (np. ropa WTI 20.04.2020), ale musi być liczbą.
      if (!Number.isFinite(session.price)) errors.push(`Aktywo ${asset.id}: zła cena w dniu ${session.date}.`);
    });
  });

  return errors;
}

// Indeks ostatniej sesji widocznej przed rozpoczęciem wyzwania.
export function getStartIndex(challenge) {
  return challenge.calendar.indexOf(challenge.timeline.startDate);
}
