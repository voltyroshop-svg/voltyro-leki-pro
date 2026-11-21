# VOLTYRO Leki PRO

Prywatny dziennik porannych i wieczornych potwierdzeń. Godziny są informacyjne. Historia jest zapisywana w pamięci przeglądarki, a aplikacja po przygotowaniu Service Workera może zapisywać ją także offline.

## Uruchomienie lokalne

Otwórz terminal w tym folderze i wpisz `python3 -m http.server 3077`. Następnie otwórz [http://localhost:3077](http://localhost:3077). Do przetestowania offline najpierw załaduj stronę z włączoną siecią. Service Worker działa na localhost i HTTPS.

## Publikacja na Netlify

1. Rozpakuj archiwum.
2. Otwórz [Netlify Drop](https://app.netlify.com/drop), zaloguj się i przeciągnij folder `voltyro-leki-pro` zawierający `index.html`. Przy wdrożeniu przez repozytorium ustaw folder publikacji na `.` i zostaw puste pole polecenia budowania.
3. Otwórz przydzielony adres HTTPS i sprawdź, czy aplikacja się ładuje.

Statyczne pliki aplikacji są dostępne dla osób znających adres. Każda przeglądarka przechowuje swoją historię lokalnie. Przejście z localhost na adres Netlify lub na inny telefon wymaga eksportu i importu JSON, jeśli chcesz zachować dotychczasowe wpisy.

## Instalacja na iPhonie

1. Otwórz adres HTTPS aplikacji w Safari.
2. Dotknij **Udostępnij → Dodaj do ekranu początkowego**, a potem **Dodaj**. Jeśli Safari pokazuje przełącznik **Otwórz jako aplikację internetową**, pozostaw go włączonego.
3. Otwórz aplikację z nowej ikony po raz pierwszy z dostępem do internetu, żeby przygotować tryb offline w tym kontekście. Jeśli chcesz przenieść historię, użyj opcji **Importuj kopię** w zainstalowanej aplikacji.

Na Androidzie otwórz adres HTTPS w Chrome i wybierz **Zainstaluj aplikację** lub **Dodaj do ekranu głównego** w menu przeglądarki.

## Kopia zapasowa

W ustawieniach wybierz **Eksportuj JSON** i zapisz plik w prywatnym miejscu. Na drugim urządzeniu wybierz **Importuj kopię**. Po zatwierdzeniu import zastępuje historię i godziny. Usunięcie danych aplikacji lub przeglądarki może usunąć historię.

## Pliki

- `index.html`, `style.css` — interfejs.
- `app.js`, `data.js` — dziennik, kalendarz oraz obsługa kopii.
- `sw.js`, `manifest.webmanifest` — offline i instalacja PWA.
- `favicon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — ikony.
- `netlify.toml` — ustawienia hostingu statycznego.
