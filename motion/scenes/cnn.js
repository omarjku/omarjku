// MyCNN (Machine-Learning-Project): a 100×100 grayscale image goes through four
// conv blocks (64 → 128 → 256 → 512 channels, each pooled by 2), global average
// pooling, two linear layers, and comes out as scores over 20 classes.
// Layer sizes match architecture.py. The input and the scores are illustrative.
import { clamp, lerp, ease, seg, rgba, mix, rr, circle, text, pill, light, dotGrid, FONTS, TAU, window_, typed, rng, noise2 } from '../engine/lib.js';

const W = 1280, H = 640, D = 10;
const C = { bg: '#0b0b10', panel: '#13131b', line: '#25253a', ink: '#ececf4', muted: '#8d8da6', hot: '#ff8a3d', cool: '#6c8cff', vio: '#b07cff' };

const BLOCKS = [
  { label: 'input', size: 100, ch: 1, px: 120, maps: 1 },
  { label: 'conv 3×3 · 64', size: 50, ch: 64, px: 96, maps: 5 },
  { label: 'conv 3×3 · 128', size: 25, ch: 128, px: 76, maps: 7 },
  { label: 'conv 3×3 · 256', size: 12, ch: 256, px: 58, maps: 9 },
  { label: 'conv 3×3 · 512', size: 6, ch: 512, px: 42, maps: 11 },
];
const SCORES = (() => { const r = rng(42); const s = Array.from({ length: 20 }, () => r() * 0.05); s[7] = 0.71; s[12] = 0.11; s[3] = 0.06; return s; })();
let TEX = null;

function makeTextures() {
  // One small grayscale "feature map" per slab, from layered noise. Built once.
  const mk = (seed, res, contrast) => {
    const c = document.createElement('canvas'); c.width = c.height = res;
    const g = c.getContext('2d'); const img = g.createImageData(res, res); const n = noise2(seed);
    for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
      let v = n(x / (res / 4), y / (res / 4)) * 0.6 + n(x / (res / 10) + 9, y / (res / 10)) * 0.4;
      v = clamp((v - 0.5) * contrast + 0.5);
      const i = (y * res + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0); return c;
  };
  // The input: a soft blob on a gradient, like a photo of an object, in grayscale.
  const inp = document.createElement('canvas'); inp.width = inp.height = 100;
  const g = inp.getContext('2d');
  const bgG = g.createLinearGradient(0, 0, 100, 100); bgG.addColorStop(0, '#9a9a9a'); bgG.addColorStop(1, '#3c3c3c');
  g.fillStyle = bgG; g.fillRect(0, 0, 100, 100);
  g.fillStyle = '#e8e8e8'; g.beginPath(); g.moveTo(30, 30); g.lineTo(70, 30); g.lineTo(64, 78); g.lineTo(36, 78); g.closePath(); g.fill();
  g.strokeStyle = '#e8e8e8'; g.lineWidth = 6; g.beginPath(); g.arc(72, 52, 11, -1.2, 1.2); g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(50, 82, 26, 5, 0, 0, TAU); g.fill();
  return { input: inp, maps: BLOCKS.map((b, i) => Array.from({ length: b.maps }, (_, k) => mk(i * 31 + k, Math.max(8, Math.min(48, b.size)), 1.8 + i * 0.3))) };
}

// A stack of feature maps, drawn as offset squares receding to the upper right.
function slab(ctx, b, i, x, y, t, lit) {
  const s = b.px, n = b.maps, dx = 7, dy = -6;
  for (let k = n - 1; k >= 0; k--) {
    const ox = x + k * dx, oy = y + k * dy;
    ctx.save();
    ctx.globalAlpha *= k === 0 ? 1 : 0.85;
    ctx.imageSmoothingEnabled = i === 0;
    ctx.drawImage(i === 0 ? TEX.input : TEX.maps[i][k % TEX.maps[i].length], ox, oy, s, s);
    if (i > 0) {
      // tint maps in the activation colour
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = mix(C.cool, C.hot, clamp(i / 4)); ctx.fillRect(ox, oy, s, s);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.strokeStyle = rgba('#ffffff', 0.25 + 0.6 * lit); ctx.lineWidth = 1; ctx.strokeRect(ox + 0.5, oy + 0.5, s - 1, s - 1);
    ctx.restore();
  }
  if (lit > 0) {
    ctx.save(); ctx.shadowColor = mix(C.cool, C.hot, clamp(i / 4)); ctx.shadowBlur = 24 * lit;
    ctx.strokeStyle = rgba(mix(C.cool, C.hot, clamp(i / 4)), lit); ctx.lineWidth = 2; ctx.strokeRect(x, y, s, s);
    ctx.restore();
  }
}

export default {
  width: W, height: H, duration: D, fps: 30,
  setup() { TEX = makeTextures(); },
  draw(ctx, t) {
    const out = 1 - seg(t, D - 0.6, D, ease.inCubic);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    dotGrid(ctx, W, H, 28, '#ffffff', 0.03);
    light(ctx, 520, 340, 520, C.vio, 0.07);
    light(ctx, 1100, 360, 360, C.hot, 0.05);

    ctx.save();
    ctx.globalAlpha = out;
    // header
    ctx.save(); ctx.globalAlpha *= seg(t, 0, 0.5);
    rr(ctx, 60, 44, 44, 44, 11); ctx.fillStyle = C.vio; ctx.fill();
    [[72, 56], [92, 56], [72, 76], [92, 76]].forEach(([cx, cy], k) => { rr(ctx, cx - 6, cy - 6, 12, 12, 3); ctx.fillStyle = rgba('#ffffff', 0.55 + 0.15 * k); ctx.fill(); });
    ctx.restore();
    text(ctx, 'MyCNN', 118, 78, { size: 36, weight: 700, color: C.ink, tracking: -0.5, alpha: seg(t, 0.1, 0.6) });
    text(ctx, typed('a from-scratch image classifier in PyTorch', seg(t, 0.4, 1.6)), 264, 77, { size: 24, family: FONTS.serif, italic: true, color: C.muted });

    // the network
    const xs = [60, 236, 400, 552, 700], base = 360;
    const flow = (t - 1.0) / 3.2; // a pulse moving left to right
    BLOCKS.forEach((b, i) => {
      const ap = seg(t, 0.3 + i * 0.18, 0.8 + i * 0.18, ease.outCubic);
      if (ap <= 0) return;
      const x = xs[i], y = base - b.px / 2 + (1 - ap) * 20;
      const lit = clamp(1 - Math.abs(flow * 5.6 - i) * 1.4) * (t < 7.6 ? 1 : 0);
      ctx.save(); ctx.globalAlpha *= ap;
      slab(ctx, b, i, x, y, t, lit);
      text(ctx, b.label, x, base + 108, { size: 12.5, family: FONTS.mono, weight: 600, color: C.ink });
      text(ctx, `${b.size}×${b.size}×${b.ch}`, x, base + 128, { size: 12, family: FONTS.mono, color: C.muted });
      if (i > 0) text(ctx, 'ReLU · pool · BN', x, base + 146, { size: 11, family: FONTS.mono, color: rgba(C.muted, 0.7) });
      ctx.restore();
      // arrow to the next block
      if (i < BLOCKS.length - 1) {
        const ax0 = x + b.px + b.maps * 7 + 6, ax1 = xs[i + 1] - 10;
        ctx.save(); ctx.globalAlpha *= seg(t, 0.6 + i * 0.18, 1.0 + i * 0.18);
        ctx.strokeStyle = rgba('#ffffff', 0.25); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(ax0, base); ctx.lineTo(ax1, base); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax1, base); ctx.lineTo(ax1 - 6, base - 4); ctx.lineTo(ax1 - 6, base + 4); ctx.closePath(); ctx.fillStyle = rgba('#ffffff', 0.35); ctx.fill();
        ctx.restore();
      }
    });
    // augmentation chips over the input
    const aug = ['flip', 'rotate ±45°', 'blur', 'noise σ 0.5'];
    aug.forEach((a, k) => {
      const at = 0.8 + k * 0.22;
      pill(ctx, a, 70 + (k % 2) * 92, 206 + Math.floor(k / 2) * 30, { size: 11, h: 24, pad: 8, alpha: seg(t, at, at + 0.3), bg: rgba(C.vio, 0.14), color: C.vio });
    });

    // head: GAP → FC 512 → dropout → FC 20
    const hx = 884, hp = seg(t, 1.2, 1.8, ease.outCubic);
    const headLit = clamp(1 - Math.abs(flow * 5.6 - 5) * 1.4) * (t < 7.6 ? 1 : 0);
    ctx.save(); ctx.globalAlpha *= hp;
    for (let k = 0; k < 14; k++) {
      circle(ctx, hx, base - 100 + k * 14.5, 4.2);
      ctx.fillStyle = mix(C.line, C.hot, headLit * (0.4 + 0.6 * ((k * 7) % 5) / 4)); ctx.fill();
    }
    text(ctx, 'avg pool', hx, base + 108, { size: 12.5, family: FONTS.mono, weight: 600, color: C.ink, align: 'center' });
    text(ctx, '512 → 512 → 20', hx, base + 128, { size: 12, family: FONTS.mono, color: C.muted, align: 'center' });
    text(ctx, 'dropout 0.5', hx, base + 146, { size: 11, family: FONTS.mono, color: rgba(C.muted, 0.7), align: 'center' });
    ctx.restore();

    // scores over 20 classes
    const sx = 970, sw = 252, sy = 196, rowH = 15;
    const sp = seg(t, 4.3, 5.4, ease.outCubic);
    ctx.save(); ctx.globalAlpha *= seg(t, 1.4, 1.9);
    rr(ctx, sx - 18, sy - 44, sw + 40, 20 * rowH + 76, 18); ctx.fillStyle = rgba('#ffffff', 0.025); ctx.fill();
    text(ctx, 'SCORES · 20 CLASSES', sx, sy - 18, { size: 11, family: FONTS.mono, weight: 700, color: C.muted, tracking: 2 });
    SCORES.forEach((v, k) => {
      const y = sy + k * rowH;
      const top = k === 7;
      text(ctx, String(k).padStart(2, '0'), sx, y + 9, { size: 10.5, family: FONTS.mono, color: top && sp > 0.9 ? C.ink : C.muted });
      rr(ctx, sx + 26, y + 2, sw - 70, 8, 4); ctx.fillStyle = C.line; ctx.fill();
      const wv = (sw - 70) * v * sp;
      if (wv > 1) { rr(ctx, sx + 26, y + 2, Math.max(8, wv), 8, 4); ctx.fillStyle = top ? C.hot : mix(C.line, C.cool, 0.7); ctx.fill(); }
      if (top && sp > 0.9) text(ctx, (v * sp).toFixed(2), sx + sw - 4, y + 10, { size: 11.5, family: FONTS.mono, weight: 700, color: C.hot, align: 'right' });
    });
    ctx.restore();

    // footer facts
    const facts = ['4 conv blocks + BatchNorm', '~1.8M parameters', '4 augmentation pipelines', 'grayscale 100×100'];
    let fx = 60;
    facts.forEach((f, k) => { fx += pill(ctx, f, fx, 594, { size: 12.5, alpha: seg(t, 2.0 + k * 0.15, 2.4 + k * 0.15), color: C.muted, bg: rgba('#ffffff', 0.05) }) + 10; });
    ctx.restore();
  },
};
