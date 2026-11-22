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

## Projekty mobilne Capacitor

Projekty `ios/App/App.xcodeproj` oraz `android/` korzystają z tego samego interfejsu i pakują pliki aplikacji do instalatora. Istniejąca PWA działa pod dotychczasowym adresem. Wersja mobilna jest przeznaczona do testowania, ze wszystkimi zrealizowanymi funkcjami włączonymi.

### iPhone 16 Pro Max

1. Na Macu z Xcode 26 lub nowszym oraz Node.js 22 lub nowszym otwórz **Uruchom-iOS.command**. Skrypt przygotuje zasoby i otworzy projekt Xcode. Można także wykonać `npm ci`, `npm run mobile:sync` i otworzyć `ios/App/App.xcodeproj`.
2. Podłącz iPhone’a. W Xcode wybierz cel **App**, w **Signing & Capabilities** wybierz swój zespół Apple (**Personal Team** wystarcza do testu lokalnego), wybierz iPhone’a jako urządzenie i naciśnij **Run ▶**. Jeśli iOS poprosi, włącz **Tryb deweloperski**. Jeżeli Xcode zgłosi zajęty identyfikator, nadaj aplikacji unikalny identyfikator przed pierwszą instalacją, a przy kolejnych instalacjach zachowaj go. Podpis bezpłatnym kontem Apple ma ograniczoną ważność.
3. W aplikacji użyj **Przypomnienia o lekach → Test za 2 minuty** i zatwierdź zgodę na powiadomienia. Wyjdź z aplikacji do ekranu głównego. Test na fizycznym iPhonie jest wymagany do potwierdzenia doręczenia.

### Android

Przygotuj JDK 21 oraz Android SDK 36 i Build Tools 35.0.0. Po `npm ci` uruchom `npm run android:apk`. Instalator testowy znajdziesz w `android/app/build/outputs/apk/debug/app-debug.apk`. Na Windows po synchronizacji otwórz projekt w Android Studio lub uruchom `gradlew.bat assembleDebug` z folderu `android`. Kolejne instalatory podpisuj tym samym kluczem testowym, aby Android mógł zaktualizować aplikację bez usuwania jej danych.

### Dane i przypomnienia

- Zapis z PWA można przenieść przez **Eksportuj JSON → Importuj kopię**. Aplikacja natywna ma osobny magazyn, więc dane PWA pozostają w niej dostępne podczas testów. Dotychczasowy format kopii obejmuje leki, historię, ustawienia godzin i pomiary. Zgody systemowe i wybór przypomnień są ustawieniami danego urządzenia.
- Ustal godziny w edytorze leku i włącz przypomnienie przy nim. Każda godzina ma oddzielny lokalny alarm. Zmiana czasu, wstrzymanie lub archiwizacja leku uzgadnia harmonogram z systemem. Doręczenie alarmu nie zmienia historii dawek.
- iOS używa powtarzających się wyzwalaczy kalendarzowych, a Android dopasowania do czasu lokalnego. Android odtwarza harmonogram przy zmianie czasu lub strefy, po restarcie telefonu i aktualizacji pakietu. Po powrocie na pierwszy plan aplikacja dodatkowo sprawdza zapisane przypomnienia. Pominięte lub podwójne godziny przy zmianie czasu są rozstrzygane według reguł systemu.
- W iOS aplikacja obsługuje do 60 zaplanowanych godzin dziennie, pozostawiając miejsce na powiadomienie testowe w limicie oczekujących powiadomień. W Androidzie przyjęto limit 400 godzin z uwagi na zróżnicowane ograniczenia producentów. Niezaplanowane godziny są wykazywane w komunikacie.
- Doręczenie zależy od zgody, ustawień systemu, trybu skupienia i oszczędzania energii. W Androidzie zezwolenie na dokładne alarmy ogranicza opóźnienia. Wymuszone zatrzymanie z ustawień Androida może zatrzymać przypomnienia do następnego otwarcia aplikacji.
- Organizer, pomiary i historia stanowią zakres FREE. Powiadomienia są oddzielnym modułem używającym istniejących danych organizera. Przyszłe uprawnienie PRO można zastosować do zaawansowanych funkcji tego modułu oraz przyszłego eksportu PDF i analiz. W bieżącej wersji wszystkie zrealizowane funkcje są dostępne bez płatności.

Dokumentacja [Capacitor Local Notifications](https://capacitorjs.com/docs/apis/local-notifications), [alarmów Androida](https://developer.android.com/develop/background-work/services/alarms/schedule) oraz [powiadomień lokalnych Apple](https://developer.apple.com/documentation/usernotifications/scheduling-a-notification-locally-from-your-app).
