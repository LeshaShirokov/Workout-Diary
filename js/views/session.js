/* Экран тренировки: подходы, отдых, кардио, итоги. */
(function (root) {
  'use strict';
  var WD = root.WD, C = WD.core, M = WD.model, D = WD.dom, h = D.h, icon = D.icon, UI = WD.ui;
  WD.views = WD.views || {};

  function isNum(n) { return typeof n === 'number' && isFinite(n); }
  function dispW(w, type) { return isNum(w) ? (type === 'assisted' ? Math.abs(w) : w) : null; }
  function storeW(v, type) { return v === null ? null : type === 'assisted' ? -Math.abs(v) : v; }

  WD.views.session = function (page, id, params, ctx) {
    var app = WD.app, st = app.state;
    var sess = app.findSession(id);
    if (!sess) {
      page.appendChild(UI.emptyState('info', 'Тренировка не найдена', 'Возможно, она была удалена.', [h('a', { class: 'btn primary', href: '#/journal' }, 'К журналу')]));
      return;
    }
    var isDraft = sess.status === 'draft';
    var prev = M.previousSession(st, sess.dayId, sess.date, sess.id);
    var changed = function () { app.save(); refresh(); };

    // ---- шапка ----
    var durEl = h('span', { class: 'live-num' }, '—');
    var volEl = h('span', { class: 'live-num' }, '0');
    var setsEl = h('span', { class: 'live-num' }, '0');
    var dateInput = h('input', { type: 'date', value: sess.date, 'aria-label': 'Дата тренировки', class: 'date-chip', onChange: function () {
      if (C.isDateStr(dateInput.value)) { sess.date = dateInput.value; app.save(); }
    } });
    page.appendChild(h('header', { class: 'page-head session-head' },
      h('div', { class: 'grow' },
        h('a', { href: isDraft ? '#/today' : '#/journal', class: 'back-link' }, icon('chevL', { size: 18 }), isDraft ? 'Сегодня' : 'Журнал'),
        h('h1', { class: 'page-title', tabindex: '-1' }, sess.dayName || 'Тренировка'),
        h('div', { class: 'row wrap gap-s' }, dateInput, isDraft ? UI.badge('идёт тренировка', 'live') : UI.badge('завершена', 'ok')))));

    var liveBar = h('section', { class: 'live-bar', 'aria-label': 'Показатели тренировки' },
      h('div', { class: 'live' }, icon('clock', { size: 18 }), h('div', null, durEl, h('span', { class: 'live-lbl' }, 'время'))),
      h('div', { class: 'live' }, icon('dumbbell', { size: 18 }), h('div', null, volEl, h('span', { class: 'live-lbl' }, 'объём, кг'))),
      h('div', { class: 'live' }, icon('check', { size: 18 }), h('div', null, setsEl, h('span', { class: 'live-lbl' }, 'подходов'))));
    page.appendChild(liveBar);
    if (isDraft && WD.pwa && WD.pwa.wakeSupported()) page.appendChild(wakeRow());

    function wakeRow() {
      var P = WD.pwa;
      var stateEl = h('span', { class: 'hint wake-state', id: 'wake-state' });
      function upd() {
        if (!stateEl.isConnected && off) { off(); return; }
        stateEl.textContent = !st.settings.wakeLock ? 'экран погаснет как обычно' : P.wakeActive() ? 'включено — экран не погаснет' : 'браузер не разрешил — экран может погаснуть';
      }
      var off = P.onChange(upd);
      var row = UI.toggle('Не гасить экран во время тренировки', st.settings.wakeLock, function (v) {
        st.settings.wakeLock = v; app.save(); P.keepAwake(v).then(upd);
      });
      row.classList.add('wake-row');
      row.id = 'wake-row';
      row.querySelector('.toggle-label').appendChild(stateEl);
      setTimeout(upd, 300);
      return h('section', { class: 'card compact' }, row);
    }

    function refresh() {
      var s = M.sessionStats(sess);
      volEl.textContent = C.fmtNum(s.volume);
      var doneCount = 0, total = 0;
      sess.exercises.forEach(function (e) { if (e.type !== 'cardio') e.sets.forEach(function (x) { total++; if (x.done || M.isValidSet(x)) doneCount++; }); });
      setsEl.textContent = doneCount + '/' + total;
      updateDur();
    }
    function updateDur() {
      if (isDraft && sess.startedAt) durEl.textContent = C.fmtClock((Date.now() - sess.startedAt) / 1000);
      else durEl.textContent = sess.durationSec ? C.fmtDuration(sess.durationSec) : '—';
    }
    if (isDraft) {
      var tick = setInterval(updateDur, 1000);
      var P = WD.pwa;
      if (P && P.wakeSupported() && st.settings.wakeLock) P.keepAwake(true);
      ctx.cleanup = function () { clearInterval(tick); if (P) P.keepAwake(false); app.saveNow(); };
    }
    else ctx.cleanup = function () { app.saveNow(); };

    // ---- прошлый раз ----
    if (prev) {
      page.appendChild(h('div', { class: 'prev-bar' },
        icon('clock', { size: 16 }), h('span', { class: 'grow' }, 'Подсказки — с тренировки ', h('strong', null, C.fmtDate(prev.date, { year: false }))),
        h('button', { type: 'button', class: 'btn soft sm', id: 'same-as-last', onClick: function () {
          var n = 0;
          sess.exercises.forEach(function (ex) { n += fillFromPrev(ex, M.findPrevExercise(prev, ex)); });
          app.save(); rerenderExercises();
          UI.toast(n ? 'Заполнено как в прошлый раз' : 'Нечего заполнять — все поля уже указаны');
        } }, icon('copy', { size: 16 }), 'Как в прошлый раз')));
    }

    // ---- упражнения ----
    var list = h('div', { class: 'ex-list' });
    page.appendChild(list);
    function rerenderExercises() {
      D.clear(list);
      sess.exercises.forEach(function (ex, i) { list.appendChild(exerciseCard(ex, i, prev ? M.findPrevExercise(prev, ex) : null)); });
      refresh();
    }

    function fillFromPrev(ex, pe) {
      if (!pe) return 0;
      var n = 0;
      if (ex.type === 'cardio') {
        ex.cardio = ex.cardio || {};
        ['min', 'km', 'kcal'].forEach(function (k) { if (!isNum(ex.cardio[k]) && pe.cardio && isNum(pe.cardio[k])) { ex.cardio[k] = pe.cardio[k]; n++; } });
        return n;
      }
      ex.sets.forEach(function (s, i) {
        var ps = pe.sets[i];
        if (!ps) return;
        if (!isNum(s.w) && isNum(ps.w)) { s.w = ps.w; n++; }
        if (!isNum(s.r) && isNum(ps.r)) { s.r = ps.r; n++; }
      });
      return n;
    }

    function exerciseCard(ex, i, pe) {
      var type = M.TYPES[ex.type] || M.TYPES.strength;
      var progressEl = h('span', { class: 'ex-progress' });
      var card = h('section', { class: 'card ex-card type-' + ex.type, 'aria-labelledby': 'ex-' + i, style: { '--i': i } });
      function updProgress() {
        if (ex.type === 'cardio') { progressEl.textContent = M.cardioText(ex.cardio) || ''; return; }
        var d = ex.sets.filter(function (s) { return s.done; }).length;
        progressEl.textContent = d + '/' + ex.sets.length;
        card.classList.toggle('complete', d > 0 && d === ex.sets.length);
      }
      var head = h('div', { class: 'ex-head' },
        h('span', { class: 'ex-idx', 'aria-hidden': 'true' }, ex.type === 'cardio' ? icon('pulse', { size: 16 }) : String(i + 1)),
        h('div', { class: 'grow' }, h('h2', { id: 'ex-' + i, class: 'ex-name' }, ex.name),
          h('span', { class: 'ex-type' }, type.label + ' · ' + type.hint)),
        progressEl);
      card.appendChild(head);
      if (pe) {
        var prevText = pe.type === 'cardio' ? M.cardioText(pe.cardio) : pe.sets.filter(M.isValidSet).map(function (s) { return M.fmtSet(s, pe.type); }).join('  ·  ');
        if (prevText) card.appendChild(h('p', { class: 'ex-prev' }, h('span', { class: 'muted' }, 'Прошлый раз: '), prevText));
      }
      if (ex.type === 'cardio') card.appendChild(cardioBlock(ex, pe, updProgress));
      else {
        var setsBox = h('div', { class: 'sets' });
        card.appendChild(setsBox);
        var drawSets = function () {
          D.clear(setsBox);
          ex.sets.forEach(function (s, si) { setsBox.appendChild(setRow(ex, s, si, pe && pe.sets[si], updProgress)); });
          updProgress();
        };
        drawSets();
        card.appendChild(h('div', { class: 'ex-tools' },
          h('button', { type: 'button', class: 'btn ghost sm', onClick: function () {
            var last = ex.sets[ex.sets.length - 1];
            ex.sets.push({ w: last ? last.w : null, r: last ? last.r : null, done: false });
            drawSets(); changed();
          } }, icon('plus', { size: 16 }), 'Подход'),
          ex.sets.length ? h('button', { type: 'button', class: 'btn ghost sm', onClick: function () {
            if (ex.sets.length <= 1) return;
            ex.sets.pop(); drawSets(); changed();
          } }, icon('minus', { size: 16 }), 'Убрать') : null,
          pe ? h('button', { type: 'button', class: 'btn ghost sm', onClick: function () { fillFromPrev(ex, pe); drawSets(); changed(); } }, icon('copy', { size: 16 }), 'Как в прошлый') : null));
      }
      // заметка к упражнению
      var noteArea = h('textarea', { rows: 2, maxlength: 2000, placeholder: 'Например: сиденье на 4, узкий хват', 'aria-label': 'Заметка к упражнению «' + ex.name + '»', value: ex.note || '', onInput: function () { ex.note = noteArea.value; app.save(); } });
      var det = h('details', { class: 'ex-note' }, h('summary', null, icon('note', { size: 16 }), ex.note ? 'Заметка' : 'Добавить заметку'), noteArea);
      if (ex.note) det.open = true;
      card.appendChild(det);
      updProgress();
      return card;
    }

    function setRow(ex, s, si, ps, updProgress) {
      var assisted = ex.type === 'assisted';
      var wLabel = assisted ? 'помощь, кг' : ex.type === 'bodyweight' ? 'доп. вес, кг' : 'вес, кг';
      var row = h('div', { class: 'set' + (s.done ? ' done' : '') });
      var wStep = WD.app.state.settings.weightStep || 2.5;
      var wIn = UI.stepper({ value: dispW(s.w, ex.type), placeholder: ps ? dispW(ps.w, ex.type) : '', step: wStep, min: 0, max: 1500, label: 'Подход ' + (si + 1) + ', ' + wLabel, cls: 'w',
        onInput: function (v) { s.w = storeW(v, ex.type); changed(); } });
      var rIn = UI.stepper({ value: s.r, placeholder: ps && isNum(ps.r) ? ps.r : '', step: 1, min: 0, max: 1000, decimal: false, label: 'Подход ' + (si + 1) + ', повторы', cls: 'r',
        onInput: function (v) { s.r = v === null ? null : Math.round(v); changed(); } });
      var check = h('button', { type: 'button', class: 'check', 'aria-pressed': String(!!s.done), 'aria-label': 'Подход ' + (si + 1) + ' выполнен', onClick: function () {
        WD.timer.unlockAudio();
        if (!s.done) {
          if (!isNum(s.r) && ps && isNum(ps.r)) { s.r = ps.r; rIn.input.value = String(ps.r); }
          if (!isNum(s.w) && ps && isNum(ps.w)) { s.w = ps.w; wIn.input.value = String(dispW(ps.w, ex.type)).replace('.', ','); }
          if (!isNum(s.w) && (ex.type === 'bodyweight' || ex.type === 'assisted') && isNum(s.r)) s.w = 0;
          if (!isNum(s.r) || s.r <= 0) { UI.toast('Укажите количество повторов', 'error'); rIn.input.focus(); return; }
          if (!isNum(s.w)) s.w = 0;
          if (!wIn.input.value) wIn.input.value = String(dispW(s.w, ex.type)).replace('.', ',');
          s.done = true;
          if (isDraft && WD.app.state.settings.autoRest) WD.timer.start(WD.app.state.settings.restSeconds);
        } else s.done = false;
        check.setAttribute('aria-pressed', String(s.done));
        row.classList.toggle('done', s.done);
        if (s.done) { row.classList.remove('pop'); void row.offsetWidth; row.classList.add('pop'); }
        updProgress(); changed();
      } }, icon('check', { size: 22, stroke: 3 }));
      row.appendChild(h('span', { class: 'set-n', 'aria-hidden': 'true' }, String(si + 1)));
      row.appendChild(h('div', { class: 'set-f' }, wIn, h('span', { class: 'set-lbl' }, wLabel)));
      row.appendChild(h('div', { class: 'set-f' }, rIn, h('span', { class: 'set-lbl' }, 'повторы')));
      row.appendChild(check);
      if (ps && M.isValidSet(ps)) row.appendChild(h('span', { class: 'set-prev' }, 'было ' + M.fmtSet(ps, ex.type)));
      return row;
    }

    function cardioBlock(ex, pe, updProgress) {
      ex.cardio = ex.cardio || { min: null, km: null, kcal: null };
      var pc = pe && pe.cardio ? pe.cardio : {};
      var fields = [['min', 'минуты', 1], ['km', 'км', 0.1], ['kcal', 'ккал', 5]];
      var inputs = {};
      var grid = h('div', { class: 'cardio-grid' }, fields.map(function (f) {
        var st = UI.stepper({ value: ex.cardio[f[0]], placeholder: isNum(pc[f[0]]) ? pc[f[0]] : '', step: f[2], min: 0, max: 100000, label: 'Кардио, ' + f[1], onInput: function (v) { ex.cardio[f[0]] = v; updProgress(); changed(); } });
        inputs[f[0]] = st.input;
        return h('div', { class: 'set-f' }, st, h('span', { class: 'set-lbl' }, f[1]));
      }));
      var quick = UI.textInput({ placeholder: 'например: 20 мин 2.5 км 180 ккал', 'aria-label': 'Быстрый ввод кардио строкой' });
      quick.addEventListener('change', function () {
        var p = M.parseCardio(quick.value);
        ['min', 'km', 'kcal'].forEach(function (k) { if (p[k] !== null) { ex.cardio[k] = p[k]; inputs[k].value = String(p[k]).replace('.', ','); } });
        updProgress(); changed();
      });
      return h('div', null, grid, h('div', { class: 'quick-cardio' }, icon('bolt', { size: 16 }), quick));
    }

    rerenderExercises();

    // ---- самочувствие и заметки ----
    var bwIn = UI.stepper({ value: sess.bodyWeight, placeholder: lastBodyWeight(st, sess), step: 0.1, min: 0, max: 400, label: 'Вес тела, кг', onInput: function (v) { sess.bodyWeight = v; app.save(); } });
    var feelBox = h('div', { class: 'feel-row', role: 'radiogroup', 'aria-label': 'Самочувствие' });
    [1, 2, 3, 4, 5].forEach(function (n) {
      var b = h('button', { type: 'button', role: 'radio', class: 'feel-btn f' + n, 'aria-checked': String(sess.feeling === n), title: UI.FEEL[n], onClick: function () {
        sess.feeling = sess.feeling === n ? null : n;
        Array.prototype.forEach.call(feelBox.children, function (c, ci) { c.setAttribute('aria-checked', String(sess.feeling === ci + 1)); });
        app.save();
      } }, UI.feelingIcon(n), h('span', null, UI.FEEL[n]));
      feelBox.appendChild(b);
    });
    var notes = h('textarea', { rows: 3, maxlength: 2000, value: sess.notes || '', placeholder: 'Как прошла тренировка?', onInput: function () { sess.notes = notes.value; app.save(); } });
    var wrap = h('section', { class: 'card', 'aria-labelledby': 'sum-h' },
      h('div', { class: 'card-head' }, h('h2', { id: 'sum-h' }, icon('heart', { size: 18 }), 'Самочувствие и заметки')),
      h('div', { class: 'grid-2' }, h('div', { class: 'field' }, h('label', { for: (bwIn.input.id = D.nextId('bw')) }, 'Вес тела, кг'), bwIn),
        !isDraft ? durationField() : null),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Самочувствие'), feelBox),
      UI.field('Заметки к тренировке', notes));
    page.appendChild(wrap);

    function durationField() {
      var inp = UI.stepper({ value: sess.durationSec ? Math.round(sess.durationSec / 60) : null, step: 5, min: 0, max: 1440, decimal: false, label: 'Длительность, минут', onInput: function (v) { sess.durationSec = v === null ? null : Math.round(v * 60); changed(); } });
      inp.input.id = D.nextId('dur');
      return h('div', { class: 'field' }, h('label', { for: inp.input.id }, 'Длительность, мин'), inp);
    }

    // ---- действия ----
    var actions = h('div', { class: 'session-actions' });
    if (isDraft) {
      actions.appendChild(h('button', { type: 'button', class: 'btn primary xl block', id: 'finish-btn', onClick: finish }, icon('flag', { size: 20 }), 'Завершить тренировку'));
      actions.appendChild(h('button', { type: 'button', class: 'btn ghost danger-text', onClick: del }, icon('trash', { size: 18 }), 'Удалить черновик'));
    } else {
      actions.appendChild(h('button', { type: 'button', class: 'btn soft', id: 'repeat-btn', onClick: function () { WD.views.repeatSession(sess); } }, icon('copy', { size: 18 }), 'Повторить сегодня'));
      actions.appendChild(h('button', { type: 'button', class: 'btn ghost danger-text', id: 'delete-btn', onClick: del }, icon('trash', { size: 18 }), 'Удалить тренировку'));
    }
    page.appendChild(actions);

    function del() {
      UI.confirm({ title: 'Удалить тренировку?', text: (sess.dayName || 'Тренировка') + ', ' + C.fmtDate(sess.date) + '. Это действие нельзя отменить.', ok: 'Удалить', danger: true }).then(function (ok) {
        if (!ok) return;
        WD.timer.stop();
        app.state.sessions = app.state.sessions.filter(function (x) { return x.id !== sess.id; });
        app.saveNow();
        UI.toast('Тренировка удалена');
        app.go('journal');
      });
    }
    function finish() {
      var stt = M.sessionStats(sess);
      var go = function () {
        WD.timer.stop();
        var now = Date.now();
        var dur = sess.startedAt ? Math.round((now - sess.startedAt) / 1000) : null;
        sess.durationSec = dur !== null && dur > 0 && dur <= 6 * 3600 ? dur : sess.durationSec;
        sess.finishedAt = now;
        sess.status = 'done';
        app.saveNow();
        showSummary(sess);
      };
      if (!stt.sets && !stt.cardioMin && !stt.cardioKm) {
        UI.confirm({ title: 'Нет ни одного подхода', text: 'Завершить тренировку без записанных подходов?', ok: 'Завершить' }).then(function (ok) { if (ok) go(); });
      } else go();
    }
  };

  function lastBodyWeight(st, sess) {
    var s = M.bodyWeightSeries(st).filter(function (b) { return b.date <= sess.date; });
    return s.length ? s[s.length - 1].weight : '';
  }

  function showSummary(sess) {
    var st = WD.app.state;
    var stt = M.sessionStats(sess);
    var prs = M.detectPRs(st, sess);
    var body = h('div', { class: 'summary' },
      h('div', { class: 'summary-hero' }, h('span', { class: 'confetti', 'aria-hidden': 'true' }), h('p', { class: 'muted' }, sess.dayName + ' · ' + C.fmtDate(sess.date, { year: false }))),
      h('div', { class: 'stats-row' },
        UI.stat('объём, кг', C.fmtNum(stt.volume), 'dumbbell'),
        UI.stat('подходов', String(stt.sets), 'check'),
        UI.stat('длительность', sess.durationSec ? C.fmtDuration(sess.durationSec) : '—', 'clock')),
      stt.cardioMin || stt.cardioKcal ? h('p', { class: 'center muted' }, icon('pulse', { size: 16 }), ' Кардио: ' + M.cardioText({ min: stt.cardioMin || null, km: stt.cardioKm || null, kcal: stt.cardioKcal || null })) : null,
      prs.length ? h('div', { class: 'pr-list' },
        h('h3', null, icon('trophy', { size: 20, class: 'gold' }), 'Личные рекорды: ' + prs.length),
        h('ul', null, prs.map(function (p) {
          var val = p.kind === 'reps' ? p.value + ' повт. (было ' + p.prev + ')' : p.kind === 'e1rm' ? '1ПМ ≈ ' + C.fmtNum(p.value) + ' кг (было ' + C.fmtNum(p.prev) + ')' : M.fmtWeight(p.value, p.type) + ' (было ' + M.fmtWeight(p.prev, p.type) + ')';
          return h('li', null, icon('trophy', { size: 16, class: 'gold' }), h('span', null, h('strong', null, p.name), ' — ' + val));
        }))) : h('p', { class: 'center muted' }, 'Отличная работа! Рекорды появятся, когда вы превзойдёте прошлые результаты.'));
    UI.modal({ title: 'Тренировка завершена', icon: 'flag', iconClass: 'ok', body: body, sticky: true,
      actions: [{ label: 'К журналу', kind: 'ghost', onClick: function () { WD.app.go('journal'); } }, { label: 'Готово', kind: 'primary', onClick: function () { WD.app.go('session/' + sess.id); } }] });
  }
  WD.views.showSummary = showSummary;

  WD.views.repeatSession = function (sess) {
    var app = WD.app;
    var copy = M.copySession(sess, C.today());
    app.state.sessions.push(copy);
    app.saveNow();
    UI.toast('Создана тренировка на сегодня по образцу');
    app.go('session/' + copy.id);
  };
})(window);
