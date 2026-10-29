/* Дневник тренировок — схема данных, миграции, санитизация, localStorage. */
(function (root) {
  'use strict';
  var WD = root.WD = root.WD || {};
  var C = WD.core;

  var VERSION = 2;
  var KEY = 'workout-diary:data';
  var LEGACY_KEY = 'workout-diary:v1';
  var THEME_KEY = 'workout-diary:theme';
  var LIMITS = { days: 30, exercises: 60, sets: 20, sessions: 20000, bodyLog: 20000, str: 200, note: 2000 };
  var ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
  var TYPE_SET = { strength: 1, bodyweight: 1, assisted: 1, cardio: 1 };

  function defaultSettings() {
    return { theme: 'auto', restSeconds: 90, autoRest: true, vibrate: true, beep: false, weightStep: 2.5, wakeLock: true, programStart: C.mondayOf(C.today()) };
  }
  function defaultState() {
    return { version: VERSION, settings: defaultSettings(), program: WD.seed.defaultProgram(), sessions: [], bodyLog: [], meta: { created: Date.now(), updated: Date.now(), demo: false, welcomed: false } };
  }

  // ---------- примитивы санитизации ----------
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function str(v, max) {
    if (typeof v !== 'string') return typeof v === 'number' && isFinite(v) ? String(v) : '';
    // убираем управляющие символы (кроме переводов строк)
    return v.replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max || LIMITS.str).trim();
  }
  function num(v, min, max) {
    var n = typeof v === 'string' ? C.parseNum(v) : v;
    if (typeof n !== 'number' || !isFinite(n)) return null;
    if (n < min || n > max) return null;
    return Math.round(n * 1000) / 1000;
  }
  function id(v, prefix) { return typeof v === 'string' && ID_RE.test(v) ? v : C.uid(prefix); }
  function date(v) { return C.isDateStr(v) ? v : null; }
  function arr(v, max) { return Array.isArray(v) ? v.slice(0, max) : []; }
  function bool(v) { return v === true; }
  function ts(v) { var n = num(v, 0, 8.64e15); return n === null ? null : Math.round(n); }

  function sanitizeSettings(s) {
    var d = defaultSettings();
    if (!isObj(s)) return d;
    var themes = { auto: 1, light: 1, dark: 1 };
    var steps = [0.5, 1, 1.25, 2, 2.5, 5, 10];
    return {
      theme: themes[s.theme] ? s.theme : d.theme,
      restSeconds: num(s.restSeconds, 30, 180) !== null ? Math.round(s.restSeconds) : d.restSeconds,
      autoRest: s.autoRest === undefined ? d.autoRest : bool(s.autoRest),
      vibrate: s.vibrate === undefined ? d.vibrate : bool(s.vibrate),
      beep: bool(s.beep),
      weightStep: steps.indexOf(s.weightStep) >= 0 ? s.weightStep : d.weightStep,
      wakeLock: s.wakeLock === undefined ? d.wakeLock : bool(s.wakeLock),
      programStart: date(s.programStart) || d.programStart
    };
  }
  function sanitizeProgram(p) {
    if (!isObj(p)) return WD.seed.defaultProgram();
    var seen = {};
    function uniq(v, prefix) { var x = id(v, prefix); while (seen[x]) x = C.uid(prefix); seen[x] = 1; return x; }
    return {
      name: str(p.name) || 'Моя программа',
      days: arr(p.days, LIMITS.days).filter(isObj).map(function (d, i) {
        return {
          id: uniq(d.id, 'd'), name: str(d.name, 60) || ('День ' + (i + 1)), title: str(d.title),
          exercises: arr(d.exercises, LIMITS.exercises).filter(isObj).map(function (e) {
            var type = TYPE_SET[e.type] ? e.type : 'strength';
            var sets = num(e.sets, 1, LIMITS.sets);
            return { id: uniq(e.id, 'e'), name: str(e.name) || 'Упражнение', type: type, sets: type === 'cardio' ? 1 : (sets === null ? 3 : Math.round(sets)) };
          })
        };
      })
    };
  }
  function sanitizeSet(s) {
    if (Array.isArray(s)) s = { w: s[0], r: s[1], done: true };
    if (!isObj(s)) return { w: null, r: null, done: false };
    var r = num(s.r, 0, 1000);
    return { w: num(s.w, -500, 1500), r: r === null ? null : Math.round(r), done: bool(s.done) };
  }
  function sanitizeExercise(e) {
    var type = TYPE_SET[e.type] ? e.type : 'strength';
    var ex = { exId: typeof e.exId === 'string' && ID_RE.test(e.exId) ? e.exId : null, name: str(e.name) || 'Упражнение', type: type, note: str(e.note, LIMITS.note) };
    if (type === 'cardio') {
      var c = isObj(e.cardio) ? e.cardio : {};
      ex.cardio = { min: num(c.min, 0, 1440), km: num(c.km, 0, 1000), kcal: num(c.kcal, 0, 100000) };
      ex.sets = [];
    } else {
      ex.sets = arr(e.sets, LIMITS.sets).map(sanitizeSet);
    }
    return ex;
  }
  function sanitizeSession(s) {
    if (!isObj(s)) return null;
    var d = date(s.date);
    if (!d) return null;
    var fe = num(s.feeling, 1, 5);
    return {
      id: id(s.id, 's'), date: d, dayId: typeof s.dayId === 'string' && ID_RE.test(s.dayId) ? s.dayId : null,
      dayName: str(s.dayName), status: s.status === 'draft' ? 'draft' : 'done',
      startedAt: ts(s.startedAt), finishedAt: ts(s.finishedAt),
      durationSec: num(s.durationSec, 0, 86400) === null ? null : Math.round(s.durationSec),
      bodyWeight: num(s.bodyWeight, 20, 400), feeling: fe === null ? null : Math.round(fe),
      notes: str(s.notes, LIMITS.note),
      exercises: arr(s.exercises, LIMITS.exercises).filter(isObj).map(sanitizeExercise)
    };
  }
  function sanitizeBody(b) {
    if (!isObj(b)) return null;
    var d = date(b.date), w = num(b.weight, 20, 400);
    if (!d || w === null) return null;
    return { id: id(b.id, 'b'), date: d, weight: w, note: str(b.note) };
  }
  function uniqueById(list) {
    var seen = {};
    return list.filter(function (x) { if (!x || seen[x.id]) return false; seen[x.id] = 1; return true; });
  }
  /** Полная санитизация состояния текущей версии (создаются только новые объекты). */
  function sanitizeState(raw) {
    if (!isObj(raw)) return defaultState();
    var meta = isObj(raw.meta) ? raw.meta : {};
    return {
      version: VERSION,
      settings: sanitizeSettings(raw.settings),
      program: sanitizeProgram(raw.program),
      sessions: uniqueById(arr(raw.sessions, LIMITS.sessions).map(sanitizeSession)),
      bodyLog: uniqueById(arr(raw.bodyLog, LIMITS.bodyLog).map(sanitizeBody)),
      meta: { created: ts(meta.created) || Date.now(), updated: ts(meta.updated) || Date.now(), demo: bool(meta.demo), welcomed: bool(meta.welcomed) }
    };
  }

  // ---------- миграции ----------
  /*
   * v1 (ранний формат): { version: 1, days: [{ id, name, exercises: [{ id, name, kind }] }],
   *   workouts: [{ date, day, items: [{ ex, sets: [[w, r], ...], text }] }], weights: { 'YYYY-MM-DD': 80 } }
   */
  var MIGRATIONS = {
    1: function (v1) {
      var kindMap = { weight: 'strength', bw: 'bodyweight', assist: 'assisted', cardio: 'cardio' };
      var days = arr(v1.days, LIMITS.days).filter(isObj).map(function (d) {
        var full = str(d.name), m = /^(.*?)\s*[-—–]\s*(.*)$/.exec(full);
        return { id: d.id, name: m ? m[1] : full, title: m ? m[2] : '', exercises: arr(d.exercises, LIMITS.exercises).filter(isObj).map(function (e) {
          return { id: e.id, name: e.name, type: kindMap[e.kind] || 'strength', sets: 3 };
        }) };
      });
      var exIndex = {};
      days.forEach(function (d) { d.exercises.forEach(function (e) { exIndex[e.id] = e; }); });
      var dayIndex = {};
      days.forEach(function (d) { dayIndex[d.id] = d; });
      var sessions = arr(v1.workouts, LIMITS.sessions).filter(isObj).map(function (w, i) {
        var day = dayIndex[w.day] || null;
        return {
          id: 'v1-' + i, date: w.date, dayId: day ? day.id : null, dayName: day ? day.name + (day.title ? ' — ' + day.title : '') : '',
          status: 'done', exercises: arr(w.items, LIMITS.exercises).filter(isObj).map(function (it) {
            var e = exIndex[it.ex] || { id: it.ex, name: it.name || 'Упражнение', type: 'strength' };
            var out = { exId: e.id, name: e.name, type: e.type };
            if (e.type === 'cardio') { var c = WD.model.parseCardio(it.text); out.cardio = c; }
            else out.sets = arr(it.sets, LIMITS.sets);
            return out;
          })
        };
      });
      var weights = isObj(v1.weights) ? v1.weights : {};
      var bodyLog = Object.keys(weights).slice(0, LIMITS.bodyLog).map(function (d, i) { return { id: 'v1b-' + i, date: d, weight: weights[d] }; });
      return { version: 2, settings: {}, program: { name: 'Моя программа', days: days }, sessions: sessions, bodyLog: bodyLog, meta: { welcomed: true } };
    }
  };
  /** Приводит любые сохранённые данные к текущей версии. Бросает ошибку для версий новее текущей. */
  function migrate(raw) {
    if (!isObj(raw)) throw new Error('Данные должны быть объектом');
    var v = raw.version === undefined ? 1 : raw.version;
    if (typeof v !== 'number' || !isFinite(v) || v < 1 || Math.floor(v) !== v) throw new Error('Неизвестная версия данных');
    if (v > VERSION) throw new Error('Данные созданы более новой версией приложения (v' + v + ')');
    var cur = raw;
    while (v < VERSION) { cur = MIGRATIONS[v](cur); v++; }
    return sanitizeState(cur);
  }

  // ---------- localStorage ----------
  function getStorage() {
    try { return root.localStorage || null; } catch (e) { return null; }
  }
  function load(storage) {
    storage = storage || getStorage();
    if (!storage) return { state: defaultState(), error: 'storage-unavailable' };
    var raw = null, src = KEY;
    try {
      raw = storage.getItem(KEY);
      if (!raw) { raw = storage.getItem(LEGACY_KEY); src = LEGACY_KEY; }
    } catch (e) { return { state: defaultState(), error: 'storage-unavailable' }; }
    if (!raw) return { state: defaultState(), fresh: true };
    try {
      var state = migrate(JSON.parse(raw));
      if (src === LEGACY_KEY) { save(state, storage); }
      return { state: state, migratedFrom: src === LEGACY_KEY ? 1 : null };
    } catch (e) {
      // повреждённые данные не теряем: сохраняем копию
      try { storage.setItem(KEY + ':corrupt-' + Date.now(), raw); } catch (e2) { /* ignore */ }
      return { state: defaultState(), error: 'corrupt' };
    }
  }
  function save(state, storage) {
    storage = storage || getStorage();
    if (!storage) return false;
    try {
      state.meta.updated = Date.now();
      storage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) { return false; }
  }

  WD.storage = {
    VERSION: VERSION, KEY: KEY, LEGACY_KEY: LEGACY_KEY, THEME_KEY: THEME_KEY, LIMITS: LIMITS,
    defaultState: defaultState, defaultSettings: defaultSettings, sanitizeSettings: sanitizeSettings, sanitizeState: sanitizeState,
    sanitizeSession: sanitizeSession, sanitizeProgram: sanitizeProgram, migrate: migrate, load: load, save: save
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = WD;
})(typeof window !== 'undefined' ? window : globalThis);
