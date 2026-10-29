const test = require('node:test');
const assert = require('node:assert/strict');
const WD = require('./_load');
const C = WD.core, M = WD.model;

const ex = (type, sets) => ({ exId: null, name: 'X', type, note: '', sets: sets.map(([w, r, done = true]) => ({ w, r, done })) });
const sess = (id, date, exercises, extra) => Object.assign({ id, date, status: 'done', dayId: null, dayName: '', exercises }, extra);

test('объём: Σ w×r только для w>0 (отрицательные и нулевые веса не считаются)', () => {
  assert.equal(M.exerciseVolume(ex('strength', [[0, 10], [2.5, 10], [5, 10]])), 75);
  assert.equal(M.exerciseVolume(ex('assisted', [[-50, 8], [-40, 8], [-30, 8]])), 0);
  assert.equal(M.exerciseVolume(ex('strength', [[10, 0], [null, 10], [12, null]])), 0);
  assert.equal(M.exerciseVolume({ type: 'cardio', cardio: { min: 5 } }), 0);
});

test('объём тренировки: сумма по упражнениям, подход с нулевым весом не добавляет объём', () => {
  const rows = [[0, 12, 10, 12, 20, 10], [30, 10, 35, 8, 40, 6], [12.5, 12, 15, 10, 0, 15]];
  const s = sess('a', '2025-03-03', rows.map(v => ex('strength', [[v[0], v[1]], [v[2], v[3]], [v[4], v[5]]])));
  const st = M.sessionStats(s);
  // 120+200 + 300+280+240 + 150+150 = 1440
  assert.equal(st.volume, 1440);
  assert.equal(st.sets, 9);
});

test('1ПМ по Эпли', () => {
  assert.equal(M.epley(100, 10), 133.3);
  assert.equal(M.epley(100, 1), 100);
  assert.equal(M.epley(0, 10), 0);
  assert.equal(M.epley(-40, 10), 0);
});

test('рекорды: сравнение только с более ранними завершёнными тренировками', () => {
  const a = sess('a', '2026-01-05', [ex('strength', [[40, 10]])]);
  const b = sess('b', '2026-01-12', [ex('strength', [[42.5, 8]])]);
  const draft = sess('d', '2026-01-10', [ex('strength', [[100, 10]])], { status: 'draft' });
  const state = { sessions: [a, b, draft] };
  const prs = M.detectPRs(state, b);
  assert.equal(prs.length, 1);
  assert.equal(prs[0].kind, 'weight');
  assert.equal(prs[0].value, 42.5);
  assert.equal(M.detectPRs(state, a).length, 0, 'у первой тренировки нет рекорда');
  // гравитрон: меньше помощи = рекорд
  const g1 = sess('g1', '2026-01-05', [ex('assisted', [[-50, 8]])]);
  const g2 = sess('g2', '2026-01-12', [ex('assisted', [[-40, 8]])]);
  const gp = M.detectPRs({ sessions: [g1, g2] }, g2);
  assert.equal(gp.length, 1); assert.equal(gp[0].value, -40);
  const recs = M.personalRecords(state);
  assert.equal(recs[0].maxW, 42.5);
});

test('даты: неделя с понедельника, номера недель от начала программы', () => {
  assert.equal(C.mondayOf('2026-03-05'), '2026-03-02');
  assert.equal(C.mondayOf('2026-03-02'), '2026-03-02');
  assert.equal(C.mondayOf('2026-03-08'), '2026-03-02');
  assert.equal(C.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(C.addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(C.weekNumber('2026-02-16', '2026-02-16'), 1);
  assert.equal(C.weekNumber('2026-02-22', '2026-02-16'), 1);
  assert.equal(C.weekNumber('2026-03-05', '2026-02-25'), 2);
  assert.equal(C.weekStart(2, '2026-02-16'), '2026-02-23');
  assert.equal(C.diffDays('2026-03-30', '2026-03-29'), 1, 'переход на летнее время не ломает арифметику');
  assert.equal(C.isDateStr('2026-02-30'), false);
});

test('серии: недели подряд и рекорд серии', () => {
  const d = ['2026-03-03', '2026-02-25', '2026-02-17', '2026-02-03'];
  assert.equal(M.streakWeeks(d, '2026-03-05'), 3);
  assert.equal(M.streakWeeks(['2026-02-25', '2026-02-17'], '2026-03-05'), 2, 'текущая неделя ещё не потеряна');
  assert.equal(M.streakWeeks(['2026-02-11'], '2026-03-05'), 0);
  assert.equal(M.longestStreakWeeks(['2026-01-05', '2026-01-12', '2026-01-19', '2026-03-02']), 3);
  assert.equal(M.streakDays(['2026-03-04', '2026-03-03'], '2026-03-05'), 2);
});

test('разбор кардио-строк из таблицы', () => {
  assert.deepEqual(M.parseCardio('20 мин 2.5 180 ккал'), { min: 20, km: 2.5, kcal: 180 });
  assert.deepEqual(M.parseCardio('15 минут 1,8 км 120ккал'), { min: 15, km: 1.8, kcal: 120 });
  assert.deepEqual(M.parseCardio('12мин 1.3 95 ккал'), { min: 12, km: 1.3, kcal: 95 });
  assert.deepEqual(M.parseCardio(''), { min: null, km: null, kcal: null });
});

test('линейный тренд', () => {
  const t = M.linearTrend([{ x: 0, y: 80 }, { x: 7, y: 79.3 }, { x: 14, y: 78.6 }]);
  assert.ok(Math.abs(t.slope + 0.1) < 1e-9);
});

test('числа: запятая как десятичный разделитель', () => {
  assert.equal(C.parseNum('2,5'), 2.5);
  assert.equal(C.parseNum(' -41 '), -41);
  assert.equal(C.parseNum('abc'), null);
});
