// Funkcja serwerowa Vercel: zapis na listę mailingową Brevo z potwierdzeniem (double opt-in).
//
// - Działa wyłącznie na serwerze. Klucz API jest w zmiennej środowiskowej BREVO_API_KEY
//   i nigdy nie trafia do przeglądarki.
// - Nie zapisuje adresu od razu na listę: Brevo wysyła wiadomość z linkiem potwierdzającym,
//   a kontakt trafia na listę dopiero po kliknięciu w ten link.
// - Nie zapisuje adresów e-mail w logach.
//
// Wymagane zmienne środowiskowe (opis w DEPLOY.md i .env.example):
//   BREVO_API_KEY, BREVO_LIST_ID, BREVO_DOI_TEMPLATE_ID, BREVO_DOI_REDIRECT_URL
// Opcjonalnie: ALLOWED_ORIGIN — adres strony, z której wolno wysyłać formularz.

const BREVO_DOI_URL = 'https://api.brevo.com/v3/contacts/doubleOptinConfirmation';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function json(status, body) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_PATTERN.test(email);
}

// Zwraca konfigurację albo null, jeśli czegoś brakuje.
export function readConfig(env) {
  const config = {
    apiKey: env.BREVO_API_KEY,
    listId: Number(env.BREVO_LIST_ID),
    templateId: Number(env.BREVO_DOI_TEMPLATE_ID),
    redirectUrl: env.BREVO_DOI_REDIRECT_URL,
  };
  const complete = Boolean(config.apiKey)
    && Number.isInteger(config.listId) && config.listId > 0
    && Number.isInteger(config.templateId) && config.templateId > 0
    && typeof config.redirectUrl === 'string' && config.redirectUrl.startsWith('https://');
  return complete ? config : null;
}

// Logika oddzielona od Vercel, żeby dało się ją przetestować z udawanym fetch.
export async function handleSubscribe(request, env, fetchImpl = fetch) {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const origin = request.headers.get('origin');
  if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) {
    return json(403, { error: 'forbidden_origin' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  // Ukryte pole „website” wypełniają tylko boty.
  if (typeof body?.website === 'string' && body.website !== '') return json(400, { error: 'rejected' });

  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!isValidEmail(email)) return json(400, { error: 'invalid_email' });
  if (body.consent !== true) return json(400, { error: 'consent_required' });

  const config = readConfig(env);
  if (!config) return json(503, { error: 'not_configured' });

  let providerResponse;
  try {
    providerResponse = await fetchImpl(BREVO_DOI_URL, {
      method: 'POST',
      headers: { 'api-key': config.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        email,
        includeListIds: [config.listId],
        templateId: config.templateId,
        redirectionUrl: config.redirectUrl,
      }),
    });
  } catch {
    console.error('Brevo: brak połączenia z API.');
    return json(502, { error: 'provider_unreachable' });
  }

  if (providerResponse.ok) return json(200, { status: 'confirmation_sent' });

  // Logujemy tylko kod błędu — bez adresu e-mail i bez treści odpowiedzi.
  console.error(`Brevo odrzuciło żądanie: HTTP ${providerResponse.status}.`);
  return json(502, { error: 'provider_error' });
}

// Format funkcji Vercel dla zwykłego JavaScriptu (bez frameworka).
export default {
  async fetch(request) {
    return handleSubscribe(request, process.env);
  },
};
