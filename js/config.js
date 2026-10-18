// Publiczna konfiguracja aplikacji.
// UWAGA: ten plik trafia do przeglądarki. Nigdy nie wpisuj tu kluczy API ani haseł.

export const CONFIG = {
  analytics: {
    // 'test'  — zdarzenia widać tylko w konsoli i w podglądzie (?debug w adresie); nic nie jest wysyłane.
    // 'umami' — wysyłka do Umami Cloud. Wymaga umamiWebsiteId z panelu Umami (to nie jest sekret).
    provider: 'test',
    umamiWebsiteId: '',
    umamiScriptUrl: 'https://cloud.umami.is/script.js',
    // Domeny, na których Umami ma liczyć zdarzenia, np. 'twoja-nazwa.vercel.app'. Puste = każda.
    umamiDomains: '',
  },
  // Formularz zapisu e-mail. Wyłączony, bo GitHub Pages nie uruchamia funkcji serwerowych
  // (api/subscribe.js działa tylko na hostingu z funkcjami, np. Vercel — zob. DEPLOY.md).
  signupEnabled: false,
  // Adres funkcji serwerowej zapisu na listę (używany tylko, gdy signupEnabled: true).
  signupEndpoint: '/api/subscribe',
};
