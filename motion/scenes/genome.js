// Genome Firewall: scan an E. coli genome, find resistance genes, answer per drug
// with a calibrated probability, and say "no-call" when the evidence is thin.
// Hits and verdicts are the real output for the bundled genome 562.7624
// (AMRFinderPlus TSV in data/raw/fasta_demo + pipeline.analyze).
import { clamp, lerp, ease, seg, rgba, mix, rr, circle, text, pill, light, dotGrid, FONTS, TAU, window_, typed, rng } from '../engine/lib.js';

const W = 1280, H = 640, D = 12;
const C = {
  bg: '#090d12', panel: '#10161e', line: '#1f2a36', ink: '#e8eef4', muted: '#8a98a8',
  indigo: '#7c7cf8', teal: '#22b8cf', fail: '#ff6b6b', work: '#51cf66', nocall: '#fcc419',
  A: '#5c7cfa', T: '#22b8cf', G: '#845ef7', Cb: '#20c997',
};

// Position along the helix (0..1) where each gene sits, and what it is.
const HITS = [
  { x: 0.16, sym: "aph(6)-Id", cls: 'aminoglycoside' },
  { x: 0.30, sym: "aph(3'')-Ib", cls: 'aminoglycoside' },
  { x: 0.46, sym: 'sul2', cls: 'sulfonamide' },
  { x: 0.62, sym: 'blaTEM-1', cls: 'beta-lactam', key: true },
  { x: 0.84, sym: 'dfrA8', cls: 'trimethoprim' },
];
const SCAN_A = 1.2, SCAN_B = 4.0;

const DRUGS = [
  { name: 'Ampicillin', call: 'LIKELY TO FAIL', p: 0.99, color: C.fail, ev: 'known gene · blaTEM-1' },
  { name: 'Ciprofloxacin', call: 'LIKELY TO WORK', p: 0.26, color: C.work, ev: 'statistical association' },
  { name: 'Trimethoprim', call: 'NO-CALL', p: 0.36, color: C.nocall, ev: 'in the 0.30–0.70 band → ask the lab' },
];

function shield(ctx, x, y, s, p) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s / 48, s / 48);
  ctx.globalAlpha *= seg(p, 0, 0.4);
  ctx.beginPath();
  ctx.moveTo(24, 2); ctx.lineTo(44, 10); ctx.lineTo(44, 24);
  ctx.bezierCurveTo(44, 36, 35, 43, 24, 47); ctx.bezierCurveTo(13, 43, 4, 36, 4, 24);
  ctx.lineTo(4, 10); ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 48, 48);
  g.addColorStop(0, '#4f46e5'); g.addColorStop(1, '#0b7285');
  ctx.fillStyle = g; ctx.fill();
  // a tiny helix inside the shield
  ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  for (const ph of [0, Math.PI]) {
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const yy = 12 + i * 1.2, xx = 24 + Math.sin(i / 20 * TAU * 0.9 + ph + p * 3) * 8;
      i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
    }
    ctx.strokeStyle = '#fff'; ctx.stroke();
  }
  ctx.restore();
}

function helix(ctx, x0, x1, cy, amp, t, scanX) {
  const n = 120, r = rng(5);
  const bases = Array.from({ length: n }, () => ['A', 'T', 'G', 'Cb'][Math.floor(r() * 4)]);
  // One full turn while the genome is being read, then it holds still: the loop
  // closes cleanly and the GIF stays small.
  const phase = TAU * seg(t, 0.2, SCAN_B + 0.6, ease.inOutSine);
  const pts = (ph) => Array.from({ length: n }, (_, i) => {
    const u = i / (n - 1);
    const a = u * TAU * 7 + phase + ph;
    return [lerp(x0, x1, u), cy + Math.sin(a) * amp, Math.cos(a)];
  });
  const s1 = pts(0), s2 = pts(Math.PI);
  // rungs first, so strands draw on top
  for (let i = 0; i < n; i += 2) {
    const [x, y1, z1] = s1[i], [, y2] = s2[i];
    const passed = scanX !== null && x < scanX;
    const hit = HITS.find((h) => Math.abs(lerp(x0, x1, h.x) - x) < 18);
    const lit = passed && hit;
    ctx.strokeStyle = lit ? rgba(hit.key ? C.fail : C.nocall, 0.95) : rgba(C[bases[i]], passed ? 0.55 : 0.28);
    ctx.lineWidth = lit ? 3 : 2;
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
  }
  for (const [s, col] of [[s1, C.indigo], [s2, C.teal]]) {
    for (let i = 1; i < n; i++) {
      const z = (s[i][2] + 1) / 2;
      ctx.strokeStyle = rgba(col, 0.35 + 0.65 * z);
      ctx.lineWidth = 2 + 2.5 * z;
      ctx.beginPath(); ctx.moveTo(s[i - 1][0], s[i - 1][1]); ctx.lineTo(s[i][0], s[i][1]); ctx.stroke();
    }
  }
}

function verdictCard(ctx, d, x, y, w, h, t, a) {
  const p = seg(t, a, a + 0.5, ease.outCubic);
  if (p <= 0) return;
  ctx.save();
  ctx.globalAlpha *= p;
  ctx.translate(0, (1 - p) * 24);
  rr(ctx, x, y, w, h, 16);
  ctx.fillStyle = C.panel; ctx.fill();
  ctx.strokeStyle = rgba(d.color, 0.35); ctx.lineWidth = 1.2; ctx.stroke();
  rr(ctx, x, y + 18, 4, h - 36, 2); ctx.fillStyle = d.color; ctx.fill();
  text(ctx, d.name, x + 24, y + 38, { size: 22, weight: 700, color: C.ink });
  pill(ctx, d.call, x + w - 20, y + 31, { size: 12, align: 'right', bg: rgba(d.color, 0.14), color: d.color, weight: 700, h: 26, pad: 10 });
  // calibrated probability of resistance, with the no-call band shaded
  const bx = x + 24, bw = w - 48, by = y + 78;
  text(ctx, 'P(resistant)', bx, by - 12, { size: 12, family: FONTS.mono, color: C.muted });
  const v = lerp(0, d.p, seg(t, a + 0.3, a + 1.1, ease.outCubic));
  text(ctx, v.toFixed(2), bx + bw, by - 12, { size: 13, family: FONTS.mono, weight: 700, color: d.color, align: 'right' });
  rr(ctx, bx, by, bw, 8, 4); ctx.fillStyle = C.line; ctx.fill();
  ctx.fillStyle = rgba(C.nocall, 0.16); ctx.fillRect(bx + bw * 0.3, by, bw * 0.4, 8);
  ctx.strokeStyle = rgba(C.nocall, 0.5); ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
  for (const k of [0.3, 0.7]) { ctx.beginPath(); ctx.moveTo(bx + bw * k, by - 4); ctx.lineTo(bx + bw * k, by + 12); ctx.stroke(); }
  ctx.setLineDash([]);
  rr(ctx, bx, by, Math.max(8, bw * v), 8, 4); ctx.fillStyle = d.color; ctx.fill();
  circle(ctx, bx + bw * v, by + 4, 7); ctx.fillStyle = '#fff'; ctx.fill();
  text(ctx, d.ev, bx, by + 40, { size: 13.5, family: FONTS.sans, weight: 500, color: C.muted, alpha: seg(t, a + 0.8, a + 1.2) });
  ctx.restore();
}

export default {
  width: W, height: H, duration: D, fps: 30,
  draw(ctx, t) {
    const out = 1 - seg(t, D - 0.6, D, ease.inCubic);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    dotGrid(ctx, W, H, 28, '#ffffff', 0.03);
    light(ctx, 640, 210, 560, C.indigo, 0.08);
    light(ctx, 1150, 560, 380, C.teal, 0.06);

    ctx.save();
    ctx.globalAlpha = out;
    shield(ctx, 60, 42, 46, t);
    text(ctx, 'Genome Firewall', 120, 78, { size: 36, weight: 700, color: C.ink, tracking: -0.5, alpha: seg(t, 0.1, 0.6) });
    text(ctx, typed('which antibiotic will still work on this genome?', seg(t, 0.4, 1.8)), 412, 77, { size: 24, family: FONTS.serif, italic: true, color: C.muted });

    // file chip + helix
    pill(ctx, 'E. coli · 562.7624.fna · AMRFinderPlus 4.2.7', 60, 132, { size: 13, dot: C.teal, bg: rgba(C.teal, 0.1), color: C.teal, alpha: seg(t, 0.4, 0.9) });
    const hx0 = 60, hx1 = 1220, hy = 232;
    const scanP = seg(t, SCAN_A, SCAN_B, ease.inOutSine);
    const scanX = t >= SCAN_A ? lerp(hx0, hx1, scanP) : null;
    ctx.save();
    ctx.globalAlpha *= seg(t, 0.2, 1.0);
    helix(ctx, hx0, hx1, hy, 38, t, scanX);
    ctx.restore();
    // scanner beam
    const beam = window_(t, SCAN_A, SCAN_B + 0.2, 0.2, 0.3);
    if (beam > 0) {
      const g = ctx.createLinearGradient(scanX - 80, 0, scanX, 0);
      g.addColorStop(0, rgba(C.teal, 0)); g.addColorStop(1, rgba(C.teal, 0.22 * beam));
      ctx.fillStyle = g; ctx.fillRect(scanX - 80, hy - 70, 80, 140);
      ctx.fillStyle = rgba('#ffffff', 0.85 * beam); ctx.fillRect(scanX - 1, hy - 74, 2, 148);
    }
    // gene labels pop as the scanner passes
    HITS.forEach((h) => {
      const hxp = lerp(hx0, hx1, h.x);
      const at = SCAN_A + (SCAN_B - SCAN_A) * (Math.acos(1 - 2 * h.x) / Math.PI); // when the beam reaches it
      const k = seg(t, at, at + 0.35, ease.outBack);
      if (k <= 0) return;
      const col = h.key ? C.fail : C.nocall;
      ctx.save();
      ctx.globalAlpha *= clamp(k);
      ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hxp, hy - 44); ctx.lineTo(hxp, hy - 62 - 4 * k); ctx.stroke();
      pill(ctx, h.sym, hxp, hy - 78, { size: 13, align: 'center', bg: rgba(col, 0.14), color: col, weight: 700, h: 26, pad: 10 });
      text(ctx, h.cls, hxp, hy + 70, { size: 12, family: FONTS.mono, color: C.muted, align: 'center' });
      ctx.restore();
    });

    // verdicts
    const cw = 372, gap = 22, cy = 342;
    DRUGS.forEach((d, i) => verdictCard(ctx, d, 60 + i * (cw + gap), cy, cw, 160, t, 4.4 + i * 0.55));

    // footer: how it was built
    const facts = ['2,127 genomes', 'held out by MLST lineage', 'Platt-calibrated', 'no-call when unsure'];
    let fx = 60;
    facts.forEach((f, i) => { fx += pill(ctx, f, fx, 556, { size: 12.5, alpha: seg(t, 6.4 + i * 0.15, 6.8 + i * 0.15), color: C.muted, bg: rgba('#ffffff', 0.05) }) + 10; });
    text(ctx, 'Research prototype: decision support, confirm with lab testing.', 60, 604, { size: 13, family: FONTS.sans, weight: 500, color: rgba(C.muted, 0.8), alpha: seg(t, 7.0, 7.5) });
    ctx.restore();
  },
};
