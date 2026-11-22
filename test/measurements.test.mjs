import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const raw = await readFile(new URL('../measurements-data.js',import.meta.url),'utf8');
const {glucoseIn,glucoseFactor,validLocalDateTime,readMeasurement,parseMeasurements,chartRows} =
  await import('data:text/javascript;base64,'+Buffer.from(raw).toString('base64'));

test('glucose conversion preserves the original reading and uses the molecular conversion factor',()=>{
  const value = 5.55;
  const base = {id:'g',at:'2026-11-22T09:12',value,unit:'mmol/l',context:'fasting'};
  const result = readMeasurement('glucose',base);
  assert.deepEqual(result,base);
  assert.equal(glucoseIn(value,'mmol/l','mg/dl'),value*glucoseFactor);
  assert.ok(Math.abs(glucoseIn(100,'mg/dl','mmol/l')-5.550747)<0.00001);
  assert.equal(glucoseIn(value,'mmol/l','mmol/l'),value);
  assert.throws(()=>readMeasurement('glucose',{...base,value:0}));
  assert.throws(()=>readMeasurement('glucose',{...base,unit:'other'}));
});

test('backup validation retains notes and rejects duplicate measurements and invalid dates',()=>{
  const pressure={id:'p',at:'2026-11-22T08:00',systolic:122,diastolic:79,pulse:70,note:'Test'};
  assert.deepEqual(parseMeasurements({pressure:[pressure],glucose:[]}),{pressure:[pressure],glucose:[]});
  assert.throws(()=>parseMeasurements({pressure:[pressure,pressure],glucose:[]}));
  assert.equal(validLocalDateTime('2026-02-29T12:00'),false);
  assert.equal(validLocalDateTime('2028-02-29T12:00'),true);
  assert.throws(()=>readMeasurement('pressure',{...pressure,pulse:-1}));
});

test('7 and 30 days include today and exclude out-of-window measurements',()=>{
  const rows=['2026-10-23T11:00','2026-10-24T11:00','2026-11-15T23:59','2026-11-16T00:00',
    '2026-11-22T20:00','2026-11-23T00:00'].map(at=>({at}));
  const now=new Date(2026,10,22,13,0);
  assert.deepEqual(chartRows(rows,7,now),rows.slice(3,5));
  assert.deepEqual(chartRows(rows,30,now),rows.slice(1,5));
});
