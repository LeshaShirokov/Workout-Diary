/* Дневник тренировок — service worker: офлайн-кэш оболочки приложения (относительные пути). */
'use strict';
var CACHE = 'workout-diary-v1';
var ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/styles.css',
  './js/theme-boot.js', './js/core.js', './js/model.js', './js/seed.js', './js/storage.js', './js/io.js', './js/dom.js',
  './js/charts.js', './js/ui.js', './js/timer.js', './js/app.js',
  './js/views/today.js', './js/views/session.js', './js/views/journal.js', './js/views/week.js',
  './js/views/progress.js', './js/views/program.js', './js/views/settings.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('workout-diary-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // сеть в приоритете для страницы, чтобы обновления приходили сразу; офлайн — из кэша
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone();
      if (res.ok) caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
      return res;
    }).catch(function () { return caches.match('./index.html'); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) {
    var net = fetch(req).then(function (res) {
      if (res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () { return hit || Response.error(); });
    return hit || net;
  }));
});
