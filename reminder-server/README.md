# Przypomnienia Web Push dla VOLTYRO Leki PRO

GitHub Pages obsługuje interfejs i Service Workera. Planowanie oraz wysyłkę wykonuje jeden stale działający proces Node.js 24 z trwałą bazą SQLite. Najprostsze miejsce to mała instancja Linux lub istniejący serwer działający całą dobę. Użyj osobnego procesu, katalogu danych i adresu HTTPS. Instancja usypiana z bezczynności nie zapewni wysyłki o ustawionej godzinie.

## Uruchomienie

1. W katalogu serwera uruchom `npm ci`. Wygeneruj własną parę VAPID przez `npx --no-install web-push generate-vapid-keys --json` w prywatnym terminalu.
2. Ustaw w menedżerze sekretów hosta `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY` i `VAPID_SUBJECT` (np. adres kontaktowy z prefiksem `mailto:`). Ustaw też `APP_ORIGIN=https://voltyroshop-svg.github.io`, `REMINDER_DB` na plik na trwałym wolumenie i opcjonalnie `PORT`. Uruchom `npm start` przez menedżer usług z automatycznym restartem lub zbuduj obraz z dołączonego Dockerfile i zamontuj prywatny wolumen pod `/data`.
3. Wystaw usługę przez HTTPS i sprawdź odpowiedź `GET /health`. Ustaw publiczny adres HTTPS usługi w `push-config.js`, zwiększ wersję cache w `sw.js`, po czym opublikuj PWA. Klucz prywatny zostaje na serwerze.
4. Zainstaluj PWA na ekranie początkowym iPhone’a, udziel zgody w sekcji **Przypomnienia**, połącz urządzenie i zaplanuj **Wyślij przypomnienie testowe**. Test zapada za 2 minuty. Sprawdź doręczenie przy zamkniętej PWA i zablokowanym ekranie.

## Działanie i dane

- Wysyłka używa Web Push z VAPID i ogólnym tekstem. Serwer zapisuje subskrypcję, strefę czasową i unikalne godziny aktywnych leków. Dane pomiarów, nazwy leków, dawki i historia zostają lokalnie.
- Zmiana godzin, wstrzymanie lub usunięcie leku synchronizuje nowy harmonogram. Zmiany offline docierają po przywróceniu połączenia. Przed podróżą lub po zmianie strefy otwórz aplikację online, aby zsynchronizować nową strefę.
- Przy jesiennym powtórzeniu godziny przypomnienie jest wysyłane co najwyżej raz. Godzina pominięta przy wiosennej zmianie czasu jest pomijana. Po restarcie serwer sprawdza ostatnie pięć minut oraz trwałe zapisy prób. Przy niejednoznacznym wyniku wysyłka dla danego terminu nie jest ponawiana, aby uniknąć duplikatu.
- Nadawanie odfiltrowuje niedozwolone domeny. Dostęp do harmonogramu urządzenia zależy od losowego identyfikatora trzymanego przez to urządzenie. Produkcyjne HTTPS, ograniczenie ruchu na bramie oraz zabezpieczenie i możliwość usunięcia kopii SQLite są obowiązkami operatora. Serwer usuwa nieużywane subskrypcje po 90 dniach i wygasłe subskrypcje po odpowiedzi 404 lub 410 usług Push.
- Powiadomienie pokazuje system telefonu według ustawień użytkownika. Sieć, tryb skupienia i usługa Push wpływają na doręczenie. Powiadomienie nie oznacza przyjęcia leku.

Testy integracyjne wykonuje `npm test` w katalogu serwera. Testy PWA i serwera razem uruchamia z katalogu repozytorium `node --test test/*.test.mjs reminder-server/server.test.mjs`.
