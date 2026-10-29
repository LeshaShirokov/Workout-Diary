const test = require('node:test');
const assert = require('node:assert/strict');
const WD = require('./_load');
const IO = WD.io, S = WD.storage;

test('ячейки CSV защищены от формул', () => {
  for (const bad of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx', '=HYPERLINK("http://evil")']) {
    const c = IO.csvCell(bad);
    assert.ok(/^"?'/.test(c), bad + ' → ' + c);
  }
  assert.equal(IO.csvCell('a;b'), '"a;b"');
  assert.equal(IO.csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(IO.csvCell(2.5), '2,5');
  assert.equal(IO.csvCell(-41), '-41', 'числа остаются числами');
  assert.equal(IO.csvCell(null), '');
  assert.equal(IO.csvCell(NaN), '');
});

test('CSV: BOM, разделитель ;, экранирование заметок', () => {
  const st = S.sanitizeState(Object.assign(S.defaultState(), { sessions: [{ id: 's', date: '2025-03-03', status: 'done', dayName: '=evil()', notes: 'a;b\nc',
    exercises: [{ name: '@x', type: 'strength', sets: [{ w: 2.5, r: 10, done: true }] }, { name: 'Кардио', type: 'cardio', cardio: { min: 20, km: 2.5, kcal: 180 } }] }] }));
  const csv = IO.toCSV(st);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  const lines = csv.slice(1).split('\r\n');
  assert.ok(lines[0].startsWith('Дата;Неделя;День;Упражнение'));
  assert.ok(!/;=|;\+|;@/.test(csv), 'нет ячеек, начинающихся с формулы');
  assert.ok(csv.includes("'=evil()"));
  assert.ok(csv.includes('2,5;10;25'));
});
