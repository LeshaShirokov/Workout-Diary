const test = require('node:test');
const assert = require('node:assert/strict');
const WD = require('./_load');
const IO = WD.io, S = WD.storage;

const wrap = data => JSON.stringify({ app: 'workout-diary', format: 'workout-diary-export', version: 2, data });

test('экспорт → импорт: круговой обмен без потерь', () => {
  const st = S.defaultState();
  st.sessions.push({ id: 's1', date: '2025-03-03', dayId: 'd1', dayName: 'День 1', status: 'done', bodyWeight: 80, feeling: 4, notes: 'ок',
    exercises: [{ exId: 'd1-e1', name: 'Жим', type: 'strength', note: '', sets: [{ w: 10, r: 10, done: true }] }] });
  const clean = S.sanitizeState(st);
  const r = IO.parseImport(IO.exportJSON(clean));
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.sessions, clean.sessions);
  assert.equal(r.summary.sessions, 1);
});

test('не-JSON, массивы, чужие файлы — понятная ошибка', () => {
  for (const t of ['', 'abc', '[]', 'null', '42', '"x"', '{"foo":1}', '{"app":"workout-diary","data":[]}']) {
    const r = IO.parseImport(t);
    assert.equal(r.ok, false, t);
    assert.ok(r.error);
  }
  assert.equal(IO.parseImport(null).ok, false);
});

test('слишком большой файл отклоняется до JSON.parse', () => {
  const big = '{"sessions":[' + '"x",'.repeat(2 * 1024 * 1024) + '"x"]}';
  const r = IO.parseImport(big);
  assert.equal(r.ok, false);
  assert.match(r.error, /большой/);
  assert.equal(IO.parseImport('{"a":"' + 'я'.repeat(600) + '"}', { maxBytes: 1000 }).ok, false, 'лимит считается в байтах UTF-8');
});

test('прототипное загрязнение и вредные поля не проходят', () => {
  const evil = '{"app":"workout-diary","version":2,"data":{"__proto__":{"polluted":1},"settings":{"__proto__":{"x":1},"theme":"<img src=x onerror=alert(1)>","restSeconds":1e9,"weightStep":-5},' +
    '"program":{"name":"' + 'A'.repeat(5000) + '","days":[{"id":"<script>","name":{"toString":1},"exercises":[{"id":"e1","name":"Жим","type":"rm -rf","sets":1e9}]}]},' +
    '"sessions":[{"id":"../../x","date":"2026-13-40"},{"id":"ok1","date":"2025-03-03","status":"hacked","feeling":99,"bodyWeight":"80","exercises":[{"type":"strength","name":"А","sets":[{"w":"1e999","r":-5,"done":"yes"},{"w":1e9,"r":5}]}]}],' +
    '"bodyLog":[{"date":"2025-03-03","weight":"abc"},{"date":"2025-03-04","weight":80}]}}';
  const r = IO.parseImport(evil);
  assert.equal(r.ok, true);
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.prototype.x, undefined);
  const d = r.data;
  assert.ok(['auto', 'light', 'dark'].includes(d.settings.theme));
  assert.ok(d.settings.restSeconds <= 600 && d.settings.weightStep > 0);
  assert.ok(d.program.name.length <= 200);
  assert.notEqual(d.program.days[0].id, '<script>');
  assert.equal(typeof d.program.days[0].name, 'string');
  assert.equal(d.program.days[0].exercises[0].type, 'strength');
  assert.ok(d.program.days[0].exercises[0].sets <= 20);
  assert.equal(d.sessions.length, 1, 'сессия с неверной датой отброшена');
  const s = d.sessions[0];
  assert.equal(s.status, 'done');
  assert.equal(s.feeling, null);
  assert.equal(s.exercises[0].sets[0].w, null);
  assert.equal(s.exercises[0].sets[0].r, null);
  assert.equal(s.exercises[0].sets[0].done, false);
  assert.equal(s.exercises[0].sets[1].w, null, 'вес вне диапазона');
  assert.equal(d.bodyLog.length, 1);
});

test('лимиты на количество элементов', () => {
  const sets = Array.from({ length: 500 }, () => ({ w: 1, r: 1 }));
  const r = IO.parseImport(wrap({ sessions: [{ id: 'a', date: '2026-01-01', exercises: [{ type: 'strength', name: 'x', sets }] }] }));
  assert.equal(r.data.sessions[0].exercises[0].sets.length, S.LIMITS.sets);
});

test('слияние: совпадающие id заменяются, новые добавляются; замена — полная', () => {
  const cur = S.sanitizeState(Object.assign(S.defaultState(), { sessions: [{ id: 'a', date: '2026-01-01', notes: 'старое' }, { id: 'b', date: '2026-01-02' }] }));
  const inc = IO.parseImport(wrap({ sessions: [{ id: 'a', date: '2026-01-01', notes: 'новое' }, { id: 'c', date: '2026-01-03' }] })).data;
  const merged = IO.applyImport(cur, inc, 'merge', {});
  assert.deepEqual(merged.sessions.map(s => s.id).sort(), ['a', 'b', 'c']);
  assert.equal(merged.sessions.find(s => s.id === 'a').notes, 'новое');
  const replaced = IO.applyImport(cur, inc, 'replace', {});
  assert.deepEqual(replaced.sessions.map(s => s.id).sort(), ['a', 'c']);
});

test('сдвиг дат сохраняет интервалы', () => {
  const d = IO.parseImport(wrap({ sessions: [{ id: 'a', date: '2025-03-03' }, { id: 'b', date: '2025-03-07' }], bodyLog: [{ date: '2025-03-12', weight: 81 }] })).data;
  IO.rebaseDates(d, '2025-04-07');
  assert.deepEqual(d.sessions.map(s => s.date), ['2025-04-07', '2025-04-11']);
  assert.equal(d.bodyLog[0].date, '2025-04-16');
});
