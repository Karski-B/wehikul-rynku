// Adapter analityki. Reszta aplikacji woła tylko track('nazwa_zdarzenia').
//
// ZASADY POMIARU
// - Sami wysyłamy wyłącznie trzy nazwy zdarzeń, bez żadnych dodatkowych danych:
//   challenge_started, challenge_completed, course_cta_clicked.
// - Uwaga: skrypt Umami sam dołącza dane techniczne (adres i tytuł strony, referrer, ekran, język),
//   a serwer Umami widzi adres IP. Opisujemy to w privacy.html — nie piszemy „bez danych osobowych”.
// - Nie wysyłamy e-maili, treści formularzy, identyfikatorów ani odcisku przeglądarki.
// - Umami liczy zdarzenia, a nie osoby. Liczby to „rozpoczęcia”, „ukończenia” i „kliknięcia”.
// - Bez skonfigurowanego Umami działa tryb testowy: zdarzenie trafia tylko do konsoli
//   i podglądu (?debug w adresie strony). Nic nie opuszcza przeglądarki.

import { CONFIG } from './config.js';

export const EVENTS = Object.freeze({
  STARTED: 'challenge_started',
  COMPLETED: 'challenge_completed',
  COURSE_CLICKED: 'course_cta_clicked',
});

const ALLOWED = new Set(Object.values(EVENTS));
const testLog = [];
const listeners = [];
const queue = [];
let mode = 'test';

function flushQueue() {
  while (queue.length > 0 && typeof window.umami?.track === 'function') {
    window.umami.track(queue.shift());
  }
}

export function initAnalytics() {
  const { provider, umamiWebsiteId, umamiScriptUrl, umamiDomains } = CONFIG.analytics;
  if (provider !== 'umami' || !umamiWebsiteId) {
    mode = 'test';
    return mode;
  }
  mode = 'umami';
  const script = document.createElement('script');
  script.defer = true;
  script.src = umamiScriptUrl;
  script.dataset.websiteId = umamiWebsiteId;
  script.dataset.autoPageview = 'false';  // mierzymy tylko trzy zdarzenia, bez odsłon
  script.dataset.doNotTrack = 'true';     // szanujemy ustawienie „Do Not Track”
  script.dataset.excludeSearch = 'true';
  script.dataset.excludeHash = 'true';
  if (umamiDomains) script.dataset.domains = umamiDomains;
  script.addEventListener('load', flushQueue);
  document.head.append(script);
  return mode;
}

export function getAnalyticsMode() {
  return mode;
}

export function track(name) {
  if (!ALLOWED.has(name)) return false;
  if (mode === 'umami') {
    queue.push(name);
    flushQueue();
    return true;
  }
  const entry = { name, time: new Date().toLocaleTimeString('pl-PL') };
  testLog.push(entry);
  console.info(`[analityka: tryb testowy] ${name}`);
  listeners.forEach((listener) => listener(entry, [...testLog]));
  return true;
}

export function onTestEvent(listener) {
  listeners.push(listener);
}
