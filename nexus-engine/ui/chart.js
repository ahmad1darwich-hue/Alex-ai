/* Nexus chart preview renderer: candles + what a Pine script draws (from /api/preview). Own canvas code, no library. */
(function () {
  'use strict';
  var SIZE = { 'size.tiny': 9, 'size.small': 10, 'size.normal': 12, 'size.large': 15, 'size.huge': 19, 'size.auto': 10 };
  var UP = '#26a69a', DN = '#ef5350', GRID = 'rgba(255,255,255,.045)', AXIS = '#8a94a6', BG = '#0b0f15';
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function fmt(v, mt) {
    if (!isNum(v)) return '';
    var d = mt ? Math.max(0, Math.min(8, Math.round(-Math.log10(mt)))) : 2;
    if (Math.abs(v) >= 100000) d = Math.min(d, 0); else if (Math.abs(v) >= 1000) d = Math.min(d, 2);
    return v.toFixed(d);
  }
  function dash(ctx, style) { ctx.setLineDash(/dash/.test(style || '') ? [6, 4] : /dot/.test(style || '') ? [2, 3] : []); }
  function tfLabel(t, tfSec, withDate) {
    var d = new Date(t), p = function (n) { return (n < 10 ? '0' : '') + n; };
    if (tfSec >= 86400) return p(d.getDate()) + '/' + p(d.getMonth() + 1);
    return (withDate ? p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' : '') + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function Chart(box, data, opts) {
    this.box = box; this.d = data; this.r = data.result || {}; this.o = opts || {};
    this.n = data.candles.length; this.tfSec = (data.tfSec || 0);
    if (!this.tfSec && this.n > 1) this.tfSec = Math.round((data.candles[1].t - data.candles[0].t) / 1000);
    box.innerHTML = '';
    this.cv = document.createElement('canvas'); this.cv.className = 'pv-cv'; box.appendChild(this.cv);
    this.leg = document.createElement('div'); this.leg.className = 'pv-leg'; box.appendChild(this.leg);
    this.tbl = document.createElement('div'); this.tbl.className = 'pv-tbls'; box.appendChild(this.tbl);
    this.ctx = this.cv.getContext('2d');
    var lower = this.r.ok && !this.r.overlay && ((this.r.plots || []).some(function (p) { return !p.hidden && !p.forceOverlay; }) || (this.r.hlines || []).length);
    this.lower = !!lower;
    this.spacing = 7; this.end = this.n - 1 + 6; this.hover = -1;
    this.bind(); this.resize(); this.tables();
  }
  Chart.prototype.bind = function () {
    var self = this, cv = this.cv, drag = null, pinch = null;
    this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function () { self.resize(); }) : null;
    if (this._ro) this._ro.observe(this.box); else window.addEventListener('resize', function () { self.resize(); });
    cv.addEventListener('wheel', function (e) { e.preventDefault(); var f = e.deltaY > 0 ? 0.9 : 1.1; self.zoom(f, e.offsetX); }, { passive: false });
    cv.addEventListener('mousedown', function (e) { drag = { x: e.clientX, end: self.end }; });
    window.addEventListener('mouseup', function () { drag = null; });
    window.addEventListener('mousemove', function (e) { if (!drag) return; self.end = drag.end - (e.clientX - drag.x) / self.spacing; self.clamp(); self.draw(); });
    cv.addEventListener('mousemove', function (e) { self.hover = self.barAt(e.offsetX); self.hy = e.offsetY; self.draw(); });
    cv.addEventListener('mouseleave', function () { self.hover = -1; self.draw(); });
    cv.addEventListener('dblclick', function () { self.spacing = 7; self.end = self.n - 1 + 6; self.draw(); });
    cv.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) drag = { x: e.touches[0].clientX, end: self.end };
      else if (e.touches.length === 2) { drag = null; pinch = { d: Math.abs(e.touches[0].clientX - e.touches[1].clientX) || 1, s: self.spacing }; }
    }, { passive: true });
    cv.addEventListener('touchmove', function (e) {
      if (drag && e.touches.length === 1) { e.preventDefault(); self.end = drag.end - (e.touches[0].clientX - drag.x) / self.spacing; self.clamp(); self.draw(); }
      else if (pinch && e.touches.length === 2) { e.preventDefault(); var d = Math.abs(e.touches[0].clientX - e.touches[1].clientX) || 1; self.spacing = Math.max(2, Math.min(40, pinch.s * d / pinch.d)); self.clamp(); self.draw(); }
    }, { passive: false });
    cv.addEventListener('touchend', function () { drag = null; pinch = null; });
  };
  Chart.prototype.destroy = function () { if (this._ro) this._ro.disconnect(); this.box.innerHTML = ''; };
  Chart.prototype.zoom = function (f, x) { var b = this.barAt(x); this.spacing = Math.max(2, Math.min(40, this.spacing * f)); var nb = this.barAt(x); this.end += b - nb; this.clamp(); this.draw(); };
  Chart.prototype.clamp = function () { this.end = Math.max(10, Math.min(this.n - 1 + Math.floor(this.W / this.spacing * 0.6), this.end)); };
  Chart.prototype.resize = function () {
    var r = this.box.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    this.Wfull = Math.max(200, r.width); this.Hfull = Math.max(180, r.height);
    this.cv.width = Math.round(this.Wfull * dpr); this.cv.height = Math.round(this.Hfull * dpr);
    this.cv.style.width = this.Wfull + 'px'; this.cv.style.height = this.Hfull + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.AX = 64; this.TX = 20; this.W = this.Wfull - this.AX;
    var h = this.Hfull - this.TX;
    this.paneA = { top: 0, h: this.lower ? Math.round(h * 0.68) : h };
    this.paneB = this.lower ? { top: this.paneA.h + 1, h: h - this.paneA.h - 1 } : null;
    this.clamp(); this.draw();
  };
  Chart.prototype.xOf = function (i) { return this.W - (this.end - i) * this.spacing - this.spacing / 2; };
  Chart.prototype.barAt = function (x) { return Math.round(this.end - (this.W - this.spacing / 2 - x) / this.spacing); };
  Chart.prototype.range = function () { var a = Math.max(0, Math.floor(this.end - this.W / this.spacing) - 1), b = Math.min(this.n - 1, Math.ceil(this.end)); return [a, b]; };
  Chart.prototype.scale = function (pane, lo, hi) {
    if (!(hi > lo)) { hi = (hi || 1) + 1; lo = (lo || 0) - 1; }
    var pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    pane.lo = lo; pane.hi = hi;
    pane.y = function (v) { return pane.top + (hi - v) / (hi - lo) * pane.h; };
    pane.v = function (y) { return hi - (y - pane.top) / pane.h * (hi - lo); };
  };
  Chart.prototype.draw = function () {
    var self = this, ctx = this.ctx, d = this.d, r = this.r, C = d.candles, rg = this.range(), a = rg[0], b = rg[1];
    if (this._raf) return;
    this._raf = (window.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(function () { self._raf = 0; self.paint(a, b); });
  };
  Chart.prototype.paint = function () {
    var ctx = this.ctx, d = this.d, r = this.r, C = d.candles, rg = this.range(), a = rg[0], b = rg[1], self = this;
    ctx.clearRect(0, 0, this.Wfull, this.Hfull); ctx.fillStyle = BG; ctx.fillRect(0, 0, this.Wfull, this.Hfull);
    // scales
    var lo = Infinity, hi = -Infinity, k;
    for (k = a; k <= b; k++) { if (C[k].l < lo) lo = C[k].l; if (C[k].h > hi) hi = C[k].h; }
    var span = hi - lo;
    if (r.ok && (r.overlay || !this.lower)) (r.plots || []).forEach(function (p) { if (p.hidden) return; for (var j = a; j <= b; j++) { var v = p.values[j]; if (isNum(v) && v > lo - span * 0.6 && v < hi + span * 0.6) { if (v < lo) lo = v; if (v > hi) hi = v; } } });
    this.scale(this.paneA, lo, hi);
    var A = this.paneA, B = this.paneB;
    if (B) {
      var l2 = Infinity, h2 = -Infinity;
      (r.plots || []).forEach(function (p) { if (p.hidden || p.forceOverlay) return; for (var j = a; j <= b; j++) { var v = p.values[j]; if (isNum(v)) { if (v < l2) l2 = v; if (v > h2) h2 = v; } } if (/histogram|columns/.test(p.style)) { l2 = Math.min(l2, p.histbase || 0); h2 = Math.max(h2, p.histbase || 0); } });
      (r.hlines || []).forEach(function (h) { if (isNum(h.price) && !h.hidden) { l2 = Math.min(l2, h.price); h2 = Math.max(h2, h.price); } });
      if (!isFinite(l2)) { l2 = 0; h2 = 100; }
      this.scale(B, l2, h2);
    }
    var P = r.overlay || !B ? A : B; // pane where the script draws
    // grid + axes
    this.grid(A); if (B) { this.grid(B); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, B.top - 1, this.Wfull, 1); }
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, this.W, this.Hfull - this.TX); ctx.clip();
    if (r.ok) {
      // background colors
      (r.bg || []).forEach(function (c, j) { if (c && j >= a && j <= b) { ctx.fillStyle = c; ctx.fillRect(self.xOf(j) - self.spacing / 2, P.top, self.spacing + 0.5, P.h); } });
      this.fills(P, a, b);
      (r.boxes || []).forEach(function (bx) { self.boxDraw(bx, bx.fo ? A : P); });
    }
    // candles
    var bw = Math.max(1, Math.min(13, this.spacing * 0.7));
    for (k = a; k <= b; k++) {
      var c = C[k], x = this.xOf(k), up = c.c >= c.o, col = (r.barcolor && r.barcolor[k]) || (up ? UP : DN);
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, A.y(c.h)); ctx.lineTo(Math.round(x) + 0.5, A.y(c.l)); ctx.stroke();
      var y1 = A.y(Math.max(c.o, c.c)), y2 = A.y(Math.min(c.o, c.c));
      ctx.fillRect(Math.round(x - bw / 2), y1, Math.max(1, Math.round(bw)), Math.max(1, y2 - y1));
    }
    if (r.ok) {
      (r.plots || []).forEach(function (p) { if (!p.hidden) self.plot(p, p.forceOverlay ? A : P, a, b); });
      (r.hlines || []).forEach(function (h) { if (h.hidden || !isNum(h.price)) return; ctx.strokeStyle = h.color; ctx.lineWidth = h.width || 1; dash(ctx, h.style); var y = Math.round(P.y(h.price)) + 0.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(self.W, y); ctx.stroke(); ctx.setLineDash([]); });
      (r.lines || []).forEach(function (l) { self.lineDraw(l, l.fo ? A : P); });
      (r.shapes || []).forEach(function (s) { if (s.bar >= a - 1 && s.bar <= b + 1) self.shape(s, P); });
      (r.trades || []).forEach(function (t) { if (t.bar >= a && t.bar <= b) self.trade(t); });
      (r.labels || []).forEach(function (l) { self.label(l, l.fo ? A : P); });
    }
    ctx.restore();
    this.axes(A, true); if (B) this.axes(B, false);
    this.timeAxis(a, b);
    this.lastPrice();
    this.crosshair();
    this.legend();
  };
  Chart.prototype.grid = function (pane) {
    var ctx = this.ctx, steps = this.ticks(pane.lo, pane.hi, Math.max(2, Math.floor(pane.h / 48)));
    ctx.strokeStyle = GRID; ctx.lineWidth = 1;
    steps.forEach(function (v) { var y = Math.round(pane.y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.W, y); ctx.stroke(); }, this);
    pane.steps = steps;
  };
  Chart.prototype.ticks = function (lo, hi, n) {
    var raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), st = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; }).find(function (s) { return s >= raw; }) || raw;
    var out = []; for (var v = Math.ceil(lo / st) * st; v <= hi; v += st) out.push(+v.toFixed(10)); return out;
  };
  Chart.prototype.axes = function (pane, main) {
    var ctx = this.ctx, mt = main ? this.d.mintick : null;
    ctx.fillStyle = BG; ctx.fillRect(this.W, pane.top, this.AX, pane.h);
    ctx.fillStyle = AXIS; ctx.font = '10.5px Inter,system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    (pane.steps || []).forEach(function (v) { var y = pane.y(v); if (y > pane.top + 6 && y < pane.top + pane.h - 6) ctx.fillText(main ? fmt(v, mt) : fmt(v, 0.01), this.W + 6, y); }, this);
  };
  Chart.prototype.timeAxis = function (a, b) {
    var ctx = this.ctx, C = this.d.candles, y = this.Hfull - this.TX;
    ctx.fillStyle = BG; ctx.fillRect(0, y, this.Wfull, this.TX); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, y, this.Wfull, 1);
    ctx.fillStyle = AXIS; ctx.font = '10px Inter,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var every = Math.max(1, Math.ceil(80 / this.spacing));
    for (var k = a - (a % every); k <= b; k += every) { if (k < 0) continue; var x = this.xOf(k); if (x < 20 || x > this.W - 20) continue; ctx.fillText(tfLabel(C[k].t, this.tfSec), x, y + this.TX / 2); }
  };
  Chart.prototype.lastPrice = function () {
    var ctx = this.ctx, C = this.d.candles, c = C[this.n - 1], A = this.paneA, y = A.y(c.c);
    if (y < 0 || y > A.h) return;
    var col = c.c >= c.o ? UP : DN;
    ctx.strokeStyle = col; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(this.W, Math.round(y) + 0.5); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = col; ctx.fillRect(this.W, y - 9, this.AX, 18); ctx.fillStyle = '#fff'; ctx.font = '600 10.5px Inter,system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(fmt(c.c, this.d.mintick), this.W + 5, y);
  };
  Chart.prototype.crosshair = function () {
    if (this.hover < 0 || this.hover >= this.n) return;
    var ctx = this.ctx, x = this.xOf(this.hover), y = this.hy, pane = this.paneB && y > this.paneB.top ? this.paneB : this.paneA;
    ctx.strokeStyle = 'rgba(200,210,225,.35)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, this.Hfull - this.TX); ctx.stroke();
    if (y < this.Hfull - this.TX) { ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(this.W, Math.round(y) + 0.5); ctx.stroke(); }
    ctx.setLineDash([]);
    if (y < this.Hfull - this.TX) { ctx.fillStyle = '#2a3446'; ctx.fillRect(this.W, y - 9, this.AX, 18); ctx.fillStyle = '#e8edf4'; ctx.font = '10.5px Inter,system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(fmt(pane.v(y), pane === this.paneA ? this.d.mintick : 0.01), this.W + 5, y); }
  };
  Chart.prototype.legend = function () {
    var C = this.d.candles, k = this.hover >= 0 && this.hover < this.n ? this.hover : this.n - 1, c = C[k], mt = this.d.mintick, self = this;
    var parts = ['<b>' + (this.d.label || this.d.symbol) + ' · ' + (this.d.tfName || this.d.tf) + '</b>', 'O <i>' + fmt(c.o, mt) + '</i> H <i>' + fmt(c.h, mt) + '</i> L <i>' + fmt(c.l, mt) + '</i> C <i class="' + (c.c >= c.o ? 'u' : 'd') + '">' + fmt(c.c, mt) + '</i>'];
    var vals = (this.r.plots || []).filter(function (p) { return !p.hidden && isNum(p.values[k]); }).slice(0, 4).map(function (p) { return '<span style="color:' + (p.colors[k] || '#9aa') + '">' + (p.title ? self.esc(p.title) + ' ' : '') + fmt(p.values[k], Math.abs(p.values[k]) > 50 ? mt : 0.01) + '</span>'; });
    this.leg.innerHTML = parts.join(' ') + (vals.length ? '<br>' + vals.join(' · ') : '');
  };
  Chart.prototype.esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  Chart.prototype.plot = function (p, pane, a, b) {
    var ctx = this.ctx, self = this, st = p.style || 'plot.style_line', w = Math.max(1, p.width || 1);
    if (/histogram|columns/.test(st)) {
      var base = pane.y(p.histbase || 0);
      for (var k = a; k <= b; k++) { var v = p.values[k]; if (!isNum(v) || !p.colors[k]) continue; ctx.fillStyle = p.colors[k]; var x = this.xOf(k), y = pane.y(v), bw = /columns/.test(st) ? Math.max(1, this.spacing * 0.7) : Math.max(1, w); ctx.fillRect(x - bw / 2, Math.min(y, base), bw, Math.max(1, Math.abs(base - y))); }
      return;
    }
    if (/circles|cross/.test(st)) {
      for (var j = a; j <= b; j++) { var vv = p.values[j]; if (!isNum(vv) || !p.colors[j]) continue; ctx.fillStyle = p.colors[j]; ctx.beginPath(); ctx.arc(this.xOf(j), pane.y(vv), Math.max(1.5, w), 0, 6.283); ctx.fill(); }
      return;
    }
    ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var step = /stepline/.test(st), prev = null;
    for (var i = Math.max(0, a - 1); i <= Math.min(this.n - 1, b + 1); i++) {
      var val = p.values[i], col = p.colors[i];
      if (!isNum(val) || !col) { prev = null; continue; }
      var px = this.xOf(i), py = pane.y(val);
      if (prev) {
        ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(prev[0], prev[1]);
        if (step) ctx.lineTo(px, prev[1]);
        ctx.lineTo(px, py); ctx.stroke();
        if (/area/.test(st)) { ctx.save(); ctx.globalAlpha = 0.15; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(px, py); ctx.lineTo(px, pane.top + pane.h); ctx.lineTo(prev[0], pane.top + pane.h); ctx.fill(); ctx.restore(); }
      }
      prev = [px, py];
    }
  };
  Chart.prototype.fills = function (pane, a, b) {
    var r = this.r, ctx = this.ctx, self = this;
    (r.fills || []).forEach(function (f) {
      var get = function (ref, k) { if (ref.kind === 'hline') { var h = (r.hlines || [])[ref.idx]; return h ? h.price : null; } var p = (r.plots || [])[ref.idx]; return p ? p.values[k] : null; };
      for (var k = Math.max(1, a); k <= b; k++) {
        var c = f.colors[k]; if (!c) continue;
        var a1 = get(f.a, k - 1), a2 = get(f.a, k), b1 = get(f.b, k - 1), b2 = get(f.b, k);
        if (![a1, a2, b1, b2].every(isNum)) continue;
        var x1 = self.xOf(k - 1), x2 = self.xOf(k);
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x1, pane.y(a1)); ctx.lineTo(x2, pane.y(a2)); ctx.lineTo(x2, pane.y(b2)); ctx.lineTo(x1, pane.y(b1)); ctx.closePath(); ctx.fill();
      }
    });
  };
  Chart.prototype.xs = function (x1, x2, ext) {
    var X1 = this.xOf(x1), X2 = this.xOf(x2);
    if (ext === 'extend.right' || ext === 'extend.both') X2 = this.W + 10;
    if (ext === 'extend.left' || ext === 'extend.both') X1 = -10;
    return [X1, X2];
  };
  Chart.prototype.boxDraw = function (bx, pane) {
    var ctx = this.ctx, xs = this.xs(bx.left, bx.right, bx.extend), x1 = Math.min(xs[0], xs[1]) - this.spacing / 2, x2 = Math.max(xs[0], xs[1]) + this.spacing / 2;
    if (x2 < 0 || x1 > this.W) return;
    var y1 = pane.y(Math.max(bx.top, bx.bottom)), y2 = pane.y(Math.min(bx.top, bx.bottom));
    if (bx.bg) { ctx.fillStyle = bx.bg; ctx.fillRect(x1, y1, x2 - x1, Math.max(1, y2 - y1)); }
    if (bx.border && bx.bw > 0) { ctx.strokeStyle = bx.border; ctx.lineWidth = bx.bw; dash(ctx, bx.bs); ctx.strokeRect(Math.round(x1) + 0.5, Math.round(y1) + 0.5, x2 - x1, Math.max(1, y2 - y1)); ctx.setLineDash([]); }
    if (bx.text) {
      var fs = SIZE[bx.ts] || 10; ctx.font = fs + 'px Inter,system-ui,sans-serif'; ctx.fillStyle = bx.tc || '#d1d4dc';
      var al = bx.th === 'text.align_left' ? 'left' : bx.th === 'text.align_right' ? 'right' : 'center';
      ctx.textAlign = al; ctx.textBaseline = bx.tv === 'text.align_top' ? 'top' : bx.tv === 'text.align_bottom' ? 'bottom' : 'middle';
      var tx = al === 'left' ? x1 + 4 : al === 'right' ? Math.min(x2, this.W) - 4 : (x1 + Math.min(x2, this.W)) / 2;
      var ty = bx.tv === 'text.align_top' ? y1 + 2 : bx.tv === 'text.align_bottom' ? y2 - 2 : (y1 + y2) / 2;
      if (y2 - y1 >= fs * 0.8) ctx.fillText(String(bx.text).split('\n')[0], tx, ty);
    }
  };
  Chart.prototype.lineDraw = function (l, pane) {
    var ctx = this.ctx, X1 = this.xOf(l.x1), X2 = this.xOf(l.x2), Y1 = pane.y(l.y1), Y2 = pane.y(l.y2);
    var ext = l.extend || 'extend.none';
    if (ext !== 'extend.none' && X2 !== X1) {
      var slope = (Y2 - Y1) / (X2 - X1);
      if (ext === 'extend.right' || ext === 'extend.both') { var xr = this.W + 10; Y2 = Y2 + slope * (xr - X2); X2 = xr; }
      if (ext === 'extend.left' || ext === 'extend.both') { var xl = -10; Y1 = Y1 + slope * (xl - X1); X1 = xl; }
    }
    if (Math.max(X1, X2) < 0 || Math.min(X1, X2) > this.W) return;
    ctx.strokeStyle = l.color || '#2962ff'; ctx.lineWidth = l.width || 1; dash(ctx, l.style);
    ctx.beginPath(); ctx.moveTo(X1, Y1); ctx.lineTo(X2, Y2); ctx.stroke(); ctx.setLineDash([]);
    if (/arrow_right|arrow_both/.test(l.style || '')) this.arrowHead(X1, Y1, X2, Y2, l.color);
  };
  Chart.prototype.arrowHead = function (x1, y1, x2, y2, col) { var ctx = this.ctx, an = Math.atan2(y2 - y1, x2 - x1); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 8 * Math.cos(an - 0.4), y2 - 8 * Math.sin(an - 0.4)); ctx.lineTo(x2 - 8 * Math.cos(an + 0.4), y2 - 8 * Math.sin(an + 0.4)); ctx.fill(); };
  Chart.prototype.bubble = function (x, y, text, bg, fg, fs, dir) {
    // dir: 'down' (bubble above the point, pointer down), 'up', 'left' (pointer left, bubble to the right), 'right', 'center', 'none'
    var ctx = this.ctx; ctx.font = '600 ' + fs + 'px Inter,system-ui,sans-serif';
    var lines = String(text || '').split('\n'), tw = Math.max.apply(null, lines.map(function (s) { return ctx.measureText(s).width; })), lh = fs + 3;
    var w = tw + 10, h = lines.length * lh + 6, px = 6, bx, by;
    if (dir === 'none') { ctx.fillStyle = fg || bg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; lines.forEach(function (s, k) { ctx.fillText(s, x, y + (k - (lines.length - 1) / 2) * lh); }); return; }
    if (dir === 'down') { bx = x - w / 2; by = y - h - px; } else if (dir === 'up') { bx = x - w / 2; by = y + px; } else if (dir === 'left') { bx = x + px; by = y - h / 2; } else if (dir === 'right') { bx = x - w - px; by = y - h / 2; } else { bx = x - w / 2; by = y - h / 2; }
    ctx.fillStyle = bg;
    if (bg) {
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, w, h, 4); else ctx.rect(bx, by, w, h); ctx.fill();
      ctx.beginPath();
      if (dir === 'down') { ctx.moveTo(x - 5, by + h); ctx.lineTo(x + 5, by + h); ctx.lineTo(x, y); }
      else if (dir === 'up') { ctx.moveTo(x - 5, by); ctx.lineTo(x + 5, by); ctx.lineTo(x, y); }
      else if (dir === 'left') { ctx.moveTo(bx, y - 5); ctx.lineTo(bx, y + 5); ctx.lineTo(x, y); }
      else if (dir === 'right') { ctx.moveTo(bx + w, y - 5); ctx.lineTo(bx + w, y + 5); ctx.lineTo(x, y); }
      ctx.fill();
    }
    if (text) { ctx.fillStyle = fg || '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; lines.forEach(function (s, k) { ctx.fillText(s, bx + w / 2, by + 3 + lh / 2 + k * lh); }); }
  };
  Chart.prototype.label = function (l, pane) {
    var x = this.xOf(l.x); if (x < -40 || x > this.W + 40) return;
    var C = this.d.candles, k = Math.max(0, Math.min(this.n - 1, Math.round(l.x)));
    var y = l.yloc === 'yloc.abovebar' ? pane.y(C[k].h) - 4 : l.yloc === 'yloc.belowbar' ? pane.y(C[k].l) + 4 : pane.y(l.y);
    var st = l.style || 'label.style_label_down', fs = SIZE[l.size] || 12, ctx = this.ctx;
    if (/xcross|cross|circle|square|diamond|triangle|arrow|flag/.test(st)) {
      ctx.fillStyle = l.color || '#2962ff'; var s = fs * 0.55;
      ctx.beginPath();
      if (/triangleup|arrowup/.test(st)) { ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s); ctx.lineTo(x - s, y + s); }
      else if (/triangledown|arrowdown/.test(st)) { ctx.moveTo(x, y + s); ctx.lineTo(x + s, y - s); ctx.lineTo(x - s, y - s); }
      else if (/circle/.test(st)) ctx.arc(x, y, s, 0, 6.283);
      else ctx.rect(x - s, y - s, 2 * s, 2 * s);
      ctx.fill();
      if (l.text) this.bubble(x, /up/.test(st) ? y + s + fs : y - s - fs, l.text, null, l.textcolor || l.color, fs, 'none');
      return;
    }
    var dir = /label_down/.test(st) ? 'down' : /label_up/.test(st) ? 'up' : /label_left/.test(st) ? 'left' : /label_right/.test(st) ? 'right' : /none/.test(st) ? 'none' : 'center';
    if (dir === 'none') { this.bubble(x, y, l.text, null, l.textcolor || '#d1d4dc', fs, 'none'); return; }
    this.bubble(x, y, l.text, l.color || '#2962ff', l.textcolor || '#fff', fs, dir);
  };
  Chart.prototype.shape = function (s, pane) {
    var ctx = this.ctx, C = this.d.candles, k = Math.max(0, Math.min(this.n - 1, s.bar)), x = this.xOf(s.bar), fs = SIZE[s.size] || 10, sz = Math.max(4, fs * 0.6);
    var loc = s.location || 'location.abovebar', above = loc === 'location.abovebar' || loc === 'location.top';
    var y = loc === 'location.abovebar' ? pane.y(C[k].h) - sz - 4 : loc === 'location.belowbar' ? pane.y(C[k].l) + sz + 4 : loc === 'location.top' ? pane.top + sz + 4 : loc === 'location.bottom' ? pane.top + pane.h - sz - 4 : isNum(s.price) ? pane.y(s.price) : pane.y(C[k].c);
    var st = s.style || 'shape.xcross', col = s.color || '#2962ff';
    if (/label(up|down)/.test(st)) { this.bubble(x, above ? y + sz : y - sz, s.text, col, s.textcolor || '#fff', fs, /labelup/.test(st) ? 'up' : 'down'); return; }
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (st === 'char') { ctx.font = (fs + 2) + 'px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.char || '•', x, y); }
    else if (/triangleup|arrowup/.test(st)) { ctx.moveTo(x, y - sz); ctx.lineTo(x + sz, y + sz * 0.8); ctx.lineTo(x - sz, y + sz * 0.8); ctx.fill(); }
    else if (/triangledown|arrowdown/.test(st)) { ctx.moveTo(x, y + sz); ctx.lineTo(x + sz, y - sz * 0.8); ctx.lineTo(x - sz, y - sz * 0.8); ctx.fill(); }
    else if (/circle/.test(st)) { ctx.arc(x, y, sz * 0.7, 0, 6.283); ctx.fill(); }
    else if (/diamond/.test(st)) { ctx.moveTo(x, y - sz); ctx.lineTo(x + sz, y); ctx.lineTo(x, y + sz); ctx.lineTo(x - sz, y); ctx.fill(); }
    else if (/square|flag/.test(st)) { ctx.rect(x - sz * 0.7, y - sz * 0.7, sz * 1.4, sz * 1.4); ctx.fill(); }
    else { ctx.moveTo(x - sz * 0.7, y - sz * 0.7); ctx.lineTo(x + sz * 0.7, y + sz * 0.7); ctx.moveTo(x + sz * 0.7, y - sz * 0.7); ctx.lineTo(x - sz * 0.7, y + sz * 0.7); if (st === 'shape.cross') { ctx.moveTo(x, y - sz); ctx.lineTo(x, y + sz); ctx.moveTo(x - sz, y); ctx.lineTo(x + sz, y); } ctx.stroke(); }
    if (s.text && st !== 'char') { ctx.font = '600 ' + fs + 'px Inter,system-ui,sans-serif'; ctx.fillStyle = s.textcolor || col; ctx.textAlign = 'center'; ctx.textBaseline = above ? 'bottom' : 'top'; ctx.fillText(s.text, x, above ? y - sz - 2 : y + sz + 2); }
  };
  Chart.prototype.trade = function (t) {
    var ctx = this.ctx, A = this.paneA, x = this.xOf(t.bar), y = A.y(t.price), up = t.dir > 0;
    var col = t.kind === 'entry' ? (up ? UP : DN) : (t.pnl >= 0 ? '#3dd68c' : '#ff6b6b');
    ctx.fillStyle = col; ctx.beginPath();
    if (up) { ctx.moveTo(x, y + 2); ctx.lineTo(x + 5, y + 10); ctx.lineTo(x - 5, y + 10); } else { ctx.moveTo(x, y - 2); ctx.lineTo(x + 5, y - 10); ctx.lineTo(x - 5, y - 10); }
    ctx.fill();
    ctx.font = '600 9.5px Inter,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = up ? 'top' : 'bottom';
    ctx.fillText(t.kind === 'entry' ? (up ? 'Long' : 'Short') : String(t.id || 'Exit'), x, up ? y + 12 : y - 12);
  };
  Chart.prototype.tables = function () {
    var r = this.r, self = this; this.tbl.innerHTML = '';
    if (!r.ok) return;
    (r.tables || []).forEach(function (t) {
      var el = document.createElement('table'); el.className = 'pv-tbl ' + String(t.position || 'position.top_right').replace('position.', 'p-');
      if (t.bgcolor) el.style.background = t.bgcolor;
      if (t.frame_color && t.frame_width) el.style.outline = t.frame_width + 'px solid ' + t.frame_color;
      for (var row = 0; row < (t.rows || 0); row++) {
        var tr = document.createElement('tr'), any = false;
        for (var col = 0; col < (t.columns || 0); col++) {
          var c = t.cells[col + ':' + row], td = document.createElement('td');
          if (c) {
            any = true; td.textContent = c.text;
            if (c.text_color) td.style.color = c.text_color; if (c.bgcolor) td.style.background = c.bgcolor;
            td.style.fontSize = (SIZE[c.text_size] || 10.5) + 'px';
            td.style.textAlign = c.text_halign === 'text.align_left' ? 'left' : c.text_halign === 'text.align_right' ? 'right' : 'center';
            if (c.mono) td.style.fontFamily = 'ui-monospace,Menlo,Consolas,monospace';
            if (t.border_color && t.border_width) td.style.border = t.border_width + 'px solid ' + t.border_color;
          }
          tr.appendChild(td);
        }
        if (any) el.appendChild(tr);
      }
      self.tbl.appendChild(el);
    });
  };

  window.NexusChart = { create: function (box, data, opts) { return new Chart(box, data, opts); } };
})();
