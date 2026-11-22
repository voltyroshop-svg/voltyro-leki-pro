import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../data.js', import.meta.url), 'utf8');
const {legacyStorageKey, legacyBackupKey, storageKey, readOrganizer, organizerBackup, emptyOrganizer,
  plannedDoses, setDoseState, dayKey} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const old = '{"version":1,"times":{"morning":"07:45","evening":"21:10"},"days":{"2026-11-20":{"morning":"07:56"}}}';
function storage(failKey) {
  const values = new Map([[legacyStorageKey, old]]);
  return {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      if (key === failKey) throw new Error('Quota exceeded');
      values.set(key, value);
    },
  };
}

test('migration preserves exact legacy data and writes a backup before upgrading', () => {
  const saved = storage();
  const data = readOrganizer(saved);
  assert.equal(data.version, 2);
  assert.deepEqual(data.times, {morning: '07:45', evening: '21:10'});
  assert.deepEqual(data.days, {'2026-11-20': {morning: '07:56'}});
  assert.deepEqual(data.medicines, []);
  assert.equal(saved.getItem(legacyStorageKey), old);
  assert.equal(saved.getItem(legacyBackupKey), old);
  assert.deepEqual(readOrganizer(saved), data);
  const failing = storage(storageKey);
  assert.throws(() => readOrganizer(failing));
  assert.equal(failing.getItem(legacyStorageKey), old);
  assert.equal(failing.getItem(legacyBackupKey), old);
  const noBackup = storage(legacyBackupKey);
  assert.throws(() => readOrganizer(noBackup));
  assert.equal(noBackup.getItem(storageKey), null);
  assert.equal(noBackup.getItem(legacyStorageKey), old);
});

test('organizer orders several medicines; actions keep original times and snapshots through edits', () => {
  const data = emptyOrganizer();
  const med = {id: 'one', name: 'Lek testowy A', dose: 'Dawka A', state: 'active',
    slots: [{id: 'a', time: '20:00'}, {id: 'b', time: '08:00'}]};
  const other = {id: 'two', name: 'Lek testowy B', dose: 'Dawka B', state: 'active', slots: [{id: 'c', time: '11:00'}]};
  data.medicines.push(med, other);
  const now = new Date(2026, 10, 22, 9, 15);
  const date = dayKey(now);
  const rows = plannedDoses(data, date);
  assert.deepEqual(rows.map(row => row.plannedTime), ['08:00', '11:00', '20:00']);
  setDoseState(data, date, rows[0], 'taken', now);
  setDoseState(data, date, rows[0], 'skipped', now);
  setDoseState(data, date, rows[2], 'skipped', now);
  med.name = 'Nazwa po edycji';
  med.dose = 'Dawka po edycji';
  med.slots[1].time = '09:00';
  const taken = plannedDoses(data, date)[0];
  assert.deepEqual([taken.name, taken.dose, taken.plannedTime, taken.recordedTime, taken.recordedAt, taken.state],
    ['Lek testowy A', 'Dawka A', '08:00', '09:15', now.toISOString(), 'taken']);
  med.state = 'archived';
  other.state = 'paused';
  assert.deepEqual(plannedDoses(data, date).map(row => row.state), ['taken', 'skipped']);
  const exported = JSON.stringify(data);
  assert.deepEqual(organizerBackup(exported, date), data);
  setDoseState(data, date, taken, 'pending', now);
  assert.deepEqual(plannedDoses(data, date).map(row => row.state), ['skipped']);
  other.state = 'active';
  assert.deepEqual(plannedDoses(data, date).map(row => row.state), ['pending','skipped']);
});

test('imports accept v1 and reject invalid v2 without replacing data', () => {
  const migrated = organizerBackup(old, '2026-11-22');
  assert.equal(migrated.version, 2);
  assert.throws(() => organizerBackup(old, '2026-11-19'));
  assert.throws(() => organizerBackup(JSON.stringify({...migrated, records: {'2026-11-23': []}}), '2026-11-22'));
  assert.throws(() => organizerBackup(JSON.stringify({...migrated, medicines: [{name: 'Niepoprawny wpis'}]})));
});
