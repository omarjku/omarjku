// Second Look (omarjku/Mixymatchy): a 33-second trailer with its own soundtrack.
// The phone screens are captures of the real app running on its invented demo
// patient ("Fiktive Testperson A", VITE_MOCK=1): no IBM patient data appears.
// Numbers come from docs/SUBMISSION.md (15/15, 0 invented facts, 5 contradictions,
// 144 ms); the letters in the opening are drawn shapes, not document text.
import { clamp, lerp, ease, seg, rng, rgba, mix, rr, circle, text, measure, FONTS, TAU, window_ } from '../engine/lib.js';
import { clock, withCamera, camAt, shake, sequence, aurora, dust, burst, shockwave, flash, grain, slam, reveal,
  words, counter, glass, phone, loadImages, letterbox } from '../engine/film.js';

const W = 1280, H = 720;
const K = clock(108);                 // one bar = 2.22 s
const B = (bars, beats = 0) => K.at(bars, beats);
const D = B(15);

const C = {
  night: '#060818', deep: '#0c1131', peri: '#7085ff', strong: '#4a5bef', soft: '#eef0ff', paper: '#f6f3ec',
  ink: '#141831', inkMuted: '#4d5370', teal: '#2dd4bf', tealDeep: '#0f766e', rose: '#fb7185', roseDeep: '#be123c',
  hi: '#ffe15a', white: '#ffffff',
};
const SANS = FONTS.plex, SERIF = FONTS.plexSerif;
let IMG = {};

// ---------------------------------------------------------------- pieces
function backdrop(ctx, t, tint = C.peri, a = 0.16) {
  ctx.fillStyle = C.night; ctx.fillRect(0, 0, W, H);
  aurora(ctx, W, H, t, [tint, '#2b3aa8', '#0f766e'], a);
  dust(ctx, W, H, t, '#c7cfff', 50, 11, 0.35);
}

// A stylised letter: paper, a header bar, grey lines. No real text.
const DOCS = ['Entlassungsbrief', 'Ambulanzbrief', 'Befundbericht', 'OP-Bericht', 'Medikationsplan', 'Arztbrief', 'Laborbefund', 'Aufnahmebogen'];
function letter(ctx, x, y, w, h, i, o = {}) {
  const { alpha = 1, hiLine = -1, hiColor = C.hi, hiP = 0, strike = -1 } = o;
  const r = rng(40 + i);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 14;
  rr(ctx, x, y, w, h, 8); ctx.fillStyle = C.paper; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = C.strong; rr(ctx, x + 14, y + 14, w * 0.18, 6, 3); ctx.fill();
  text(ctx, DOCS[i % DOCS.length], x + 14, y + 40, { size: Math.max(9, w * 0.085), weight: 600, family: SANS, color: C.ink });
  const rows = Math.floor((h - 70) / 13);
  for (let k = 0; k < rows; k++) {
    const lw = (w - 28) * (0.55 + r() * 0.42);
    const ly = y + 58 + k * 13;
    if (k === hiLine && hiP > 0) {
      ctx.fillStyle = rgba(hiColor, 0.85);
      rr(ctx, x + 12, ly - 4, (lw + 4) * ease.outCubic(hiP), 11, 3); ctx.fill();
    }
    ctx.fillStyle = k === strike ? rgba(C.roseDeep, 0.6) : 'rgba(20,24,49,0.22)';
    rr(ctx, x + 14, ly, lw, 4, 2); ctx.fill();
  }
  ctx.restore();
}

function caption(ctx, str, x, y, t, t0, o = {}) {
  words(ctx, str, x, y, t, t0, o.step ?? 0.09, { size: 56, weight: 700, family: SANS, color: C.white, ...o });
}

function kicker(ctx, str, x, y, a, color = C.peri) {
  text(ctx, str.toUpperCase(), x, y, { size: 14, weight: 600, family: SANS, color, tracking: 3, alpha: a });
}

function ripple(ctx, t, t0, x, y, color = C.peri) {
  const p = clamp((t - t0) / 0.5);
  if (p <= 0 || p >= 1) return;
  circle(ctx, x, y, 6 + p * 34); ctx.strokeStyle = rgba(color, 1 - p); ctx.lineWidth = 3; ctx.stroke();
  circle(ctx, x, y, 8 * (1 - p)); ctx.fillStyle = rgba(C.white, 0.9 * (1 - p)); ctx.fill();
}

// Phone with a capture; css (x, y) inside the capture → scene coordinates.
const PW = 300;
function phoneAt(ctx, img, x, y, o = {}) {
  const s = phone(ctx, img, x, y, PW, { glow: rgba(C.peri, 0.45), ...o });
  const k = s.w / 390;   // captures are 390 css px wide
  return { ...s, at: (cx, cy) => [s.x + cx * k, s.y + (cy - (o.scrollCss || 0)) * k], k };
}

// ---------------------------------------------------------------- shots
function hook(ctx, t, len) {
  backdrop(ctx, t, C.peri, 0.12);
  const cam = { x: W / 2 + Math.sin(t * 0.4) * 20, y: H / 2, z: 1.0 + t * 0.012, r: -0.01 + t * 0.002 };
  withCamera(ctx, W, H, cam, () => {
    for (let i = 0; i < 8; i++) {
      const col = i % 4, row = Math.floor(i / 4);
      const p = seg(t, 0.15 + i * K.beat * 0.5, 0.75 + i * K.beat * 0.5, ease.outExpo);
      const tx = 250 + col * 205, ty = 150 + row * 230;
      const x = lerp(W / 2 - 70, tx, p), y = lerp(H + 120, ty, p);
      ctx.save();
      ctx.translate(x + 75, y + 100); ctx.rotate((1 - p) * (i % 2 ? 0.5 : -0.5) + Math.sin(t + i) * 0.02); ctx.translate(-x - 75, -y - 100);
      letter(ctx, x, y, 150, 200, i, { alpha: clamp(p * 2) });
      ctx.restore();
    }
  });
  const v = ctx.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, 'rgba(6,8,24,0.0)'); v.addColorStop(0.55, 'rgba(6,8,24,0.15)'); v.addColorStop(1, 'rgba(6,8,24,0.92)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  caption(ctx, 'One patient.', 64, 612, t, B(0, 1), { size: 54 });
  caption(ctx, 'Eight letters.', 64, 668, t, B(0, 3), { size: 54, color: '#c7cfff' });
  const n = Math.min(8, Math.floor(seg(t, 0.2, 3.9) * 8 + 0.999));
  text(ctx, String(n).padStart(2, '0'), W - 64, 668, { size: 120, weight: 700, family: SANS, color: rgba(C.white, 0.12), align: 'right' });
}

function problem(ctx, t, len) {
  backdrop(ctx, t, C.rose, 0.10);
  const lt = t;
  // two letters that disagree, linked by a red line
  const z = 1 + lt * 0.03;
  withCamera(ctx, W, H, { x: W / 2, y: H / 2 - 20, z }, () => {
    letter(ctx, 300, 140, 230, 300, 0, { hiLine: 5, hiColor: C.rose, hiP: seg(lt, 0.35, 0.8) });
    letter(ctx, 750, 170, 230, 300, 2, { hiLine: 8, hiColor: C.rose, hiP: seg(lt, 0.7, 1.15) });
    const a = [300 + 200, 140 + 58 + 5 * 13], b = [750 + 20, 170 + 58 + 8 * 13];
    const p = seg(lt, 1.0, 1.5, ease.inOutCubic);
    if (p > 0) {
      ctx.strokeStyle = C.rose; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(lerp(a[0], b[0], p), lerp(a[1], b[1], p)); ctx.stroke(); ctx.setLineDash([]);
    }
    const tag = seg(lt, 1.4, 1.8, ease.outBack);
    if (tag > 0) {
      ctx.save(); ctx.globalAlpha *= clamp(tag);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - 34;
      rr(ctx, mx - 70, my - 22, 140, 44, 22); ctx.fillStyle = C.roseDeep; ctx.fill();
      text(ctx, 'left ≠ right', mx, my + 1, { size: 20, weight: 700, family: SANS, color: '#fff', align: 'center', baseline: 'middle' });
      ctx.restore();
    }
    // a fact that falls out of the newest letter
    const q = seg(lt, 2.4, 3.6);
    if (lt > 2.1) {
      const fx = 640, fy = 520;
      const fade = 1 - q;
      ctx.save();
      ctx.globalAlpha *= clamp(seg(lt, 2.1, 2.4) * fade * 1.2);
      rr(ctx, fx - 90, fy - 30, 180, 60, 30); ctx.fillStyle = rgba(C.white, 0.1); ctx.fill();
      ctx.strokeStyle = rgba(C.white, 0.4); ctx.stroke();
      text(ctx, '−12 kg', fx, fy + 2, { size: 30, weight: 700, family: SANS, color: '#fff', align: 'center', baseline: 'middle' });
      ctx.restore();
      const r = rng(21);
      for (let i = 0; i < 70 && q > 0; i++) {
        const dx = (r() - 0.3) * 260 * q, dy = -r() * 160 * q - 40 * q * q;
        circle(ctx, fx + (r() - 0.5) * 170 + dx, fy + (r() - 0.5) * 50 + dy, 1.5 + r() * 2);
        ctx.fillStyle = rgba('#dfe3ff', (1 - q) * 0.8); ctx.fill();
      }
    }
  });
  caption(ctx, 'Errors travel.', 64, 612, t, 0.25, { size: 54 });
  caption(ctx, 'Facts vanish.', 64, 668, t, 2.25, { size: 54, color: '#c7cfff' });
}

function drop(ctx, t, len) {
  backdrop(ctx, t, C.peri, 0.2);
  const lt = t;
  const sh = shake(lt, 8 * K.pulse(lt, 0, 0.5, 0.2), 2);
  withCamera(ctx, W, H, { x: W / 2 + sh.x, y: H / 2 + sh.y, z: 1 + 0.02 * K.pulse(lt, 0), r: sh.r }, () => {
    shockwave(ctx, lt, 0.02, W / 2, 300, { color: C.peri, max: 900, width: 8 });
    shockwave(ctx, lt, 0.12, W / 2, 300, { color: '#c7cfff', max: 700, width: 3 });
    burst(ctx, lt, 0.02, W / 2, 300, { color: '#c7cfff', n: 70, speed: 700, seed: 4 });
    const ip = seg(lt, 0, 0.45, ease.outBack);
    if (ip > 0 && IMG.icon) {
      const s = lerp(2.2, 1, ease.outExpo(clamp(lt / 0.45)));
      ctx.save();
      ctx.translate(W / 2, 300); ctx.scale(s, s);
      ctx.shadowColor = rgba(C.peri, 0.8); ctx.shadowBlur = 60;
      rr(ctx, -64, -64, 128, 128, 30); ctx.clip();
      ctx.drawImage(IMG.icon, -64, -64, 128, 128);
      ctx.restore();
    }
    slam(ctx, 'Second Look', W / 2, 450, seg(lt, 0.25, 0.75), { size: 92, weight: 700, family: SANS, tracking: -2 });
  });
  words(ctx, 'Other tools summarise the record.', W / 2, 548, lt, B(0, 3), 0.08, { size: 30, weight: 500, family: SANS, color: '#c7cfff', align: 'center' });
  words(ctx, 'Second Look checks it.', W / 2, 594, lt, B(1, 1), 0.12, { size: 34, weight: 700, family: SANS, color: C.white, align: 'center', accent: [2], accentColor: C.peri });
}

function ask(ctx, t, len) {
  backdrop(ctx, t, C.peri, 0.14);
  const frames = [[0, 'start'], [B(0, 1), 'role'], [B(0, 2.5), 'typing'], [B(0, 3.2), 'typed']];
  const cur = frames.filter(([at]) => t >= at).pop()[1];
  const cam = camAt([{ t: 0, x: 640, y: 360, z: 1.0 }, { t: len, x: 652, y: 410, z: 1.12, e: ease.inOutCubic }], t);
  withCamera(ctx, W, H, cam, () => {
    const p = phoneAt(ctx, IMG[cur], 640, 45);
    const [cx, cy] = p.at(16 + 175 / 2, 235.8 + 22);
    ripple(ctx, t, B(0, 1) - 0.05, cx, cy);
    const [sx, sy] = p.at(319 + 24, 715.5 + 24);
    ripple(ctx, t, len - 0.35, sx, sy);
  });
  kicker(ctx, 'Step 1', 64, 250, seg(t, 0.1, 0.4));
  caption(ctx, 'One sentence in.', 64, 320, t, 0.15, { size: 60 });
  text(ctx, 'Who you are, and what you are', 64, 380, { size: 24, weight: 400, family: SANS, color: '#aab3e6', alpha: seg(t, 0.6, 1.0) });
  text(ctx, 'about to do.', 64, 412, { size: 24, weight: 400, family: SANS, color: '#aab3e6', alpha: seg(t, 0.7, 1.1) });
}

function screen(ctx, t, len) {
  backdrop(ctx, t, C.peri, 0.14);
  const half = B(1);                      // first bar: scroll the results; second bar: the source
  const scrollCss = lerp(0, 600, seg(t, 0.2, half - 0.1, ease.inOutCubic));
  const showSource = t >= half;
  const cam = camAt([{ t: 0, x: 646, y: 360, z: 1.04 }, { t: half, x: 640, y: 362, z: 1.0 }, { t: len, x: 652, y: 405, z: 1.12 }], t);
  withCamera(ctx, W, H, cam, () => {
    if (!showSource) {
      phoneAt(ctx, IMG.results, 640, 45, { scrollY: scrollCss * (PW - 2 * PW * 0.035) / 390, scrollCss });
    } else {
      const p = phoneAt(ctx, IMG.source, 640, 45);
      // highlighter sweep over the cited sentence, like the app's source viewer
      const hp = seg(t, half + B(0, 1), half + B(0, 1.6), ease.outCubic);
      if (hp > 0) {
        const [x0, y0] = p.at(21, 770.6);
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        rr(ctx, x0, y0, 348 * p.k * hp, 56.4 * p.k, 6);
        ctx.fillStyle = rgba(C.hi, 0.75); ctx.fill();
        ctx.restore();
      }
    }
  });
  kicker(ctx, 'Step 2', 64, 200, seg(t, 0.1, 0.4));
  caption(ctx, 'One screen out.', 64, 270, t, 0.12, { size: 60 });
  const items = [
    ['Only what this task needs.', 0.7, C.white],
    ['Every fact opens its sentence.', half + B(0, 0.5), C.hi],
    ['Missing? It says so.', half + B(0, 2.5), '#c7cfff'],
  ];
  items.forEach(([s, at, col], i) => {
    const a = seg(t, at, at + 0.4, ease.outCubic);
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.translate((1 - a) * -30, 0);
    circle(ctx, 76, 352 + i * 54 - 8, 6); ctx.fillStyle = col; ctx.fill();
    text(ctx, s, 96, 352 + i * 54, { size: 28, weight: 600, family: SANS, color: col });
    ctx.restore();
  });
}

function views(ctx, t, len) {
  backdrop(ctx, t, C.teal, 0.12);
  const list = [['Overview', IMG.results, 0], ['History', IMG.history, 1], ['Dashboard', IMG.dash || IMG.history, 2]];
  list.forEach(([label, img, i]) => {
    const at = i * K.beat;
    const p = seg(t, at, at + 0.45, ease.outExpo);
    if (p <= 0) return;
    const x = 140 + i * 360 + (1 - p) * 500;
    ctx.save();
    ctx.globalAlpha *= clamp(p * 2);
    ctx.translate(x + 120, 370); ctx.rotate((1 - p) * 0.25 + (i - 1) * 0.03); ctx.scale(0.82, 0.82); ctx.translate(-x - 120, -370);
    phone(ctx, img, x, 60, 240, { glow: rgba(i === 1 ? C.teal : C.peri, 0.4), scrollY: i === 0 ? 0 : 0 });
    ctx.restore();
    text(ctx, label, x + 120, 668, { size: 24, weight: 600, family: SANS, color: C.white, align: 'center', alpha: p });
  });
  caption(ctx, 'See the trend, not just the value.', W / 2, 52, t, B(0, 3), { size: 34, align: 'center', step: 0.06 });
}

function disagree(ctx, t, len) {
  ctx.fillStyle = '#12050c'; ctx.fillRect(0, 0, W, H);
  aurora(ctx, W, H, t, [C.roseDeep, '#3b0a1e'], 0.25 + 0.15 * K.pulse(t, 0, len, 0.3));
  // the app's contradiction card, cropped from the capture and lifted out
  const img = IMG.contra;
  if (img) {
    const k = img.width / 390;
    const sx = 16 * k, sy = 103.8 * k, sw = 358 * k, sh = 255.3 * k;
    const p = seg(t, 0.05, 0.6, ease.outExpo);
    const w = 640, h = w * sh / sw;
    const x = 600, y = 360 - h / 2 + (1 - p) * 60;
    ctx.save();
    ctx.globalAlpha *= clamp(p * 1.5);
    ctx.translate(x + w / 2, y + h / 2); ctx.rotate(-0.025 + Math.sin(t * 1.3) * 0.006); ctx.scale(lerp(0.9, 1, p), lerp(0.9, 1, p)); ctx.translate(-x - w / 2, -y - h / 2);
    ctx.shadowColor = rgba(C.rose, 0.6); ctx.shadowBlur = 50;
    rr(ctx, x, y, w, h, 22); ctx.fillStyle = '#fff'; ctx.fill(); ctx.clip();
    ctx.shadowColor = 'transparent';
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    ctx.restore();
  }
  kicker(ctx, 'Step 3', 64, 230, seg(t, 0.1, 0.4), C.rose);
  caption(ctx, 'The record', 64, 300, t, 0.1, { size: 56 });
  caption(ctx, 'disagrees.', 64, 360, t, 0.3, { size: 56, color: C.rose });
  const n = counter(5, seg(t, 0.9, 1.6), 0, '');
  text(ctx, n, 64, 486, { size: 96, weight: 700, family: SANS, color: C.white, alpha: seg(t, 0.85, 1.0) });
  text(ctx, 'contradictions found in the record', 136, 452, { size: 20, weight: 500, family: SANS, color: '#ffc9d2', alpha: seg(t, 1.0, 1.3) });
  text(ctx, '0 known false alarms', 136, 482, { size: 20, weight: 700, family: SANS, color: C.white, alpha: seg(t, 1.2, 1.5) });
}

const STATS = [
  ['15/15', 'official questions answered', C.white],
  ['0', 'invented facts', C.teal],
  ['100%', 'facts linked to their source', C.hi],
  ['144 ms', 'slowest screen', '#c7cfff'],
];
function results(ctx, t, len) {
  backdrop(ctx, t, C.peri, 0.18);
  const i = Math.min(3, Math.floor(t / K.beat));
  const lt = t - i * K.beat;
  const [big, small, col] = STATS[i];
  const sh = shake(lt, 6 * Math.exp(-lt / 0.15), i + 1);
  withCamera(ctx, W, H, { x: W / 2 + sh.x, y: H / 2 + sh.y, z: 1 + 0.03 * Math.exp(-lt / 0.2) }, () => {
    shockwave(ctx, lt, 0, W / 2, 330, { color: col, max: 600, width: 4, life: 0.5 });
    slam(ctx, big, W / 2, 330, seg(lt, 0, 0.3), { size: 180, weight: 700, family: SANS, color: col, tracking: -6 });
    reveal(ctx, small, W / 2, 470, seg(lt, 0.08, 0.4), { size: 34, weight: 500, family: SANS, color: '#c7cfff', align: 'center' });
  });
  // progress pips
  for (let k = 0; k < 4; k++) { circle(ctx, W / 2 - 36 + k * 24, 560, 5); ctx.fillStyle = k <= i ? C.peri : rgba(C.white, 0.2); ctx.fill(); }
  flash(ctx, W, H, lt, 0, 0.18, col, 0.35);
}

const TRUST = [
  ['AI points. Code verifies.', 'The model only picks from the rulebook\'s IDs; every pick is checked again in code.'],
  ['No clinical role, no patient data.', 'A journalist or a neighbour gets a screen with zero facts.'],
  ['Locked by default. Read only.', 'Sign-in, a PIN after 3 minutes idle, a tamper-evident audit log.'],
];
function trust(ctx, t, len) {
  backdrop(ctx, t, C.tealDeep, 0.16);
  TRUST.forEach(([a, b], i) => {
    const at = 0.1 + i * K.beat * 1.2;
    const p = seg(t, at, at + 0.5, ease.outExpo);
    if (p <= 0) return;
    const y = 190 + i * 150;
    ctx.save();
    ctx.globalAlpha *= clamp(p * 2);
    ctx.translate((1 - p) * 80, 0);
    glass(ctx, 140, y - 62, 1000, 118, { r: 26, fill: 'rgba(255,255,255,0.05)' });
    circle(ctx, 200, y - 3, 22); ctx.fillStyle = rgba(i === 0 ? C.peri : i === 1 ? C.rose : C.teal, 0.25); ctx.fill();
    circle(ctx, 200, y - 3, 8); ctx.fillStyle = i === 0 ? C.peri : i === 1 ? C.rose : C.teal; ctx.fill();
    text(ctx, a, 250, y - 8, { size: 36, weight: 700, family: SANS, color: C.white });
    text(ctx, b, 250, y + 28, { size: 20, weight: 400, family: SANS, color: '#aab3e6' });
    ctx.restore();
  });
}

function close(ctx, t, len) {
  backdrop(ctx, t, C.peri, 0.18);
  const p = seg(t, 0, 0.6, ease.outExpo);
  if (IMG.icon) {
    ctx.save();
    ctx.globalAlpha *= p;
    ctx.translate(W / 2, 250); ctx.scale(lerp(0.6, 1, p), lerp(0.6, 1, p));
    ctx.shadowColor = rgba(C.peri, 0.7); ctx.shadowBlur = 50;
    rr(ctx, -56, -56, 112, 112, 26); ctx.clip();
    ctx.drawImage(IMG.icon, -56, -56, 112, 112);
    ctx.restore();
  }
  reveal(ctx, 'Second Look', W / 2, 400, seg(t, 0.2, 0.8), { size: 76, weight: 700, family: SANS, color: C.white, align: 'center', tracking: -2 });
  words(ctx, 'Other tools summarise the record. Second Look checks it,', W / 2, 462, t, 0.7, 0.05, { size: 24, weight: 400, family: SANS, color: '#c7cfff', align: 'center' });
  words(ctx, 'for the task in front of you.', W / 2, 496, t, 1.2, 0.07, { size: 24, weight: 600, family: SANS, color: C.white, align: 'center' });
  text(ctx, 'AIM AUSTRIA HACKATHON  ·  TRACK 1  ·  CLINICAL DOCUMENTATION', W / 2, 590, { size: 14, weight: 600, family: SANS, color: C.peri, align: 'center', tracking: 2.5, alpha: seg(t, 1.6, 2.1) });
  text(ctx, 'github.com/omarjku/Mixymatchy', W / 2, 626, { size: 18, weight: 500, family: FONTS.mono, color: '#aab3e6', align: 'center', alpha: seg(t, 1.8, 2.3) });
  ctx.save();
  ctx.globalAlpha = seg(t, len - 0.8, len, ease.inCubic);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// ---------------------------------------------------------------- timeline
const SHOTS = [
  { from: 0, to: B(2), draw: hook },
  { from: B(2), to: B(4), draw: problem, tin: 'zoom' },
  { from: B(4), to: B(6), draw: drop, tin: 'flash', flashColor: '#dfe4ff' },
  { from: B(6), to: B(7), draw: ask, tin: 'zoom' },
  { from: B(7), to: B(9), draw: screen, tin: 'whip' },
  { from: B(9), to: B(10), draw: views, tin: 'whip' },
  { from: B(10), to: B(11), draw: disagree, tin: 'flash', flashColor: '#ff9db0' },
  { from: B(11), to: B(12), draw: results, tin: 'cut' },
  { from: B(12), to: B(13), draw: trust, tin: 'slide' },
  { from: B(13), to: D, draw: close, tin: 'zoom' },
];

const typingTicks = Array.from({ length: 10 }, (_, i) => B(6, 2.4) + i * 0.08);

export default {
  width: W, height: H, duration: D, fps: 60,
  music: {
    bpm: 108, seed: 11,
    chords: ['Dm7', 'Bbmaj7', 'Fmaj7', 'C'],
    sections: [
      { from: 0, to: 2, type: 'intro' }, { from: 2, to: 4, type: 'build' }, { from: 4, to: 10, type: 'drop' },
      { from: 10, to: 11, type: 'break' }, { from: 11, to: 13, type: 'drop' }, { from: 13, to: 15, type: 'outro' },
    ],
    whooshes: [B(2), B(6), B(7), B(9), B(12), B(13)],
    ticks: typingTicks,
    bells: [[B(8, 1), 81], [B(13, 0.5), 74], [B(13, 1.5), 77]],
    hits: [B(10)],
    style: { bass: 'sustain', snare: 'rim', punch: 0.85, hats: 0.75, brightness: 0.95, arp_level: 0.9, drums: 0.9 },
  },
  async setup() {
    const names = ['start', 'role', 'typing', 'typed', 'results', 'contra', 'source', 'notdoc', 'history', 'dash'];
    const map = Object.fromEntries(names.map((n) => [n, `../assets/secondlook/${n}.jpg`]));
    map.icon = '../assets/secondlook/icon.png';
    // tolerate a missing optional capture (dash)
    IMG = {};
    for (const [k, v] of Object.entries(map)) {
      try { Object.assign(IMG, await loadImages({ [k]: v })); } catch { /* optional */ }
    }
  },
  draw(ctx, t) {
    sequence(ctx, W, H, t, SHOTS);
    letterbox(ctx, W, H, 1, 0.0);
    grain(ctx, W, H, t, 0.045);
  },
};
