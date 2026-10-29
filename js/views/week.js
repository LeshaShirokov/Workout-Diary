/* «Неделя» — таблица как в Excel: упражнения × подходы (вес / кол-во), с редактированием. */
(function (root) {
  'use strict';
  var WD = root.WD, C = WD.core, M = WD.model, D = WD.dom, h = D.h, icon = D.icon, UI = WD.ui;
  WD.views = WD.views || {};
  function isNum(n) { return typeof n === 'number' && isFinite(n); }

  WD.views.week = function (page, arg, params) {
    var app = WD.app, st = app.state, start = st.settings.programStart;
    var curN = C.weekNumber(C.today(), start);
    var n = /^-?\d{1,4}$/.test(params.n || '') ? +params.n : curN;
    var wStart = C.weekStart(n, start), wEnd = C.addDays(wStart, 6);
    var days = st.program.days;

    page.appendChild(UI.pageHead('Неделя ' + n, C.fmtDate(wStart, { year: false }) + ' — ' + C.fmtDate(wEnd)));

    var nav = h('div', { class: 'week-nav card' },
      h('a', { class: 'btn icon-btn ghost', href: '#/week?n=' + (n - 1), 'aria-label': 'Предыдущая неделя' }, icon('chevL')),
      h('div', { class: 'center grow' }, h('strong', null, 'Неделя ' + n), h('span', { class: 'muted small' }, n === curN ? 'текущая' : n < curN ? (curN - n) + ' нед. назад' : 'впереди')),
      n !== curN ? h('a', { class: 'btn ghost sm', href: '#/week?n=' + curN }, 'Сейчас') : null,
      h('a', { class: 'btn icon-btn ghost', href: '#/week?n=' + (n + 1), 'aria-label': 'Следующая неделя' }, icon('chevR')));
    page.appendChild(nav);

    if (!days.length) { page.appendChild(UI.emptyState('table', 'В программе нет дней', null, [h('a', { class: 'btn primary', href: '#/program' }, 'Программа')])); return; }

    var inWeek = st.sessions.filter(function (s) { return s.date >= wStart && s.date <= wEnd; }).sort(M.cmpSession);
    var used = {};
    function sessFor(day) {
      var s = inWeek.filter(function (x) { return x.dayId === day.id && !used[x.id]; })[0] || null;
      if (s) used[s.id] = 1;
      return s;
    }
    var maxSets = 3;
    days.forEach(function (d) { d.exercises.forEach(function (e) { if (e.type !== 'cardio') maxSets = Math.max(maxSets, e.sets || 3); }); });
    inWeek.forEach(function (s) { s.exercises.forEach(function (e) { if (e.type !== 'cardio') maxSets = Math.max(maxSets, e.sets.length); }); });
    maxSets = Math.min(maxSets, 8);

    var table = h('table', { class: 'xl-table' });
    var head1 = h('tr', null, h('th', { rowspan: 2, scope: 'col', class: 'ex-col' }, 'Упражнения'));
    var head2 = h('tr', null);
    for (var i = 0; i < maxSets; i++) {
      head1.appendChild(h('th', { colspan: 2, scope: 'colgroup' }, 'Подход ' + (i + 1)));
      head2.appendChild(h('th', { scope: 'col' }, 'вес'));
      head2.appendChild(h('th', { scope: 'col' }, 'кол-во'));
    }
    head1.appendChild(h('th', { rowspan: 2, scope: 'col', class: 'vol-col' }, 'Объём'));
    table.appendChild(h('thead', null, head1, head2));

    days.forEach(function (day, di) {
      var sess = sessFor(day);
      var tb = h('tbody', { class: 'day-block', style: { '--hue': WD.views.dayHue(di) } });
      var dateIn = h('input', { type: 'date', class: 'cell-date', value: sess ? sess.date : '', 'aria-label': day.name + ': дата', min: wStart, max: wEnd, onChange: function () {
        if (!C.isDateStr(dateIn.value)) return;
        ensure().date = dateIn.value; app.save();
      } });
      var bwIn = h('input', { type: 'text', inputmode: 'decimal', class: 'cell bw', value: sess && isNum(sess.bodyWeight) ? String(sess.bodyWeight).replace('.', ',') : '', placeholder: 'вес тела', 'aria-label': day.name + ': вес тела, кг', onInput: function () { ensure().bodyWeight = C.parseNum(bwIn.value); app.save(); } });
      var openLink = h('a', { class: 'btn ghost sm', href: sess ? '#/session/' + encodeURIComponent(sess.id) : '#/today?day=' + day.id + '&date=' + defaultDate() }, sess ? 'Открыть' : 'Начать', icon('chevR', { size: 14 }));
      tb.appendChild(h('tr', { class: 'day-row' }, h('th', { colspan: maxSets * 2 + 2, scope: 'rowgroup' },
        h('div', { class: 'day-row-in' }, h('span', { class: 'day-name' }, day.name + (day.title ? ' — ' + day.title : '')),
          h('span', { class: 'day-row-tools' }, dateIn, bwIn, sess && sess.status === 'draft' ? UI.badge('черновик', 'warn') : null, openLink)))));

      function defaultDate() { return C.addDays(wStart, Math.min(6, di * 2)); }
      function ensure() {
        if (sess) return sess;
        sess = M.newSessionFromDay(day, dateIn.value && C.isDateStr(dateIn.value) ? dateIn.value : defaultDate());
        sess.status = 'done'; sess.startedAt = null;
        st.sessions.push(sess);
        dateIn.value = sess.date;
        openLink.setAttribute('href', '#/session/' + encodeURIComponent(sess.id));
        D.clear(openLink).appendChild(document.createTextNode('Открыть'));
        return sess;
      }
      function exFor(e) {
        var s = ensure();
        var found = s.exercises.filter(function (x) { return x.exId === e.id; })[0] || s.exercises.filter(function (x) { return C.nameKey(x.name) === C.nameKey(e.name); })[0];
        if (!found) { found = M.blankExercise(e); s.exercises.push(found); }
        return found;
      }
      function peek(e) {
        if (!sess) return null;
        return sess.exercises.filter(function (x) { return x.exId === e.id; })[0] || sess.exercises.filter(function (x) { return C.nameKey(x.name) === C.nameKey(e.name); })[0] || null;
      }

      day.exercises.forEach(function (e) {
        var ex = peek(e);
        var tr = h('tr', { class: 'type-' + e.type });
        tr.appendChild(h('th', { scope: 'row', class: 'ex-col' }, e.name, e.type === 'assisted' ? h('span', { class: 'cell-hint' }, 'помощь, кг') : null));
        if (e.type === 'cardio') {
          var cin = h('input', { type: 'text', class: 'cell wide', value: ex ? M.cardioText(ex.cardio).replace(/ · /g, ' ') : '', placeholder: 'мин, км, ккал — напр. 20 мин 2.5 км 180 ккал', 'aria-label': day.name + ': кардио',
            onChange: function () { var x = exFor(e); x.cardio = M.parseCardio(cin.value); app.save(); } });
          tr.appendChild(h('td', { colspan: maxSets * 2 }, cin));
          tr.appendChild(h('td', { class: 'vol' }, ''));
        } else {
          var volCell = h('td', { class: 'vol' }, ex ? fmtVol(M.exerciseVolume(ex)) : '');
          for (var si = 0; si < maxSets; si++) {
            (function (si) {
              var s = ex && ex.sets[si];
              var wv = s && isNum(s.w) ? (e.type === 'assisted' ? Math.abs(s.w) : s.w) : null;
              var wIn = h('input', { type: 'text', inputmode: 'decimal', class: 'cell' + (e.type === 'assisted' ? ' assist' : ''), value: wv === null ? '' : String(wv).replace('.', ','), 'aria-label': e.name + ', подход ' + (si + 1) + ', ' + (e.type === 'assisted' ? 'помощь' : 'вес'),
                onInput: function () { var set = setAt(si); var v = C.parseNum(wIn.value); set.w = v === null ? null : e.type === 'assisted' ? -Math.abs(v) : v; set.done = M.isValidSet(set); upd(); } });
              var rIn = h('input', { type: 'text', inputmode: 'numeric', class: 'cell', value: s && isNum(s.r) ? String(s.r) : '', 'aria-label': e.name + ', подход ' + (si + 1) + ', повторы',
                onInput: function () { var set = setAt(si); var v = C.parseNum(rIn.value); set.r = v === null ? null : Math.round(v); set.done = M.isValidSet(set); upd(); } });
              tr.appendChild(h('td', null, wIn));
              tr.appendChild(h('td', null, rIn));
            })(si);
          }
          tr.appendChild(volCell);
          var setAt = function (si) {
            var x = exFor(e);
            while (x.sets.length <= si) x.sets.push({ w: null, r: null, done: false });
            return x.sets[si];
          };
          var upd = function () { volCell.textContent = fmtVol(M.exerciseVolume(exFor(e))); app.save(); };
        }
        tb.appendChild(tr);
      });
      table.appendChild(tb);
    });

    page.appendChild(h('section', { class: 'card xl-card', 'aria-label': 'Таблица недели' },
      h('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Таблица недели ' + n + ' (прокручивается по горизонтали)' }, table),
      h('p', { class: 'muted small' }, icon('info', { size: 14 }), ' Ячейки редактируются прямо здесь и сохраняются автоматически. Для гравитрона вводите вес помощи (в Excel это было отрицательное число). Неделя 1 начинается ' + C.fmtDate(C.mondayOf(start)) + ' — дату можно поменять в программе.')));

    var other = inWeek.filter(function (s) { return !used[s.id]; });
    if (other.length) page.appendChild(h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Другие тренировки этой недели')),
      h('div', { class: 'sess-list' }, other.map(function (s) { return WD.views.sessionItem(s); }))));
  };
  function fmtVol(v) { return v ? C.fmtNum(v) : ''; }
})(window);
