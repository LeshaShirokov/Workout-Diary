/* Программа: дни и упражнения (добавить, переименовать, переставить, удалить). */
(function (root) {
  'use strict';
  var WD = root.WD, C = WD.core, M = WD.model, D = WD.dom, h = D.h, icon = D.icon, UI = WD.ui;
  WD.views = WD.views || {};

  function move(arr, i, d) { var j = i + d; if (j < 0 || j >= arr.length) return false; var t = arr[i]; arr[i] = arr[j]; arr[j] = t; return true; }
  function rerender(focusKey) {
    WD.app.saveNow();
    var y = root.scrollY;
    WD.app._navigated = false;
    WD.app.render();
    root.scrollTo(0, y);
    if (focusKey) { var el = document.querySelector('[data-fk="' + focusKey + '"]'); if (el) el.focus(); }
  }

  WD.views.program = function (page) {
    var app = WD.app, st = app.state, prog = st.program;
    page.appendChild(UI.pageHead('Программа', 'Шаблон тренировок: дни, упражнения и число подходов'));

    var nameIn = UI.textInput({ value: prog.name, maxlength: 200, onInput: function () { prog.name = nameIn.value; app.save(); } });
    var startIn = h('input', { type: 'date', value: st.settings.programStart, onChange: function () {
      if (C.isDateStr(startIn.value)) { st.settings.programStart = C.mondayOf(startIn.value); app.save(); UI.toast('Неделя 1 начинается ' + C.fmtDate(st.settings.programStart)); }
    } });
    page.appendChild(h('section', { class: 'card' }, h('div', { class: 'grid-2' },
      UI.field('Название программы', nameIn),
      UI.field('Начало программы (неделя 1)', startIn, 'Номера недель на экране «Неделя» считаются от понедельника этой даты'))));

    prog.days.forEach(function (day, di) {
      var dName = UI.textInput({ value: day.name, maxlength: 60, 'aria-label': 'Название дня ' + (di + 1), onInput: function () { day.name = dName.value; app.save(); } });
      var dTitle = UI.textInput({ value: day.title, maxlength: 200, placeholder: 'Например: Спина', 'aria-label': 'Мышцы / описание дня ' + (di + 1), onInput: function () { day.title = dTitle.value; app.save(); } });
      var card = h('section', { class: 'card prog-day', style: { '--hue': WD.views.dayHue(di) }, 'aria-label': day.name });
      card.appendChild(h('div', { class: 'prog-day-head' },
        h('span', { class: 'day-pill' }, String(di + 1)),
        h('div', { class: 'prog-day-fields' }, dName, dTitle),
        h('div', { class: 'tools' },
          h('button', { type: 'button', class: 'btn icon-btn ghost', 'aria-label': 'Переместить день выше', disabled: di === 0, dataset: { fk: 'dup-' + day.id }, onClick: function () { if (move(prog.days, di, -1)) rerender('dup-' + day.id); } }, icon('chevUp')),
          h('button', { type: 'button', class: 'btn icon-btn ghost', 'aria-label': 'Переместить день ниже', disabled: di === prog.days.length - 1, dataset: { fk: 'ddn-' + day.id }, onClick: function () { if (move(prog.days, di, 1)) rerender('ddn-' + day.id); } }, icon('chevDown')),
          h('button', { type: 'button', class: 'btn icon-btn ghost danger-text', 'aria-label': 'Удалить день «' + day.name + '»', onClick: function () {
            UI.confirm({ title: 'Удалить ' + day.name + '?', text: 'День и его упражнения будут удалены из программы. Прошлые тренировки останутся в журнале.', ok: 'Удалить', danger: true }).then(function (ok) {
              if (!ok) return; prog.days.splice(di, 1); rerender(); UI.toast('День удалён');
            });
          } }, icon('trash')))));

      var list = h('ol', { class: 'prog-ex' });
      day.exercises.forEach(function (e, ei) {
        var nIn = UI.textInput({ value: e.name, maxlength: 200, 'aria-label': 'Название упражнения ' + (ei + 1), dataset: { fk: 'en-' + e.id }, onInput: function () { e.name = nIn.value; app.save(); },
          onChange: function () {
            // переименование обновляет и историю этого упражнения, чтобы графики не «рвались»
            var nn = nIn.value.trim() || 'Упражнение'; e.name = nn; nIn.value = nn;
            st.sessions.forEach(function (s) { s.exercises.forEach(function (x) { if (x.exId === e.id) x.name = nn; }); });
            app.save();
          } });
        var tSel = h('select', { 'aria-label': 'Тип упражнения «' + e.name + '»', onChange: function () { e.type = tSel.value; if (e.type === 'cardio') e.sets = 1; else if (!e.sets || e.sets < 1) e.sets = 3; rerender('et-' + e.id); }, dataset: { fk: 'et-' + e.id } },
          Object.keys(M.TYPES).map(function (k) { return h('option', { value: k }, M.TYPES[k].label); }));
        tSel.value = e.type;
        var sets = e.type === 'cardio' ? null : UI.stepper({ value: e.sets, step: 1, min: 1, max: 20, decimal: false, label: 'Подходов в «' + e.name + '»', cls: 'sm', onInput: function (v) { if (v !== null) { e.sets = C.clamp(Math.round(v), 1, 20); app.save(); } } });
        list.appendChild(h('li', { class: 'prog-ex-row type-' + e.type },
          h('span', { class: 'ex-idx', 'aria-hidden': 'true' }, String(ei + 1)),
          h('div', { class: 'prog-ex-main' }, nIn, h('div', { class: 'row wrap gap-s' }, tSel, sets ? h('label', { class: 'sets-lbl' }, h('span', null, 'подходов'), sets) : h('span', { class: 'muted small' }, 'мин · км · ккал'))),
          h('div', { class: 'tools' },
            h('button', { type: 'button', class: 'btn icon-btn ghost', 'aria-label': 'Выше', disabled: ei === 0, dataset: { fk: 'eup-' + e.id }, onClick: function () { if (move(day.exercises, ei, -1)) rerender('eup-' + e.id); } }, icon('chevUp')),
            h('button', { type: 'button', class: 'btn icon-btn ghost', 'aria-label': 'Ниже', disabled: ei === day.exercises.length - 1, dataset: { fk: 'edn-' + e.id }, onClick: function () { if (move(day.exercises, ei, 1)) rerender('edn-' + e.id); } }, icon('chevDown')),
            h('button', { type: 'button', class: 'btn icon-btn ghost danger-text', 'aria-label': 'Удалить «' + e.name + '»', onClick: function () {
              UI.confirm({ title: 'Удалить упражнение?', text: '«' + e.name + '» будет убрано из программы. История в журнале сохранится.', ok: 'Удалить', danger: true }).then(function (ok) {
                if (!ok) return; day.exercises.splice(ei, 1); rerender();
              });
            } }, icon('trash')))));
      });
      card.appendChild(list);
      card.appendChild(h('button', { type: 'button', class: 'btn soft block', onClick: function () {
        var ne = { id: C.uid('e'), name: 'Новое упражнение', type: 'strength', sets: 3 };
        var cardioIdx = -1;
        day.exercises.forEach(function (x, i) { if (x.type === 'cardio') cardioIdx = i; });
        if (cardioIdx === day.exercises.length - 1 && cardioIdx >= 0) day.exercises.splice(cardioIdx, 0, ne); else day.exercises.push(ne);
        rerender('en-' + ne.id);
        var el = document.querySelector('[data-fk="en-' + ne.id + '"]'); if (el) el.select();
      } }, icon('plus', { size: 18 }), 'Добавить упражнение'));
      page.appendChild(card);
    });

    page.appendChild(h('div', { class: 'row wrap' },
      h('button', { type: 'button', class: 'btn primary', onClick: function () {
        var nd = { id: C.uid('d'), name: 'День ' + (prog.days.length + 1), title: '', exercises: [{ id: C.uid('e'), name: 'Кардио', type: 'cardio', sets: 1 }] };
        prog.days.push(nd); rerender();
        UI.toast('Добавлен ' + nd.name);
      } }, icon('plus', { size: 18 }), 'Добавить день'),
      h('button', { type: 'button', class: 'btn ghost', onClick: function () {
        UI.confirm({ title: 'Вернуть исходную программу?', text: 'Текущие дни и упражнения будут заменены программой из таблицы (3 дня). Журнал не изменится.', ok: 'Вернуть' }).then(function (ok) {
          if (!ok) return; st.program = WD.seed.defaultProgram(); rerender(); UI.toast('Программа восстановлена');
        });
      } }, 'Сбросить к исходной')));
  };
})(window);
