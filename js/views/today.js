/* Экран «Сегодня»: старт тренировки, черновик, приветствие. */
(function (root) {
  'use strict';
  var WD = root.WD, C = WD.core, M = WD.model, D = WD.dom, h = D.h, icon = D.icon, UI = WD.ui;
  WD.views = WD.views || {};

  function greeting() {
    var hr = new Date().getHours();
    return hr < 5 ? 'Доброй ночи' : hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : 'Добрый вечер';
  }

  WD.views.today = function (page, arg, params) {
    var app = WD.app, st = app.state, todayStr = C.today();
    var date = C.isDateStr(params.date) ? params.date : todayStr;
    var suggested = M.suggestNextDay(st);
    var chosen = params.day && app.dayById(params.day) ? params.day : suggested;

    page.appendChild(UI.pageHead(greeting() + '!', C.fmtDate(todayStr, { weekday: true, year: false })));

    var draft = app.draft();
    if (draft) {
      var dst = M.sessionStats(draft);
      page.appendChild(h('a', { class: 'card draft-card', href: '#/session/' + encodeURIComponent(draft.id) },
        h('span', { class: 'pulse-dot', 'aria-hidden': 'true' }),
        h('div', { class: 'grow' }, h('strong', null, 'Тренировка в процессе'),
          h('span', { class: 'muted' }, draft.dayName + ' · ' + C.fmtDate(draft.date, { year: false }) + ' · ' + dst.sets + ' ' + C.plural(dst.sets, 'подход', 'подхода', 'подходов'))),
        h('span', { class: 'btn primary sm' }, 'Продолжить', icon('chevR', { size: 18 }))));
    }

    if (!st.sessions.length) page.appendChild(welcome());

    // ---- выбор дня ----
    var dateInput = h('input', { type: 'date', value: date, max: C.addDays(todayStr, 365), onChange: function () { if (C.isDateStr(dateInput.value)) date = dateInput.value; } });
    var dayList = h('div', { class: 'day-grid', role: 'radiogroup', 'aria-label': 'День программы' });
    var days = st.program.days;
    days.forEach(function (d, i) {
      var last = M.previousSession(st, d.id, null, null);
      var sel = d.id === chosen;
      var b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(sel), class: 'day-card', style: { '--hue': dayHue(i) }, onClick: function () {
        chosen = d.id;
        Array.prototype.forEach.call(dayList.children, function (c) { c.setAttribute('aria-checked', 'false'); });
        b.setAttribute('aria-checked', 'true');
      }, onKeydown: function (e) {
        var dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        var n = dayList.children[(i + dir + days.length) % days.length];
        n.focus(); n.click();
      } },
        h('span', { class: 'day-num' }, d.name),
        h('span', { class: 'day-title' }, d.title || 'Без названия'),
        h('span', { class: 'day-meta' }, d.exercises.length + ' ' + C.plural(d.exercises.length, 'упражнение', 'упражнения', 'упражнений') + (last ? ' · был ' + C.fmtDate(last.date, { short: true }) : '')),
        d.id === suggested && st.sessions.length ? h('span', { class: 'badge accent' }, 'Следующий') : null,
        h('span', { class: 'day-check', 'aria-hidden': 'true' }, icon('check', { size: 16, stroke: 3 })));
      dayList.appendChild(b);
    });

    var startCard = h('section', { class: 'card start-card', 'aria-labelledby': 'start-h' },
      h('div', { class: 'card-head' }, h('h2', { id: 'start-h' }, icon('play', { size: 18 }), 'Начать тренировку')),
      UI.field('Дата', dateInput, null, 'inline'),
      days.length ? dayList : UI.emptyState('dumbbell', 'В программе нет дней', 'Добавьте дни и упражнения на вкладке «Программа».', [h('a', { class: 'btn primary', href: '#/program' }, 'Открыть программу')]),
      days.length ? h('button', { type: 'button', class: 'btn primary xl block', id: 'start-btn', onClick: start }, icon('play', { size: 20 }), 'Начать') : null);
    page.appendChild(startCard);

    function start() {
      var day = app.dayById(chosen);
      if (!day) { UI.toast('Выберите день программы', 'error'); return; }
      if (!C.isDateStr(date)) { UI.toast('Укажите дату', 'error'); return; }
      var same = st.sessions.filter(function (s) { return s.status === 'draft' && s.dayId === day.id && s.date === date; })[0];
      if (same) { app.go('session/' + same.id); return; }
      var sess = M.newSessionFromDay(day, date);
      st.sessions.push(sess);
      app.saveNow();
      app.go('session/' + sess.id);
    }

    // ---- быстрые показатели ----
    var done = M.doneSessions(st);
    if (done.length) {
      var dates = done.map(function (s) { return s.date; });
      var month = todayStr.slice(0, 7);
      var monthCount = dates.filter(function (d) { return d.slice(0, 7) === month; }).length;
      var bws = M.bodyWeightSeries(st);
      page.appendChild(h('section', { class: 'stats-row', 'aria-label': 'Коротко' },
        UI.stat('в этом месяце', String(monthCount), 'calendar'),
        UI.stat(C.plural(M.streakWeeks(dates, todayStr), 'неделя подряд', 'недели подряд', 'недель подряд'), String(M.streakWeeks(dates, todayStr)), 'flame', 'warm'),
        UI.stat('вес тела', bws.length ? C.fmtNum(bws[bws.length - 1].weight) + ' кг' : '—', 'scale')));
      var last = done[done.length - 1], ls = M.sessionStats(last);
      page.appendChild(h('section', { class: 'card', 'aria-labelledby': 'last-h' },
        h('div', { class: 'card-head' }, h('h2', { id: 'last-h' }, icon('clock', { size: 18 }), 'Последняя тренировка'),
          h('a', { class: 'btn ghost sm', href: '#/journal' }, 'Журнал', icon('chevR', { size: 16 }))),
        WD.views.sessionItem(last, ls)));
    }
  };

  function welcome() {
    return h('section', { class: 'card welcome', 'aria-labelledby': 'wel-h' },
      h('div', { class: 'welcome-art', 'aria-hidden': 'true' }, icon('sparkles', { size: 30 })),
      h('h2', { id: 'wel-h' }, 'Добро пожаловать в дневник!'),
      h('p', null, 'Ваша программа уже загружена: 3 дня и упражнения из таблицы. Выберите день и нажмите «Начать» — подходы, отдых и прогресс посчитаются сами.'),
      h('p', { class: 'muted' }, 'Хотите сначала посмотреть, как всё выглядит? Загрузите демо-историю с вымышленными данными (её можно удалить в настройках). Свои данные из Excel можно перенести через JSON-файл в «Настройки → Импорт».'),
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', class: 'btn soft', id: 'demo-btn', onClick: function () { WD.views.loadDemo(); } }, icon('sparkles', { size: 18 }), 'Загрузить демо-данные'),
        h('a', { class: 'btn ghost', href: '#/settings?import=1' }, icon('upload', { size: 18 }), 'Импорт JSON')));
  }

  function dayHue(i) { return [255, 160, 25, 320, 200, 100][i % 6]; }
  WD.views.dayHue = dayHue;

  WD.views.loadDemo = function () {
    var app = WD.app, st = app.state;
    var demo = WD.seed.demoSessions(st.program, C.today(), 8);
    var ids = {};
    st.sessions.forEach(function (s) { ids[s.id] = 1; });
    demo.forEach(function (s) { if (!ids[s.id]) st.sessions.push(s); });
    st.meta.demo = true; st.meta.welcomed = true;
    if (demo.length) st.settings.programStart = C.mondayOf(demo[0].date);
    app.saveNow();
    UI.toast('Загружено демо: ' + demo.length + ' тренировок (вымышленные данные)');
    app.render();
  };
  WD.views.removeDemo = function () {
    var st = WD.app.state;
    st.sessions = st.sessions.filter(function (s) { return s.id.indexOf('demo-') !== 0; });
    st.meta.demo = false;
    WD.app.saveNow();
  };

  /** Карточка-строка тренировки для списков. */
  WD.views.sessionItem = function (s, stt) {
    stt = stt || M.sessionStats(s);
    var idx = 0;
    WD.app.state.program.days.forEach(function (d, i) { if (d.id === s.dayId) idx = i; });
    return h('a', { class: 'sess-item', href: '#/session/' + encodeURIComponent(s.id), style: { '--hue': dayHue(idx) } },
      h('span', { class: 'sess-date' }, h('strong', null, String(C.parts(s.date).d)), h('span', null, C.MONTHS_GEN[C.parts(s.date).m - 1].slice(0, 3))),
      h('span', { class: 'grow' },
        h('strong', { class: 'sess-title' }, s.dayName || 'Тренировка'),
        h('span', { class: 'sess-meta' },
          s.status === 'draft' ? UI.badge('черновик', 'warn') : null,
          h('span', null, icon('dumbbell', { size: 14 }), C.fmtNum(stt.volume) + ' кг'),
          h('span', null, icon('list', { size: 14 }), stt.sets + ' подх.'),
          s.durationSec ? h('span', null, icon('clock', { size: 14 }), C.fmtDuration(s.durationSec)) : null,
          stt.cardioMin ? h('span', null, icon('pulse', { size: 14 }), C.fmtNum(stt.cardioMin) + ' мин') : null)),
      s.feeling ? h('span', { class: 'feel f' + s.feeling, title: 'Самочувствие: ' + UI.FEEL[s.feeling] }, UI.feelingIcon(s.feeling)) : null,
      icon('chevR', { size: 18, class: 'muted' }));
  };
})(window);
