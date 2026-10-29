/* Настройки: тема, таймер отдыха, данные (экспорт/импорт/CSV/демо/сброс). */
(function (root) {
  'use strict';
  var WD = root.WD, C = WD.core, D = WD.dom, h = D.h, icon = D.icon, UI = WD.ui, IO = WD.io, S = WD.storage;
  WD.views = WD.views || {};

  WD.views.settings = function (page, arg, params) {
    var app = WD.app, st = app.state, set = st.settings;
    page.appendChild(UI.pageHead('Настройки', 'Всё хранится только в этом браузере'));

    // ---- внешний вид ----
    page.appendChild(h('section', { class: 'card', 'aria-labelledby': 'ap-h' },
      h('div', { class: 'card-head' }, h('h2', { id: 'ap-h' }, icon('sun', { size: 18 }), 'Оформление')),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Тема'),
        UI.segmented([{ value: 'auto', label: 'Авто' }, { value: 'light', label: 'Светлая', icon: 'sun' }, { value: 'dark', label: 'Тёмная', icon: 'moon' }], set.theme, function (v) { set.theme = v; app.applyTheme(); app.save(); }, 'Тема'))));

    // ---- таймер ----
    var restVal = h('output', { class: 'range-val' }, C.fmtClock(set.restSeconds));
    var range = h('input', { type: 'range', min: 30, max: 180, step: 15, value: set.restSeconds, id: 'rest-range', 'aria-valuetext': set.restSeconds + ' секунд', onInput: function () {
      set.restSeconds = +range.value; restVal.textContent = C.fmtClock(set.restSeconds); range.setAttribute('aria-valuetext', set.restSeconds + ' секунд'); app.save();
    } });
    var stepSel = h('select', { id: 'step-sel', onChange: function () { set.weightStep = +stepSel.value; app.save(); } },
      [0.5, 1, 1.25, 2, 2.5, 5, 10].map(function (v) { return h('option', { value: String(v) }, '± ' + String(v).replace('.', ',') + ' кг'); }));
    stepSel.value = String(set.weightStep);
    page.appendChild(h('section', { class: 'card', 'aria-labelledby': 'tm-h' },
      h('div', { class: 'card-head' }, h('h2', { id: 'tm-h' }, icon('timer', { size: 18 }), 'Таймер отдыха и ввод')),
      h('div', { class: 'field' }, h('label', { for: 'rest-range' }, 'Длительность отдыха ', restVal), range, h('span', { class: 'hint' }, 'от 30 секунд до 3 минут')),
      UI.toggle('Запускать таймер автоматически', set.autoRest, function (v) { set.autoRest = v; app.save(); }, 'после отметки подхода'),
      UI.toggle('Вибрация в конце отдыха', set.vibrate, function (v) { set.vibrate = v; app.save(); }, 'если устройство поддерживает'),
      UI.toggle('Звуковой сигнал', set.beep, function (v) { set.beep = v; app.save(); if (v) WD.timer.beep(); }),
      UI.field('Шаг кнопок − / + для веса', stepSel),
      h('button', { type: 'button', class: 'btn ghost sm', onClick: function () { WD.timer.unlockAudio(); WD.timer.start(set.restSeconds); } }, icon('play', { size: 16 }), 'Проверить таймер')));

    // ---- данные ----
    var fileIn = h('input', { type: 'file', accept: '.json,application/json', id: 'import-file', class: 'sr-only', onChange: function () {
      var f = fileIn.files && fileIn.files[0];
      fileIn.value = '';
      if (!f) return;
      if (f.size > IO.MAX_BYTES) { UI.toast('Файл слишком большой (максимум 5 МБ)', 'error'); return; }
      var rd = new FileReader();
      rd.onload = function () { importPreview(String(rd.result || ''), f.name, f.size); };
      rd.onerror = function () { UI.toast('Не удалось прочитать файл', 'error'); };
      rd.readAsText(f, 'utf-8');
    } });
    var stamp = C.today();
    page.appendChild(h('section', { class: 'card', 'aria-labelledby': 'dt-h', id: 'data' },
      h('div', { class: 'card-head' }, h('h2', { id: 'dt-h' }, icon('file', { size: 18 }), 'Данные')),
      h('p', { class: 'muted' }, 'Тренировок: ' + st.sessions.length + ' · записей веса: ' + st.bodyLog.length + '. Делайте резервную копию JSON время от времени — данные браузера могут быть очищены.'),
      h('div', { class: 'btn-grid' },
        h('button', { type: 'button', class: 'btn soft', id: 'export-json', onClick: function () { IO.download('workout-diary-' + stamp + '.json', IO.exportJSON(st), 'application/json'); UI.toast('Резервная копия сохранена'); } }, icon('download', { size: 18 }), 'Экспорт JSON'),
        h('label', { class: 'btn soft', for: 'import-file', tabindex: '0', role: 'button', id: 'import-btn', onKeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } } }, icon('upload', { size: 18 }), 'Импорт JSON'),
        h('button', { type: 'button', class: 'btn soft', id: 'export-csv', onClick: function () { IO.download('workout-diary-' + stamp + '.csv', IO.toCSV(st), 'text/csv;charset=utf-8'); UI.toast('CSV для Excel сохранён'); } }, icon('table', { size: 18 }), 'Экспорт CSV (Excel)')),
      fileIn,
      h('p', { class: 'hint' }, 'Импорт принимает файлы этого приложения (до 5 МБ). Перед импортом покажем, что в файле, и предложим заменить или объединить данные. CSV открывается в Excel: разделитель «;», кодировка UTF-8.')));

    page.appendChild(h('section', { class: 'card', 'aria-labelledby': 'dm-h' },
      h('div', { class: 'card-head' }, h('h2', { id: 'dm-h' }, icon('sparkles', { size: 18 }), 'Демо и сброс')),
      h('div', { class: 'btn-grid' },
        st.meta.demo ? h('button', { type: 'button', class: 'btn soft', onClick: function () {
          UI.confirm({ title: 'Удалить демо-данные?', text: 'Будут удалены только демо-тренировки. Ваши записи останутся.', ok: 'Удалить', danger: true }).then(function (ok) { if (ok) { WD.views.removeDemo(); UI.toast('Демо-данные удалены'); app.render(); } });
        } }, icon('trash', { size: 18 }), 'Удалить демо-данные')
          : h('button', { type: 'button', class: 'btn soft', onClick: function () { WD.views.loadDemo(); } }, icon('sparkles', { size: 18 }), 'Загрузить демо-данные'),
        h('button', { type: 'button', class: 'btn ghost danger-text', id: 'reset-all', onClick: function () {
          UI.confirm({ title: 'Стереть все данные?', text: 'Журнал, программа и настройки будут удалены из этого браузера. Сначала сделайте экспорт JSON, если данные нужны.', ok: 'Стереть всё', danger: true }).then(function (ok) {
            if (!ok) return; WD.timer.stop(); app.replaceState(S.defaultState()); UI.toast('Данные удалены'); app.go('today');
          });
        } }, icon('trash', { size: 18 }), 'Стереть все данные'))));

    page.appendChild(h('section', { class: 'card about', 'aria-labelledby': 'ab-h' },
      h('div', { class: 'card-head' }, h('h2', { id: 'ab-h' }, icon('info', { size: 18 }), 'О приложении')),
      h('p', null, 'Дневник тренировок — офлайн-приложение без сервера: данные хранятся в localStorage этого браузера (ключ «' + S.KEY + '», формат v' + S.VERSION + ') и никуда не отправляются.'),
      h('p', { class: 'muted small' }, 'Совет: на телефоне добавьте страницу на главный экран («Поделиться → На экран Домой» или меню браузера → «Установить приложение») — так она работает как приложение и без интернета.')));

    if (params.import) setTimeout(function () { var b = document.getElementById('import-btn'); if (b) { b.focus(); b.scrollIntoView({ block: 'center' }); } }, 50);
  };

  function importPreview(text, name, size) {
    var app = WD.app;
    var res = IO.parseImport(text);
    if (!res.ok) { UI.toast('Импорт невозможен: ' + res.error, 'error'); return; }
    var sm = res.summary;
    var mode = 'merge';
    var rebase = h('input', { type: 'checkbox', id: 'rebase-cb' });
    var rebaseDate = h('input', { type: 'date', id: 'rebase-date', value: sm.firstDate || C.today(), disabled: true });
    rebase.addEventListener('change', function () { rebaseDate.disabled = !rebase.checked; });
    var rows = [
      ['Файл', name + ' (' + Math.max(1, Math.round(size / 1024)) + ' КБ)'],
      ['Программа', res.hasProgram ? sm.days + ' ' + C.plural(sm.days, 'день', 'дня', 'дней') + ', ' + sm.exercises + ' упражн.' : 'нет'],
      ['Тренировок', String(sm.sessions) + (sm.skipped ? ' (пропущено повреждённых: ' + sm.skipped + ')' : '')],
      ['Подходов', String(sm.sets)],
      ['Записей веса тела', String(sm.bodyLog)],
      ['Период', sm.firstDate ? C.fmtDate(sm.firstDate) + ' — ' + C.fmtDate(sm.lastDate) : '—']
    ];
    var body = h('div', { class: 'import-preview' },
      h('dl', { class: 'kv' }, rows.map(function (r) { return [h('dt', null, r[0]), h('dd', null, r[1])]; })),
      h('fieldset', { class: 'field' }, h('legend', null, 'Как импортировать'),
        UI.segmented([{ value: 'merge', label: 'Объединить' }, { value: 'replace', label: 'Заменить всё' }], mode, function (v) { mode = v; note.textContent = v === 'replace' ? 'Текущие данные будут полностью заменены содержимым файла.' : 'Тренировки из файла добавятся к текущим (совпадающие по id — обновятся), недостающие дни и упражнения добавятся в программу.'; }, 'Режим импорта')),
      (function () { var p = h('p', { class: 'hint' }); return p; })(),
      sm.firstDate ? h('div', { class: 'field' },
        h('label', { class: 'check-row', for: 'rebase-cb' }, rebase, h('span', null, 'Сдвинуть даты: первая тренировка будет')),
        rebaseDate, h('span', { class: 'hint' }, 'Удобно, если даты в файле условные. Все тренировки сдвинутся на одинаковое число дней.')) : null);
    var note = body.querySelector('.hint');
    note.textContent = 'Тренировки из файла добавятся к текущим (совпадающие по id — обновятся), недостающие дни и упражнения добавятся в программу.';
    UI.modal({ title: 'Импорт данных', icon: 'upload', body: body, wide: true,
      actions: [{ label: 'Отмена', kind: 'ghost' }, { label: 'Импортировать', kind: 'primary', icon: 'check', onClick: function () {
        var data = res.data;
        if (rebase.checked && C.isDateStr(rebaseDate.value)) data = IO.rebaseDates(data, rebaseDate.value);
        var next = IO.applyImport(app.state, data, mode, { hasProgram: res.hasProgram, hasSettings: res.hasSettings });
        WD.timer.stop();
        app.replaceState(next);
        UI.toast('Импортировано тренировок: ' + data.sessions.length);
        app.go('journal' + (data.sessions.length ? '?month=' + data.sessions.map(function (s) { return s.date; }).sort().pop().slice(0, 7) : ''));
      } }] });
  }
  WD.views.importPreview = importPreview;
})(window);
