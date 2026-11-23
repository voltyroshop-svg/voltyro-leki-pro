import {doses, emptyOrganizer, dayKey, timeKey, monthDays, moveMonth, organizerBackup, isTime,
  readOrganizer, storageKey, legacyStorageKey, plannedDoses, setDoseState} from './data.js';

import {setupMeasurements,loadMeasurements} from './measurements.js';
import {measurementsKey,parseMeasurements} from './measurements-data.js';

const $ = id => document.getElementById(id);
const preImportKey = storageKey + '.before-import';
const preImportMeasurementsKey = measurementsKey + '.before-import';
const fullDate = new Intl.DateTimeFormat('pl-PL', {dateStyle: 'full'});
const monthName = new Intl.DateTimeFormat('pl-PL', {month: 'long', year: 'numeric'});
const doseLabels = {morning: 'Rano', evening: 'Wieczorem'};
let loaded = false;
let data = emptyOrganizer();
let today = dayKey(new Date());
let month = moveMonth(new Date(), 0);
let dialogAction;

function announce(message) {
  $('notice').hidden = false;
  $('notice').textContent = message;
}

function readData() {
  return readOrganizer(localStorage);
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
    if (replace) {
      const previous = localStorage.getItem(storageKey) ?? localStorage.getItem(legacyStorageKey);
      if (previous !== null) localStorage.setItem(preImportKey, previous);
    }
    const next = replace ? emptyOrganizer() : readData();
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
  renderMedicines();
  renderCalendar();
}

const medicineDialog = $('medicine-dialog');
const medicineForm = $('medicine-form');
let editedMedicineId;
const doseStatus = {pending: 'Oczekuje', taken: 'Przyjęty', skipped: 'Pominięty'};

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function action(label, onClick) {
  const button = element('button', label);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

function describeDose(dose) {
  const time = dose.state === 'taken' ? ' · potwierdzono o ' + dose.recordedTime :
    dose.state === 'skipped' ? ' · oznaczono o ' + dose.recordedTime : '';
  return dose.plannedTime + ' · ' + doseStatus[dose.state] + time;
}

function renderMedicines() {
  $('add-medicine').disabled = !loaded;
  const plan = $('medicine-doses');
  const list = $('medicine-list');
  plan.replaceChildren();
  list.replaceChildren();
  if (!loaded) return;
  const rows = plannedDoses(data, today);
  if (!rows.length) plan.append(element('p', 'Brak dawek w planie na dziś.', 'organizer-note'));
  for (const dose of rows) {
    const card = element('article', null, 'medicine-card');
    card.append(element('h3', dose.name), element('p', dose.dose, 'organizer-note'),
      element('p', describeDose(dose), 'medicine-status ' + dose.state));
    const controls = element('div', null, 'medicine-actions');
    const date = today;
    const change = state => {
      const now = new Date();
      if (dayKey(now) !== date) {
        updateDay(now);
        announce('Rozpoczął się nowy dzień. Sprawdź aktualną listę dawek.');
        return;
      }
      if (save(next => setDoseState(next, date, dose, state, now))) {
        announce(state === 'pending' ? 'Cofnięto wpis.' : dose.name + ' · ' +
          (state === 'taken' ? 'Zapisano przyjęcie.' : 'Zapisano pominięcie.'));
      }
    };
    if (dose.state === 'pending') {
      const take = action('Przyjąłem', () => change('taken'));
      take.className = 'take-medicine';
      controls.append(take, action('Pomiń', () => change('skipped')));
    } else controls.append(action(dose.state === 'taken' ? 'Cofnij potwierdzenie' : 'Cofnij pominięcie', () => change('pending')));
    card.append(controls);
    plan.append(card);
  }

  const current = data.medicines.filter(med => med.state !== 'archived');
  if (!current.length) list.append(element('p', 'Nie masz jeszcze zapisanych leków.', 'organizer-note'));
  for (const med of current) {
    const card = element('article', null, 'medicine-card');
    card.append(element('h3', med.name), element('p', med.dose + ' · ' + med.slots.map(slot => slot.time).join(', '), 'organizer-note'));
    if (med.state === 'paused') card.append(element('p', 'Wstrzymany', 'medicine-status skipped'));
    const controls = element('div', null, 'medicine-actions');
    function changeState(state) {
      if (save(next => {
        const saved = next.medicines.find(item => item.id === med.id);
        if (saved && saved.state !== 'archived') saved.state = state;
      })) announce(state === 'archived' ? 'Usunięto lek z planu. Historia jest dostępna w kalendarzu.' :
        state === 'paused' ? 'Wstrzymano lek w organizerze.' : 'Przywrócono lek do planu organizera.');
    }
    controls.append(action('Edytuj', () => openMedicine(med)),
      action(med.state === 'paused' ? 'Wznów' : 'Wstrzymaj', () => changeState(med.state === 'paused' ? 'active' : 'paused')),
      action('Usuń z planu', () => showDialog('Usunąć lek z planu?', [med.name, 'Dotychczasowe wpisy pozostaną w kalendarzu.'],
        () => changeState('archived'), 'Usuń z planu')));
    card.append(controls);
    list.append(card);
  }
}

function addMedicineTime(time = '', id = crypto.randomUUID()) {
  const row = element('div', null, 'medicine-time');
  const label = element('label', 'Godzina');
  const input = element('input');
  input.type = 'time';
  input.required = true;
  input.value = time;
  input.dataset.slotId = id;
  label.append(input);
  row.append(label, action('Usuń godzinę', () => {
    if ($('medicine-times').childElementCount > 1) row.remove();
    else {
      $('medicine-error').textContent = 'Zostaw co najmniej jedną godzinę.';
      $('medicine-error').hidden = false;
    }
  }));
  $('medicine-times').append(row);
}

function openMedicine(med) {
  editedMedicineId = med?.id;
  $('medicine-title').textContent = med ? 'Edytuj lek' : 'Dodaj lek';
  medicineForm.elements.name.value = med?.name ?? '';
  medicineForm.elements.dose.value = med?.dose ?? '';
  $('medicine-error').hidden = true;
  $('medicine-times').replaceChildren();
  if (med) for (const slot of med.slots) addMedicineTime(slot.time, slot.id);
  else addMedicineTime();
  medicineDialog.showModal();
  medicineForm.elements.name.focus();
}

$('add-medicine').addEventListener('click', () => openMedicine());
$('add-time').addEventListener('click', () => {
  $('medicine-error').hidden = true;
  addMedicineTime();
  $('medicine-times').lastElementChild.querySelector('input').focus();
});
$('cancel-medicine').addEventListener('click', () => medicineDialog.close());
medicineForm.addEventListener('submit', event => {
  event.preventDefault();
  const name = medicineForm.elements.name.value.trim();
  const dose = medicineForm.elements.dose.value.trim();
  const slots = [...$('medicine-times').querySelectorAll('input')].map(input => ({id: input.dataset.slotId, time: input.value}));
  if (!name || !dose || !slots.length || slots.some(slot => !isTime(slot.time)) ||
      new Set(slots.map(slot => slot.time)).size !== slots.length) {
    $('medicine-error').textContent = 'Wpisz nazwę, dawkę i co najmniej jedną godzinę. Godziny leku nie mogą się powtarzać.';
    $('medicine-error').hidden = false;
    return;
  }
  slots.sort((a, b) => a.time.localeCompare(b.time));
  if (save(next => {
    const med = next.medicines.find(item => item.id === editedMedicineId && item.state !== 'archived');
    if (editedMedicineId && !med) throw new Error('Lek został usunięty');
    if (med) Object.assign(med, {name, dose, slots});
    else next.medicines.push({id: crypto.randomUUID(), name, dose, slots, state: 'active'});
  })) {
    medicineDialog.close();
    $('manage-medicines').open = true;
    announce('Zapisano lek.');
  }
});

function renderCalendar() {
  $('month').textContent = monthName.format(month);
  const {offset, count} = monthDays(month.getFullYear(), month.getMonth());
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < offset; i++) fragment.append(document.createElement('span'));
  for (let day = 1; day <= count; day++) {
    const date = new Date(month.getFullYear(), month.getMonth(), day, 12);
    const key = dayKey(date);
    const record = data.days[key];
    const individual = key === today ? plannedDoses(data, key) : [...(data.records[key] ?? [])]
      .sort((a, b) => a.plannedTime.localeCompare(b.plannedTime));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'day';
    button.dataset.date = key;
    button.classList.toggle('future', key > today);
    button.textContent = day;
    if (key === today) button.setAttribute('aria-current', 'date');
    const dots = document.createElement('span');
    dots.className = 'dots';
    dots.setAttribute('aria-hidden', 'true');
    const states = new Set(individual.map(item => item.state));
    if (doses.some(dose => record?.[dose])) states.add('taken');
    if (!states.size || key <= today && doses.some(dose => !record?.[dose])) states.add('pending');
    for (const state of ['taken', 'skipped', 'pending']) {
      if (states.has(state)) dots.append(element('i', null, 'dot ' + state));
    }
    button.setAttribute('aria-label', fullDate.format(date) + ', ' + individual.length + ' indywidualnych dawek');
    button.append(dots);
    button.addEventListener('click', () => showDialog(fullDate.format(date), [
      ...individual.map(item => item.name + ' · ' + item.dose + ' · ' + describeDose(item)),
      ...doses.map(dose => doseLabels[dose] + ' · ' + (key > today ? 'Przyszły termin' :
        record?.[dose] ? 'Potwierdzono o ' + record[dose] : 'Brak potwierdzenia')),
    ]));
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
    const combined = {version: 3, organizer: readData(), measurements: loadMeasurements()};
    const backup = new Blob([JSON.stringify(combined, null, 2)], {type: 'application/json'});
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
    const raw = await file.text();
    const input = JSON.parse(raw);
    const restored = organizerBackup(input?.version===3?JSON.stringify(input.organizer):raw, dayKey(new Date()));
    const measures = input?.version===3?parseMeasurements(input.measurements):null;
    showDialog('Przywrócić kopię?', [
      'Kopia zawiera ' + restored.medicines.length + ' leków i ' +
        new Set([...Object.keys(restored.days), ...Object.keys(restored.records)]).size + ' dni historii.',
      measures ? 'Kopia zawiera pomiary: '+measures.pressure.length+' ciśnienia i '+measures.glucose.length+' cukru.' :
        'Kopia zawiera tylko leki. Zapisane pomiary pozostaną na urządzeniu.',
      'Import zastąpi dane objęte kopią i zachowa lokalny zapis sprzed przywrócenia.',
      'Zachowaj także własny eksport JSON, jeśli chcesz mieć kopię poza aplikacją.'
    ], () => {
      let previous;
      try {
        if (measures) {
          previous = localStorage.getItem(measurementsKey);
          localStorage.setItem(preImportMeasurementsKey, previous ?? 'null');
          localStorage.setItem(measurementsKey, JSON.stringify(measures));
        }
        if (!save(() => restored, true)) {
          if (measures) {
            if (previous === null) localStorage.removeItem(measurementsKey);
            else localStorage.setItem(measurementsKey, previous);
          }
          return;
        }
        populateSettings();
        refreshMeasurements();
        announce('Przywrócono kopię zapasową.');
      } catch {
        announce('Nie udało się przywrócić kopii. Sprawdź dostęp do pamięci urządzenia.');
      }
    }, 'Przywróć kopię');
  } catch {
    announce('Nie udało się wczytać kopii. Wybierz poprawny plik JSON z VOLTYRO Leki PRO, bez przyszłych dat.');
  }
});

const refreshMeasurements = setupMeasurements({announce, confirm:showDialog});
reloadData();
populateSettings();
render();
window.addEventListener('storage', event => {
  if (event.key === storageKey || event.key === legacyStorageKey || event.key === null) {
    reloadData();
    populateSettings();
    render();
  }
});
window.addEventListener('pageshow', () => updateDay());
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateDay(); });
setInterval(() => updateDay(), 15_000);
if (!globalThis.Capacitor?.isNativePlatform?.()) {
  $('pwaHelp').hidden=false;
  if (navigator.standalone===true||matchMedia('(display-mode: standalone)').matches) {
    $('pwaInstallTip').hidden=true;
  }
  if ('serviceWorker' in navigator) {
    void preparePwa().catch(()=>{
      $('pwaStatus').textContent='Nie udało się przygotować trybu offline. Spróbuj ponownie przy aktywnym połączeniu.';
    });
  } else {
    $('pwaStatus').textContent='Tryb offline jest niedostępny w tej przeglądarce.';
  }
}

async function preparePwa() {
  const worker=navigator.serviceWorker;
  const registration=await worker.register('./sw.js',{updateViaCache:'none'});
  const notice=$('pwaUpdate');
  const apply=$('applyPwaUpdate');
  const status=$('pwaStatus');
  let applying=false;
  const showUpdate=()=>{
    notice.hidden=!registration.waiting||!worker.controller;
  };
  showUpdate();
  registration.addEventListener('updatefound',()=>{
    registration.installing?.addEventListener('statechange',showUpdate);
  });
  apply.onclick=()=>{
    if(applying||!registration.waiting)return;
    applying=true;
    apply.disabled=true;
    registration.waiting.postMessage('ACTIVATE_UPDATE');
    setTimeout(()=>{
      if(!applying)return;
      applying=false;
      apply.disabled=false;
      if(!registration.waiting)location.reload();
    },8000);
  };
  worker.addEventListener('controllerchange',()=>{
    showUpdate();
    if(applying){applying=false;location.reload();}
  });
  let checkedAt=Date.now();
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden||Date.now()-checkedAt<30*60_000)return;
    checkedAt=Date.now();
    void registration.update().catch(()=>{});
  });
  await worker.ready;
  status.textContent='Aplikacja jest gotowa do działania offline. Zapisy pozostają na tym urządzeniu.';
}
