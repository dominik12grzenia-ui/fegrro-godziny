// iter95ct: Globalny sprawdzacz pisowni dla calej aplikacji.
//
// Strategia: wykorzystujemy WBUDOWANY w przegladarke spell-checker (Chrome,
// Firefox, Safari, Edge). Slownik polski jest standardowo dostepny w systemie
// operacyjnym uzytkownika (lub mozna doinstalowac w przegladarce). Brak
// zewnetrznych zaleznosci, brak dodatkowych kosztow API, dziala offline.
//
// Co robimy:
//   1. Ustawiamy `lang="pl"` i `spellcheck="true"` na wszystkich istniejacych
//      polach tekstowych (input typu text/email/search/url, textarea, [contenteditable]).
//   2. MutationObserver - wlaczamy spell-check na ELEMENTACH dodawanych dynamicznie
//      (React renderuje nowe formularze ciagle).
//   3. Pomijamy pola, ktore SAMI explicit oznaczyli `data-spellcheck="off"` lub
//      `spellcheck="false"` (np. pola NIP, kody, hasla, JSON-y itp.).
//   4. Wykluczamy hasla / pola numeryczne / kody (pesel, NIP, IBAN) automatycznie.

const TEXT_INPUT_TYPES = new Set([
  "text", "search", "email", "url", "", // "" gdy brak atrybutu type
]);

// Pola, ktore NIGDY nie powinny miec spell-check (zniszczyloby UX):
// hasla, kody, identyfikatory, liczby, kwoty, NIP-y, pesele, IBAN-y itp.
const NO_SPELLCHECK_TOKENS = [
  "password", "passwd", "pin", "code", "token", "secret",
  "nip", "pesel", "regon", "iban", "swift", "krs", "numer",
  "phone", "telefon", "tel", "mobile",
  "kwota", "amount", "price", "cena", "ilosc", "qty", "quantity",
  "vat", "stawka", "rate", "percent", "procent",
  "url", "link", "domain", "host",
  "json", "yaml", "config",
];

function shouldSkip(el) {
  if (!el || el.dataset?.spellcheck === "off") return true;
  if (el.getAttribute?.("spellcheck") === "false") return true;
  // Inputy: tylko typy tekstowe
  if (el.tagName === "INPUT") {
    const t = (el.getAttribute("type") || "text").toLowerCase();
    if (!TEXT_INPUT_TYPES.has(t)) return true;
  }
  // Heurystyka: po name/id/placeholder wykluczamy pola "techniczne"
  const probe = `${el.name || ""} ${el.id || ""} ${el.placeholder || ""} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
  if (NO_SPELLCHECK_TOKENS.some((tok) => probe.includes(tok))) return true;
  return false;
}

function enableOn(el) {
  if (shouldSkip(el)) return;
  // Tylko jesli element JESZCZE nie ma jawnie ustawionego spellcheck
  if (!el.hasAttribute("spellcheck")) el.setAttribute("spellcheck", "true");
  if (!el.hasAttribute("lang")) el.setAttribute("lang", "pl");
  // Autocorrect/autocapitalize wylaczamy by nie psuly nazw wlasnych typu "iter95ct"
  if (!el.hasAttribute("autocorrect")) el.setAttribute("autocorrect", "off");
}

function sweep(root) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  const sel = 'input:not([type="number"]):not([type="password"]):not([type="tel"]):not([type="hidden"]):not([type="date"]):not([type="time"]):not([type="datetime-local"]):not([type="month"]):not([type="week"]):not([type="color"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]),textarea,[contenteditable="true"],[contenteditable=""]';
  root.querySelectorAll(sel).forEach(enableOn);
  if (root.matches?.(sel)) enableOn(root);
}

let observer = null;

export function initSpellcheck() {
  if (typeof document === "undefined") return;
  // Initial sweep gdy DOM gotowy
  const start = () => {
    sweep(document.body);
    // MutationObserver dla dynamicznie dodawanych pol
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes?.forEach((n) => {
          if (n.nodeType === 1) sweep(n);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}

export default initSpellcheck;
