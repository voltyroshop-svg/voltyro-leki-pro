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
