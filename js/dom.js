/* Дневник тренировок — безопасное построение DOM (без innerHTML) и иконки. */
(function (root) {
  'use strict';
  var WD = root.WD = root.WD || {};
  var SVGNS = 'http://www.w3.org/2000/svg';
  var PROPS = { value: 1, checked: 1, disabled: 1, selected: 1, hidden: 1, type: 0 };

  function append(el, c) {
    if (c === null || c === undefined || c === false || c === true) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    if (typeof c === 'string' || typeof c === 'number') { el.appendChild(document.createTextNode(String(c))); return; }
    el.appendChild(c);
  }
  function setAttrs(el, attrs, isSvg) {
    if (!attrs) return;
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(function (p) { if (p.indexOf('--') === 0) el.style.setProperty(p, v[p]); else el.style[p] = v[p]; });
      else if (k === 'dataset') Object.keys(v).forEach(function (p) { el.dataset[p] = v[p]; });
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (!isSvg && PROPS[k]) el[k] = v;
      else if (k === 'ref' && typeof v === 'function') v(el);
      else el.setAttribute(k, v === true ? '' : String(v));
    });
  }
  /** h('div', {class:'x', onClick: fn}, 'текст', child) */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    var deferred = null;
    if (attrs && (attrs.value !== undefined || attrs.checked !== undefined)) {
      deferred = { value: attrs.value, checked: attrs.checked };
      attrs = Object.assign({}, attrs); delete attrs.value; delete attrs.checked;
    }
    setAttrs(el, attrs, false);
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    if (deferred) {
      if (deferred.value !== undefined && deferred.value !== null) el.value = deferred.value;
      if (deferred.checked !== undefined) el.checked = !!deferred.checked;
    }
    return el;
  }
  function s(tag, attrs) {
    var el = document.createElementNS(SVGNS, tag);
    setAttrs(el, attrs, true);
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  var C10 = 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0';
  var ICONS = {
    plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', check: 'M20 6 9 17l-5-5', x: 'M18 6 6 18M6 6l12 12',
    chevL: 'm15 18-6-6 6-6', chevR: 'm9 18 6-6-6-6', chevUp: 'm18 15-6-6-6 6', chevDown: 'm6 9 6 6 6-6',
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
    calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    table: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM3 9h18M3 15h18M9 9v12M15 9v12',
    chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
    dumbbell: 'M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11M3.5 9h3M3.5 15h3M17.5 9h3M17.5 15h3',
    sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    trash: 'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
    edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    timer: 'M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16a8 8 0 0 0 0 16z',
    sun: 'M12 17a5 5 0 1 0 0-10a5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
    trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a1 1 0 0 0-1 1a4 4 0 0 0 4 4M17 6h3a1 1 0 0 1 1 1a4 4 0 0 1-4 4',
    flame: 'M12 22c4 0 7-2.7 7-7c0-4-3-6.5-4-9c-1 2-2 3-3.5 3.5C12 7 12 4 10 2C9 6 5 8.5 5 14c0 4.3 3 8 7 8z',
    scale: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 9a6 6 0 0 1 8 0l-2.6 3a2 2 0 0 0-2.8 0z',
    heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z',
    pulse: 'M3 12h4l2-5 4 10 2-5h6',
    download: 'M12 3v12M7 10l5 5 5-5M5 21h14', upload: 'M12 21V9M7 14l5-5 5 5M5 3h14',
    play: 'M7 4v16l13-8z', flag: 'M4 22V4M4 4h13l-2 4 2 4H4',
    note: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5',
    info: C10 + 'M12 16v-4M12 8h.01', clock: C10 + 'M12 7v5l3 2',
    sparkles: 'M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
    file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6', skip: 'M5 4l10 8-10 8zM19 5v14',
    pause: 'M7 4h3v16H7zM14 4h3v16h-3z', target: C10 + 'M12 6a6 6 0 1 0 0 12a6 6 0 0 0 0-12M12 10a2 2 0 1 0 0 4a2 2 0 0 0 0-4'
  };
  function icon(name, opts) {
    opts = opts || {};
    var size = opts.size || 20;
    return s('svg', { class: 'ic' + (opts.class ? ' ' + opts.class : ''), width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': opts.stroke || 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' },
      s('path', { d: ICONS[name] || ICONS.info }));
  }

  var idc = 0;
  function nextId(p) { idc++; return (p || 'f') + '-' + idc; }

  WD.dom = { h: h, s: s, clear: clear, icon: icon, ICONS: ICONS, nextId: nextId, SVGNS: SVGNS };
})(typeof window !== 'undefined' ? window : globalThis);
