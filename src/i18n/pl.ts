// Polish locale dictionary (audit spec 23 §6). Typed keys + interpolation;
// no dynamic string-key access. App default locale is `pl`.

export const pl = {
  common: {
    confirm: "Zatwierdź",
    cancel: "Anuluj",
    close: "Zamknij",
    retry: "Spróbuj ponownie",
    save: "Zapisz",
    copy: "Kopiuj",
    copied: "Skopiowano",
    all: "Wszystkie",
    more: "Więcej",
  },
  errors: {
    UNAUTHORIZED: "Nie masz dostępu do tych akt sprawy.",
    FORBIDDEN: "Nie masz uprawnień, aby to zrobić.",
    GAME_NOT_FOUND: "Te akta sprawy już nie istnieją.",
    VERSION_CONFLICT: "Ta sprawa zmieniła się w innej karcie — widok został odświeżony. Spróbuj ponownie.",
    INVALID_DISPLAY_NAME: "Imię jest wymagane.",
    DISPLAY_NAME_TAKEN: "To imię jest już w kręgu.",
    ROSTER_FULL: "Lista osiągnęła już maksimum 16 uczestników.",
    ROSTER_SIZE_INVALID: "Sprawa wymaga od 13 do 16 uczestników.",
    VIRTUAL_CIRCLE_LOCKED: "Skład i krąg są już zablokowane po zatwierdzeniu układu.",
    SETUP_NOT_COMMITTED: "Układ nie został jeszcze zatwierdzony.",
    ACTION_NOT_ACTIVE: "Ta akcja nie jest teraz dostępna.",
    INVALID_SESSION_STATE: "Nie można tego teraz zrobić w tej fazie gry.",
    CLAIM_ALREADY_USED: "Ten link do odbioru został już użyty lub wygasł.",
    RATE_LIMITED: "Zbyt wiele prób — spróbuj ponownie później.",
    NETWORK: "Nie mogę połączyć się z serwerem. Sprawdź połączenie i spróbuj ponownie.",
    UNKNOWN: "Coś poszło nie tak.",
  },
  realtime: {
    live: "LIVE",
    reconnecting: "ŁĄCZENIE…",
    offline: "OFFLINE",
  },
  voting: {
    currentPlayer: "Czekaj na swoją kolej — głosuje: {name}",
  },
  gameEnd: {
    good: "Koniec gry — wygrywa dobro",
    evil: "Koniec gry — wygrywa zło",
  },
  scanner: {
    scanButton: "Skanuj kod QR",
    scanning: "Skanowanie…",
    unsupported:
      "Ta przeglądarka nie obsługuje skanowania — zeskanuj kodem z innego urządzenia.",
    cameraUnavailable: "Nie można uzyskać dostępu do kamery.",
    unrecognized: "Kod nierozpoznany — spróbuj ponownie.",
    success: "Skan przyjęty.",
    preview: "Podgląd kamery",
  },
} as const;
