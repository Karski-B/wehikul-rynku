// Test ścieżki gracza: klikamy aplikację w ramce (iframe) tak jak użytkownik i sprawdzamy, co widać.
// Ramka ma ten sam adres co test, więc możemy czytać jej dokument. Bez npm i bez dodatkowych bibliotek.

const frame = document.querySelector('#app');
const steps = [];
function step(name, fn) { steps.push({ name, fn }); }
function assert(condition, message) { if (!condition) throw new Error(message); }
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function waitFor(check, message, timeout = 5000) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    try {
      if (check()) return;
    } catch {
      // element jeszcze nie istnieje — czekamy dalej
    }
    await sleep(50);
  }
  throw new Error(`Przekroczono czas: ${message}`);
}

let win;
let doc;
const appErrors = [];
const $ = (selector) => doc.querySelector(selector);
const screen = () => doc.documentElement.dataset.screen;
const isShown = (selector) => {
  const node = $(selector);
  return Boolean(node) && !node.hidden && node.getClientRects().length > 0;
};

function noHorizontalScroll(label) {
  const { scrollWidth, clientWidth } = doc.documentElement;
  assert(scrollWidth <= clientWidth, `${label}: poziome przewijanie (${scrollWidth} > ${clientWidth} px)`);
}

// Klik w środek widocznej kontrolki — tak trafia palec. Jeśli coś ją zasłania
// (np. przypięty pulpit), test to wykryje.
function clickCenter(selector) {
  const target = $(selector);
  assert(target, `brak elementu ${selector}`);
  const box = target.closest('label') ?? target;
  box.scrollIntoView({ block: 'center' });
  const rect = box.getBoundingClientRect();
  const hit = doc.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  assert(hit && (hit === target || box.contains(hit)), `${selector}: środek kontrolki zasłania ${hit?.outerHTML.slice(0, 60)}`);
  hit.focus({ preventScroll: true }); // klik myszą w przeglądarce też ustawia fokus
  hit.click();
}

async function attach() {
  win = frame.contentWindow;
  doc = frame.contentDocument;
  win.addEventListener('error', (event) => appErrors.push(event.message));
  win.addEventListener('unhandledrejection', (event) => appErrors.push(String(event.reason)));
  await waitFor(() => screen(), 'aplikacja nie pokazała żadnego ekranu');
  assert($('#load-error').hidden, `błąd wczytania: ${$('#load-error').textContent}`);
}

function loadFrame(action) {
  return new Promise((resolve) => {
    frame.addEventListener('load', resolve, { once: true });
    action();
  });
}

// --- Scenariusz ---
step('Ekran planu wczytuje się bez błędu (360 px)', async () => {
  try { sessionStorage.clear(); } catch { /* brak zapisu — aplikacja działa i tak */ }
  await loadFrame(() => { frame.src = '../index.html'; });
  await attach();
  assert(screen() === 'intro', `oczekiwano ekranu planu, jest ${screen()}`);
  noHorizontalScroll('plan, 360 px');
});

step('Start bez planu pokazuje błąd i przenosi fokus do pierwszego pytania', async () => {
  $('#start-button').click();
  assert(isShown('#error-maxPositionPercent'), 'brak komunikatu przy wielkości pozycji');
  assert(doc.activeElement?.name === 'maxPositionPercent', `fokus jest na ${doc.activeElement?.name}`);
  assert(screen() === 'intro', 'gra nie powinna wystartować');
});

step('Plan wybrany kliknięciem w kafelki uruchamia grę', async () => {
  clickCenter('input[name="maxPositionPercent"][value="25"]');
  clickCenter('input[name="stopLossPercent"][value="8"]');
  clickCenter('input[name="quizAnswer"][value="one-asset"]');
  $('#start-button').click();
  await waitFor(() => screen() === 'game', 'nie pokazano ekranu gry');
  assert($('#dock-date').textContent.trim() !== '', 'pusta data na pulpicie');
  // Wykres (Chart.js z CDN) albo — bez sieci — komunikat i tabela cen jako zamiennik.
  // Sprawdzamy, że wykres powstał; jego rozmiar Chart.js ustala w kolejnej klatce animacji.
  assert(win.Chart ? win.Chart.getChart($('#price-chart')) : isShown('#chart-fallback'), 'brak wykresu i zamiennika');
  // Tabela (tekstowa wersja wykresu) buduje się po rozwinięciu sekcji — wszystkie odsłonięte sesje.
  $('.table-details summary').click();
  await waitFor(() => $('#price-table tr'), 'brak tabeli cen po rozwinięciu');
  const revealed = Number($('#price-table-caption').textContent.match(/\d+/)[0]);
  assert(doc.querySelectorAll('#price-table tr').length === revealed, 'tabela nie pokazuje wszystkich odsłoniętych sesji');
  $('.table-details summary').click();
  noHorizontalScroll('gra, 360 px');
});

step('Puste zlecenie pokazuje komunikat przy polu', async () => {
  $('#order-submit').click();
  assert(isShown('#order-error') && $('#order-error').textContent.includes('Wpisz kwotę'), 'brak komunikatu o kwocie');
});

step('Szybki wybór kwoty wpisuje ją do pola i nie zabiera fokusu', async () => {
  clickCenter('#order-chips button[data-value="1000"]');
  assert($('#order-input').value === '1000', `pole kwoty: ${$('#order-input').value}`);
  assert(doc.activeElement === $('#order-chips button[data-value="1000"]'), `fokus na ${doc.activeElement?.tagName}`);
});

step('Powód niepasujący do sytuacji pokazuje ostrzeżenie przy „Dlaczego?”', async () => {
  clickCenter('#reason-options input[value="risk"]'); // kupno nie „ogranicza ryzyka”
  await waitFor(() => $('#reason-warning').textContent.includes('nie pasuje'), 'brak ostrzeżenia o powodzie');
});

step('Zakup z powodem „Zgodnie z planem” czeka na następną sesję i trafia do dziennika', async () => {
  clickCenter('#reason-options input[value="plan"]');
  $('#order-submit').click();
  await waitFor(() => isShown('#pending'), 'brak informacji o oczekującym zleceniu');
  assert($('#journal li').textContent.includes('Powód: zgodnie z planem'), 'powód nie trafił do dziennika');
  const reasons = [...doc.querySelectorAll('#reason-options input')];
  assert(reasons.every((input) => !input.checked && input.disabled), 'powód powinien się wyczyścić i zablokować do następnej sesji');
});

step('„Następna sesja” wykonuje zakup i stawia znacznik ▲ na osi czasu', async () => {
  $('#next-session').click();
  await waitFor(() => $('#timeline-marks .tl-buy'), 'brak znacznika kupna na osi czasu');
  assert($('#session-progress').getAttribute('aria-valuenow') === '1', 'oś czasu nie pokazuje sesji 1');
  assert(!isShown('#pending'), 'zlecenie nadal oczekuje');
});

step('Odświeżenie strony zachowuje grę w tym samym dniu', async () => {
  const before = $('#dock-date').textContent;
  await loadFrame(() => win.location.reload());
  await attach();
  assert(screen() === 'game', `po odświeżeniu ekran ${screen()}`);
  assert($('#dock-date').textContent === before, `data ${$('#dock-date').textContent} zamiast ${before}`);
});

step('„Zakończ grę” pyta w oknie strony; „Wróć do gry” niczego nie zmienia', async () => {
  clickCenter('#finish-button');
  await waitFor(() => $('#confirm-dialog').open, 'okno potwierdzenia się nie otworzyło');
  assert($('#confirm-ok').textContent.includes('Zakończ'), `przycisk: ${$('#confirm-ok').textContent}`);
  $('#confirm-cancel').click();
  await waitFor(() => !$('#confirm-dialog').open, 'okno się nie zamknęło');
  assert(screen() === 'game', `po anulowaniu ekran ${screen()}`);
  assert(doc.activeElement === $('#finish-button'), `fokus po zamknięciu: ${doc.activeElement?.id || doc.activeElement?.tagName}`);
});

step('Przewijanie „+miesiąc” prowadzi do ekranu wyniku', async () => {
  for (let i = 0; i < 80 && screen() === 'game'; i += 1) {
    ($('#ff-month').disabled ? $('#next-session') : $('#ff-month')).click();
    await sleep(30);
  }
  await waitFor(() => screen() === 'results', 'gra nie doszła do wyniku');
});

step('Wynik pokazuje XP, 5 kategorii i porównanie strategii', async () => {
  const xp = Number($('#xp-total').textContent);
  assert(Number.isInteger(xp) && xp >= 0 && xp <= 100, `XP = ${$('#xp-total').textContent}`);
  assert(doc.querySelectorAll('#categories .category').length === 5, 'oczekiwano 5 kategorii');
  assert(doc.querySelectorAll('#compare-grid .compare-row').length === 3, 'oczekiwano 3 strategii');
  noHorizontalScroll('wynik, 360 px');
});

step('Refleksja daje informację zwrotną, a fokus zostaje na wybranej odpowiedzi', async () => {
  clickCenter('#reflection-options input[value="smaller"]');
  await waitFor(() => $('#reflection-feedback').textContent.length > 20, 'brak informacji zwrotnej');
  const chosen = $('#reflection-options input[value="smaller"]');
  assert(chosen.checked && doc.activeElement === chosen, 'fokus zniknął z odpowiedzi (przyciski przebudowane?)');
});

step('Szerokość 1280 px: wynik bez poziomego przewijania', async () => {
  frame.width = '1280';
  await sleep(300);
  noHorizontalScroll('wynik, 1280 px');
});

step('„Zagraj ponownie” wraca do czystego planu', async () => {
  $('#replay-button').click();
  await waitFor(() => screen() === 'intro', 'nie wrócono do planu');
  assert(!$('input[name="maxPositionPercent"]:checked'), 'plan powinien być pusty');
  assert(isShown('#lesson-note') && $('#lesson-note').textContent.includes('Wezmę mniejszą pozycję'), 'brak wniosku z poprzedniej gry');
  noHorizontalScroll('plan, 1280 px');
  frame.width = '360';
});

step('Brak błędów JavaScript w aplikacji', async () => {
  assert(appErrors.length === 0, appErrors.join(' | '));
});

// --- Uruchomienie: po pierwszym błędzie kolejne kroki pomijamy (zależą od poprzednich) ---
const list = document.querySelector('#results');
let passed = 0;
let failed = false;
for (const { name, fn } of steps) {
  const item = document.createElement('li');
  if (failed) {
    item.textContent = `– ${name} (pominięto po wcześniejszym błędzie)`;
  } else {
    try {
      await fn();
      passed += 1;
      item.textContent = `✓ ${name}`;
      item.className = 'ok';
    } catch (error) {
      failed = true;
      item.textContent = `✗ ${name} — ${error.message}`;
      item.className = 'error';
    }
  }
  list.append(item);
}
const summary = `${passed} z ${steps.length} kroków zaliczonych`;
document.querySelector('#summary').textContent = summary;
document.querySelector('#summary').className = passed === steps.length ? 'ok' : 'error';
window.testSummary = { passed, total: steps.length };
