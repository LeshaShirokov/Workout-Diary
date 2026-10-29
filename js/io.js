/* Дневник тренировок — экспорт/импорт JSON и экспорт CSV. */
(function (root) {
  'use strict';
  var WD = root.WD = root.WD || {};
  var C = WD.core, M = WD.model, S = WD.storage;

  var APP_ID = 'workout-diary';
  var MAX_BYTES = 5 * 1024 * 1024;

  function byteLength(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  }

  function buildExport(state) {
    return {
      app: APP_ID, format: 'workout-diary-export', version: S.VERSION, exportedAt: new Date().toISOString(),
      data: { settings: state.settings, program: state.program, sessions: state.sessions, bodyLog: state.bodyLog }
    };
  }
  function exportJSON(state) { return JSON.stringify(buildExport(state), null, 2); }

  /**
   * Разбор файла импорта. Возвращает { ok, error } или { ok: true, data, summary }.
   * data — полностью санитизированное состояние; ничего из файла не попадает в приложение без проверки.
   */
  function parseImport(text, opts) {
    opts = opts || {};
    var max = opts.maxBytes || MAX_BYTES;
    if (typeof text !== 'string') return { ok: false, error: 'Файл не прочитан' };
    if (text.length > max || byteLength(text) > max) return { ok: false, error: 'Файл слишком большой (максимум ' + Math.round(max / 1024 / 1024) + ' МБ)' };
    var raw;
    try { raw = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (e) { return { ok: false, error: 'Это не JSON-файл или он повреждён' }; }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Неверная структура файла' };
    var payload;
    if (raw.app === APP_ID && raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
      payload = {};
      ['settings', 'program', 'sessions', 'bodyLog', 'meta'].forEach(function (k) { if (Object.prototype.hasOwnProperty.call(raw.data, k)) payload[k] = raw.data[k]; });
      payload.version = raw.version;
    } else if (Array.isArray(raw.sessions) || (raw.program && typeof raw.program === 'object') || Array.isArray(raw.workouts)) {
      payload = raw; // «сырое» состояние или формат v1
    } else {
      return { ok: false, error: 'Файл не похож на данные дневника тренировок' };
    }
    var hasProgram = !!(payload.program && typeof payload.program === 'object') || Array.isArray(payload.days);
    var data;
    try { data = S.migrate(payload); } catch (e) { return { ok: false, error: e.message }; }
    var rawCount = Array.isArray(payload.sessions) ? payload.sessions.length : Array.isArray(payload.workouts) ? payload.workouts.length : 0;
    return { ok: true, data: data, hasProgram: hasProgram, hasSettings: !!payload.settings, summary: summarize(data, rawCount) };
  }

  function summarize(data, rawCount) {
    var dates = data.sessions.map(function (s) { return s.date; }).concat(data.bodyLog.map(function (b) { return b.date; })).sort();
    var sets = 0;
    data.sessions.forEach(function (s) { sets += M.sessionStats(s).sets; });
    return {
      days: data.program.days.length,
      exercises: data.program.days.reduce(function (a, d) { return a + d.exercises.length; }, 0),
      sessions: data.sessions.length, skipped: Math.max(0, (rawCount || 0) - data.sessions.length),
      sets: sets, bodyLog: data.bodyLog.length,
      firstDate: dates[0] || null, lastDate: dates[dates.length - 1] || null
    };
  }

  /** Сдвиг всех дат так, чтобы первая дата стала newFirst. */
  function rebaseDates(data, newFirst) {
    if (!C.isDateStr(newFirst)) return data;
    var dates = data.sessions.map(function (s) { return s.date; }).concat(data.bodyLog.map(function (b) { return b.date; })).sort();
    if (!dates.length) return data;
    var shift = C.diffDays(newFirst, dates[0]);
    if (!shift) return data;
    data.sessions.forEach(function (s) {
      s.date = C.addDays(s.date, shift);
      if (s.startedAt) s.startedAt += shift * C.DAY_MS;
      if (s.finishedAt) s.finishedAt += shift * C.DAY_MS;
    });
    data.bodyLog.forEach(function (b) { b.date = C.addDays(b.date, shift); });
    if (data.settings && data.settings.programStart) data.settings.programStart = C.addDays(data.settings.programStart, shift);
    return data;
  }

  /**
   * Применение импорта. mode: 'replace' | 'merge'.
   * merge: программа текущая + дни/упражнения из файла, которых нет; тренировки и записи веса — по id (файл важнее).
   */
  function applyImport(current, incoming, mode, opts) {
    opts = opts || {};
    if (mode === 'replace') {
      var st = S.sanitizeState(JSON.parse(JSON.stringify(incoming)));
      if (!opts.hasSettings) st.settings = current.settings;
      st.meta.welcomed = true;
      return st;
    }
    var next = JSON.parse(JSON.stringify(current));
    if (opts.hasProgram) {
      var dayById = {};
      next.program.days.forEach(function (d) { dayById[d.id] = d; });
      incoming.program.days.forEach(function (d) {
        var cur = dayById[d.id];
        if (!cur) { next.program.days.push(d); return; }
        var exIds = {}, exNames = {};
        cur.exercises.forEach(function (e) { exIds[e.id] = 1; exNames[C.nameKey(e.name)] = 1; });
        d.exercises.forEach(function (e) { if (!exIds[e.id] && !exNames[C.nameKey(e.name)]) cur.exercises.push(e); });
      });
    }
    if (opts.hasSettings && incoming.settings && incoming.settings.programStart && !(current.sessions || []).length) {
      next.settings.programStart = incoming.settings.programStart;
    }
    function mergeList(a, b) {
      var idx = {};
      a.forEach(function (x, i) { idx[x.id] = i; });
      b.forEach(function (x) { if (idx[x.id] !== undefined) a[idx[x.id]] = x; else { idx[x.id] = a.length; a.push(x); } });
      return a;
    }
    next.sessions = mergeList(next.sessions, incoming.sessions);
    next.bodyLog = mergeList(next.bodyLog, incoming.bodyLog);
    next.meta.welcomed = true;
    return S.sanitizeState(next);
  }

  // ---------- CSV ----------
  /** Ячейка CSV: защита от формул (=,+,-,@, таб, CR) и экранирование. Числа — с запятой (Excel, ru). */
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return isFinite(v) ? String(v).replace('.', ',') : '';
    var s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[";\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  var CSV_HEAD = ['Дата', 'Неделя', 'День', 'Упражнение', 'Тип', 'Подход', 'Вес, кг', 'Повторы', 'Объём, кг', 'Отмечен', 'Минуты', 'Км', 'Ккал', 'Вес тела', 'Самочувствие', 'Заметка'];
  function toCSV(state) {
    var rows = [CSV_HEAD];
    var start = state.settings.programStart;
    M.doneSessions(state).concat((state.sessions || []).filter(function (s) { return s.status === 'draft'; })).forEach(function (s) {
      var wk = C.weekNumber(s.date, start);
      s.exercises.forEach(function (ex) {
        var tl = (M.TYPES[ex.type] || {}).label || ex.type;
        if (ex.type === 'cardio') {
          var c = ex.cardio || {};
          if (c.min == null && c.km == null && c.kcal == null) return;
          rows.push([s.date, wk, s.dayName, ex.name, tl, null, null, null, null, null, c.min, c.km, c.kcal, s.bodyWeight, s.feeling, ex.note || s.notes]);
          return;
        }
        ex.sets.forEach(function (st, i) {
          if (st.w == null && st.r == null) return;
          rows.push([s.date, wk, s.dayName, ex.name, tl, i + 1, st.w, st.r, M.setVolume(st), st.done ? 'да' : 'нет', null, null, null, s.bodyWeight, s.feeling, i === 0 ? ex.note : '']);
        });
      });
    });
    (state.bodyLog || []).forEach(function (b) {
      rows.push([b.date, C.weekNumber(b.date, start), 'Вес тела', '', '', null, null, null, null, null, null, null, null, b.weight, null, b.note]);
    });
    return '\uFEFF' + rows.map(function (r) { return r.map(csvCell).join(';'); }).join('\r\n') + '\r\n';
  }

  /** Скачивание файла в браузере (Blob + временная ссылка). */
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  WD.io = {
    APP_ID: APP_ID, MAX_BYTES: MAX_BYTES, buildExport: buildExport, exportJSON: exportJSON, parseImport: parseImport,
    summarize: summarize, rebaseDates: rebaseDates, applyImport: applyImport, csvCell: csvCell, toCSV: toCSV, download: download
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = WD;
})(typeof window !== 'undefined' ? window : globalThis);
