/* Дневник тренировок — PWA: service worker и обновления, установка, сеть, хранилище, Wake Lock. */
(function (root) {
  'use strict';
  var WD = root.WD = root.WD || {};
  var D = WD.dom, h = D.h, icon = D.icon;
  var nav = root.navigator || {};
  var KEY_DISMISS = 'workout-diary:install-hint-dismissed';
  var KEY_VISITS = 'workout-diary:visits';
  var HINT_VISITS = 5; // подсказку об установке показываем только на первых визитах
  function noop() {}
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function mm(q) { return !!(root.matchMedia && root.matchMedia(q).matches); }

  var pwa = WD.pwa = {
    deferred: null,      // событие beforeinstallprompt
    installed: false,    // пришло appinstalled в этой сессии
    reg: null,           // ServiceWorkerRegistration
    waiting: null,       // ожидающий новый worker
    sw: 'pending',       // pending | active | unsupported | file | disabled | error
    version: null,       // имя кэша оболочки (версия)
    online: nav.onLine !== false
  };
  var listeners = [];
  pwa.onChange = function (fn) { listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; };
  function emit() { listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } }); }
  pwa._emit = emit;

  // ---------- режим запуска / платформа ----------
  pwa.isStandalone = function () {
    return mm('(display-mode: standalone)') || mm('(display-mode: minimal-ui)') || mm('(display-mode: fullscreen)') ||
      mm('(display-mode: window-controls-overlay)') || nav.standalone === true;
  };
  pwa.isIOS = function () {
    var ua = nav.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  };
  /** Что можно предложить пользователю: 'standalone' | 'prompt' | 'ios' | 'manual'. */
  pwa.installMode = function () {
    if (pwa.isStandalone()) return 'standalone';
    if (pwa.deferred) return 'prompt';
    if (pwa.isIOS()) return 'ios';
    return 'manual';
  };
  pwa.promptInstall = function () {
    var e = pwa.deferred;
    if (!e) return Promise.resolve('unavailable');
    pwa.deferred = null;
    return Promise.resolve(e.prompt()).then(function () { return e.userChoice; }).then(function (c) {
      emit(); return c && c.outcome || 'dismissed';
    }, function () { emit(); return 'error'; });
  };
  root.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); pwa.deferred = e; emit(); });
  root.addEventListener('appinstalled', function () {
    pwa.installed = true; pwa.deferred = null; lsSet(KEY_DISMISS, '1');
    if (WD.ui) WD.ui.toast('Приложение установлено — ищите «Дневник» на главном экране');
    emit();
  });
  if (root.matchMedia) {
    var dm = root.matchMedia('(display-mode: standalone)');
    if (dm.addEventListener) dm.addEventListener('change', emit);
  }

  // ---------- подсказка об установке ----------
  pwa.hintDismissed = function () { return lsGet(KEY_DISMISS) === '1'; };
  pwa.dismissHint = function () { lsSet(KEY_DISMISS, '1'); emit(); };
  pwa.visits = function () { return parseInt(lsGet(KEY_VISITS), 10) || 0; };
  function countVisit() {
    try { if (sessionStorage.getItem(KEY_VISITS)) return; sessionStorage.setItem(KEY_VISITS, '1'); } catch (e) { /* ignore */ }
    lsSet(KEY_VISITS, String(pwa.visits() + 1));
  }
  pwa.shouldHint = function () {
    var m = pwa.installMode();
    return (m === 'prompt' || m === 'ios') && !pwa.installed && !pwa.hintDismissed() && pwa.visits() <= HINT_VISITS;
  };
  function iosSteps() {
    return h('span', null, 'Нажмите ', h('strong', null, '«Поделиться»'), ' ', icon('share', { size: 16 }), ' внизу экрана Safari, затем ', h('strong', null, '«На экран «Домой»»'), '.');
  }
  pwa.iosSteps = iosSteps;
  /** Контейнер подсказки для экрана «Сегодня» — сам обновляется при событиях установки. */
  pwa.installHint = function () {
    var slot = h('div', { class: 'install-slot' });
    function draw() {
      D.clear(slot);
      if (!pwa.shouldHint()) return;
      var mode = pwa.installMode();
      slot.appendChild(h('aside', { class: 'card install-hint', 'aria-label': 'Установка приложения' },
        h('span', { class: 'install-ic', 'aria-hidden': 'true' }, icon('phone', { size: 22 })),
        h('div', { class: 'grow' },
          h('strong', null, 'Установите дневник как приложение'),
          h('p', { class: 'muted small' }, mode === 'ios' ? iosSteps() : 'Отдельная иконка на главном экране, запуск без адресной строки и работа без интернета.')),
        h('div', { class: 'install-actions' },
          mode === 'prompt' ? h('button', { type: 'button', class: 'btn primary sm', id: 'install-hint-btn', onClick: function () { pwa.promptInstall(); } }, icon('download', { size: 16 }), 'Установить') : null,
          h('button', { type: 'button', class: 'btn icon-btn ghost', id: 'install-hint-close', 'aria-label': 'Больше не показывать подсказку', onClick: pwa.dismissHint }, icon('x', { size: 18 })))));
    }
    var off = pwa.onChange(function () { if (!slot.isConnected) { off(); return; } draw(); });
    draw();
    return slot;
  };

  // ---------- service worker и обновления ----------
  var userUpdate = false, reloading = false;
  function readVersion() {
    if (!root.caches || !caches.keys) return;
    caches.keys().then(function (keys) {
      var k = keys.filter(function (x) { return x.indexOf('workout-diary-shell-') === 0; });
      pwa.version = k.length ? k[k.length - 1].replace('workout-diary-shell-', '') : null; emit();
    }, noop);
  }
  function onWaiting(w) {
    pwa.waiting = w; emit();
    if (!WD.ui) return;
    var inWorkout = WD.app && WD.app.current && WD.app.current.route === 'session' && WD.app.draft();
    WD.ui.toast(inWorkout ? 'Доступна новая версия. Тренировка сохранится — можно обновить и сейчас, и после' : 'Доступна новая версия', null,
      { id: 'update-toast', icon: 'refresh', sticky: true, action: { label: 'Обновить', onClick: pwa.applyUpdate } });
  }
  pwa.applyUpdate = function () {
    var w = pwa.waiting || (pwa.reg && pwa.reg.waiting);
    if (WD.app && WD.app.state) WD.app.saveNow();
    if (!w) { root.location.reload(); return; }
    userUpdate = true;
    w.postMessage({ type: 'SKIP_WAITING' });
  };
  pwa.checkForUpdate = function () {
    if (!pwa.reg) return Promise.resolve('unavailable');
    return pwa.reg.update().then(function () {
      var r = pwa.reg;
      if (r.waiting) { onWaiting(r.waiting); return 'found'; }
      if (r.installing) return 'installing';
      return 'latest';
    }, function () { return 'error'; });
  };
  pwa.register = function () {
    if (!('serviceWorker' in nav)) { pwa.sw = 'unsupported'; emit(); return; }
    if (!/^https?:$/.test(root.location.protocol)) { pwa.sw = 'file'; emit(); return; } // file:// — без офлайна
    if (/^(localhost|127\.0\.0\.1)$/.test(root.location.hostname) && /[?&]nosw\b/.test(root.location.search)) { pwa.sw = 'disabled'; emit(); return; }
    nav.serviceWorker.addEventListener('controllerchange', function () {
      // перезагружаем только по нажатию «Обновить», а не посреди тренировки
      if (!userUpdate || reloading) { readVersion(); return; }
      reloading = true; root.location.reload();
    });
    nav.serviceWorker.register('./sw.js', { scope: './' }).then(function (reg) {
      pwa.reg = reg; pwa.sw = 'active';
      if (reg.waiting && nav.serviceWorker.controller) onWaiting(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var w = reg.installing; if (!w) return;
        w.addEventListener('statechange', function () {
          if (w.state === 'installed' && nav.serviceWorker.controller) onWaiting(w);
          if (w.state === 'activated') readVersion();
        });
      });
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') reg.update().catch(noop); });
      setInterval(function () { reg.update().catch(noop); }, 60 * 60 * 1000);
      nav.serviceWorker.ready.then(readVersion);
      emit();
    }, function () { pwa.sw = 'error'; emit(); });
  };

  // ---------- сеть ----------
  var netBadge = null;
  pwa.netBadge = function () {
    netBadge = h('span', { class: 'net-badge', id: 'net-badge', hidden: pwa.online, title: 'Нет подключения к интернету — дневник работает, данные сохраняются на устройстве' },
      icon('wifiOff', { size: 14 }), h('span', null, 'Офлайн'));
    return netBadge;
  };
  function setOnline(on) {
    if (pwa.online === on) return;
    pwa.online = on;
    if (netBadge) netBadge.hidden = on;
    if (WD.ui) WD.ui.toast(on ? 'Снова в сети' : 'Нет интернета — дневник работает офлайн, данные сохраняются на устройстве', null, { id: 'net-toast', icon: on ? 'wifi' : 'wifiOff' });
    emit();
  }
  root.addEventListener('online', function () { setOnline(true); });
  root.addEventListener('offline', function () { setOnline(false); });

  // ---------- хранилище ----------
  pwa.storageSupported = function () { return !!(nav.storage && nav.storage.persist); };
  pwa.persisted = function () {
    if (!(nav.storage && nav.storage.persisted)) return Promise.resolve(null);
    return nav.storage.persisted().catch(function () { return null; });
  };
  pwa.requestPersist = function () {
    if (!pwa.storageSupported()) return Promise.resolve(null);
    return nav.storage.persist().catch(function () { return false; });
  };
  pwa.estimate = function () {
    if (!(nav.storage && nav.storage.estimate)) return Promise.resolve(null);
    return nav.storage.estimate().catch(function () { return null; });
  };
  /** Объём данных дневника в localStorage (приблизительно, байты UTF-16). */
  pwa.localBytes = function () {
    var n = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('workout-diary:') === 0) n += (k.length + (localStorage.getItem(k) || '').length) * 2;
      }
    } catch (e) { return null; }
    return n;
  };
  pwa.fmtBytes = function (b) {
    if (b === null || b === undefined || !isFinite(b)) return '—';
    if (b < 1024) return Math.round(b) + ' Б';
    if (b < 1024 * 1024) return (b / 1024).toFixed(b < 10240 ? 1 : 0).replace('.', ',') + ' КБ';
    if (b < 1024 * 1024 * 1024) return (b / 1048576).toFixed(1).replace('.', ',') + ' МБ';
    return (b / 1073741824).toFixed(1).replace('.', ',') + ' ГБ';
  };

  // ---------- Wake Lock: экран не гаснет во время тренировки ----------
  var wl = { want: false, sentinel: null, pending: null };
  pwa.wakeSupported = function () { return !!(nav.wakeLock && nav.wakeLock.request); };
  pwa.wakeActive = function () { return !!wl.sentinel; };
  function acquire() {
    if (!wl.want || wl.sentinel || wl.pending || !pwa.wakeSupported() || document.visibilityState !== 'visible') return Promise.resolve(pwa.wakeActive());
    wl.pending = nav.wakeLock.request('screen').then(function (s) {
      wl.pending = null;
      if (!wl.want) { s.release().catch(noop); return false; }
      wl.sentinel = s;
      s.addEventListener('release', function () { if (wl.sentinel === s) wl.sentinel = null; emit(); });
      emit(); return true;
    }, function () { wl.pending = null; emit(); return false; });
    return wl.pending;
  }
  pwa.keepAwake = function (on) {
    wl.want = !!on;
    if (on) return acquire();
    var s = wl.sentinel; wl.sentinel = null;
    if (s) s.release().catch(noop);
    emit();
    return Promise.resolve(false);
  };
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && wl.want) acquire(); });

  pwa.init = function () { countVisit(); pwa.register(); };
})(window);
