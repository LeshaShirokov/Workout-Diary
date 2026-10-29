/* Дневник тренировок — SVG-графики собственного изготовления. */
(function (root) {
  'use strict';
  var WD = root.WD = root.WD || {};
  var C = WD.core, D = WD.dom, s = D.s, h = D.h;

  function niceTicks(min, max, count) {
    if (min === max) { min -= 1; max += 1; }
    var span = max - min, step = Math.pow(10, Math.floor(Math.log10(span / count)));
    var err = span / count / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    var ticks = [];
    for (var v = lo; v <= hi + step / 2; v += step) ticks.push(C.round(v, 4));
    return { lo: lo, hi: hi, ticks: ticks };
  }
  /** Ширина viewBox ≈ реальной ширине на экране, чтобы подписи были читаемы и на телефоне, и на десктопе. */
  function chartW(half) {
    var vw = (typeof window !== 'undefined' && window.innerWidth) || 720;
    var content = Math.min(vw, 1120 + (vw >= 960 ? 232 : 0)) - (vw >= 960 ? 232 : 0) - 64;
    if (half && vw >= 720) content = content / 2 - 30;
    return Math.round(Math.max(280, Math.min(900, content)));
  }
  function empty(text) {
    return h('div', { class: 'chart-empty' }, D.icon('chart', { size: 28 }), h('p', null, text || 'Пока недостаточно данных'));
  }

  /**
   * Линейный график. points: [{x: dayNum, y, label}]
   * opts: { yFmt, trend: bool, color: css var, label: aria }
   */
  function lineChart(points, opts) {
    opts = opts || {};
    if (!points.length) return empty(opts.emptyText);
    var W = opts.width || chartW(opts.half), H = W < 480 ? 220 : 260, pl = 46, pr = 14, pt = 16, pb = 30;
    var xs = points.map(function (p) { return p.x; }), ys = points.map(function (p) { return p.y; });
    var trend = opts.trend && points.length >= 2 ? WD.model.linearTrend(points) : null;
    var xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
    if (xmin === xmax) { xmin -= 3; xmax += 3; }
    var ymn = Math.min.apply(null, ys), ymx = Math.max.apply(null, ys);
    var pad = (ymx - ymn) * 0.12 || Math.max(1, Math.abs(ymx) * 0.05);
    var t = niceTicks(ymn - pad, ymx + pad, 4);
    function X(v) { return pl + (v - xmin) / (xmax - xmin) * (W - pl - pr); }
    function Y(v) { return pt + (1 - (v - t.lo) / (t.hi - t.lo)) * (H - pt - pb); }
    var yFmt = opts.yFmt || function (v) { return C.fmtNum(v); };
    var gid = D.nextId('g');
    var svg = s('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opts.label || 'График', preserveAspectRatio: 'xMidYMid meet' });
    var defs = s('defs', null, s('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 },
      s('stop', { offset: '0%', 'stop-color': 'var(--accent)', 'stop-opacity': '0.35' }),
      s('stop', { offset: '100%', 'stop-color': 'var(--accent)', 'stop-opacity': '0' })));
    svg.appendChild(defs);
    t.ticks.forEach(function (v) {
      svg.appendChild(s('line', { class: 'grid', x1: pl, x2: W - pr, y1: Y(v), y2: Y(v) }));
      svg.appendChild(s('text', { class: 'axis', x: pl - 8, y: Y(v) + 4, 'text-anchor': 'end' }, yFmt(v)));
    });
    var nLabels = Math.min(points.length, W < 420 ? 4 : 5);
    for (var i = 0; i < nLabels; i++) {
      var idx = nLabels === 1 ? 0 : Math.round(i * (points.length - 1) / (nLabels - 1));
      var p = points[idx];
      svg.appendChild(s('text', { class: 'axis', x: X(p.x), y: H - 8, 'text-anchor': i === 0 && nLabels > 1 ? 'start' : i === nLabels - 1 && nLabels > 1 ? 'end' : 'middle' }, C.fmtDate(C.fromDayNum(p.x), { short: true })));
    }
    var d = points.map(function (p, i) { return (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1); }).join(' ');
    if (points.length > 1) {
      var area = d + ' L' + X(points[points.length - 1].x).toFixed(1) + ' ' + (H - pb) + ' L' + X(points[0].x).toFixed(1) + ' ' + (H - pb) + ' Z';
      svg.appendChild(s('path', { class: 'area', d: area, fill: 'url(#' + gid + ')' }));
      svg.appendChild(s('path', { class: 'line draw', d: d, pathLength: 1 }));
    }
    if (trend) {
      svg.appendChild(s('line', { class: 'trend', x1: X(xmin), y1: Y(trend.intercept + trend.slope * xmin), x2: X(xmax), y2: Y(trend.intercept + trend.slope * xmax) }));
    }
    points.forEach(function (p, i) {
      var last = i === points.length - 1;
      svg.appendChild(s('circle', { class: 'dot' + (last ? ' last' : ''), cx: X(p.x), cy: Y(p.y), r: last ? 5.5 : 3.5 },
        s('title', null, C.fmtDate(C.fromDayNum(p.x)) + ': ' + (p.label || yFmt(p.y)))));
    });
    return h('div', { class: 'chart-wrap' }, svg);
  }

  /** Столбчатая диаграмма. bars: [{label, value, title}] */
  function barChart(bars, opts) {
    opts = opts || {};
    if (!bars.length || bars.every(function (b) { return !b.value; })) return empty(opts.emptyText);
    var W = opts.width || chartW(opts.half), H = W < 480 ? 190 : 220, pl = 46, pr = 8, pt = 14, pb = 28;
    var max = Math.max.apply(null, bars.map(function (b) { return b.value; }));
    var t = niceTicks(0, max, 4);
    var bw = (W - pl - pr) / bars.length;
    function Y(v) { return pt + (1 - v / t.hi) * (H - pt - pb); }
    var yFmt = opts.yFmt || function (v) { return C.fmtNum(v); };
    var svg = s('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opts.label || 'Диаграмма' });
    t.ticks.forEach(function (v) {
      svg.appendChild(s('line', { class: 'grid', x1: pl, x2: W - pr, y1: Y(v), y2: Y(v) }));
      svg.appendChild(s('text', { class: 'axis', x: pl - 8, y: Y(v) + 4, 'text-anchor': 'end' }, yFmt(v)));
    });
    bars.forEach(function (b, i) {
      var x = pl + i * bw + bw * 0.18, w = bw * 0.64, y = Y(b.value), hh = Math.max(0, H - pb - y);
      svg.appendChild(s('rect', { class: 'bar' + (i === bars.length - 1 ? ' current' : ''), x: x.toFixed(1), y: y.toFixed(1), width: w.toFixed(1), height: hh.toFixed(1), rx: Math.min(6, w / 3), style: { '--i': i } },
        s('title', null, (b.title || b.label) + ': ' + yFmt(b.value))));
      var every = bw >= 38 ? 1 : bw >= 19 ? 2 : 3;
      if ((bars.length - 1 - i) % every === 0) svg.appendChild(s('text', { class: 'axis', x: (x + w / 2).toFixed(1), y: H - 9, 'text-anchor': 'middle' }, b.label));
    });
    return h('div', { class: 'chart-wrap' }, svg);
  }

  /** Кольцо прогресса для таймера отдыха. */
  function ring(size, stroke) {
    var r = (size - stroke) / 2, c = 2 * Math.PI * r;
    var fg = s('circle', { class: 'ring-fg', cx: size / 2, cy: size / 2, r: r, 'stroke-width': stroke, 'stroke-dasharray': c.toFixed(2), 'stroke-dashoffset': 0, transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')' });
    var svg = s('svg', { class: 'ring', width: size, height: size, viewBox: '0 0 ' + size + ' ' + size, 'aria-hidden': 'true' },
      s('circle', { class: 'ring-bg', cx: size / 2, cy: size / 2, r: r, 'stroke-width': stroke }), fg);
    return { el: svg, set: function (frac) { fg.setAttribute('stroke-dashoffset', (c * (1 - C.clamp(frac, 0, 1))).toFixed(2)); } };
  }

  WD.charts = { lineChart: lineChart, barChart: barChart, ring: ring, niceTicks: niceTicks };
})(typeof window !== 'undefined' ? window : globalThis);
