/* Дневник тренировок — программа по умолчанию (шаблон из таблицы) и демо-данные. */
(function (root) {
  'use strict';
  var WD = root.WD = root.WD || {};
  var C = WD.core;

  // Только названия дней и упражнений — без чьих-либо весов и повторов.
  var TEMPLATE = [
    { id: 'd1', name: 'День 1', title: 'Грудные, руки (бицепс, трицепс)', exercises: [
      ['Сгибание туловища в станке', 'strength'],
      ['Разгибание спины в станке', 'strength'],
      ['Жим на наклонной скамье в тренажёре Смита', 'strength'],
      ['Жим гантелями лёжа на горизонтальной скамье', 'strength'],
      ['Сведение рук сидя в тренажёре (бабочка)', 'strength'],
      ['Подъём гантелей на наклонной скамье на бицепс', 'strength'],
      ['Жим рукоятки на трицепс в кроссовере', 'strength'],
      ['Подъём штанги на бицепс стоя', 'strength'],
      ['Французский жим лёжа гантелями на горизонтальной скамье', 'strength'],
      ['Кардио', 'cardio']
    ] },
    { id: 'd2', name: 'День 2', title: 'Ноги', exercises: [
      ['Подъём ног в висе на шведской стенке на пресс', 'bodyweight'],
      ['Разгибание спины в станке', 'strength'],
      ['Разгибание ног сидя в тренажёре', 'strength'],
      ['Приседания в маятниковом тренажёре', 'strength'],
      ['Жим ногами сидя в тренажёре', 'strength'],
      ['Сгибание ног сидя в станке', 'strength'],
      ['Икроножные сидя в тренажёре', 'strength'],
      ['Кардио', 'cardio']
    ] },
    { id: 'd3', name: 'День 3', title: 'Спина', exercises: [
      ['Подъём туловища лёжа на скамье', 'bodyweight'],
      ['Разгибание спины в станке', 'strength'],
      ['Подтягивание в гравитроне', 'assisted'],
      ['Горизонтальная тяга в тренажёре', 'strength'],
      ['Вертикальная тяга в хаммере', 'strength'],
      ['Жим сидя в тренажёре на дельты', 'strength'],
      ['Разведение рук сидя в тренажёре', 'strength'],
      ['Разведение рук сидя в тренажёре (обратная бабочка)', 'strength'],
      ['Кардио', 'cardio']
    ] }
  ];

  function defaultProgram() {
    return {
      name: 'Моя программа',
      days: TEMPLATE.map(function (d) {
        return {
          id: d.id, name: d.name, title: d.title,
          exercises: d.exercises.map(function (e, i) {
            return { id: d.id + '-e' + (i + 1), name: e[0], type: e[1], sets: e[1] === 'cardio' ? 1 : 3 };
          })
        };
      })
    };
  }

  /** Детерминированный ГПСЧ (mulberry32) — демо одинаковое при каждой загрузке. */
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /**
   * Явно вымышленная история: 8 недель по 3 тренировки, плавная прогрессия.
   * Стартовые веса — круглые «учебные» числа, не данные пользователя.
   */
  function demoSessions(program, todayStr, weeks) {
    weeks = weeks || 8;
    var rand = rng(20240607);
    var start = C.addDays(C.mondayOf(todayStr), -7 * (weeks - 1)); // включая текущую неделю
    var base = {};
    var sessions = [];
    var bw = 76.0;
    for (var w = 0; w < weeks; w++) {
      program.days.forEach(function (day, di) {
        if (rand() < 0.08) return; // иногда пропуск
        var date = C.addDays(start, w * 7 + di * 2);
        if (date >= todayStr) return; // сегодня оставляем пользователю
        bw = C.round(bw - 0.12 + (rand() - 0.5) * 0.5, 1);
        var startedAt = new Date(date + 'T18:30:00').getTime();
        var dur = 3000 + Math.floor(rand() * 1500);
        var sess = {
          id: 'demo-' + date + '-' + day.id, date: date, dayId: day.id,
          dayName: day.name + (day.title ? ' — ' + day.title : ''), status: 'done',
          startedAt: startedAt, finishedAt: startedAt + dur * 1000, durationSec: dur,
          bodyWeight: di === 0 ? bw : null, feeling: 3 + Math.floor(rand() * 3), notes: 'Демо-данные (вымышленные)',
          exercises: day.exercises.map(function (e, ei) {
            var ex = { exId: e.id, name: e.name, type: e.type, note: '' };
            if (e.type === 'cardio') {
              var min = 8 + Math.floor(rand() * 8);
              ex.cardio = { min: min, km: C.round(min * (0.11 + rand() * 0.03), 2), kcal: Math.round(min * (9 + rand() * 3)) };
              ex.sets = [];
              return ex;
            }
            var k = day.id + ei;
            if (base[k] == null) base[k] = e.type === 'assisted' ? -40 : e.type === 'bodyweight' ? 0 : 10 + 5 * Math.floor(rand() * 6);
            var b = base[k] + (e.type === 'assisted' ? 1 : e.type === 'bodyweight' ? 0 : 2.5) * w;
            ex.sets = [];
            for (var si = 0; si < (e.sets || 3); si++) {
              var wt = e.type === 'bodyweight' ? 0 : C.round(Math.round((b + (e.type === 'assisted' ? si * 3 : si * 2.5)) / 2.5) * 2.5, 2);
              if (e.type === 'assisted') wt = Math.min(-5, wt);
              ex.sets.push({ w: wt, r: e.type === 'bodyweight' ? 12 + Math.floor(w / 2) + (si === 2 ? -2 : 0) : 12 - si * 2 + (rand() < 0.2 ? 1 : 0), done: true });
            }
            return ex;
          })
        };
        sessions.push(sess);
      });
    }
    return sessions;
  }

  WD.seed = { TEMPLATE: TEMPLATE, defaultProgram: defaultProgram, demoSessions: demoSessions, rng: rng };
  if (typeof module !== 'undefined' && module.exports) module.exports = WD;
})(typeof window !== 'undefined' ? window : globalThis);
