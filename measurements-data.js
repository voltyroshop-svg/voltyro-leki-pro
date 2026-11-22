export const measurementsKey = 'voltyro-leki-pro.measurements.v1';
export const glucoseFactor = 18.01559;
export const glucoseContexts = {'fasting':'Na czczo','before':'Przed posiłkiem','after':'Po posiłku','other':'Inny'};
export const wellbeingLabels = {good:'Dobrze',fair:'Średnio',poor:'Źle'};
export const medicationTimingLabels = {before:'Przed lekami',after:'Po lekach',na:'Nie dotyczy'};
export const emptyMeasurements = () => ({pressure: [], glucose: []});

export function glucoseIn(value, from, to) {
  if (from === to) return value;
  return from === 'mg/dl' ? value / glucoseFactor : value * glucoseFactor;
}

export function validLocalDateTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const parsed = new Date(value + ':00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 16) === value;
}

export function readMeasurement(type, entry) {
  const number = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (!entry || !validLocalDateTime(entry.at) || typeof entry.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(entry.id)) throw Error('Nieprawidłowa data, godzina lub identyfikator.');
  const {id,at,note='',wellbeing='',medicationTiming=''}=entry;
  if(typeof note!=='string'||note.length>500||
    wellbeing!==''&&(typeof wellbeing!=='string'||!Object.hasOwn(wellbeingLabels,wellbeing))||
    medicationTiming!==''&&(typeof medicationTiming!=='string'||!Object.hasOwn(medicationTimingLabels,medicationTiming))) {
    throw Error('Sprawdź notatkę i informacje dodatkowe.');
  }
  const contextFields={...(wellbeing?{wellbeing}:{}),...(medicationTiming?{medicationTiming}:{})};
  if (type === 'pressure') {
    const {systolic,diastolic,pulse}=entry;
    if (![systolic, diastolic, pulse].every(value => Number.isSafeInteger(value) && value > 0) ) throw Error('Wpisz dodatnie liczby całkowite dla ciśnienia i pulsu.');
    return {id, at, systolic, diastolic, pulse,note,...contextFields};
  }
  if (type === 'glucose') {
    const {value, unit, context} = entry;
    if (!number(value) || !['mg/dl','mmol/l'].includes(unit) || !Object.hasOwn(glucoseContexts, context) ||
        !Number.isFinite(glucoseIn(value, unit, 'mg/dl'))) throw Error('Wpisz dodatni wynik, jednostkę i rodzaj pomiaru.');
    return {id, at, value,unit,context,...(note?{note}:{}),...contextFields};
  }
  throw Error('Nieznany rodzaj pomiaru.');
}

export function parseMeasurements(source) {
  if (!source || !Array.isArray(source.pressure) || !Array.isArray(source.glucose))
    throw Error('Nieprawidłowa kopia pomiarów.');
  return Object.fromEntries(Object.keys(emptyMeasurements()).map(type => {
    const ids = new Set();
    return [type, source[type].map(item => {
      const value = readMeasurement(type, item);
      if (ids.has(value.id)) throw Error('Powtórzony identyfikator pomiaru.');
      ids.add(value.id);
      return value;
    })];
  }));
}

export function chartRows(rows, days, now) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1, 12);
  const key = date => [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((v,i) =>
    String(v).padStart(i ? 2 : 4, '0')).join('-');
  return rows.filter(row => row.at.slice(0,10) >= key(start) && row.at.slice(0,10) < key(end))
    .sort((a,b) => a.at.localeCompare(b.at));
}
