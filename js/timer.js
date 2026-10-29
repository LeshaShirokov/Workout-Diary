/* Дневник тренировок — таймер отдыха (плавающая панель). */
(function (root) {
  'use strict';
  var WD = root.WD = root.WD || {};
  var C = WD.core, D = WD.dom, h = D.h;

  var el, ring, timeEl, labelEl, tick = null, endAt = 0, total = 0, getSettings = function () { return {}; };
  var audioCtx = null;

  function beep() {
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      [0, 0.25].forEach(function (off) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime + off);
        g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + off + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + off + 0.2);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(audioCtx.currentTime + off); o.stop(audioCtx.currentTime + off + 0.22);
      });
    } catch (e) { /* звук недоступен */ }
  }
  function unlockAudio() {
    // вызывается из обработчика нажатия: браузеры разрешают звук только после жеста пользователя
    if (!getSettings().beep) return;
    try { var AC = root.AudioContext || root.webkitAudioContext; if (AC && !audioCtx) audioCtx = new AC(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) { /* ignore */ }
  }

  function build() {
    ring = WD.charts.ring(56, 5);
    timeEl = h('span', { class: 'rest-time', 'aria-hidden': 'true' }, '0:00');
    labelEl = h('span', { class: 'sr-only', 'aria-live': 'polite' });
    el = h('section', { class: 'rest', id: 'rest-timer', 'aria-label': 'Таймер отдыха', hidden: true },
      h('div', { class: 'rest-ring' }, ring.el, timeEl),
      h('div', { class: 'rest-info' }, h('strong', null, 'Отдых'), h('span', { class: 'muted rest-sub' }, 'следующий подход скоро')),
      h('div', { class: 'rest-actions' },
        h('button', { type: 'button', class: 'btn icon-btn ghost', 'aria-label': 'Минус 15 секунд', onClick: function () { adjust(-15); } }, '−15'),
        h('button', { type: 'button', class: 'btn icon-btn ghost', 'aria-label': 'Плюс 15 секунд', onClick: function () { adjust(15); } }, '+15'),
        h('button', { type: 'button', class: 'btn icon-btn', 'aria-label': 'Остановить таймер', onClick: function () { stop(); } }, D.icon('x'))),
      labelEl);
    document.body.appendChild(el);
  }
  function render() {
    var left = Math.max(0, (endAt - Date.now()) / 1000);
    timeEl.textContent = C.fmtClock(Math.ceil(left));
    ring.set(total ? left / total : 0);
    if (left <= 0) finish();
  }
  function start(seconds) {
    if (!el) build();
    total = seconds || getSettings().restSeconds || 90;
    endAt = Date.now() + total * 1000;
    el.hidden = false;
    el.classList.remove('done');
    document.body.classList.add('has-rest');
    labelEl.textContent = 'Таймер отдыха запущен: ' + total + ' секунд';
    clearInterval(tick);
    tick = setInterval(render, 250);
    render();
  }
  function adjust(delta) {
    if (!endAt) return;
    endAt = Math.max(Date.now() + 1000, endAt + delta * 1000);
    total = Math.max(total + delta, 1);
    render();
  }
  function finish() {
    clearInterval(tick); tick = null; endAt = 0;
    var st = getSettings();
    if (st.vibrate && root.navigator && typeof navigator.vibrate === 'function') { try { navigator.vibrate([200, 100, 200]); } catch (e) { /* ignore */ } }
    if (st.beep) beep();
    el.classList.add('done');
    labelEl.textContent = 'Отдых окончен';
    timeEl.textContent = '0:00';
    if (WD.ui && WD.ui.toast) WD.ui.toast('Отдых окончен — следующий подход!');
    setTimeout(function () { if (!endAt) hide(); }, 2500);
  }
  function hide() { if (el) el.hidden = true; document.body.classList.remove('has-rest'); }
  function stop() { clearInterval(tick); tick = null; endAt = 0; hide(); }
  function running() { return !!endAt; }
  function init(fn) { getSettings = fn; }

  WD.timer = { init: init, start: start, stop: stop, adjust: adjust, running: running, unlockAudio: unlockAudio, beep: beep };
})(typeof window !== 'undefined' ? window : globalThis);
