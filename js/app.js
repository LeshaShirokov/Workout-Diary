/* Дневник тренировок — состояние, маршрутизация, оболочка приложения. */
(function (root) {
  'use strict';
  var WD = root.WD = root.WD || {};
  var C = WD.core, D = WD.dom, h = D.h, icon = D.icon, S = WD.storage;

  var app = WD.app = { state: null, views: (WD.views = WD.views || {}), current: null };
  var saveTimer = null, main, navLinks = [], saveDot;

  // ---------- хранение ----------
  app.save = function () {
    clearTimeout(saveTimer);
    if (saveDot) saveDot.classList.add('pending');
    saveTimer = setTimeout(app.saveNow, 400);
  };
  app.saveNow = function () {
    clearTimeout(saveTimer);
    var ok = S.save(app.state);
    if (saveDot) { saveDot.classList.remove('pending'); saveDot.classList.toggle('error', !ok); }
    if (!ok && !app._warned) { app._warned = true; WD.ui.toast('Не удалось сохранить данные в браузере (хранилище недоступно или заполнено)', 'error'); }
    return ok;
  };
  app.replaceState = function (st) { app.state = st; applyTheme(); app.saveNow(); };
  app.findSession = function (id) { return app.state.sessions.filter(function (s) { return s.id === id; })[0] || null; };
  app.draft = function () {
    var d = app.state.sessions.filter(function (s) { return s.status === 'draft'; });
    d.sort(function (a, b) { return (b.startedAt || 0) - (a.startedAt || 0); });
    return d[0] || null;
  };
  app.dayById = function (id) { return app.state.program.days.filter(function (d) { return d.id === id; })[0] || null; };

  // ---------- тема ----------
  var THEME_LIGHT = '#f3f4fb', THEME_DARK = '#0d0f1c';
  var mq = root.matchMedia ? root.matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    var pref = app.state.settings.theme;
    try { localStorage.setItem(S.THEME_KEY, pref); } catch (e) { /* ignore */ }
    var dark = pref === 'dark' || (pref === 'auto' && mq && mq.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    // theme-color: в режиме «Авто» работают варианты meta с media, иначе оба получают цвет выбранной темы
    Array.prototype.forEach.call(document.querySelectorAll('meta[name="theme-color"]'), function (m) {
      var own = m.getAttribute('data-color') || m.getAttribute('content');
      m.setAttribute('data-color', own);
      m.setAttribute('content', pref === 'auto' ? own : (dark ? THEME_DARK : THEME_LIGHT));
    });
    if (themeBtn) {
      D.clear(themeBtn).appendChild(icon(dark ? 'sun' : 'moon'));
      themeBtn.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
    }
  }
  app.applyTheme = applyTheme;
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (app.state) applyTheme(); });

  // ---------- маршрутизация ----------
  var NAV = [
    { route: 'today', label: 'Сегодня', icon: 'home' },
    { route: 'journal', label: 'Журнал', icon: 'calendar' },
    { route: 'week', label: 'Неделя', icon: 'table' },
    { route: 'progress', label: 'Прогресс', icon: 'chart' },
    { route: 'program', label: 'Программа', icon: 'dumbbell' }
  ];
  app.go = function (hash) { if (location.hash === '#/' + hash) render(); else location.hash = '#/' + hash; };
  function parseHash() {
    var raw = (location.hash || '').replace(/^#\/?/, '');
    var q = raw.split('?'), parts = q[0].split('/').filter(Boolean).map(function (p) { try { return decodeURIComponent(p); } catch (e) { return ''; } });
    var params = {};
    (q[1] || '').split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); try { params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); } catch (e) { /* ignore */ } });
    return { route: parts[0] || 'today', arg: parts[1] || null, params: params };
  }
  var TITLES = { today: 'Сегодня', journal: 'Журнал', week: 'Неделя', progress: 'Прогресс', program: 'Программа', settings: 'Настройки', session: 'Тренировка' };
  function render() {
    var r = parseHash();
    var view = app.views[r.route] ? r.route : 'today';
    if (app.current && app.current.cleanup) { try { app.current.cleanup(); } catch (e) { /* ignore */ } }
    app.current = { route: view };
    D.clear(main);
    var page = h('div', { class: 'page page-' + view });
    main.appendChild(page);
    try { app.views[view](page, r.arg, r.params, app.current); }
    catch (e) {
      D.clear(page).appendChild(WD.ui.emptyState('info', 'Что-то пошло не так', String(e && e.message || e)));
      if (root.console) console.error(e);
    }
    var active = view === 'session' ? 'today' : view === 'settings' ? null : view;
    navLinks.forEach(function (a) {
      var on = a.dataset.route === active;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    settingsBtn.classList.toggle('active', view === 'settings');
    document.title = (TITLES[view] || 'Дневник') + ' · Дневник тренировок';
    if (app._navigated) {
      var t = page.querySelector('.page-title');
      if (t) t.focus({ preventScroll: true });
      root.scrollTo(0, 0);
    }
    app._navigated = true;
  }
  app.render = render;

  var themeBtn, settingsBtn;
  function shell() {
    var body = document.body;
    var brand = h('a', { href: '#/today', class: 'brand', 'aria-label': 'Дневник тренировок — на главную' },
      h('span', { class: 'brand-logo', 'aria-hidden': 'true' }, icon('dumbbell', { size: 20, stroke: 2.4 })),
      h('span', { class: 'brand-text' }, h('strong', null, 'Дневник'), h('span', null, 'тренировок')));
    themeBtn = h('button', { type: 'button', class: 'btn icon-btn ghost', onClick: function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      app.state.settings.theme = dark ? 'light' : 'dark';
      applyTheme(); app.save();
      if (app.current && app.current.route === 'settings') render();
    } });
    settingsBtn = h('a', { href: '#/settings', class: 'btn icon-btn ghost', 'aria-label': 'Настройки и данные' }, icon('sliders'));
    saveDot = h('span', { class: 'save-dot', title: 'Данные сохраняются автоматически', 'aria-hidden': 'true' });
    var header = h('header', { class: 'topbar' }, brand, h('div', { class: 'topbar-actions' }, WD.pwa ? WD.pwa.netBadge() : null, saveDot, themeBtn, settingsBtn));
    var nav = h('nav', { class: 'tabbar', 'aria-label': 'Основная навигация' },
      h('ul', null, NAV.map(function (n) {
        var a = h('a', { href: '#/' + n.route, class: 'tab', dataset: { route: n.route } }, icon(n.icon, { size: 22 }), h('span', null, n.label));
        navLinks.push(a);
        return h('li', null, a);
      })));
    main = h('main', { id: 'main', class: 'main', tabindex: '-1' });
    var skip = h('a', { href: '#main', class: 'skip-link', onClick: function (e) { e.preventDefault(); main.focus(); } }, 'Перейти к содержимому');
    var appEl = h('div', { class: 'app' }, header, nav, main);
    body.insertBefore(appEl, body.firstChild);
    body.insertBefore(skip, body.firstChild);
    var nos = document.getElementById('noscript-msg'); if (nos) nos.remove();
  }

  app.init = function () {
    var res = S.load();
    app.state = res.state;
    shell();
    applyTheme();
    WD.timer.init(function () { return app.state.settings; });
    root.addEventListener('hashchange', render);
    root.addEventListener('pagehide', app.saveNow);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') app.saveNow(); });
    render();
    if (res.error === 'corrupt') WD.ui.toast('Сохранённые данные были повреждены — создана резервная копия, начато с чистого листа', 'error');
    if (res.error === 'storage-unavailable') WD.ui.toast('Хранилище браузера недоступно: данные не сохранятся после закрытия', 'error');
    if (res.migratedFrom) WD.ui.toast('Данные обновлены до новой версии формата');
    if (WD.pwa) WD.pwa.init();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', app.init);
  else app.init();
})(window);
