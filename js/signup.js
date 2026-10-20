// Formularz zapisu na kolejne wyzwania (strona przeglądarki).
// - Adres e-mail trafia wyłącznie do naszej funkcji serwerowej /api/subscribe.
// - Nie zapisujemy go w localStorage, sessionStorage ani w konsoli.
// - Komunikat o sukcesie pokazujemy tylko wtedy, gdy serwer potwierdzi wysłanie e-maila
//   z linkiem potwierdzającym (double opt-in).

import { CONFIG } from './config.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const SERVER_MESSAGES = {
  not_configured: ['is-info', 'Zapis jest wyłączony w tym środowisku: serwer nie ma skonfigurowanej listy mailingowej. Twój adres nie został nigdzie zapisany.'],
  invalid_email: ['is-error', 'Serwer uznał adres e-mail za niepoprawny. Sprawdź pisownię i spróbuj ponownie.'],
  consent_required: ['is-error', 'Bez zaznaczonej zgody nie możemy Cię zapisać.'],
  forbidden_origin: ['is-error', 'Formularz został wysłany z nieobsługiwanej strony. Adres nie został zapisany.'],
  provider_error: ['is-error', 'System mailingowy odrzucił zgłoszenie. Adres nie został zapisany. Spróbuj ponownie później.'],
  provider_unreachable: ['is-error', 'Nie udało się połączyć z systemem mailingowym. Adres nie został zapisany. Spróbuj ponownie później.'],
};

function setFieldError(input, errorElement, message) {
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  errorElement.textContent = message;
  errorElement.hidden = !message;
}

function showStatus(element, type, message) {
  element.className = `form-status ${type}`;
  element.textContent = message;
  element.hidden = false;
}

async function readServerError(response) {
  try {
    const body = await response.json();
    return body?.error ?? null;
  } catch {
    return null;  // np. strona błędu HTML z lokalnego serwera
  }
}

export function initSignupForm(form) {
  const email = form.querySelector('#signup-email');
  const consent = form.querySelector('#signup-consent');
  const website = form.querySelector('#signup-website');
  const emailError = form.querySelector('#signup-email-error');
  const consentError = form.querySelector('#signup-consent-error');
  const submit = form.querySelector('#signup-submit');
  const status = form.querySelector('#signup-status');
  let sending = false;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;
    status.hidden = true;

    const value = email.value.trim();
    let emailMessage = '';
    if (value === '') emailMessage = 'Wpisz adres e-mail.';
    else if (value.length > 254 || !EMAIL_PATTERN.test(value)) emailMessage = 'To nie wygląda na adres e-mail. Przykład: imie@example.com';
    const consentMessage = consent.checked ? '' : 'Zaznacz zgodę, aby się zapisać.';
    setFieldError(email, emailError, emailMessage);
    setFieldError(consent, consentError, consentMessage);
    if (emailMessage) { email.focus(); return; }
    if (consentMessage) { consent.focus(); return; }

    sending = true;
    submit.disabled = true;
    submit.textContent = 'Wysyłanie…';
    form.setAttribute('aria-busy', 'true');
    showStatus(status, 'is-info', 'Wysyłamy zgłoszenie…');

    try {
      const response = await fetch(CONFIG.signupEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: value, consent: true, website: website.value }),
      });
      if (response.ok) {
        const body = await response.json().catch(() => null);
        if (body?.status === 'confirmation_sent') {
          showStatus(status, 'is-success',
            'Prawie gotowe! Wysłaliśmy wiadomość z linkiem potwierdzającym. Zapis będzie aktywny dopiero po kliknięciu w ten link.');
          form.reset();
          return;
        }
        showStatus(status, 'is-error', 'Serwer odpowiedział w nieoczekiwany sposób. Adres nie został zapisany.');
        return;
      }
      if ([404, 405, 501].includes(response.status)) {
        showStatus(status, 'is-info',
          'W tym środowisku nie działa funkcja zapisu (np. lokalny serwer bez Vercel). Twój adres nie został nigdzie zapisany.');
        return;
      }
      const code = await readServerError(response);
      const [type, message] = SERVER_MESSAGES[code] ?? ['is-error', 'Coś poszło nie tak. Adres nie został zapisany. Spróbuj ponownie później.'];
      showStatus(status, type, message);
    } catch {
      showStatus(status, 'is-error', 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie. Adres nie został zapisany.');
    } finally {
      sending = false;
      submit.disabled = false;
      submit.textContent = 'Zapisz mnie';
      form.removeAttribute('aria-busy');
    }
  });
}
