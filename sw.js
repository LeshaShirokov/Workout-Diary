/* Дневник тренировок — service worker: офлайн-оболочка приложения.
 * Пользовательские данные живут в localStorage и сюда не попадают: кэшируются только файлы приложения.
 * Список файлов и VERSION генерирует tools/build-sw.js (по хэшу содержимого). */
'use strict';

// <build:assets> — сгенерировано tools/build-sw.js, не редактируйте вручную
var VERSION = '6e0f0d11a1';
var ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/charts.js',
  'js/core.js',
  'js/dom.js',
  'js/io.js',
  'js/model.js',
  'js/pwa.js',
  'js/seed.js',
  'js/storage.js',
  'js/theme-boot.js',
  'js/timer.js',
  'js/ui.js',
  'js/views/journal.js',
  'js/views/program.js',
  'js/views/progress.js',
  'js/views/session.js',
  'js/views/settings.js',
  'js/views/today.js',
  'js/views/week.js',
  'icons/apple-touch-icon-180.png',
  'icons/favicon-32.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon.svg',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
  'icons/maskable.svg',
  'icons/shortcut-journal.png',
  'icons/shortcut-progress.png',
  'icons/shortcut-start.png'
];
// </build:assets>

var PREFIX = 'workout-diary-';             // на общем origin github.io трогаем только свои кэши
var SHELL = PREFIX + 'shell-' + VERSION;   // предзагруженная оболочка этой версии
var RUNTIME = PREFIX + 'runtime-' + VERSION; // прочие файлы из scope, встреченные по ходу
var SCOPE = self.registration.scope;       // https://…/Workout-Diary/ или http://localhost:…/
var INDEX = new URL('index.html', SCOPE).href;
var PRECACHED = {};
ASSETS.forEach(function (a) { PRECACHED[new URL(a, SCOPE).href] = true; });

self.addEventListener('install', function (event) {
  // Без skipWaiting: новая версия ждёт, пока пользователь нажмёт «Обновить» в приложении.
  event.waitUntil(caches.open(SHELL).then(function (cache) {
    return Promise.all(ASSETS.map(function (asset) {
      var url = new URL(asset, SCOPE).href;
      return fetch(new Request(url, { cache: 'reload' })).then(function (res) {
        if (!res.ok) throw new Error('precache ' + url + ': HTTP ' + res.status);
        return cache.put(url, res);
      });
    }));
  }));
});

self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  else if (data.type === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage({ version: VERSION, cache: SHELL });
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) {
      return k.indexOf(PREFIX) === 0 && k !== SHELL && k !== RUNTIME;
    }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function isAppPage(url) {
  // корень scope, index.html и «чистые» пути без расширения внутри scope — это наш SPA
  var rest = url.href.slice(SCOPE.length).split('#')[0].split('?')[0];
  return rest === '' || rest === 'index.html' || !/\.[a-z0-9]+$/i.test(rest.split('/').pop());
}

function fromNetwork(request, cacheName) {
  return fetch(request).then(function (res) {
    if (res && res.ok && res.type === 'basic' && cacheName) {
      var copy = res.clone();
      caches.open(cacheName).then(function (c) { return c.put(request, copy); });
    }
    return res;
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || req.url.indexOf(SCOPE) !== 0) return; // чужие сайты на том же origin не трогаем
  if (/-my-data/.test(url.pathname)) return; // личные файлы — никогда не в кэш

  if (req.mode === 'navigate') {
    if (isAppPage(url)) {
      // оболочка из кэша (мгновенный старт и офлайн), при пустом кэше — сеть
      event.respondWith(caches.match(INDEX, { cacheName: SHELL }).then(function (hit) {
        return hit || fetch(req).catch(function () { return caches.match(INDEX); });
      }));
    } else {
      event.respondWith(fetch(req).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match(INDEX); });
      }));
    }
    return;
  }

  var clean = url.origin + url.pathname;
  if (PRECACHED[clean]) {
    // файлы оболочки: cache-first (версия меняется вместе с содержимым)
    event.respondWith(caches.match(clean, { cacheName: SHELL }).then(function (hit) {
      return hit || fromNetwork(req, url.search ? null : SHELL);
    }));
    return;
  }

  // прочее в scope: stale-while-revalidate, в кэш — только без query-строки
  event.respondWith(caches.open(RUNTIME).then(function (cache) {
    return cache.match(req).then(function (hit) {
      var net = fromNetwork(req, url.search ? null : RUNTIME).catch(function () { return hit || Response.error(); });
      if (hit) { event.waitUntil(net.catch(function () {})); return hit; }
      return net;
    });
  }));
});
