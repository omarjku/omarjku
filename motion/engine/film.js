// Trailer toolkit on top of lib.js: a beat clock shared with the soundtrack,
// a camera, shots with transitions, kinetic type and particle effects.
// Everything stays a pure function of t, so frames render in any order.
import { clamp, lerp, ease, seg, rng, rgba, rr, circle, text, measure, FONTS, TAU } from './lib.js';

// ---------- beat clock ----------
// The score uses the same bpm and section list, so cuts land on the music.
export function clock(bpm) {
  const beat = 60 / bpm, bar = 4 * beat;
  return {
    bpm, beat, bar,
    at: (bars, beats = 0) => bars * bar + beats * beat,           // seconds of bar:beat
    beats: (t) => t / beat,
    // 1 on each beat, decaying: drives pulses that should feel like the kick
    pulse: (t, from = 0, to = Infinity, decay = 0.16) => {
      if (t < from || t > to) return 0;
      const k = (t - from) % beat;
      return Math.exp(-k / decay);
    },
  };
}

// ---------- camera ----------
// cam = { x, y, z, r } in scene units: (x, y) is the point at screen centre.
export function withCamera(ctx, W, H, cam, fn) {
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(cam.r || 0);
  ctx.scale(cam.z || 1, cam.z || 1);
  ctx.translate(-(cam.x ?? W / 2), -(cam.y ?? H / 2));
  fn();
  ctx.restore();
}

// Interpolate camera keyframes [{t, x, y, z, r, e}] (e = easing into that key).
export function camAt(keys, t) {
  if (t <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.t) {
      const p = (b.e || ease.inOutCubic)(clamp((t - a.t) / (b.t - a.t)));
      return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), z: lerp(a.z ?? 1, b.z ?? 1, p), r: lerp(a.r || 0, b.r || 0, p) };
    }
  }
  return keys[keys.length - 1];
}

// Deterministic hand-held shake, scaled by amount (scene units).
export function shake(t, amt, seed = 1) {
  const s = (f, o) => Math.sin(t * f + o + seed) * 0.6 + Math.sin(t * f * 2.3 + o * 1.7 + seed) * 0.4;
  return { x: s(13, 1) * amt, y: s(11, 4) * amt, r: s(7, 2) * amt * 0.0015 };
}

// ---------- shots and transitions ----------
// shots: [{ from, to, draw(ctx, lt, len), tin: 'cut'|'flash'|'zoom'|'whip'|'slide'|'iris', td }]
// A transition happens at shot.from and lasts td seconds; during it the previous
// shot is drawn leaving and the new one arriving.
export function sequence(ctx, W, H, t, shots) {
  const i = shots.findIndex((s) => t >= s.from && t < s.to);
  if (i < 0) return;
  const s = shots[i];
  const td = s.td ?? 0.35;
  const lt = t - s.from;
  const prev = shots[i - 1];
  const kind = s.tin || 'cut';
  if (prev && lt < td && kind !== 'cut' && kind !== 'flash') {
    const p = ease.inOutExpo(clamp(lt / td));
    const plt = t - prev.from;
    drawTransition(ctx, W, H, kind, p,
      () => prev.draw(ctx, plt, prev.to - prev.from),
      () => s.draw(ctx, lt, s.to - s.from));
  } else {
    s.draw(ctx, lt, s.to - s.from);
  }
  if (kind === 'flash' && lt < 0.4) {
    ctx.save();
    ctx.globalAlpha = Math.pow(1 - lt / 0.4, 2) * 0.9;
    ctx.fillStyle = s.flashColor || '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

function drawTransition(ctx, W, H, kind, p, drawA, drawB) {
  const at = (fn, tf) => { ctx.save(); tf(); fn(); ctx.restore(); };
  if (kind === 'zoom') {
    at(drawA, () => { ctx.globalAlpha = 1 - p; ctx.translate(W / 2, H / 2); ctx.scale(1 + p * 1.8, 1 + p * 1.8); ctx.translate(-W / 2, -H / 2); });
    at(drawB, () => { ctx.globalAlpha = p; ctx.translate(W / 2, H / 2); ctx.scale(0.55 + 0.45 * p, 0.55 + 0.45 * p); ctx.translate(-W / 2, -H / 2); });
  } else if (kind === 'whip') {
    at(drawA, () => { ctx.translate(-p * W * 1.1, 0); });
    at(drawB, () => { ctx.translate((1 - p) * W * 1.1, 0); });
  } else if (kind === 'slide') {
    at(drawA, () => { ctx.translate(0, -p * H); });
    at(drawB, () => { ctx.translate(0, (1 - p) * H); });
  } else if (kind === 'iris') {
    drawA();
    at(drawB, () => { circle(ctx, W / 2, H / 2, p * Math.hypot(W, H) / 2); ctx.clip(); });
  } else {
    drawB();
  }
}

// ---------- backgrounds ----------
// Slow-moving colour fields: depth without noise (GIF/WebP friendly).
export function aurora(ctx, W, H, t, colors, a = 0.22) {
  colors.forEach((c, i) => {
    const x = W * (0.5 + 0.38 * Math.sin(t * 0.21 + i * 2.1));
    const y = H * (0.5 + 0.32 * Math.cos(t * 0.17 + i * 1.3));
    const r = Math.max(W, H) * (0.45 + 0.1 * Math.sin(t * 0.3 + i));
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(c, a));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });
}

// Perspective grid floor rushing toward the camera.
export function gridFloor(ctx, W, H, t, color, o = {}) {
  const { horizon = H * 0.58, speed = 1.2, alpha = 0.28, spacing = 80 } = o;
  ctx.save();
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = 1;
  const vx = W / 2;
  for (let i = -24; i <= 24; i++) {
    ctx.beginPath(); ctx.moveTo(vx + i * 6, horizon); ctx.lineTo(vx + i * spacing * 3.2, H + 40); ctx.stroke();
  }
  const off = (t * speed) % 1;
  for (let k = 0; k < 18; k++) {
    const z = (k + 1 - off) / 18;
    const y = horizon + (H - horizon) * Math.pow(z, 2.2);
    ctx.globalAlpha = z;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.restore();
  const g = ctx.createLinearGradient(0, horizon - 40, 0, horizon + 120);
  g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, horizon - 40, W, 160);
}

// Floating dust/bokeh particles with depth.
export function dust(ctx, W, H, t, color, n = 60, seed = 3, a = 0.5) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x0 = r() * W, y0 = r() * H, z = 0.3 + r() * 0.7, sp = 8 + r() * 30;
    const x = (x0 + t * sp * z) % (W + 40) - 20;
    const y = y0 + Math.sin(t * 0.6 + i) * 12 * z;
    circle(ctx, x, y, 0.8 + z * 2.2);
    ctx.fillStyle = rgba(color, a * z * (0.5 + 0.5 * Math.sin(t * 2 + i)));
    ctx.fill();
  }
}

// ---------- effects ----------
// Particle burst from (x, y) starting at t0.
export function burst(ctx, t, t0, x, y, o = {}) {
  const { n = 40, speed = 520, life = 0.9, color = '#ffffff', seed = 9, size = 3, gravity = 260 } = o;
  const dt = t - t0;
  if (dt < 0 || dt > life) return;
  const r = rng(seed);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, v = speed * (0.3 + r() * 0.7);
    const px = x + Math.cos(a) * v * dt * (1 - dt / (life * 2));
    const py = y + Math.sin(a) * v * dt * (1 - dt / (life * 2)) + gravity * dt * dt;
    const k = 1 - dt / life;
    circle(ctx, px, py, size * k * (0.5 + r()));
    ctx.fillStyle = rgba(color, k);
    ctx.fill();
  }
  ctx.restore();
}

// Expanding ring.
export function shockwave(ctx, t, t0, x, y, o = {}) {
  const { life = 0.7, max = 900, color = '#ffffff', width = 6 } = o;
  const dt = t - t0;
  if (dt < 0 || dt > life) return;
  const p = ease.outCubic(dt / life);
  ctx.save();
  circle(ctx, x, y, p * max);
  ctx.strokeStyle = rgba(color, (1 - p) * 0.9);
  ctx.lineWidth = width * (1 - p) + 0.5;
  ctx.stroke();
  ctx.restore();
}

// Light streaks crossing the frame (speed lines).
export function streaks(ctx, W, H, t, color, n = 18, seed = 5, a = 0.5) {
  const r = rng(seed);
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const y = r() * H, sp = 900 + r() * 1400, len = 80 + r() * 260, off = r() * 3;
    const x = ((t + off) * sp) % (W + len * 2) - len;
    const g = ctx.createLinearGradient(x - len, 0, x, 0);
    g.addColorStop(0, rgba(color, 0)); g.addColorStop(1, rgba(color, a));
    ctx.strokeStyle = g; ctx.lineWidth = 1 + r() * 2;
    ctx.beginPath(); ctx.moveTo(x - len, y); ctx.lineTo(x, y); ctx.stroke();
  }
  ctx.restore();
}

export function letterbox(ctx, W, H, p, size = 0.1) {
  const h = H * size * p;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, h);
  ctx.fillRect(0, H - h, W, h);
}

export function flash(ctx, W, H, t, t0, life = 0.35, color = '#ffffff', peak = 0.85) {
  const dt = t - t0;
  if (dt < 0 || dt > life) return;
  ctx.save();
  ctx.globalAlpha = Math.pow(1 - dt / life, 2) * peak;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// Film grain from a pre-made tile; only for video output (it defeats GIF compression).
let GRAIN = null;
export function grain(ctx, W, H, t, a = 0.05) {
  if (typeof document === 'undefined' || !globalThis.__video) return;
  if (!GRAIN) {
    GRAIN = document.createElement('canvas');
    GRAIN.width = GRAIN.height = 256;
    const g = GRAIN.getContext('2d'), im = g.createImageData(256, 256), r = rng(42);
    for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    g.putImageData(im, 0, 0);
  }
  ctx.save();
  ctx.globalAlpha = a;
  ctx.globalCompositeOperation = 'overlay';
  const f = Math.floor(t * 24), ox = (f * 97) % 256, oy = (f * 61) % 256;
  ctx.translate(-ox, -oy);
  ctx.fillStyle = ctx.createPattern(GRAIN, 'repeat');
  ctx.fillRect(0, 0, W + 256, H + 256);
  ctx.restore();
}

// ---------- kinetic type ----------
// Slam: scales down from big, with chromatic fringes that converge.
export function slam(ctx, str, x, y, p, o = {}) {
  const { size = 120, weight = 800, family = FONTS.display, color = '#ffffff', tracking = -3, align = 'center', rgb = true } = o;
  if (p <= 0) return;
  const e = ease.outExpo(clamp(p));
  const s = lerp(1.9, 1, e);
  const off = (1 - e) * 22;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalAlpha *= clamp(p * 3);
  if (rgb && off > 0.5) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    text(ctx, str, -off, 0, { size, weight, family, color: '#ff2a55', align, tracking, baseline: 'middle', alpha: 0.7 });
    text(ctx, str, off, 0, { size, weight, family, color: '#22d3ee', align, tracking, baseline: 'middle', alpha: 0.7 });
    ctx.restore();
  }
  text(ctx, str, 0, 0, { size, weight, family, color, align, tracking, baseline: 'middle' });
  ctx.restore();
}

// Mask reveal: text slides up out of a clip line.
export function reveal(ctx, str, x, y, p, o = {}) {
  const { size = 64, weight = 700, family = FONTS.display, color = '#fff', align = 'left', tracking = -1 } = o;
  if (p <= 0) return;
  const e = ease.outExpo(clamp(p));
  const w = measure(ctx, str, { size, weight, family, tracking });
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0 - 20, y - size * 1.05, w + 40, size * 1.35); ctx.clip();
  text(ctx, str, x0, y + (1 - e) * size * 1.2, { size, weight, family, color, tracking });
  ctx.restore();
}

// Word-by-word kinetic line, each word rising and unblurring on its own beat.
export function words(ctx, str, x, y, t, t0, step, o = {}) {
  const { size = 64, weight = 700, family = FONTS.display, color = '#fff', align = 'left', gap = 0.28, accent = null, accentColor = '#fff' } = o;
  const ws = str.split(' ');
  const widths = ws.map((w) => measure(ctx, w, { size, weight, family }));
  const space = size * gap;
  const total = widths.reduce((a, b) => a + b, 0) + space * (ws.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  ws.forEach((w, i) => {
    const p = clamp((t - t0 - i * step) / 0.45);
    const e = ease.outBack(p);
    if (p > 0) {
      ctx.save();
      ctx.globalAlpha *= clamp(p * 2.5);
      ctx.translate(cx + widths[i] / 2, y);
      ctx.rotate((1 - e) * 0.12);
      ctx.translate(-(cx + widths[i] / 2), -y);
      const col = accent && accent.includes(i) ? accentColor : color;
      text(ctx, w, cx, y + (1 - e) * size * 0.6, { size, weight, family, color: col });
      ctx.restore();
    }
    cx += widths[i] + space;
  });
}

// Decode effect: random glyphs settle into the final string left to right.
export function decode(str, p, seed = 1, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+') {
  const r = rng(seed + Math.floor(p * 40));
  const n = str.length, done = Math.floor(clamp(p) * n * 1.15);
  let out = '';
  for (let i = 0; i < n; i++) {
    if (str[i] === ' ' || i < done) out += str[i];
    else if (i < done + 6) out += charset[Math.floor(r() * charset.length)];
    else out += ' ';
  }
  return out;
}

// Rolling counter that ticks like an odometer.
export function counter(v, p, digits = 0, sep = ',') {
  const x = v * ease.outExpo(clamp(p));
  const s = x.toFixed(digits);
  if (!sep) return s;
  const [a, b] = s.split('.');
  return a.replace(/\B(?=(\d{3})+(?!\d))/g, sep) + (b ? '.' + b : '');
}

// Glassy rounded panel with a soft drop shadow and a hairline.
export function glass(ctx, x, y, w, h, o = {}) {
  const { r = 22, fill = 'rgba(255,255,255,0.06)', stroke = 'rgba(255,255,255,0.12)', shadow = 40, glow = null } = o;
  ctx.save();
  ctx.shadowColor = glow || 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = shadow;
  ctx.shadowOffsetY = glow ? 0 : 18;
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

// Draw an image (e.g. an app capture) inside a phone frame. Returns the screen rect.
export function phone(ctx, img, x, y, w, o = {}) {
  const { radius = w * 0.13, bezel = w * 0.035, scrollY = 0, glow = null, notch = true } = o;
  const h = w * 2.165;
  ctx.save();
  ctx.shadowColor = glow || 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = glow ? 60 : 50;
  ctx.shadowOffsetY = glow ? 0 : 24;
  rr(ctx, x, y, w, h, radius);
  ctx.fillStyle = '#0a0a0c';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const sx = x + bezel, sy = y + bezel, sw = w - 2 * bezel, sh = h - 2 * bezel;
  rr(ctx, sx, sy, sw, sh, radius - bezel);
  ctx.clip();
  ctx.fillStyle = '#fff';
  ctx.fillRect(sx, sy, sw, sh);
  if (img) {
    const scale = sw / img.width;
    ctx.drawImage(img, 0, scrollY / scale, img.width, sh / scale, sx, sy, sw, sh);
  }
  if (notch) { rr(ctx, x + w / 2 - w * 0.15, sy + w * 0.025, w * 0.3, w * 0.075, w * 0.04); ctx.fillStyle = '#000'; ctx.fill(); }
  ctx.restore();
  return { x: sx, y: sy, w: sw, h: sh };
}

// Load images once (scene setup); returns a map name -> HTMLImageElement.
export async function loadImages(map) {
  const out = {};
  await Promise.all(Object.entries(map).map(([k, src]) => new Promise((ok, bad) => {
    const im = new Image();
    im.onload = () => { out[k] = im; ok(); };
    im.onerror = () => bad(new Error('image failed: ' + src));
    im.src = src;
  })));
  return out;
}
