/* Дневник тренировок — базовые утилиты (без DOM). */
(function (root) {
  'use strict';
  var WD = root.WD = root.WD || {};

  var DAY_MS = 86400000;
  var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** Проверка строки даты YYYY-MM-DD (реальная календарная дата). */
  function isDateStr(s) {
    if (typeof s !== 'string') return false;
    var m = DATE_RE.exec(s);
    if (!m) return false;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (y < 1970 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  }

  /** Номер дня (UTC) — для арифметики дат без проблем с переходом на летнее время. */
  function dayNum(s) {
    var m = DATE_RE.exec(s);
    return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS);
  }
  function fromDayNum(n) {
    var d = new Date(n * DAY_MS);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function addDays(s, n) { return fromDayNum(dayNum(s) + n); }
  /** 0 = понедельник … 6 = воскресенье */
  function weekday(s) { return ((new Date(dayNum(s) * DAY_MS).getUTCDay()) + 6) % 7; }
  function mondayOf(s) { return addDays(s, -weekday(s)); }
  function diffDays(a, b) { return dayNum(a) - dayNum(b); }
  /** Номер недели относительно даты начала программы (неделя начала = 1). */
  function weekNumber(date, start) {
    return Math.floor((dayNum(mondayOf(date)) - dayNum(mondayOf(start))) / 7) + 1;
  }
  function weekStart(n, start) { return addDays(mondayOf(start), (n - 1) * 7); }

  function toDateStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function today(now) { return toDateStr(now ? new Date(now) : new Date()); }

  var MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  var MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var WD_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  var WD_LONG = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

  function parts(s) { var m = DATE_RE.exec(s); return { y: +m[1], m: +m[2], d: +m[3] }; }
  function fmtDate(s, opts) {
    if (!isDateStr(s)) return '—';
    var p = parts(s);
    opts = opts || {};
    if (opts.short) return pad(p.d) + '.' + pad(p.m);
    var str = p.d + ' ' + MONTHS_GEN[p.m - 1];
    if (opts.year !== false) str += ' ' + p.y;
    if (opts.weekday) str = WD_LONG[weekday(s)] + ', ' + str;
    return str;
  }
  function fmtDuration(sec) {
    if (sec == null || !isFinite(sec) || sec < 0) return '—';
    sec = Math.round(sec);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return h + ' ч ' + m + ' мин';
    if (m) return m + ' мин' + (s && m < 10 ? ' ' + s + ' с' : '');
    return s + ' с';
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + pad(m) : m) + ':' + pad(s);
  }
  /** Число по-русски: 1 234,5 */
  function fmtNum(n, digits) {
    if (n == null || !isFinite(n)) return '—';
    var d = digits == null ? (Math.abs(n % 1) > 1e-9 ? 1 : 0) : digits;
    var s = Math.abs(n).toFixed(d);
    var ip = s.split('.')[0], fp = s.split('.')[1];
    ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    if (fp && /^0+$/.test(fp) && digits == null) fp = null;
    return (n < 0 ? '\u2212' : '') + ip + (fp ? ',' + fp : '');
  }
  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }
  /** Разбор числа, допускается запятая. Пустая строка → null. */
  function parseNum(v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim().replace(/\s+/g, '').replace(',', '.').replace('\u2212', '-');
    if (s === '' || s === '-' || s === '.') return null;
    if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return null;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  function round(n, d) { var k = Math.pow(10, d == null ? 2 : d); return Math.round(n * k) / k; }
  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

  var uidCounter = 0;
  function uid(prefix) {
    uidCounter = (uidCounter + 1) % 1679616;
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36) + uidCounter.toString(36);
  }
  /** Нормализация названия упражнения для связи истории. */
  function nameKey(name) {
    return String(name || '').toLowerCase().replace(/[ёë]/g, 'е').replace(/\s+/g, ' ').trim();
  }

  WD.core = {
    DAY_MS: DAY_MS, pad: pad, isDateStr: isDateStr, dayNum: dayNum, fromDayNum: fromDayNum,
    addDays: addDays, weekday: weekday, mondayOf: mondayOf, diffDays: diffDays,
    weekNumber: weekNumber, weekStart: weekStart, toDateStr: toDateStr, today: today, parts: parts,
    MONTHS: MONTHS, MONTHS_GEN: MONTHS_GEN, WD_SHORT: WD_SHORT, WD_LONG: WD_LONG,
    fmtDate: fmtDate, fmtDuration: fmtDuration, fmtClock: fmtClock, fmtNum: fmtNum, plural: plural,
    parseNum: parseNum, round: round, clamp: clamp, uid: uid, nameKey: nameKey
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = WD;
})(typeof window !== 'undefined' ? window : globalThis);
