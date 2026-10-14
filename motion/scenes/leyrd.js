// Leyrd: the forecast goes in, the engine adjusts it, layers come out.
// Numbers follow lib/engine.ts: wind > 25 km/h −2, bike −2, feedback offset,
// band "cold" (0–6 °C) → base 2 · mid 3 · outer 3 + scarf, gloves; rain → waterproof.
import { clamp, lerp, ease, seg, rng, rgba, mix, rr, circle, text, measure, pill, light, dotGrid, FONTS, TAU, typed, window_ } from '../engine/lib.js';

const C = {
  bg: '#0e1012', card: '#181b1d', line: '#2b3033', ink: '#eceeef', muted: '#9aa1a6',
  accent: '#7cc4ad', accentSoft: '#1d2f2a', cold: '#7fb1f0', warm: '#f08a6c', warn: '#f0b860',
  l1: '#e3eeea', l2: '#a9d3c5', l3: '#7cc4ad', deep: '#2f5d50',
};
const W = 1280, H = 640, D = 11;

// Hourly feels-like °C, 06:00–21:00, for a raw October morning.
const HOURS = [5.2, 5.6, 6.0, 6.8, 8.1, 9.4, 10.6, 11.4, 11.9, 12.0, 11.4, 10.2, 8.9, 7.6, 6.9, 6.4];
const LEAVE = 2, BACK = 11; // 08:00 and 17:00

const STEPS = [
  { label: 'Feels-like at 08:00 (worst commute)', v: 6.0, base: true },
  { label: 'Wind 31 km/h', v: -2.0 },
  { label: 'You bike', v: -2.0 },
  { label: 'Your feedback so far', v: -0.5 },
];
const ADJ = STEPS.reduce((s, x) => s + x.v, 0); // 1.5

const fmt = (v, sign) => `${sign ? (v < 0 ? '−' : '+') : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;

function logo(ctx, x, y, s, p) {
  // Three stacked chevrons, dropping in one after another (the app's LogoMark).
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 64, s / 64);
  rr(ctx, 0, 0, 64, 64, 14);
  ctx.fillStyle = C.deep; ctx.globalAlpha = seg(p, 0, 0.3); ctx.fill();
  ctx.globalAlpha = 1;
  const shapes = [
    [C.l1, 'M14 22 L32 13 L50 22 L32 31 Z'],
    [C.l2, 'M14 32 L20 29 L32 35 L44 29 L50 32 L32 41 Z'],
    [C.l3, 'M14 42 L20 39 L32 45 L44 39 L50 42 L32 51 Z'],
  ];
  shapes.forEach(([c, d], i) => {
    const k = seg(p, 0.2 + i * 0.18, 0.55 + i * 0.18, ease.outBack);
    ctx.save();
    ctx.globalAlpha = clamp(k * 1.5);
    ctx.translate(0, (1 - k) * -14);
    ctx.fillStyle = c; ctx.fill(new Path2D(d));
    ctx.restore();
  });
  ctx.restore();
}

// A garment around the mannequin. i = layer index (0 base, 1 mid, 2 outer).
function garment(ctx, cx, o) {
  const { inflate = 0, len = 0, sleeve = 1, color, collar = false, zip = false, hood = false, open = null } = o;
  const sy = 236, sw = 62 + inflate, hw = 56 + inflate * 0.9, hy = 410 + len;
  const cuffY = lerp(300, 404, sleeve) + inflate * 0.3;
  const cuffX = lerp(sw + 14, sw + 30, sleeve);
  const cuffW = 24 + inflate * 0.5;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 14;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * (sw - 10), sy + 2);
    ctx.lineTo(cx + side * (cuffX + 2), cuffY);
    ctx.lineTo(cx + side * (cuffX - cuffW), cuffY + 2);
    ctx.lineTo(cx + side * (sw - 20), sy + 60);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - 22, sy - 14);
  ctx.quadraticCurveTo(cx - sw + 6, sy - 8, cx - sw, sy + 12);
  ctx.lineTo(cx - hw, hy);
  ctx.lineTo(cx + hw, hy);
  ctx.lineTo(cx + sw, sy + 12);
  ctx.quadraticCurveTo(cx + sw - 6, sy - 8, cx + 22, sy - 14);
  ctx.quadraticCurveTo(cx, sy + (collar ? -4 : 8), cx - 22, sy - 14);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  if (hood) {
    ctx.beginPath();
    ctx.ellipse(cx, sy - 10, 40, 16, 0, Math.PI * 0.05, Math.PI * 0.95);
    ctx.lineWidth = 10; ctx.strokeStyle = mix(color, '#000', 0.18); ctx.stroke();
  }
  if (collar) {
    ctx.fillStyle = mix(color, '#000', 0.2);
    ctx.beginPath();
    ctx.moveTo(cx - 30, sy - 22); ctx.lineTo(cx - 6, sy + 16); ctx.lineTo(cx - 34, sy + 4); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 30, sy - 22); ctx.lineTo(cx + 6, sy + 16); ctx.lineTo(cx + 34, sy + 4); ctx.closePath(); ctx.fill();
  }
  if (open) {
    // Unzipped: the hoodie shows down the middle and the tee at the neck.
    ctx.fillStyle = open[0];
    ctx.beginPath();
    ctx.moveTo(cx - 14, sy + 2); ctx.lineTo(cx + 14, sy + 2); ctx.lineTo(cx + 22, hy + 6); ctx.lineTo(cx - 22, hy + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = open[1];
    ctx.beginPath(); ctx.moveTo(cx - 12, sy + 2); ctx.lineTo(cx + 12, sy + 2); ctx.lineTo(cx, sy + 22); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = mix(color, '#000', 0.35); ctx.lineWidth = 3;
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + sd * 15, sy + 4); ctx.lineTo(cx + sd * 23, hy + 6); ctx.stroke(); }
  }
  if (zip) {
    ctx.strokeStyle = mix(color, '#000', 0.35); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, sy + 12); ctx.lineTo(cx, hy + 6); ctx.stroke();
    ctx.fillStyle = mix(color, '#fff', 0.5); rr(ctx, cx - 4, sy + 40, 8, 14, 3); ctx.fill();
  }
  ctx.restore();
}

function figure(ctx, cx, t, layers) {
  // Legs, head, and the base body. Kept flat so the layers read clearly.
  const skin = '#cfd5d8', pants = '#2a3134';
  ctx.save();
  ctx.fillStyle = pants;
  rr(ctx, cx - 50, 400, 46, 170, 18); ctx.fill();
  rr(ctx, cx + 4, 400, 46, 170, 18); ctx.fill();
  ctx.fillStyle = '#1b1f22';
  rr(ctx, cx - 56, 556, 56, 22, 10); ctx.fill();
  rr(ctx, cx + 2, 556, 56, 22, 10); ctx.fill();
  // body under everything
  ctx.fillStyle = skin;
  rr(ctx, cx - 12, 190, 24, 40, 8); ctx.fill();
  ctx.strokeStyle = skin; ctx.lineCap = 'round'; ctx.lineWidth = 22;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * 52, 250); ctx.lineTo(cx + s * 88, 396); ctx.stroke(); }
  for (const s of [-1, 1]) { circle(ctx, cx + s * 90, 410, 15); ctx.fill(); }
  garment(ctx, cx, { color: '#4a5359', inflate: -8, sleeve: 0.1 });
  ctx.fillStyle = skin;
  circle(ctx, cx, 160, 38); ctx.fill();
  ctx.restore();

  // Layers drop from above with a little overshoot.
  layers.forEach((L) => {
    if (L.p <= 0) return;
    const k = ease.outBack(clamp(L.p));
    ctx.save();
    ctx.globalAlpha = clamp(L.p * 2.5);
    ctx.translate(cx, 330);
    ctx.scale(lerp(1.25, 1, k), lerp(1.25, 1, k));
    ctx.translate(-cx, -330 - (1 - k) * 60);
    garment(ctx, cx, L.g);
    ctx.restore();
  });

  // Scarf and gloves (cold band accessories)
  const sc = ease.outBack(seg(t, 6.15, 6.55));
  if (sc > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(sc * 2);
    ctx.fillStyle = C.warm;
    ctx.translate(cx, 214); ctx.scale(sc, sc);
    rr(ctx, -40, -14, 80, 26, 13); ctx.fill();
    rr(ctx, 6, 0, 22, 70, 9); ctx.fill();
    ctx.fillStyle = mix(C.warm, '#000', 0.2);
    rr(ctx, 6, 54, 22, 6, 2); ctx.fill();
    ctx.restore();
  }
  const gl = ease.outBack(seg(t, 6.35, 6.75));
  if (gl > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(gl * 2);
    ctx.fillStyle = C.warn;
    for (const s of [-1, 1]) { circle(ctx, cx + s * 98, 416, 17 * gl); ctx.fill(); }
    ctx.restore();
  }
}

function rain(ctx, x, y, w, h, t, amt) {
  if (amt <= 0) return;
  const r = rng(11);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = rgba(C.cold, 0.5 * amt);
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const rx = x + r() * w, sp = 520 + r() * 260, off = r() * h, len = 12 + r() * 14;
    // Period of D seconds keeps the rain seamless across the loop.
    const loops = Math.max(1, Math.round((sp * D) / h));
    const yy = y + ((off + (loops * h * t) / D) % h);
    if (r() > amt) continue;
    ctx.beginPath(); ctx.moveTo(rx, yy); ctx.lineTo(rx - 3, yy + len); ctx.stroke();
  }
  ctx.restore();
}

function hourly(ctx, x, y, w, h, t) {
  const n = HOURS.length, gap = 5, bw = (w - gap * (n - 1)) / n;
  const lo = Math.min(...HOURS), hi = Math.max(...HOURS);
  HOURS.forEach((v, i) => {
    const p = seg(t, 0.7 + i * 0.045, 1.3 + i * 0.045, ease.outCubic);
    const bh = (12 + ((v - lo) / (hi - lo)) * (h - 12)) * p;
    const out = i === LEAVE || i === BACK;
    const hl = out ? window_(t, 1.6, D - 0.3, 0.4, 0.4) : 0;
    rr(ctx, x + i * (bw + gap), y + h - bh, bw, bh, 3);
    ctx.fillStyle = hl > 0 ? mix(C.line, C.accent, hl) : C.line;
    ctx.fill();
  });
  [[LEAVE, 'leave 08:00'], [BACK, 'back 17:00']].forEach(([i, s]) => {
    text(ctx, s, x + i * (bw + gap) + bw / 2, y + h + 22, { size: 13, family: FONTS.mono, weight: 500, color: C.accent, align: 'center', alpha: window_(t, 1.7, D - 0.3) });
  });
}

export default {
  width: W, height: H, duration: D, fps: 30,
  draw(ctx, t) {
    // Everything fades back to the empty frame in the last 0.6 s so the loop is seamless.
    const out = 1 - seg(t, D - 0.6, D, ease.inCubic);

    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    dotGrid(ctx, W, H, 28, '#ffffff', 0.035);
    light(ctx, 960, 300, 420, C.accent, 0.10);
    light(ctx, 180, 80, 380, C.cold, 0.06);

    ctx.save();
    ctx.globalAlpha = out;

    // ---- header ----
    logo(ctx, 64, 52, 46, seg(t, 0.05, 1.0));
    text(ctx, 'Leyrd', 124, 88, { size: 38, weight: 700, color: C.ink, alpha: seg(t, 0.3, 0.8), tracking: -0.5 });
    text(ctx, 'the layer coach', 230, 87, { size: 26, family: FONTS.serif, italic: true, color: C.muted, alpha: seg(t, 0.5, 1.0) });

    // ---- left: the question, then the engine ----
    const q = 'How many layers today?';
    text(ctx, typed(q, seg(t, 0.4, 1.5)), 64, 172, { size: 46, weight: 700, color: C.ink, tracking: -1 });

    const rowY = 232, rowH = 46;
    STEPS.forEach((s, i) => {
      const a = 1.9 + i * 0.6;
      const p = seg(t, a, a + 0.45, ease.outCubic);
      if (p <= 0) return;
      const y = rowY + i * rowH;
      ctx.save();
      ctx.globalAlpha *= p;
      ctx.translate((1 - p) * -16, 0);
      circle(ctx, 76, y - 6, 4); ctx.fillStyle = s.base ? C.cold : C.warm; ctx.fill();
      text(ctx, s.label, 96, y, { size: 20, family: FONTS.sans, weight: 500, color: C.ink });
      text(ctx, `${fmt(s.v, !s.base)} °C`, 600, y, { size: 20, family: FONTS.mono, weight: 600, color: s.base ? C.cold : C.warm, align: 'right' });
      ctx.restore();
    });

    // the running total
    const tot = seg(t, 4.5, 5.0, ease.outCubic);
    if (tot > 0) {
      const y = rowY + STEPS.length * rowH + 4;
      ctx.save();
      ctx.globalAlpha *= tot;
      ctx.strokeStyle = C.line; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(76, y - 22); ctx.lineTo(lerp(76, 600, tot), y - 22); ctx.stroke();
      text(ctx, 'Adjusted', 96, y + 12, { size: 20, family: FONTS.sans, weight: 700, color: C.ink });
      const shown = lerp(6.0, ADJ, seg(t, 4.6, 5.3, ease.outCubic));
      text(ctx, `${fmt(shown)} °C`, 600, y + 12, { size: 20, family: FONTS.mono, weight: 700, color: C.ink, align: 'right' });
      ctx.restore();
    }

    // verdict
    const v = seg(t, 5.4, 5.9, ease.outBack);
    if (v > 0) {
      const y = 520;
      ctx.save();
      ctx.globalAlpha *= clamp(v);
      text(ctx, 'COLD', 64, y, { size: 15, family: FONTS.mono, weight: 700, color: C.cold, tracking: 3 });
      const n = Math.min(3, Math.floor(seg(t, 5.5, 6.3) * 3 + 0.999));
      text(ctx, String(n), 64, y + 74, { size: 84, weight: 800, color: C.ink, tracking: -3 });
      text(ctx, 'layers', 124, y + 74, { size: 34, family: FONTS.serif, italic: true, color: C.muted });
      const chips = ['+ scarf', '+ gloves', '+ waterproof'];
      let cx = 236;
      chips.forEach((c, i) => {
        const pc = seg(t, 6.2 + i * 0.22, 6.6 + i * 0.22, ease.outBack);
        if (pc <= 0) return;
        cx += pill(ctx, c, cx, y + 52, { size: 14, alpha: clamp(pc), bg: i === 2 ? rgba(C.cold, 0.16) : rgba(C.accent, 0.14), color: i === 2 ? C.cold : C.accent }) + 10;
      });
      ctx.restore();
    }

    // ---- right: the stage ----
    const sx = 760, sw = 460;
    rr(ctx, sx, 40, sw, 560, 28);
    ctx.fillStyle = rgba('#ffffff', 0.025); ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.06); ctx.lineWidth = 1; ctx.stroke();
    rain(ctx, sx, 40, sw, 440, t, seg(t, 2.0, 3.0) * (1 - seg(t, D - 1.2, D - 0.4)));
    pill(ctx, 'rain 60%', sx + 24, 78, { size: 13, dot: C.cold, alpha: window_(t, 2.4, D - 0.4), bg: rgba(C.cold, 0.12), color: C.cold });
    pill(ctx, 'wind 31 km/h', sx + 136, 78, { size: 13, dot: C.warn, alpha: window_(t, 2.6, D - 0.4), bg: rgba(C.warn, 0.12), color: C.warn });
    pill(ctx, `${fmt(lerp(6.0, ADJ, seg(t, 4.6, 5.3, ease.outCubic)))} °C`, sx + sw - 24, 78, { size: 13, align: 'right', alpha: window_(t, 1.0, D - 0.4) });

    ctx.save();
    ctx.globalAlpha *= seg(t, 0.6, 1.4);
    const fy = (1 - seg(t, 0.6, 1.4, ease.outCubic)) * 20;
    ctx.translate(0, fy - 4);
    ctx.translate(sx + sw / 2, 300); ctx.scale(0.78, 0.78); ctx.translate(-(sx + sw / 2), -300);
    figure(ctx, sx + sw / 2, t, [
      { p: seg(t, 5.55, 6.0), g: { color: C.l1, sleeve: 0.25, inflate: 2 } },
      { p: seg(t, 5.8, 6.25), g: { color: C.l2, sleeve: 1, inflate: 10, hood: true } },
      { p: seg(t, 6.05, 6.5), g: { color: C.deep, sleeve: 1, inflate: 20, len: 30, collar: true, open: [C.l2, C.l1] } },
    ]);
    ctx.restore();

    // tags pointing at each layer
    [['outer', 'rain jacket', 6.5], ['mid', 'hoodie', 6.7], ['base', 'long tee', 6.9]].forEach(([slot, item, a], i) => {
      const p = seg(t, a, a + 0.35, ease.outCubic);
      if (p <= 0) return;
      const y = 300 + i * 40;
      ctx.save();
      ctx.globalAlpha *= p;
      text(ctx, slot.toUpperCase(), sx + sw - 26, y, { size: 11, family: FONTS.mono, weight: 700, color: C.muted, tracking: 2, align: 'right' });
      text(ctx, item, sx + sw - 26, y + 18, { size: 15, family: FONTS.sans, weight: 600, color: C.ink, align: 'right' });
      ctx.restore();
    });

    hourly(ctx, sx + 32, 512, sw - 64, 44, t);
    ctx.restore();
  },
};
