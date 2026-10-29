/* Дневник тренировок — модель и расчёты (без DOM). */
(function (root) {
  'use strict';
  var WD = root.WD = root.WD || {};
  var C = WD.core;

  var TYPES = {
    strength: { label: 'Силовое', hint: 'вес × повторы' },
    bodyweight: { label: 'Собственный вес', hint: 'доп. вес × повторы' },
    assisted: { label: 'Гравитрон (помощь)', hint: 'помощь, кг × повторы' },
    cardio: { label: 'Кардио', hint: 'минуты, км, ккал' }
  };

  function isNum(n) { return typeof n === 'number' && isFinite(n); }
  /** Подход засчитан, если указаны повторы > 0. */
  function isValidSet(s) { return !!s && isNum(s.r) && s.r > 0; }
  /** Объём подхода: только положительный вес (помощь гравитрона и 0 не дают «тоннажа»). */
  function setVolume(s) { return isValidSet(s) && isNum(s.w) && s.w > 0 ? s.w * s.r : 0; }
  /** Оценка 1ПМ по формуле Эпли. */
  function epley(w, r) {
    if (!isNum(w) || !isNum(r) || w <= 0 || r <= 0) return 0;
    if (r === 1) return w;
    return C.round(w * (1 + r / 30), 1);
  }
  function exerciseVolume(ex) {
    if (!ex || ex.type === 'cardio' || !ex.sets) return 0;
    return C.round(ex.sets.reduce(function (a, s) { return a + setVolume(s); }, 0), 2);
  }
  function exerciseSummary(ex) {
    var res = { sets: 0, reps: 0, volume: 0, maxW: null, maxE1rm: 0, maxReps: 0 };
    if (!ex || ex.type === 'cardio') return res;
    (ex.sets || []).forEach(function (s) {
      if (!isValidSet(s)) return;
      var w = isNum(s.w) ? s.w : 0;
      res.sets++; res.reps += s.r; res.volume += setVolume(s);
      if (res.maxW === null || w > res.maxW) res.maxW = w;
      res.maxE1rm = Math.max(res.maxE1rm, epley(w, s.r));
      res.maxReps = Math.max(res.maxReps, s.r);
    });
    res.volume = C.round(res.volume, 2);
    return res;
  }
  function sessionStats(sess) {
    var st = { volume: 0, sets: 0, reps: 0, exercises: 0, cardioMin: 0, cardioKm: 0, cardioKcal: 0 };
    if (!sess) return st;
    (sess.exercises || []).forEach(function (ex) {
      if (ex.type === 'cardio') {
        var c = ex.cardio || {};
        if (isNum(c.min)) st.cardioMin += c.min;
        if (isNum(c.km)) st.cardioKm += c.km;
        if (isNum(c.kcal)) st.cardioKcal += c.kcal;
        return;
      }
      var s = exerciseSummary(ex);
      if (s.sets) st.exercises++;
      st.sets += s.sets; st.reps += s.reps; st.volume += s.volume;
    });
    st.volume = C.round(st.volume, 2);
    st.cardioKm = C.round(st.cardioKm, 2);
    return st;
  }

  function exKey(ex) { return C.nameKey(ex && ex.name); }
  function doneSessions(state) {
    return (state.sessions || []).filter(function (s) { return s.status === 'done'; })
      .slice().sort(cmpSession);
  }
  function cmpSession(a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.startedAt || 0) - (b.startedAt || 0);
  }

  /** История упражнения по завершённым тренировкам. */
  function exerciseHistory(state, key) {
    var out = [];
    doneSessions(state).forEach(function (sess) {
      (sess.exercises || []).forEach(function (ex) {
        if (ex.type === 'cardio' || exKey(ex) !== key) return;
        var s = exerciseSummary(ex);
        if (!s.sets) return;
        out.push({ date: sess.date, sessionId: sess.id, type: ex.type, maxW: s.maxW, e1rm: s.maxE1rm, volume: s.volume, maxReps: s.maxReps, sets: s.sets });
      });
    });
    return out;
  }

  /** Список всех упражнений с историей (для выбора на экране прогресса). */
  function exerciseCatalog(state) {
    var map = {}, list = [];
    function add(name, type, group) {
      var k = C.nameKey(name);
      if (!k || type === 'cardio' || map[k]) return;
      map[k] = { key: k, name: String(name).trim(), type: type, group: group, count: 0 };
      list.push(map[k]);
    }
    ((state.program && state.program.days) || []).forEach(function (d) {
      d.exercises.forEach(function (e) { add(e.name, e.type, d.name + (d.title ? ' — ' + d.title : '')); });
    });
    doneSessions(state).forEach(function (sess) {
      sess.exercises.forEach(function (e) {
        add(e.name, e.type, 'Из истории');
        var k = C.nameKey(e.name);
        if (map[k] && e.type !== 'cardio' && exerciseSummary(e).sets) map[k].count++;
      });
    });
    return list;
  }

  function bestOf(hist, type) {
    var b = { maxW: null, e1rm: 0, maxReps: 0, volume: 0 };
    hist.forEach(function (h) {
      if (b.maxW === null || h.maxW > b.maxW) b.maxW = h.maxW;
      b.e1rm = Math.max(b.e1rm, h.e1rm);
      b.volume = Math.max(b.volume, h.volume);
      b.maxReps = Math.max(b.maxReps, h.maxReps);
    });
    return b;
  }

  /**
   * Личные рекорды, достигнутые в тренировке (по сравнению с более ранними завершёнными).
   * Первое выполнение упражнения рекордом не считается.
   */
  function detectPRs(state, sess) {
    var prs = [];
    var earlier = doneSessions(state).filter(function (s) {
      return s.id !== sess.id && cmpSession(s, sess) < 0;
    });
    var tmp = { sessions: earlier };
    (sess.exercises || []).forEach(function (ex) {
      if (ex.type === 'cardio') return;
      var cur = exerciseSummary(ex);
      if (!cur.sets) return;
      var hist = exerciseHistory(tmp, exKey(ex));
      if (!hist.length) return;
      var best = bestOf(hist, ex.type);
      var pushed = false;
      if (cur.maxW !== null && best.maxW !== null && cur.maxW > best.maxW && (cur.maxW > 0 || ex.type === 'assisted')) {
        prs.push({ name: ex.name, kind: 'weight', value: cur.maxW, prev: best.maxW, type: ex.type }); pushed = true;
      }
      if (!pushed && cur.maxE1rm > 0 && cur.maxE1rm > best.e1rm) {
        prs.push({ name: ex.name, kind: 'e1rm', value: cur.maxE1rm, prev: best.e1rm, type: ex.type }); pushed = true;
      }
      if (!pushed && (ex.type === 'bodyweight' || cur.maxW === 0) && cur.maxReps > best.maxReps) {
        prs.push({ name: ex.name, kind: 'reps', value: cur.maxReps, prev: best.maxReps, type: ex.type });
      }
    });
    return prs;
  }

  /** Таблица рекордов по всем упражнениям. */
  function personalRecords(state) {
    var cat = exerciseCatalog(state);
    var out = [];
    cat.forEach(function (c) {
      var hist = exerciseHistory(state, c.key);
      if (!hist.length) return;
      var r = { key: c.key, name: c.name, type: c.type, maxW: null, maxWDate: null, e1rm: 0, e1rmDate: null, maxReps: 0, volume: 0, count: hist.length };
      hist.forEach(function (h) {
        if (r.maxW === null || h.maxW > r.maxW) { r.maxW = h.maxW; r.maxWDate = h.date; }
        if (h.e1rm > r.e1rm) { r.e1rm = h.e1rm; r.e1rmDate = h.date; }
        r.maxReps = Math.max(r.maxReps, h.maxReps);
        r.volume = Math.max(r.volume, h.volume);
      });
      out.push(r);
    });
    return out;
  }

  /** Серия недель подряд с ≥1 тренировкой (текущая неделя может быть ещё пустой). */
  function streakWeeks(dates, todayStr) {
    var set = {};
    dates.forEach(function (d) { if (C.isDateStr(d)) set[C.mondayOf(d)] = true; });
    var w = C.mondayOf(todayStr);
    if (!set[w]) w = C.addDays(w, -7);
    var n = 0;
    while (set[w]) { n++; w = C.addDays(w, -7); }
    return n;
  }
  /** Серия дней подряд (сегодня или вчера должна быть тренировка). */
  function streakDays(dates, todayStr) {
    var set = {};
    dates.forEach(function (d) { set[d] = true; });
    var d = todayStr;
    if (!set[d]) d = C.addDays(d, -1);
    var n = 0;
    while (set[d]) { n++; d = C.addDays(d, -1); }
    return n;
  }
  function longestStreakWeeks(dates) {
    var mons = {};
    dates.forEach(function (d) { if (C.isDateStr(d)) mons[C.dayNum(C.mondayOf(d))] = true; });
    var keys = Object.keys(mons).map(Number).sort(function (a, b) { return a - b; });
    var best = 0, cur = 0, prev = null;
    keys.forEach(function (k) { cur = prev !== null && k - prev === 7 ? cur + 1 : 1; best = Math.max(best, cur); prev = k; });
    return best;
  }

  /** Недельные агрегаты за последние n недель. */
  function weeklyBuckets(state, n, todayStr) {
    var start = C.addDays(C.mondayOf(todayStr), -7 * (n - 1));
    var buckets = [];
    for (var i = 0; i < n; i++) buckets.push({ monday: C.addDays(start, i * 7), volume: 0, count: 0, sets: 0 });
    doneSessions(state).forEach(function (s) {
      var idx = Math.floor(C.diffDays(C.mondayOf(s.date), start) / 7);
      if (idx < 0 || idx >= n) return;
      var st = sessionStats(s);
      buckets[idx].volume += st.volume; buckets[idx].count++; buckets[idx].sets += st.sets;
    });
    buckets.forEach(function (b) { b.volume = C.round(b.volume, 1); });
    return buckets;
  }

  /** Линейная регрессия y = a + b·x. */
  function linearTrend(points) {
    var n = points.length;
    if (n < 2) return null;
    var sx = 0, sy = 0, sxx = 0, sxy = 0;
    points.forEach(function (p) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; });
    var den = n * sxx - sx * sx;
    if (!den) return null;
    var b = (n * sxy - sx * sy) / den;
    return { slope: b, intercept: (sy - b * sx) / n };
  }

  /** Вес тела: из тренировок и отдельных записей, по датам. */
  function bodyWeightSeries(state) {
    var byDate = {};
    (state.sessions || []).forEach(function (s) {
      if (s.status === 'done' && isNum(s.bodyWeight) && s.bodyWeight > 0) byDate[s.date] = s.bodyWeight;
    });
    (state.bodyLog || []).forEach(function (b) { if (isNum(b.weight) && b.weight > 0) byDate[b.date] = b.weight; });
    return Object.keys(byDate).sort().map(function (d) { return { date: d, weight: byDate[d] }; });
  }

  /** Разбор строки кардио: «20 мин 2.5 180 ккал», «15 минут 1.8 км 120ккал». */
  function parseCardio(text) {
    var res = { min: null, km: null, kcal: null };
    if (!text) return res;
    var s = String(text).toLowerCase().replace(/,/g, '.');
    var m;
    if ((m = /(\d+(?:\.\d+)?)\s*мин/.exec(s))) { res.min = +m[1]; s = s.replace(m[0], ' '); }
    if ((m = /(\d+(?:\.\d+)?)\s*(?:ккал|kcal|кал)/.exec(s))) { res.kcal = +m[1]; s = s.replace(m[0], ' '); }
    if ((m = /(\d+(?:\.\d+)?)\s*(?:км|km)/.exec(s))) { res.km = +m[1]; s = s.replace(m[0], ' '); }
    var rest = s.match(/\d+(?:\.\d+)?/g) || [];
    rest.forEach(function (v) {
      var n = +v;
      if (res.km === null && v.indexOf('.') >= 0) res.km = n;
      else if (res.min === null) res.min = n;
      else if (res.km === null) res.km = n;
      else if (res.kcal === null) res.kcal = n;
    });
    return res;
  }
  function cardioText(c) {
    if (!c) return '';
    var p = [];
    if (isNum(c.min)) p.push(C.fmtNum(c.min) + ' мин');
    if (isNum(c.km)) p.push(C.fmtNum(c.km, c.km % 1 ? 2 : 0) + ' км');
    if (isNum(c.kcal)) p.push(C.fmtNum(c.kcal) + ' ккал');
    return p.join(' · ');
  }

  /** Отображение веса с учётом типа упражнения. */
  function fmtWeight(w, type) {
    if (!isNum(w)) return '—';
    if (type === 'assisted' || w < 0) return '\u2212' + C.fmtNum(Math.abs(w)) + ' кг помощь';
    if (w === 0) return type === 'bodyweight' ? 'свой вес' : '0 кг';
    return C.fmtNum(w) + ' кг';
  }
  function fmtSet(s, type) {
    if (!s || (!isNum(s.w) && !isNum(s.r))) return '—';
    var w = isNum(s.w) ? s.w : 0;
    var ws = type === 'assisted' || w < 0 ? '\u2212' + C.fmtNum(Math.abs(w)) : C.fmtNum(w);
    return ws + '\u00d7' + (isNum(s.r) ? s.r : '?');
  }

  /** Последняя завершённая тренировка того же дня программы (до даты). */
  function previousSession(state, dayId, beforeDate, excludeId) {
    var list = doneSessions(state).filter(function (s) {
      return s.dayId === dayId && s.id !== excludeId && (!beforeDate || s.date <= beforeDate);
    });
    return list.length ? list[list.length - 1] : null;
  }
  function findPrevExercise(prevSess, ex) {
    if (!prevSess) return null;
    var k = exKey(ex);
    var byId = null, byName = null;
    prevSess.exercises.forEach(function (e) {
      if (ex.exId && e.exId === ex.exId && !byId) byId = e;
      if (exKey(e) === k && !byName) byName = e;
    });
    return byName || byId;
  }
  /** Предложение следующего дня программы по ротации. */
  function suggestNextDay(state) {
    var days = (state.program && state.program.days) || [];
    if (!days.length) return null;
    var done = doneSessions(state);
    if (!done.length) return days[0].id;
    var last = done[done.length - 1];
    var idx = -1;
    days.forEach(function (d, i) { if (d.id === last.dayId) idx = i; });
    return days[(idx + 1) % days.length].id;
  }

  /** Новая тренировка по дню программы. */
  function newSessionFromDay(day, date, now) {
    return {
      id: C.uid('s'), date: date, dayId: day.id, dayName: day.name + (day.title ? ' — ' + day.title : ''),
      status: 'draft', startedAt: now || Date.now(), finishedAt: null, durationSec: null,
      bodyWeight: null, feeling: null, notes: '',
      exercises: day.exercises.map(function (e) { return blankExercise(e); })
    };
  }
  function blankExercise(e) {
    var ex = { exId: e.id || e.exId || null, name: e.name, type: e.type, note: '' };
    if (e.type === 'cardio') { ex.cardio = { min: null, km: null, kcal: null }; ex.sets = []; }
    else {
      var n = e.sets && typeof e.sets === 'object' ? e.sets.length : e.sets;
      n = C.clamp(Math.round(n || 3), 1, 20);
      ex.sets = [];
      for (var i = 0; i < n; i++) ex.sets.push({ w: null, r: null, done: false });
    }
    return ex;
  }
  /** Копия тренировки как шаблон на новую дату (значения переносятся, отметки сбрасываются). */
  function copySession(sess, date, now) {
    return {
      id: C.uid('s'), date: date, dayId: sess.dayId, dayName: sess.dayName, status: 'draft',
      startedAt: now || Date.now(), finishedAt: null, durationSec: null, bodyWeight: null, feeling: null, notes: '',
      exercises: sess.exercises.map(function (e) {
        var ex = { exId: e.exId, name: e.name, type: e.type, note: '' };
        if (e.type === 'cardio') { ex.cardio = { min: e.cardio ? e.cardio.min : null, km: e.cardio ? e.cardio.km : null, kcal: e.cardio ? e.cardio.kcal : null }; ex.sets = []; }
        else ex.sets = e.sets.map(function (s) { return { w: s.w, r: s.r, done: false }; });
        return ex;
      })
    };
  }

  WD.model = {
    TYPES: TYPES, isValidSet: isValidSet, setVolume: setVolume, epley: epley, exerciseVolume: exerciseVolume,
    exerciseSummary: exerciseSummary, sessionStats: sessionStats, exKey: exKey, doneSessions: doneSessions,
    cmpSession: cmpSession, exerciseHistory: exerciseHistory, exerciseCatalog: exerciseCatalog, detectPRs: detectPRs,
    personalRecords: personalRecords, streakWeeks: streakWeeks, streakDays: streakDays, longestStreakWeeks: longestStreakWeeks,
    weeklyBuckets: weeklyBuckets, linearTrend: linearTrend, bodyWeightSeries: bodyWeightSeries, parseCardio: parseCardio,
    cardioText: cardioText, fmtWeight: fmtWeight, fmtSet: fmtSet, previousSession: previousSession,
    findPrevExercise: findPrevExercise, suggestNextDay: suggestNextDay, newSessionFromDay: newSessionFromDay,
    blankExercise: blankExercise, copySession: copySession
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = WD;
})(typeof window !== 'undefined' ? window : globalThis);
