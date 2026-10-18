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

  const { startDate, endDate } = challenge.timeline ?? {};
  if (!calendar.includes(startDate)) errors.push('Data startu nie jest w kalendarzu.');
  if (!calendar.includes(endDate)) errors.push('Data końca nie jest w kalendarzu.');

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
      if (!Number.isFinite(session.price) || session.price <= 0) errors.push(`Aktywo ${asset.id}: zła cena w dniu ${session.date}.`);
    });
  });

  return errors;
}

// Indeks ostatniej sesji widocznej przed rozpoczęciem wyzwania.
export function getStartIndex(challenge) {
  return challenge.calendar.indexOf(challenge.timeline.startDate);
}
