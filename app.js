import {doses, emptyData, dayKey, timeKey, monthDays, moveMonth, parseBackup, isTime} from './data.js';

const $ = id => document.getElementById(id);
const storageKey = 'voltyro-leki-pro.v1';
const fullDate = new Intl.DateTimeFormat('pl-PL', {dateStyle: 'full'});
const monthName = new Intl.DateTimeFormat('pl-PL', {month: 'long', year: 'numeric'});
const doseLabels = {morning: 'Rano', evening: 'Wieczorem'};
let loaded = false;
let data = emptyData();
let today = dayKey(new Date());
let month = moveMonth(new Date(), 0);
let dialogAction;

function announce(message) {
  $('notice').hidden = false;
  $('notice').textContent = message;
}

function readData() {
  const saved = localStorage.getItem(storageKey);
  return saved === null ? emptyData() : parseBackup(saved);
}

function reloadData() {
  try {
    data = readData();
    loaded = true;
  } catch {
    loaded = false;
    announce('W tym trybie nie udało się odczytać historii. Możesz przywrócić poprawną kopię w ustawieniach.');
  }
}

function save(change, replace = false) {
  try {
    const next = replace ? emptyData() : readData();
    const result = change(next) ?? next;
    localStorage.setItem(storageKey, JSON.stringify(result));
    data = result;
    loaded = true;
    render();
    return true;
  } catch {
    announce('Nie udało się zapisać zmian na tym urządzeniu. Sprawdź dostęp do pamięci przeglądarki.');
    return false;
  }
}

function render() {
  $('today').dateTime = today;
  $('today').textContent = fullDate.format(new Date(today + 'T12:00:00'));
  for (const dose of doses) {
    const recorded = data.days[today]?.[dose];
    const button = document.querySelector('[data-dose="' + dose + '"]');
    button.textContent = recorded ? 'Wzięte ✓' : 'Potwierdź przyjęcie';
    button.disabled = !loaded || Boolean(recorded);
    button.classList.toggle('done', Boolean(recorded));
    $(dose + '-plan').textContent = data.times[dose];
    $(dose + '-note').textContent = recorded ? 'Potwierdzono o ' + recorded : '';
    document.querySelector('[data-undo="' + dose + '"]').hidden = !loaded || !recorded;
  }
  renderCalendar();
}

function renderCalendar() {
  $('month').textContent = monthName.format(month);
  const {offset, count} = monthDays(month.getFullYear(), month.getMonth());
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < offset; i++) fragment.append(document.createElement('span'));
  for (let day = 1; day <= count; day++) {
    const date = new Date(month.getFullYear(), month.getMonth(), day, 12);
    const key = dayKey(date);
    const record = data.days[key];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'day';
    button.dataset.date = key;
    button.classList.toggle('future', key > today);
    button.textContent = day;
    button.setAttribute('aria-label', [fullDate.format(date), ...doses.map(dose =>
      doseLabels[dose] + ' ' + (record?.[dose] ? 'potwierdzone o ' + record[dose] : 'brak potwierdzenia'))].join(', '));
    if (key === today) button.setAttribute('aria-current', 'date');
    const dots = document.createElement('span');
    dots.className = 'dots';
    dots.setAttribute('aria-hidden', 'true');
    for (const dose of doses) {
      const dot = document.createElement('i');
      dot.className = record?.[dose] ? 'dot taken' : 'dot';
      dots.append(dot);
    }
    button.append(dots);
    button.addEventListener('click', () => showDialog(fullDate.format(date), doses.map(dose =>
      doseLabels[dose] + ' · ' + (key > today ? 'Przyszły termin' : record?.[dose] ? 'Potwierdzono o ' + record[dose] : 'Brak potwierdzenia'))));
    fragment.append(button);
  }
  $('days').replaceChildren(fragment);
}

function showDialog(title, lines, action, acceptLabel = 'Potwierdź') {
  const dialog = $('dialog');
  if (dialog.open) return;
  $('dialog-title').textContent = title;
  $('dialog-body').replaceChildren(...lines.map(line => {
    const p = document.createElement('p');
    p.textContent = line;
    return p;
  }));
  dialogAction = action;
  $('accept').hidden = !action;
  $('accept').textContent = acceptLabel;
  $('cancel').textContent = action ? 'Anuluj' : 'Zamknij';
  dialog.returnValue = '';
  dialog.showModal();
}

$('dialog').addEventListener('close', () => {
  const action = dialogAction;
  dialogAction = undefined;
  if ($('dialog').returnValue === 'accept') action?.();
});

function updateDay(now = new Date()) {
  const key = dayKey(now);
  if (key === today) return;
  if (dayKey(month).slice(0, 7) === today.slice(0, 7)) month = moveMonth(now, 0);
  today = key;
  render();
}

for (const dose of doses) {
  document.querySelector('[data-dose="' + dose + '"]').addEventListener('click', () => {
    const now = new Date();
    updateDay(now);
    if (save(next => {
      next.days[today] ??= {};
      next.days[today][dose] ??= timeKey(now);
    })) announce(doseLabels[dose] + ' · Zapisano potwierdzenie.');
  });
  document.querySelector('[data-undo="' + dose + '"]').addEventListener('click', () => {
    const date = today;
    const recorded = data.days[date]?.[dose];
    showDialog('Cofnąć potwierdzenie?', [doseLabels[dose] + ' · ' + fullDate.format(new Date(date + 'T12:00:00'))],
      () => {
        if (save(next => {
          const day = next.days[date];
          if (day?.[dose] !== recorded) return;
          delete day[dose];
          if (!Object.keys(day).length) delete next.days[date];
        })) announce('Cofnięto potwierdzenie.');
      }, 'Cofnij potwierdzenie');
  });
}

for (const [id, direction] of [['prev', -1], ['next', 1]]) {
  $(id).addEventListener('click', () => {
    month = moveMonth(month, direction);
    renderCalendar();
  });
}

const settings = $('settings');
function populateSettings() {
  for (const dose of doses) settings.elements[dose].value = data.times[dose];
}
settings.addEventListener('submit', event => {
  event.preventDefault();
  const {morning, evening} = Object.fromEntries(new FormData(settings));
  if (!isTime(morning) || !isTime(evening)) return;
  if (save(next => { next.times = {morning, evening}; })) announce('Zapisano godziny.');
});

$('export').addEventListener('click', () => {
  try {
    const backup = new Blob([JSON.stringify(readData(), null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(backup);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'voltyro-leki-' + dayKey(new Date()) + '.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch {
    announce('Nie udało się odczytać historii do eksportu.');
  }
});

$('import').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async () => {
  const file = $('file').files[0];
  $('file').value = '';
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error();
    const restored = parseBackup(await file.text(), dayKey(new Date()));
    showDialog('Przywrócić kopię?', [
      'Kopia zawiera ' + Object.keys(restored.days).length + ' dni z potwierdzeniami.',
      'Import zastąpi dotychczasową historię oraz ustawienia godzin na tym urządzeniu.'
    ], () => {
      if (save(() => restored, true)) {
        populateSettings();
        announce('Przywrócono kopię zapasową.');
      }
    }, 'Przywróć kopię');
  } catch {
    announce('Nie udało się wczytać kopii. Wybierz poprawny plik JSON z VOLTYRO Leki PRO, bez przyszłych dat.');
  }
});

reloadData();
populateSettings();
render();
window.addEventListener('storage', event => {
  if (event.key === storageKey || event.key === null) {
    reloadData();
    populateSettings();
    render();
  }
});
window.addEventListener('pageshow', () => updateDay());
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateDay(); });
setInterval(() => updateDay(), 15_000);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => announce('Nie udało się przygotować trybu offline.'));
}
