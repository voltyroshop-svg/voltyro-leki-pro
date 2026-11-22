# VOLTYRO Leki PRO

Lokalny organizer leków z planem dnia, indywidualnymi godzinami i historią przyjęć oraz pominięć. Godziny są informacyjne. Historia jest zapisywana w pamięci przeglądarki, również offline po pierwszym załadowaniu.

W sekcji **Moje leki na dziś** wybierz **Dodaj lek**. Liczbę godzin można zmienić w edytorze. Wstrzymanie usuwa oczekujące dawki z planu do czasu wznowienia. Usunięcie z planu archiwizuje lek, a istniejące wpisy nadal widać w historii. Kalendarz przechowuje planowaną godzinę oraz czas ręcznego zapisania przyjęcia lub pominięcia.

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

W ustawieniach wybierz **Eksportuj JSON** i zapisz plik w prywatnym miejscu. Na drugim urządzeniu wybierz **Importuj kopię**. Eksport zapisuje format v3 z lekami, ciśnieniem, pulsem i cukrem. Import przyjmuje formaty v1, v2 i v3. Kopie v1 i v2 przywracają sam organizer i zachowują pomiary. Po zatwierdzeniu zastępuje bieżący zapis, poprzednią wersję zachowując lokalnie pod kluczem `voltyro-leki-pro.v2.before-import`. Przed importem warto wyeksportować własną kopię. Usunięcie danych aplikacji lub przeglądarki może usunąć historię.

Migracja zachowuje rekord `voltyro-leki-pro.v1` i jego kopię `voltyro-leki-pro.v1.migration-backup`. Przeniesione potwierdzenia są wyświetlane jako wpisy rano i wieczorem, ponieważ v1 nie przechowywała nazw leków.

## Pomiary

Zakładki **Ciśnienie** i **Cukier** zapisują pomiary w tej przeglądarce pod kluczem `voltyro-leki-pro.measurements.v1`. Historia pokazuje wartości wpisane przez użytkownika oraz przeliczoną jednostkę cukru. Wykresy pokazują ostatnie 7 lub 30 dni z pomiarami według lokalnej daty wprowadzonej w formularzu. Dane mają stabilne identyfikatory i format eksportu do wykorzystania przez przyszłe raporty.

## Testy

```sh
node --test test/*.test.mjs
```

## Pliki

- `index.html`, `style.css` — interfejs.
- `app.js`, `data.js` — dziennik, kalendarz oraz obsługa kopii.
- `sw.js`, `manifest.webmanifest` — offline i instalacja PWA.
- `favicon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — ikony.
- `netlify.toml` — ustawienia hostingu statycznego.
