/* Журнал: календарь месяца, серия, список тренировок. */
(function (root) {
  'use strict';
  var WD = root.WD, C = WD.core, M = WD.model, D = WD.dom, h = D.h, icon = D.icon, UI = WD.ui;
  WD.views = WD.views || {};

  WD.views.journal = function (page, arg, params) {
    var app = WD.app, st = app.state, todayStr = C.today();
    var month = /^\d{4}-\d{2}$/.test(params.month || '') ? params.month : todayStr.slice(0, 7);
    var selDay = C.isDateStr(params.day) ? params.day : null;
    var all = st.sessions.slice().sort(function (a, b) { return -M.cmpSession(a, b); });
    var doneDates = M.doneSessions(st).map(function (s) { return s.date; });
    var streak = M.streakWeeks(doneDates, todayStr);

    page.appendChild(UI.pageHead('Журнал', all.length ? all.length + ' ' + C.plural(all.length, 'тренировка', 'тренировки', 'тренировок') + ' в истории' : 'История тренировок',
      h('div', { class: 'streak', title: 'Недель подряд с тренировками' }, icon('flame', { size: 20 }), h('strong', null, String(streak)), h('span', null, C.plural(streak, 'неделя', 'недели', 'недель') + ' подряд'))));

    if (!all.length) {
      page.appendChild(UI.emptyState('calendar', 'Пока пусто', 'Завершённые тренировки появятся здесь и в календаре.', [
        h('a', { class: 'btn primary', href: '#/today' }, icon('play', { size: 18 }), 'Начать тренировку'),
        h('button', { type: 'button', class: 'btn soft', onClick: function () { WD.views.loadDemo(); } }, icon('sparkles', { size: 18 }), 'Демо-данные')]));
      return;
    }

    // ---- календарь ----
    var byDate = {};
    all.forEach(function (s) { (byDate[s.date] = byDate[s.date] || []).push(s); });
    var y = +month.slice(0, 4), m = +month.slice(5, 7);
    var first = month + '-01';
    var daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
    function shift(delta) {
      var nm = m + delta, ny = y;
      if (nm < 1) { nm = 12; ny--; } if (nm > 12) { nm = 1; ny++; }
      app.go('journal?month=' + ny + '-' + C.pad(nm));
    }
    var grid = h('div', { class: 'cal-grid', role: 'grid', 'aria-label': 'Календарь: ' + C.MONTHS[m - 1] + ' ' + y });
    var headRow = h('div', { class: 'cal-row cal-wd', role: 'row' }, C.WD_SHORT.map(function (d) { return h('span', { role: 'columnheader', class: 'cal-wdn' }, d); }));
    grid.appendChild(headRow);
    var offset = C.weekday(first);
    var cells = [];
    for (var i = 0; i < offset; i++) cells.push(null);
    for (var d = 1; d <= daysIn; d++) cells.push(month + '-' + C.pad(d));
    while (cells.length % 7) cells.push(null);
    var dayIdx = {};
    st.program.days.forEach(function (dd, i2) { dayIdx[dd.id] = i2; });
    for (var r = 0; r < cells.length; r += 7) {
      var row = h('div', { class: 'cal-row', role: 'row' });
      cells.slice(r, r + 7).forEach(function (ds) {
        if (!ds) { row.appendChild(h('span', { class: 'cal-cell empty', role: 'gridcell' })); return; }
        var list = byDate[ds] || [];
        var label = C.fmtDate(ds) + (list.length ? ': ' + list.map(function (s) { return s.dayName; }).join(', ') : ', нет тренировок');
        var cell = h('button', { type: 'button', role: 'gridcell', class: ['cal-cell', list.length ? 'has' : '', ds === todayStr ? 'today' : '', ds === selDay ? 'sel' : ''].join(' '), 'aria-label': label, 'aria-selected': String(ds === selDay),
          onClick: function () { app.go('journal?month=' + month + (ds === selDay ? '' : '&day=' + ds)); } },
          h('span', { class: 'cal-d' }, String(C.parts(ds).d)),
          list.length ? h('span', { class: 'cal-dots', 'aria-hidden': 'true' }, list.slice(0, 3).map(function (s) {
            return h('i', { class: s.status === 'draft' ? 'draft' : '', style: { '--hue': WD.views.dayHue(dayIdx[s.dayId] || 0) } });
          })) : null);
        row.appendChild(cell);
      });
      grid.appendChild(row);
    }
    var monthCount = all.filter(function (s) { return s.date.slice(0, 7) === month && s.status === 'done'; }).length;
    page.appendChild(h('section', { class: 'card cal', 'aria-label': 'Календарь тренировок' },
      h('div', { class: 'cal-head' },
        h('button', { type: 'button', class: 'btn icon-btn ghost', 'aria-label': 'Предыдущий месяц', onClick: function () { shift(-1); } }, icon('chevL')),
        h('div', { class: 'center' }, h('h2', { class: 'cal-title' }, C.MONTHS[m - 1] + ' ' + y), h('span', { class: 'muted small' }, monthCount + ' ' + C.plural(monthCount, 'тренировка', 'тренировки', 'тренировок'))),
        h('button', { type: 'button', class: 'btn icon-btn ghost', 'aria-label': 'Следующий месяц', onClick: function () { shift(1); } }, icon('chevR'))),
      grid,
      h('div', { class: 'cal-legend' }, st.program.days.map(function (dd, i3) { return h('span', null, h('i', { style: { '--hue': WD.views.dayHue(i3) } }), dd.name + (dd.title ? ' · ' + dd.title : '')); }))));

    // ---- список ----
    var shown = selDay ? (byDate[selDay] || []) : all.filter(function (s) { return s.date.slice(0, 7) === month; });
    var listTitle = selDay ? C.fmtDate(selDay, { weekday: true }) : 'Тренировки за ' + C.MONTHS[m - 1];
    var sec = h('section', { class: 'card', 'aria-labelledby': 'jl-h' },
      h('div', { class: 'card-head' }, h('h2', { id: 'jl-h' }, icon('list', { size: 18 }), listTitle),
        selDay ? h('a', { class: 'btn ghost sm', href: '#/journal?month=' + month }, 'Весь месяц') : null));
    if (!shown.length) {
      sec.appendChild(h('p', { class: 'muted' }, selDay ? 'В этот день тренировок нет.' : 'В этом месяце тренировок нет.'));
      if (selDay) sec.appendChild(h('a', { class: 'btn soft', href: '#/today?date=' + selDay }, icon('plus', { size: 18 }), 'Записать тренировку на эту дату'));
    } else {
      sec.appendChild(h('div', { class: 'sess-list' }, shown.map(function (s) {
        return h('div', { class: 'sess-row' }, WD.views.sessionItem(s),
          s.status === 'done' ? h('button', { type: 'button', class: 'btn icon-btn ghost', 'aria-label': 'Повторить сегодня: ' + s.dayName + ', ' + C.fmtDate(s.date), title: 'Повторить сегодня', onClick: function () { WD.views.repeatSession(s); } }, icon('copy', { size: 18 })) : null);
      })));
    }
    page.appendChild(sec);
  };
})(window);
