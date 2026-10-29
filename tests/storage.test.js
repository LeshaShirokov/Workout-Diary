const test = require('node:test');
const assert = require('node:assert/strict');
const WD = require('./_load');
const S = WD.storage;

function mem(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), keys: () => [...m.keys()], m };
}

test('пустое хранилище → программа по умолчанию (только шаблон, без чисел)', () => {
  const r = S.load(mem());
  assert.equal(r.fresh, true);
  assert.equal(r.state.version, 2);
  assert.equal(r.state.program.days.length, 3);
  assert.equal(r.state.sessions.length, 0);
});

test('миграция v1 → v2 и запись в новый ключ', () => {
  const v1 = {
    days: [{ id: 'd1', name: 'День 1 - Грудь', exercises: [{ id: 'e1', name: 'Жим', kind: 'weight' }, { id: 'e2', name: 'Гравитрон', kind: 'assist' }, { id: 'e3', name: 'Кардио', kind: 'cardio' }] }],
    workouts: [{ date: '2026-01-05', day: 'd1', items: [{ ex: 'e1', sets: [{ w: 40, r: 10, done: true }] }, { ex: 'e2', sets: [{ w: -40, r: 8, done: true }] }, { ex: 'e3', text: '10 мин 1.2 км 90 ккал' }] }],
    weights: { '2026-01-05': 80.5 }
  };
  const st = mem({ [S.LEGACY_KEY]: JSON.stringify(v1) });
  const r = S.load(st);
  assert.equal(r.migratedFrom, 1);
  assert.equal(r.state.program.days[0].name, 'День 1');
  assert.equal(r.state.program.days[0].title, 'Грудь');
  assert.equal(r.state.program.days[0].exercises[1].type, 'assisted');
  const s = r.state.sessions[0];
  assert.equal(s.exercises[0].sets[0].w, 40);
  assert.deepEqual(s.exercises[2].cardio, { min: 10, km: 1.2, kcal: 90 });
  assert.equal(r.state.bodyLog[0].weight, 80.5);
  assert.ok(st.getItem(S.KEY), 'сохранено под новым ключом');
});

test('повреждённые данные сохраняются в резервную копию, приложение стартует', () => {
  const st = mem({ [S.KEY]: '{not json' });
  const r = S.load(st);
  assert.equal(r.error, 'corrupt');
  assert.ok(st.keys().some(k => k.startsWith(S.KEY + ':corrupt-')));
});

test('версия из будущего отклоняется', () => {
  assert.throws(() => S.migrate({ version: 99 }), /новой версией/);
  assert.throws(() => S.migrate({ version: 'x' }), /версия/);
});

test('сохранение и повторная загрузка дают то же состояние', () => {
  const st = mem();
  const a = S.defaultState();
  a.sessions.push({ id: 's1', date: '2025-03-03', status: 'done', exercises: [{ exId: 'd1-e1', name: 'A', type: 'strength', sets: [{ w: 5, r: 10, done: true }] }] });
  assert.equal(S.save(S.sanitizeState(a), st), true);
  const b = S.load(st).state;
  assert.equal(b.sessions[0].exercises[0].sets[0].w, 5);
});
