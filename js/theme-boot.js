/* Применяем тему до отрисовки, чтобы не было «вспышки». */
(function () {
  'use strict';
  var pref = 'auto';
  try { pref = localStorage.getItem('workout-diary:theme') || 'auto'; } catch (e) { /* ignore */ }
  var dark = pref === 'dark' || (pref === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
