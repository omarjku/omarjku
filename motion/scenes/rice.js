// Offline rice-leaf advisor (Hack-Nation 2026, World Bank challenge).
// A phone in airplane mode classifies a leaf on-device, answers only above
// min_prob 0.80, and says "not sure — ask your SAAO" for anything else.
// Stats on the left are from docs/results.md (model v2). The two predictions
// on the phone are illustrative.
import { clamp, lerp, ease, seg, rgba, mix, rr, circle, text, pill, light, dotGrid, FONTS, TAU, window_, typed, countUp } from '../engine/lib.js';

const W = 1280, H = 640, D = 13;
const C = {
  bg: '#0a0f0b', panel: '#121a14', line: '#223026', ink: '#eef3ec', muted: '#93a396',
  leaf: '#7cb342', leafDark: '#4e7d2a', gold: '#f2c14e', spot: '#8d5a2b', ok: '#9be15d', unsure: '#fbbf24', bd: '#006a4e',
};
const CLASSES = ['healthy', 'blast', 'brown spot', 'sheath blight', 'tungro', 'leaf blight', 'not rice'];
const P1 = [0.02, 0.07, 0.86, 0.02, 0.01, 0.01, 0.01];
const P2 = [0.18, 0.04, 0.03, 0.08, 0.05, 0.02, 0.60];
const A = { in: 0.9, scan: 1.6, bars: 2.4, card: 3.6, out: 6.2 };
const B = { in: 6.7, scan: 7.3, bars: 8.1, card: 9.3, out: 12.2 };

function plane(ctx, x, y, s, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 4); ctx.scale(s / 20, s / 20);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -10); ctx.quadraticCurveTo(1.6, -10, 1.6, -7); ctx.lineTo(1.6, -2); ctx.lineTo(9, 2.5); ctx.lineTo(9, 4.5); ctx.lineTo(1.6, 2.2);
  ctx.lineTo(1.6, 6.5); ctx.lineTo(4, 8.5); ctx.lineTo(4, 10); ctx.lineTo(0, 8.8); ctx.lineTo(-4, 10); ctx.lineTo(-4, 8.5); ctx.lineTo(-1.6, 6.5);
  ctx.lineTo(-1.6, 2.2); ctx.lineTo(-9, 4.5); ctx.lineTo(-9, 2.5); ctx.lineTo(-1.6, -2); ctx.lineTo(-1.6, -7); ctx.quadraticCurveTo(-1.6, -10, 0, -10);
  ctx.fill();
  ctx.restore();
}

function riceLeaf(ctx, cx, cy, t) {
  // A long blade with a midrib and brown-spot lesions (oval, brown, yellow halo).
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(-0.42 + 0.02 * Math.sin(t * 1.3));
  const L = 300, Wd = 30;
  const g = ctx.createLinearGradient(0, -Wd, 0, Wd);
  g.addColorStop(0, '#9ccc65'); g.addColorStop(0.5, C.leaf); g.addColorStop(1, C.leafDark);
  ctx.beginPath();
  ctx.moveTo(-L / 2, -Wd * 0.55);
  ctx.bezierCurveTo(-L * 0.1, -Wd, L * 0.3, -Wd * 0.8, L / 2, 0);
  ctx.bezierCurveTo(L * 0.3, Wd * 0.8, -L * 0.1, Wd, -L / 2, Wd * 0.55);
  ctx.closePath();
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = rgba('#e6f4d0', 0.5); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.quadraticCurveTo(0, 2, L / 2 - 4, 0); ctx.stroke();
  for (const k of [-0.5, 0.5]) {
    ctx.strokeStyle = rgba('#e6f4d0', 0.18); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-L / 2, k * Wd * 0.7); ctx.quadraticCurveTo(0, k * Wd * 0.75, L / 2 - 30, k * 4); ctx.stroke();
  }
  [[-90, -8, 9, 5], [-40, 9, 11, 6], [0, -10, 8, 4.5], [38, 6, 10, 5.5], [-118, 10, 7, 4], [80, -4, 7, 4], [-12, 2, 6, 3.5]].forEach(([x, y, rx, ry]) => {
    ctx.fillStyle = rgba(C.gold, 0.55); ctx.beginPath(); ctx.ellipse(x, y, rx + 4, ry + 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C.spot; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5d3a1a'; ctx.beginPath(); ctx.ellipse(x, y, rx * 0.4, ry * 0.4, 0, 0, TAU); ctx.fill();
  });
  ctx.restore();
}

function beanLeaf(ctx, cx, cy, t) {
  // A broad, heart-shaped trifoliate leaf: clearly not a rice leaf.
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(0.15 + 0.02 * Math.sin(t * 1.1));
  const one = (dx, dy, rot, s) => {
    ctx.save(); ctx.translate(dx, dy); ctx.rotate(rot); ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-60, -10, -55, -90, 0, -120);
    ctx.bezierCurveTo(55, -90, 60, -10, 0, 0);
    const g = ctx.createLinearGradient(-50, 0, 50, -100);
    g.addColorStop(0, '#558b2f'); g.addColorStop(1, '#8bc34a');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = rgba('#e6f4d0', 0.45); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, -112); ctx.stroke();
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, -i * 22); ctx.quadraticCurveTo(sd * 18, -i * 22 - 6, sd * 34, -i * 22 - 18); ctx.stroke(); }
    ctx.restore();
  };
  ctx.strokeStyle = '#558b2f'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 40); ctx.lineTo(0, 120); ctx.stroke();
  one(0, 40, -1.05, 0.75); one(0, 40, 1.05, 0.75); one(0, 40, 0, 0.95);
  ctx.restore();
}

function phone(ctx, t) {
  const x = 812, y = 36, w = 316, h = 572;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
  rr(ctx, x, y, w, h, 44); ctx.fillStyle = '#050706'; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#2a332c'; ctx.lineWidth = 2; ctx.stroke();
  rr(ctx, x + 10, y + 10, w - 20, h - 20, 36); ctx.fillStyle = '#0d130f'; ctx.fill();
  // status bar: airplane mode on
  plane(ctx, x + 46, y + 36, 16, C.unsure);
  text(ctx, 'offline', x + 60, y + 41, { size: 12, family: FONTS.mono, weight: 700, color: C.unsure });
  text(ctx, '9:41', x + w - 40, y + 41, { size: 13, family: FONTS.sans, weight: 700, color: C.ink, align: 'right' });
  rr(ctx, x + w / 2 - 44, y + 22, 88, 24, 12); ctx.fillStyle = '#000'; ctx.fill();
  ctx.restore();
  return { x: x + 22, y: y + 64, w: w - 44, h: h - 90 };
}

function screen(ctx, s, t, P, ph, kind) {
  const vis = window_(t, ph.in, ph.out, 0.4, 0.4);
  if (vis <= 0) return;
  ctx.save();
  ctx.globalAlpha *= vis;
  ctx.translate((1 - seg(t, ph.in, ph.in + 0.4, ease.outCubic)) * 30 - seg(t, ph.out - 0.4, ph.out, ease.inCubic) * 30, 0);
  // camera viewport
  const vx = s.x, vy = s.y, vw = s.w, vh = 190;
  ctx.save();
  rr(ctx, vx, vy, vw, vh, 18); ctx.clip();
  ctx.fillStyle = '#1b2a1d'; ctx.fillRect(vx, vy, vw, vh);
  light(ctx, vx + vw * 0.3, vy + vh * 0.3, 200, '#cddc39', 0.12);
  if (kind === 'rice') riceLeaf(ctx, vx + vw / 2, vy + vh / 2, t); else beanLeaf(ctx, vx + vw / 2, vy + vh / 2 + 18, t);
  // scan line
  const sp = seg(t, ph.scan, ph.bars, ease.inOutSine);
  if (sp > 0 && sp < 1) {
    const sy = vy + vh * sp;
    const g = ctx.createLinearGradient(0, sy - 40, 0, sy);
    g.addColorStop(0, rgba(C.ok, 0)); g.addColorStop(1, rgba(C.ok, 0.3));
    ctx.fillStyle = g; ctx.fillRect(vx, sy - 40, vw, 40);
    ctx.fillStyle = C.ok; ctx.fillRect(vx, sy - 1, vw, 2);
  }
  ctx.restore();
  // corner brackets
  ctx.strokeStyle = rgba('#ffffff', 0.7); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  [[vx + 14, vy + 14, 1, 1], [vx + vw - 14, vy + 14, -1, 1], [vx + 14, vy + vh - 14, 1, -1], [vx + vw - 14, vy + vh - 14, -1, -1]].forEach(([cx, cy, dx, dy]) => {
    ctx.beginPath(); ctx.moveTo(cx, cy + dy * 16); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * 16, cy); ctx.stroke();
  });
  pill(ctx, 'MobileNetV3 · on-device', vx + 12, vy + vh - 20, { size: 10.5, h: 22, pad: 8, bg: 'rgba(0,0,0,0.55)', color: '#dfe', alpha: 0.9 });

  // probabilities
  const by = vy + vh + 22, bw = vw - 134;
  const grow = seg(t, ph.bars, ph.bars + 0.9, ease.outCubic);
  const top = P.indexOf(Math.max(...P));
  const answers = P[top] >= 0.8;
  CLASSES.forEach((c, i) => {
    const yy = by + i * 24;
    const v = P[i] * grow;
    const hi = i === top && grow > 0.95;
    text(ctx, c, vx, yy + 10, { size: 12.5, family: FONTS.sans, weight: hi ? 700 : 500, color: hi ? C.ink : C.muted });
    rr(ctx, vx + 92, yy + 2, bw, 9, 4.5); ctx.fillStyle = C.line; ctx.fill();
    if (v > 0.005) { rr(ctx, vx + 92, yy + 2, Math.max(9, bw * v), 9, 4.5); ctx.fillStyle = hi ? (answers ? C.ok : C.unsure) : mix(C.line, C.muted, 0.6); ctx.fill(); }
    text(ctx, v.toFixed(2), vx + vw, yy + 11, { size: 11.5, family: FONTS.mono, color: hi ? C.ink : C.muted, align: 'right' });
  });
  // the 0.80 threshold
  const tx = vx + 92 + bw * 0.8;
  ctx.strokeStyle = rgba(C.unsure, 0.8); ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(tx, by - 8); ctx.lineTo(tx, by + 7 * 24 - 4); ctx.stroke(); ctx.setLineDash([]);
  text(ctx, 'answer only ≥ 0.80', tx, by - 12, { size: 10.5, family: FONTS.mono, color: C.unsure, align: 'center' });

  // the card
  const cp = seg(t, ph.card, ph.card + 0.45, ease.outBack);
  if (cp > 0) {
    const cy = s.y + s.h - 104;
    ctx.save();
    ctx.globalAlpha *= clamp(cp);
    ctx.translate(0, (1 - cp) * 30);
    rr(ctx, vx, cy, vw, 100, 18);
    ctx.fillStyle = answers ? '#16261a' : '#2a2412'; ctx.fill();
    ctx.strokeStyle = rgba(answers ? C.ok : C.unsure, 0.5); ctx.lineWidth = 1.2; ctx.stroke();
    if (answers) {
      text(ctx, 'Looks like brown spot', vx + 16, cy + 30, { size: 17, weight: 700, color: C.ink });
      text(ctx, '(not certain)', vx + 16, cy + 50, { size: 13, family: FONTS.serif, italic: true, color: C.muted });
      let px = vx + 16;
      ['do now', 'do not', 'ask SAAO'].forEach((c) => { px += pill(ctx, c, px, cy + 76, { size: 11, h: 22, pad: 8, bg: rgba(C.ok, 0.13), color: C.ok }) + 6; });
    } else {
      text(ctx, 'নিশ্চিত নই', vx + 16, cy + 34, { size: 22, family: FONTS.bangla, weight: 700, color: C.unsure });
      text(ctx, "Not sure: this doesn't look like", vx + 16, cy + 60, { size: 14, family: FONTS.sans, weight: 600, color: C.ink });
      text(ctx, 'a rice leaf I know. Ask your SAAO.', vx + 16, cy + 80, { size: 14, family: FONTS.sans, weight: 600, color: C.ink });
    }
    ctx.restore();
  }
  ctx.restore();
}

export default {
  width: W, height: H, duration: D, fps: 30,
  draw(ctx, t) {
    const out = 1 - seg(t, D - 0.5, D, ease.inCubic);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    dotGrid(ctx, W, H, 28, '#ffffff', 0.03);
    light(ctx, 970, 330, 460, C.leaf, 0.10);
    light(ctx, 200, 560, 420, C.gold, 0.05);

    ctx.save();
    ctx.globalAlpha = out;
    // mark: a rice grain in a rounded square
    ctx.save();
    ctx.globalAlpha *= seg(t, 0, 0.5);
    rr(ctx, 60, 44, 44, 44, 11); ctx.fillStyle = C.bd; ctx.fill();
    ctx.fillStyle = C.gold; ctx.beginPath(); ctx.ellipse(82, 66, 7, 14, 0.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#0a0f0b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(77, 74); ctx.lineTo(87, 58); ctx.stroke();
    ctx.restore();
    text(ctx, 'Rice-leaf advisor', 118, 78, { size: 34, weight: 700, color: C.ink, tracking: -0.5, alpha: seg(t, 0.1, 0.6) });
    text(ctx, typed('a photo, an answer, and an honest "not sure"', seg(t, 0.4, 1.8)), 60, 128, { size: 25, family: FONTS.serif, italic: true, color: C.muted });

    const lines = [
      ['Offline, on a Tk 6,000 Android', 'Chrome PWA · ONNX in the browser · Bangla voice cards'],
      ['For flood-hit rice farmers', 'Sirajganj, Bangladesh · BRRI rules · hand-off to the SAAO'],
    ];
    lines.forEach(([a, b], i) => {
      const p = seg(t, 0.8 + i * 0.25, 1.3 + i * 0.25, ease.outCubic);
      text(ctx, a, 60, 190 + i * 58, { size: 19, weight: 700, color: C.ink, alpha: p });
      text(ctx, b, 60, 214 + i * 58, { size: 14.5, family: FONTS.sans, weight: 500, color: C.muted, alpha: p });
    });

    const stats = [
      [6.1, 1, ' MB', 'model size, fp32: fits a cheap phone'],
      [74, 0, '%', 'right when it answers, on a Bangladeshi dataset it never saw'],
      [100, 0, '%', 'of bean leaves (never seen) → "not sure"'],
    ];
    stats.forEach(([v, d, u, l], i) => {
      const a = 1.6 + i * 0.35;
      const p = seg(t, a, a + 1.2);
      const y = 362 + i * 82;
      ctx.save();
      ctx.globalAlpha *= seg(t, a, a + 0.3);
      rr(ctx, 60, y - 46, 660, 70, 16); ctx.fillStyle = rgba('#ffffff', 0.03); ctx.fill();
      text(ctx, countUp(v, p, d) + u, 84, y + 2, { size: 38, weight: 800, color: i === 2 ? C.unsure : C.ok, tracking: -1 });
      text(ctx, l, 250, y - 6, { size: 15.5, family: FONTS.sans, weight: 500, color: C.ink });
      ctx.restore();
    });
    text(ctx, 'Hack-Nation 2026 · World Bank challenge: Small AI for Development', 60, 612, { size: 12.5, family: FONTS.mono, color: rgba(C.muted, 0.8), alpha: seg(t, 2.6, 3.0) });

    const s = phone(ctx, t);
    screen(ctx, s, t, P1, A, 'rice');
    screen(ctx, s, t, P2, B, 'bean');
    ctx.restore();
  },
};
