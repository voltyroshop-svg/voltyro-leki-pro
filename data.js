export function newRecordId(cryptoApi=globalThis.crypto) {
  if(typeof cryptoApi.randomUUID==='function')return cryptoApi.randomUUID();
  // Some native WebView origins expose secure randomness without randomUUID().
  const bytes=cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&0x0f)|0x40;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}

export const doses = ['morning', 'evening'];
export const emptyData = () => ({version: 1, times: {morning: '08:00', evening: '20:00'}, days: {}});
const twoDigits = value => String(value).padStart(2, '0');
export const dayKey = date => [String(date.getFullYear()).padStart(4, '0'), twoDigits(date.getMonth() + 1), twoDigits(date.getDate())].join('-');
export const timeKey = date => [twoDigits(date.getHours()), twoDigits(date.getMinutes())].join(':');
export const isTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

export function monthDays(year, month) {
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0, 12).getDate();
  return {offset, count};
}

export function moveMonth(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1, 12);
}

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00');
  return Number.isFinite(date.getTime()) && dayKey(date) === value;
}

export function parseBackup(text, today) {
  const source = JSON.parse(text);
  if (!isRecord(source) || source.version !== 1 || !isRecord(source.times) || !isRecord(source.days) ||
      !doses.every(dose => isTime(source.times[dose]))) throw new Error('Nieprawidłowy format kopii.');
  const data = emptyData();
  for (const dose of doses) data.times[dose] = source.times[dose];
  for (const [key, entry] of Object.entries(source.days)) {
    if (!validDateKey(key) || (today && key > today) || !isRecord(entry)) throw new Error('Kopia zawiera nieprawidłową lub przyszłą datę.');
    const restored = {};
    for (const [dose, time] of Object.entries(entry)) {
      if (!doses.includes(dose) || !isTime(time)) throw new Error('Kopia zawiera nieprawidłowe potwierdzenie.');
      restored[dose] = time;
    }
    if (Object.keys(restored).length) data.days[key] = restored;
  }
  return data;
}

export const legacyStorageKey = 'voltyro-leki-pro.v1';
export const storageKey = 'voltyro-leki-pro.v2';
export const legacyBackupKey = legacyStorageKey + '.migration-backup';

export function organizerBackup(text, today) {
  const source = JSON.parse(text);
  if (source?.version === 1) return {...emptyOrganizer(), ...parseBackup(text, today), version: 2};
  if (!isRecord(source) || source.version !== 2 || !Array.isArray(source.medicines) || !isRecord(source.records))
    throw new Error('Nieprawidłowy format kopii organizera.');
  const legacy = parseBackup(JSON.stringify({version: 1, times: source.times, days: source.days}), today);
  const ids = new Set();
  const idValid = id => typeof id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(id);
  const labelValid = (label, max) => typeof label === 'string' && label.trim().length > 0 && label.length <= max;
  const medicines = source.medicines.map(med => {
    if (!isRecord(med) || !idValid(med.id) || ids.has(med.id) || !labelValid(med.name, 120) ||
        !labelValid(med.dose, 80) || !['active', 'paused', 'archived'].includes(med.state) ||
        !Array.isArray(med.slots) || !med.slots.length) throw new Error('Nieprawidłowy lek w kopii.');
    ids.add(med.id);
    const slotIds = new Set(), hours = new Set();
    const slots = med.slots.map(slot => {
      if (!isRecord(slot) || !idValid(slot.id) || slotIds.has(slot.id) || !isTime(slot.time) || hours.has(slot.time))
        throw new Error('Nieprawidłowe godziny leku.');
      slotIds.add(slot.id);
      hours.add(slot.time);
      return {id: slot.id, time: slot.time};
    });
    return {id: med.id, name: med.name, dose: med.dose, state: med.state, slots};
  });
  const records = {};
  for (const [date, entries] of Object.entries(source.records)) {
    if (!validDateKey(date) || today && date > today || !Array.isArray(entries)) throw new Error('Nieprawidłowy dzień historii.');
    const unique = new Set();
    records[date] = entries.map(item => {
      const key = item?.medicineId + ':' + item?.slotId;
      if (!isRecord(item) || !ids.has(item.medicineId) || !idValid(item.slotId) || unique.has(key) ||
          !labelValid(item.name, 120) || !labelValid(item.dose, 80) || !isTime(item.plannedTime) ||
          !['taken', 'skipped'].includes(item.state) || !isTime(item.recordedTime) ||
          typeof item.recordedAt !== 'string' || !Number.isFinite(Date.parse(item.recordedAt)))
        throw new Error('Nieprawidłowe potwierdzenie w kopii.');
      unique.add(key);
      const {medicineId, slotId, name, dose, plannedTime, state, recordedAt, recordedTime} = item;
      return {medicineId, slotId, name, dose, plannedTime, state, recordedAt, recordedTime};
    });
  }
  return {...legacy, version: 2, medicines, records};
}

export const emptyOrganizer = () => ({...emptyData(), version: 2, medicines: [], records: {}});

export function readOrganizer(storage) {
  const current = storage.getItem(storageKey);
  if (current !== null) return organizerBackup(current);
  const old = storage.getItem(legacyStorageKey);
  if (old === null) return emptyOrganizer();
  const migrated = organizerBackup(old);
  if (storage.getItem(legacyBackupKey) === null) storage.setItem(legacyBackupKey, old);
  storage.setItem(storageKey, JSON.stringify(migrated));
  return migrated;
}

export function plannedDoses(data, date) {
  const entries = new Map((data.records[date] ?? []).map(item => [item.medicineId + ':' + item.slotId, item]));
  for (const med of data.medicines) {
    if (med.state !== 'active') continue;
    for (const slot of med.slots) {
      const key = med.id + ':' + slot.id;
      if (!entries.has(key)) entries.set(key, {medicineId: med.id, slotId: slot.id,
        name: med.name, dose: med.dose, plannedTime: slot.time, state: 'pending'});
    }
  }
  return [...entries.values()].sort((a, b) => a.plannedTime.localeCompare(b.plannedTime) ||
    a.name.localeCompare(b.name, 'pl'));
}

export function setDoseState(data, date, dose, state, now = new Date()) {
  const entries = data.records[date] ?? [];
  const index = entries.findIndex(item => item.medicineId === dose.medicineId && item.slotId === dose.slotId);
  if (state === 'pending') {
    if (index >= 0) entries.splice(index, 1);
    if (!entries.length) delete data.records[date];
    return;
  }
  const med = data.medicines.find(item => item.id === dose.medicineId && item.state === 'active');
  const slot = med?.slots.find(item => item.id === dose.slotId);
  if (index >= 0 || !slot || date !== dayKey(now)) return;
  data.records[date] = entries;
  entries.push({medicineId: med.id, slotId: slot.id, name: med.name, dose: med.dose, plannedTime: slot.time,
    state, recordedAt: now.toISOString(), recordedTime: timeKey(now)});
}
