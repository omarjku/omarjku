// Shared helpers for every scene. A scene is a pure function of time:
// draw(ctx, t) must paint the same pixels for the same t, so frames can be
// rendered in any order, on any worker, and loops close cleanly.

export const TAU = Math.PI * 2;

// ---------- numbers ----------
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));
export const remap = (x, a, b, c, d) => lerp(c, d, invLerp(a, b, x));
export const fract = (x) => x - Math.floor(x);
export const smooth = (x) => x * x * (3 - 2 * x);

// ---------- easing ----------
export const ease = {
  linear: (x) => x,
  inQuad: (x) => x * x,
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  inOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outQuart: (x) => 1 - Math.pow(1 - x, 4),
  inOutQuart: (x) => (x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2),
  outExpo: (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inOutExpo: (x) =>
    x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  outBack: (x) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  },
  outElastic: (x) =>
    x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};

// Progress of t through [a, b], eased. The workhorse of every timeline.
export const seg = (t, a, b, e = ease.linear) => {
  const x = invLerp(a, b, t);
  return x <= 0 ? 0 : x >= 1 ? 1 : e(x);
};
// Fade in over [a, a+fi], hold, fade out over [b-fo, b].
export const window_ = (t, a, b, fi = 0.4, fo = 0.4) =>
  Math.min(seg(t, a, a + fi, ease.outCubic), 1 - seg(t, b - fo, b, ease.inCubic));
// Pulse 0..1..0 with period p.
export const pulse = (t, p = 1, phase = 0) => 0.5 - 0.5 * Math.cos(TAU * (t / p + phase));

// ---------- randomness (seeded, so frames are reproducible) ----------
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D value noise, smooth and periodic-friendly enough for drifting fields.
export function noise2(seed = 7) {
  const r = rng(seed);
  const p = new Uint8Array(512);
  const v = new Float32Array(256);
  for (let i = 0; i < 256; i++) { p[i] = i; v[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  const h = (x, y) => v[p[p[x & 255] + (y & 255)]];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    return lerp(lerp(h(xi, yi), h(xi + 1, yi), xf), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), xf), yf);
  };
}

// ---------- color ----------
export function hex(h) {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgba = (h, a = 1) => {
  const [r, g, b] = hex(h);
  return `rgba(${r},${g},${b},${a})`;
};
export const mix = (h1, h2, t) => {
  const a = hex(h1), b = hex(h2);
  const c = a.map((x, i) => Math.round(lerp(x, b[i], t)));
  return '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
};

// ---------- drawing ----------
export function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, TAU);
}

export const FONTS = {
  display: '"Inter Display", "Inter", "Inter Bundled", sans-serif',
  sans: '"Inter", "Inter Bundled", sans-serif',
  mono: '"JetBrains Mono", "DejaVu Sans Mono", monospace',
  serif: '"Instrument Serif", serif',
  grotesk: '"Space Grotesk", "Inter", "Inter Bundled", sans-serif',
  bangla: '"Hind Siliguri", sans-serif',
};

// Text with tracking, alpha and alignment in one call. Returns the width.
export function text(ctx, str, x, y, o = {}) {
  const {
    size = 32, weight = 600, family = FONTS.display, color = '#fff', align = 'left',
    baseline = 'alphabetic', alpha = 1, tracking = 0, italic = false, shadow = null,
  } = o;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`;
  ctx.fillStyle = color;
  ctx.textBaseline = baseline;
  ctx.letterSpacing = `${tracking}px`;
  const w = ctx.measureText(str).width;
  ctx.textAlign = 'left';
  const dx = align === 'center' ? -w / 2 : align === 'right' ? -w : 0;
  if (shadow) { ctx.shadowColor = shadow.color; ctx.shadowBlur = shadow.blur; }
  ctx.fillText(str, x + dx, y);
  ctx.restore();
  return w;
}

export function measure(ctx, str, o = {}) {
  const { size = 32, weight = 600, family = FONTS.display, tracking = 0, italic = false } = o;
  ctx.save();
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`;
  ctx.letterSpacing = `${tracking}px`;
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

// Reveal a string letter by letter: each glyph rises and fades in.
export function kinetic(ctx, str, x, y, p, o = {}) {
  const { stagger = 0.04, rise = 18, align = 'left' } = o;
  const total = measure(ctx, str, o);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const n = str.length;
  const span = 1 + stagger * (n - 1) * 10;
  for (let i = 0; i < n; i++) {
    const ch = str[i];
    const local = clamp((p * span - i * stagger * 10));
    const e = ease.outCubic(local);
    const w = measure(ctx, ch, o) ;
    text(ctx, ch, cx, y + (1 - e) * rise, { ...o, align: 'left', alpha: (o.alpha ?? 1) * e });
    cx += w + (o.tracking || 0) * 0;
  }
}

// Typewriter: first floor(p * len) characters, plus a blinking caret.
export function typed(str, p) {
  return str.slice(0, Math.floor(clamp(p) * str.length + 1e-6));
}

export function glow(ctx, color, blur, fn) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  fn();
  ctx.restore();
}

// Soft radial light. Cheap way to give flat scenes depth.
export function light(ctx, x, y, r, color, a = 0.35) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function dotGrid(ctx, W, H, gap = 32, color = '#ffffff', a = 0.06, r = 1.1) {
  ctx.fillStyle = rgba(color, a);
  for (let y = gap / 2; y < H; y += gap)
    for (let x = gap / 2; x < W; x += gap) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
}

export function vignette(ctx, W, H, a = 0.55) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// A pill label, e.g. a tag or a status chip. Returns its width.
export function pill(ctx, str, x, y, o = {}) {
  const { size = 15, pad = 12, h = size * 2, bg = 'rgba(255,255,255,0.08)', stroke = null,
    color = '#fff', family = FONTS.mono, weight = 500, alpha = 1, align = 'left', dot = null } = o;
  const tw = measure(ctx, str, { size, family, weight });
  const w = tw + pad * 2 + (dot ? size * 0.9 : 0);
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.save();
  ctx.globalAlpha *= alpha;
  rr(ctx, x0, y - h / 2, w, h, h / 2);
  ctx.fillStyle = bg; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  let tx = x0 + pad;
  if (dot) { circle(ctx, tx + size * 0.3, y, size * 0.27); ctx.fillStyle = dot; ctx.fill(); tx += size * 0.9; }
  text(ctx, str, tx, y + 1, { size, family, weight, color, baseline: 'middle' });
  ctx.restore();
  return w;
}

// Cubic bezier point, for paths things travel along.
export function bez(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

// Draw the first p (0..1) of a polyline, so lines can "draw themselves".
export function partialLine(ctx, pts, p) {
  if (pts.length < 2 || p <= 0) return;
  let len = 0;
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segs.push(d); len += d;
  }
  let left = len * clamp(p);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length && left > 0; i++) {
    const d = segs[i - 1];
    const k = Math.min(1, left / d);
    ctx.lineTo(lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k));
    left -= d;
  }
  ctx.stroke();
}

// Window chrome: a rounded panel with three dots, like a macOS app window.
export function windowFrame(ctx, x, y, w, h, o = {}) {
  const { r = 14, bg = '#11141b', stroke = 'rgba(255,255,255,0.08)', title = '', bar = 34, alpha = 1 } = o;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = bg; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y + bar); ctx.lineTo(x + w, y + bar); ctx.stroke();
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { circle(ctx, x + 18 + i * 18, y + bar / 2, 5.5); ctx.fillStyle = c; ctx.fill(); });
  if (title) text(ctx, title, x + w / 2, y + bar / 2 + 1, { size: 13, family: FONTS.mono, weight: 500, color: 'rgba(255,255,255,0.45)', align: 'center', baseline: 'middle' });
  ctx.restore();
}

// Count up a number with an ease, formatted.
export function countUp(v, p, digits = 0) {
  return (v * ease.outCubic(clamp(p))).toFixed(digits);
}
