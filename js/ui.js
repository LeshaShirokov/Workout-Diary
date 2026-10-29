/* Дневник тренировок — общие UI-компоненты: тосты, модальные окна, поля. */
(function (root) {
  'use strict';
  var WD = root.WD = root.WD || {};
  var C = WD.core, D = WD.dom, h = D.h, icon = D.icon;

  var toastBox;
  /** Короткое уведомление. opts: { action: {label, onClick}, sticky: true, id, icon } — возвращает элемент. */
  function toast(msg, kind, opts) {
    opts = opts || {};
    if (!toastBox) {
      toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(toastBox);
    }
    if (opts.id) { var old = document.getElementById(opts.id); if (old) old.remove(); }
    var t = h('div', { class: 'toast' + (kind ? ' ' + kind : '') + (opts.action || opts.sticky ? ' interactive' : ''), id: opts.id || null },
      icon(opts.icon || (kind === 'error' ? 'info' : 'check'), { size: 18 }), h('span', { class: 'toast-msg' }, msg));
    function dismiss() { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }
    if (opts.action) t.appendChild(h('button', { type: 'button', class: 'toast-btn', onClick: function () { opts.action.onClick(); dismiss(); } }, opts.action.label));
    if (opts.sticky) t.appendChild(h('button', { type: 'button', class: 'toast-x', 'aria-label': 'Скрыть уведомление', onClick: dismiss }, icon('x', { size: 16 })));
    toastBox.appendChild(t);
    if (!opts.sticky) setTimeout(dismiss, opts.duration || 2600);
    t.dismiss = dismiss;
    return t;
  }

  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  /** Модальное окно с ловушкой фокуса и закрытием по Esc. */
  function modal(opts) {
    var prev = document.activeElement;
    var titleId = D.nextId('mt');
    var closed = false;
    var actions = h('div', { class: 'modal-actions' });
    var box = h('div', { class: 'modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' },
      h('div', { class: 'modal-head' },
        opts.icon ? h('span', { class: 'modal-icon ' + (opts.iconClass || '') }, icon(opts.icon, { size: 22 })) : null,
        h('h2', { id: titleId }, opts.title),
        h('button', { type: 'button', class: 'btn icon-btn ghost', 'aria-label': 'Закрыть', onClick: function () { close(false); } }, icon('x'))),
      h('div', { class: 'modal-body' }, opts.body),
      actions);
    var back = h('div', { class: 'modal-back', onClick: function (e) { if (e.target === back && !opts.sticky) close(false); } }, box);
    (opts.actions || []).forEach(function (a) {
      actions.appendChild(h('button', { type: 'button', class: 'btn ' + (a.kind || ''), onClick: function () {
        var r = a.onClick ? a.onClick() : undefined;
        if (r !== false && a.close !== false) close(a.value !== undefined ? a.value : true);
      } }, a.icon ? icon(a.icon, { size: 18 }) : null, a.label));
    });
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Tab') {
        var f = Array.prototype.filter.call(box.querySelectorAll(FOCUSABLE), function (x) { return x.offsetParent !== null || x === document.activeElement; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    function close(val) {
      if (closed) return; closed = true;
      document.removeEventListener('keydown', onKey, true);
      back.classList.add('out');
      setTimeout(function () { back.remove(); }, 180);
      document.body.classList.remove('modal-open');
      if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* ignore */ } }
      if (opts.onClose) opts.onClose(val);
    }
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
    document.body.classList.add('modal-open');
    setTimeout(function () {
      var target = box.querySelector('[autofocus]') || box.querySelector('.modal-actions .primary') || box;
      target.focus();
    }, 30);
    return { close: close, el: box };
  }
  function confirmBox(o) {
    return new Promise(function (resolve) {
      modal({
        title: o.title || 'Подтвердите', icon: o.danger ? 'trash' : 'info', iconClass: o.danger ? 'danger' : '',
        body: h('p', null, o.text || ''),
        actions: [{ label: 'Отмена', kind: 'ghost', value: false }, { label: o.ok || 'Да', kind: o.danger ? 'danger' : 'primary', value: true }],
        onClose: function (v) { resolve(v === true); }
      });
    });
  }

  function field(label, control, hint, cls) {
    var idv = control.id || D.nextId('fld');
    control.id = idv;
    var hintEl = null;
    if (hint) { hintEl = h('span', { class: 'hint', id: idv + '-h' }, hint); control.setAttribute('aria-describedby', idv + '-h'); }
    return h('div', { class: 'field' + (cls ? ' ' + cls : '') }, h('label', { for: idv }, label), control, hintEl);
  }
  function textInput(attrs) { return h('input', Object.assign({ type: 'text', autocomplete: 'off' }, attrs)); }

  /** Поле числа со степперами − / +. */
  function stepper(o) {
    var input = h('input', {
      type: 'text', inputmode: o.decimal === false ? 'numeric' : 'decimal', autocomplete: 'off', enterkeyhint: 'next',
      class: 'num', value: o.value == null ? '' : String(o.value).replace('.', ','), placeholder: o.placeholder == null ? '' : String(o.placeholder).replace('.', ','),
      'aria-label': o.label, id: o.id
    });
    function emit() { if (o.onInput) o.onInput(C.parseNum(input.value)); }
    function bump(dir) {
      var cur = C.parseNum(input.value);
      if (cur === null) cur = C.parseNum(input.placeholder) || 0;
      var n = C.round(cur + dir * (o.step || 1), 3);
      if (o.min != null) n = Math.max(o.min, n);
      if (o.max != null) n = Math.min(o.max, n);
      input.value = String(n).replace('.', ',');
      emit();
      input.classList.remove('bump'); void input.offsetWidth; input.classList.add('bump');
    }
    input.addEventListener('input', function () {
      var v = input.value.replace(/[^0-9.,\-]/g, '');
      if (v !== input.value) input.value = v;
      emit();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp') { e.preventDefault(); bump(1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); bump(-1); }
    });
    input.addEventListener('focus', function () { setTimeout(function () { try { input.select(); } catch (e) { /* ignore */ } }, 0); });
    var wrap = h('div', { class: 'stepper' + (o.cls ? ' ' + o.cls : '') },
      h('button', { type: 'button', class: 'step', tabindex: '-1', 'aria-label': o.label + ': уменьшить на ' + String(o.step || 1).replace('.', ','), onClick: function () { bump(-1); } }, icon('minus', { size: 18 })),
      input,
      h('button', { type: 'button', class: 'step', tabindex: '-1', 'aria-label': o.label + ': увеличить на ' + String(o.step || 1).replace('.', ','), onClick: function () { bump(1); } }, icon('plus', { size: 18 })));
    wrap.input = input;
    return wrap;
  }

  function toggle(label, checked, onChange, hint) {
    var idv = D.nextId('tg');
    var inp = h('input', { type: 'checkbox', role: 'switch', id: idv, checked: !!checked, onChange: function () { onChange(inp.checked); } });
    return h('div', { class: 'toggle-row' },
      h('label', { for: idv, class: 'toggle-label' }, h('span', null, label), hint ? h('span', { class: 'hint' }, hint) : null),
      h('span', { class: 'switch' }, inp, h('span', { class: 'switch-ui', 'aria-hidden': 'true' })));
  }
  /** Сегментированный переключатель (группа кнопок с aria-pressed). */
  function segmented(options, value, onChange, label) {
    var wrap = h('div', { class: 'seg', role: 'group', 'aria-label': label });
    options.forEach(function (o) {
      var b = h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(o.value === value), onClick: function () {
        Array.prototype.forEach.call(wrap.children, function (c) { c.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        onChange(o.value);
      } }, o.icon ? icon(o.icon, { size: 16 }) : null, o.label);
      wrap.appendChild(b);
    });
    return wrap;
  }
  function pageHead(title, sub, extra) {
    return h('header', { class: 'page-head' }, h('div', null, h('h1', { class: 'page-title', tabindex: '-1' }, title), sub ? h('p', { class: 'page-sub' }, sub) : null), extra || null);
  }
  function stat(label, value, ic, cls) {
    return h('div', { class: 'stat ' + (cls || '') }, h('span', { class: 'stat-ic' }, icon(ic, { size: 18 })), h('span', { class: 'stat-val' }, value), h('span', { class: 'stat-lbl' }, label));
  }
  function badge(text, cls) { return h('span', { class: 'badge ' + (cls || '') }, text); }
  function emptyState(ic, title, text, actions) {
    return h('div', { class: 'empty card' }, h('span', { class: 'empty-ic' }, icon(ic, { size: 30 })), h('h3', null, title), text ? h('p', { class: 'muted' }, text) : null, actions ? h('div', { class: 'row wrap center' }, actions) : null);
  }
  function feelingIcon(n) {
    var paths = { 1: 'M8 16s1.5-2 4-2 4 2 4 2', 2: 'M8 15.5s1.5-1 4-1 4 1 4 1', 3: 'M8 15h8', 4: 'M8 14.5s1.5 1 4 1 4-1 4-1', 5: 'M8 14s1.5 2.5 4 2.5 4-2.5 4-2.5' };
    return D.s('svg', { class: 'ic', width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'aria-hidden': 'true' },
      D.s('circle', { cx: 12, cy: 12, r: 10 }), D.s('path', { d: paths[n] + 'M9 9h.01M15 9h.01' }));
  }
  var FEEL = ['', 'Тяжело', 'Так себе', 'Нормально', 'Хорошо', 'Отлично'];

  WD.ui = { toast: toast, modal: modal, confirm: confirmBox, field: field, textInput: textInput, stepper: stepper, toggle: toggle, segmented: segmented, pageHead: pageHead, stat: stat, badge: badge, emptyState: emptyState, feelingIcon: feelingIcon, FEEL: FEEL };
})(typeof window !== 'undefined' ? window : globalThis);
