// Zapis stanu gry w sessionStorage (znika po zamknięciu karty).
// Zapisujemy tylko stan symulacji — nigdy adresu e-mail ani innych danych osobowych.
// Każdy dostęp w try/catch: w trybie prywatnym zapis może być zablokowany, a gra ma działać dalej.

const KEY = 'wehikul-rynku:march-2020';

export function loadState() {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearState() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Brak dostępu do pamięci — nie ma czego czyścić.
  }
}
