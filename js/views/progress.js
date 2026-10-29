/* Прогресс: сводка, графики по упражнениям, вес тела, недельные объёмы, рекорды. */
(function (root) {
  'use strict';
  var WD = root.WD, C = WD.core, M = WD.model, D = WD.dom, h = D.h, icon = D.icon, UI = WD.ui, CH = WD.charts;
  WD.views = WD.views || {};
  var memo = { ex: null, metric: 'maxW' };

  WD.views.progress = function (page) {
    var app = WD.app, st = app.state, todayStr = C.today();
    var done = M.doneSessions(st);
    page.appendChild(UI.pageHead('Прогресс', 'Графики строятся по завершённым тренировкам'));
    if (!done.length && !st.bodyLog.length) {
      page.appendChild(UI.emptyState('chart', 'Здесь появятся графики', 'Завершите первую тренировку или загрузите демо-данные, чтобы увидеть прогресс.', [
        h('button', { type: 'button', class: 'btn soft', onClick: function () { WD.views.loadDemo(); } }, icon('sparkles', { size: 18 }), 'Демо-данные')]));
      return;
    }
    var dates = done.map(function (s) { return s.date; });
    var month = todayStr.slice(0, 7);
    var totalVol = done.reduce(function (a, s) { return a + M.sessionStats(s).volume; }, 0);
    var bws = M.bodyWeightSeries(st);
    var bwChange = bws.length >= 2 ? C.round(bws[bws.length - 1].weight - bws[0].weight, 1) : null;
    var streak = M.streakWeeks(dates, todayStr);
    page.appendChild(h('section', { class: 'stats-grid', 'aria-label': 'Сводка' },
      UI.stat('тренировок в этом месяце', String(dates.filter(function (d) { return d.slice(0, 7) === month; }).length), 'calendar'),
      UI.stat('общий объём, кг', C.fmtNum(Math.round(totalVol)), 'dumbbell'),
      UI.stat('серия, ' + C.plural(streak, 'неделя', 'недели', 'недель') + ' (рекорд ' + M.longestStreakWeeks(dates) + ')', String(streak), 'flame', 'warm'),
      UI.stat('изменение веса тела', bwChange === null ? '—' : (bwChange > 0 ? '+' : '') + C.fmtNum(bwChange) + ' кг', 'scale', bwChange === null ? '' : bwChange <= 0 ? 'good' : '')));

    // ---- упражнение ----
    var cat = M.exerciseCatalog(st).filter(function (c) { return c.count > 0; });
    if (cat.length) {
      if (!memo.ex || !cat.some(function (c) { return c.key === memo.ex; })) {
        memo.ex = cat.slice().sort(function (a, b) { return b.count - a.count; })[0].key;
      }
      var chartBox = h('div', { class: 'chart-box' });
      var select = h('select', { id: 'ex-select', 'aria-label': 'Упражнение', onChange: function () { memo.ex = select.value; draw(); } });
      var groups = {};
      cat.forEach(function (c) {
        if (!groups[c.group]) { groups[c.group] = h('optgroup', { label: c.group }); select.appendChild(groups[c.group]); }
        groups[c.group].appendChild(h('option', { value: c.key }, c.name + ' (' + c.count + ')'));
      });
      select.value = memo.ex;
      var seg = UI.segmented([{ value: 'maxW', label: 'Макс. вес' }, { value: 'e1rm', label: '1ПМ (Эпли)' }, { value: 'volume', label: 'Объём' }], memo.metric, function (v) { memo.metric = v; draw(); }, 'Показатель');
      var info = h('p', { class: 'muted small chart-note' });
      var draw = function () {
        var item = cat.filter(function (c) { return c.key === memo.ex; })[0];
        var hist = M.exerciseHistory(st, memo.ex);
        var metric = memo.metric;
        if (metric === 'e1rm' && item && (item.type === 'assisted' || item.type === 'bodyweight')) metric = 'maxW';
        var pts = hist.map(function (x) { return { x: C.dayNum(x.date), y: x[metric] }; });
        var fmt = metric === 'maxW' && item && item.type === 'assisted' ? function (v) { return C.fmtNum(Math.abs(v)); } : function (v) { return C.fmtNum(v); };
        if (metric === 'maxW' && item && item.type === 'bodyweight' && hist.every(function (x) { return !x.maxW; })) {
          pts = hist.map(function (x) { return { x: C.dayNum(x.date), y: x.maxReps }; });
          info.textContent = 'Упражнение с собственным весом — показаны максимальные повторы.';
        } else if (item && item.type === 'assisted') info.textContent = 'Гравитрон: чем меньше помощь, тем лучше — линия растёт к нулю (значения — помощь в кг).';
        else info.textContent = metric === 'e1rm' ? 'Оценка разового максимума: вес × (1 + повторы / 30).' : metric === 'volume' ? 'Объём = сумма вес × повторы (только положительный вес).' : 'Максимальный рабочий вес за тренировку.';
        D.clear(chartBox).appendChild(CH.lineChart(pts, { label: (item ? item.name : '') + ': ' + metric, yFmt: fmt, trend: pts.length > 2 }));
      };
      page.appendChild(h('section', { class: 'card', 'aria-labelledby': 'pe-h' },
        h('div', { class: 'card-head' }, h('h2', { id: 'pe-h' }, icon('chart', { size: 18 }), 'Прогресс в упражнении')),
        h('div', { class: 'chart-controls' }, select, seg), chartBox, info));
      draw();
    }

    // ---- вес тела ----
    var bwPts = bws.map(function (b) { return { x: C.dayNum(b.date), y: b.weight }; });
    var bwIn = UI.stepper({ value: null, placeholder: bws.length ? bws[bws.length - 1].weight : '', step: 0.1, min: 20, max: 400, label: 'Вес тела сегодня, кг' });
    var trendInfo = '';
    var tr = M.linearTrend(bwPts);
    if (tr && bwPts.length > 2) { var perWeek = C.round(tr.slope * 7, 2); trendInfo = 'Тренд: ' + (perWeek > 0 ? '+' : '') + C.fmtNum(perWeek, 2) + ' кг в неделю'; }
    page.appendChild(h('section', { class: 'card', 'aria-labelledby': 'bw-h' },
      h('div', { class: 'card-head' }, h('h2', { id: 'bw-h' }, icon('scale', { size: 18 }), 'Вес тела'), trendInfo ? UI.badge(trendInfo, 'accent') : null),
      CH.lineChart(bwPts, { label: 'Вес тела', trend: true, emptyText: 'Указывайте вес тела в тренировке или добавьте запись ниже' }),
      h('div', { class: 'row wrap bw-add' }, bwIn, h('button', { type: 'button', class: 'btn soft', onClick: function () {
        var v = C.parseNum(bwIn.input.value);
        if (v === null || v < 20 || v > 400) { UI.toast('Введите вес от 20 до 400 кг', 'error'); bwIn.input.focus(); return; }
        st.bodyLog = st.bodyLog.filter(function (b) { return b.date !== todayStr; });
        st.bodyLog.push({ id: C.uid('b'), date: todayStr, weight: v, note: '' });
        app.saveNow(); UI.toast('Вес сохранён'); app.render();
      } }, icon('plus', { size: 18 }), 'Записать на сегодня'))));

    // ---- недели ----
    var weeks = M.weeklyBuckets(st, 12, todayStr);
    var lbl = function (b) { return C.fmtDate(b.monday, { short: true }); };
    page.appendChild(h('div', { class: 'grid-2 charts-2' },
      h('section', { class: 'card', 'aria-labelledby': 'wv-h' }, h('div', { class: 'card-head' }, h('h2', { id: 'wv-h' }, icon('dumbbell', { size: 18 }), 'Объём по неделям, кг')),
        CH.barChart(weeks.map(function (b) { return { label: lbl(b), value: b.volume, title: 'Неделя с ' + C.fmtDate(b.monday) }; }), { label: 'Объём по неделям', half: true })),
      h('section', { class: 'card', 'aria-labelledby': 'wc-h' }, h('div', { class: 'card-head' }, h('h2', { id: 'wc-h' }, icon('calendar', { size: 18 }), 'Тренировок в неделю')),
        CH.barChart(weeks.map(function (b) { return { label: lbl(b), value: b.count, title: 'Неделя с ' + C.fmtDate(b.monday) }; }), { label: 'Тренировок в неделю', half: true, yFmt: function (v) { return String(Math.round(v * 10) / 10); } }))));

    // ---- рекорды ----
    var prs = M.personalRecords(st).sort(function (a, b) { return b.count - a.count; });
    if (prs.length) {
      page.appendChild(h('section', { class: 'card', 'aria-labelledby': 'pr-h' },
        h('div', { class: 'card-head' }, h('h2', { id: 'pr-h' }, icon('trophy', { size: 18, class: 'gold' }), 'Личные рекорды')),
        h('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Таблица рекордов' },
          h('table', { class: 'pr-table' },
            h('thead', null, h('tr', null, ['Упражнение', 'Лучший вес', '1ПМ', 'Повторы', 'Объём'].map(function (t) { return h('th', { scope: 'col' }, t); }))),
            h('tbody', null, prs.map(function (r) {
              return h('tr', null, h('th', { scope: 'row' }, r.name, h('span', { class: 'cell-hint' }, r.count + ' ' + C.plural(r.count, 'тренировка', 'тренировки', 'тренировок'))),
                h('td', null, M.fmtWeight(r.maxW, r.type), r.maxWDate ? h('span', { class: 'cell-hint' }, C.fmtDate(r.maxWDate, { short: true })) : null),
                h('td', null, r.e1rm ? C.fmtNum(r.e1rm) + ' кг' : '—'),
                h('td', null, String(r.maxReps)),
                h('td', null, r.volume ? C.fmtNum(r.volume) : '—'));
            }))))));
    }
  };
})(window);
