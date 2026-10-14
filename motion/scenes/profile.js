// Profile banner: a drifting neural mesh with signals running along its edges,
// the name, and a line that cycles through what the projects actually do.
// Every motion has period D (or D/k), so the GIF loops without a seam.
import { clamp, lerp, ease, seg, rgba, mix, rr, circle, text, measure, pill, light, FONTS, TAU, rng } from '../engine/lib.js';

const W = 1280, H = 420, D = 12;
const C = { bg: '#07080c', ink: '#f3f4f8', muted: '#8f95a8', line: '#1c2030' };
const ACCENTS = ['#2f6fed', '#7cc4ad', '#7c7cf8', '#9be15d', '#5fb7f5', '#b07cff'];

const PHRASES = [
  ['AI agents', 'that report their own work'],
  ['models', 'that say “not sure”'],
  ['products', 'in 24-hour hackathons'],
  ['apps', 'that tell you what to wear'],
];

const r = rng(2026);
const NODES = Array.from({ length: 84 }, (_, i) => {
  // Keep the left third calmer so the name stays readable.
  let x = r() * W, y = r() * H;
  if (x < 700 && r() < 0.55) x = 700 + r() * (W - 700);
  return { x, y, rad: 14 + r() * 26, ph: r() * TAU, dir: r() < 0.5 ? 1 : -1, size: 1.2 + r() * 2.2, c: ACCENTS[Math.floor(r() * ACCENTS.length)], hub: r() < 0.12 };
});
const EDGES = [];
NODES.forEach((a, i) => NODES.forEach((b, j) => {
  if (j <= i) return;
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  if (d < 150) EDGES.push({ i, j, d });
}));
const SIGNALS = Array.from({ length: 44 }, () => ({ e: Math.floor(r() * EDGES.length), at: r() * D, dur: 0.9 + r() * 0.9, rev: r() < 0.5 }));

// The mesh holds still and signals do the moving: a GIF only stores the pixels
// that change, so a static mesh with travelling pulses stays a few MB.
const pos = (n) => [n.x, n.y];

function phraseAt(t) {
  const per = D / PHRASES.length;
  const k = Math.floor(t / per) % PHRASES.length;
  const lt = t - k * per;
  const typeIn = seg(lt, 0.15, 1.0), del = seg(lt, per - 0.5, per - 0.1);
  return { k, show: typeIn * (1 - del), lt, per };
}

export default {
  width: W, height: H, duration: D, fps: 30,
  draw(ctx, t) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    light(ctx, 980, 200, 520, '#2f6fed', 0.10);
    light(ctx, 1180, 380, 300, '#b07cff', 0.07);
    light(ctx, 120, 60, 360, '#7cc4ad', 0.05);

    // mesh
    const P = NODES.map((n) => pos(n, t));
    ctx.lineWidth = 1;
    EDGES.forEach(({ i, j, d }) => {
      const [x1, y1] = P[i], [x2, y2] = P[j];
      const dd = Math.hypot(x1 - x2, y1 - y2);
      const a = clamp(1 - dd / 170) * 0.22 * clamp((x1 + x2) / 2 / 500 - 0.1);
      if (a <= 0.005) return;
      ctx.strokeStyle = rgba('#9fb3ff', a);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });
    SIGNALS.forEach((s) => {
      const lt = ((t - s.at) % D + D) % D;
      if (lt > s.dur) return;
      const p = ease.inOutSine(lt / s.dur);
      const { i, j } = EDGES[s.e];
      const [a, b] = s.rev ? [P[j], P[i]] : [P[i], P[j]];
      const x = lerp(a[0], b[0], p), y = lerp(a[1], b[1], p);
      const c = NODES[i].c;
      ctx.save();
      ctx.strokeStyle = rgba(c, 0.8 * Math.sin(p * Math.PI)); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(lerp(a[0], b[0], Math.max(0, p - 0.25)), lerp(a[1], b[1], Math.max(0, p - 0.25))); ctx.lineTo(x, y); ctx.stroke();
      circle(ctx, x, y, 2.6); ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 10; ctx.fill();
      ctx.restore();
    });
    NODES.forEach((n, k) => {
      const [x, y] = P[k];
      const fade = clamp(x / 500 - 0.15);
      if (fade <= 0) return;
      const tw = 0.6 + 0.4 * Math.sin(TAU * (t / D) * 2 + n.ph);
      if (n.hub) { circle(ctx, x, y, n.size + 4); ctx.fillStyle = rgba(n.c, 0.12 * fade); ctx.fill(); }
      circle(ctx, x, y, n.size); ctx.fillStyle = rgba(n.hub ? n.c : '#c9d3ff', (n.hub ? 0.9 : 0.45) * tw * fade); ctx.fill();
    });

    // left fade so text sits on calm ground
    const g = ctx.createLinearGradient(0, 0, 760, 0);
    g.addColorStop(0, rgba(C.bg, 0.95)); g.addColorStop(0.75, rgba(C.bg, 0.6)); g.addColorStop(1, rgba(C.bg, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, 760, H);

    // text
    text(ctx, 'JKU LINZ  ·  ARTIFICIAL INTELLIGENCE', 64, 104, { size: 14, family: FONTS.mono, weight: 600, color: '#7cc4ad', tracking: 3 });
    const name = 'Omar Kassem';
    text(ctx, name, 60, 196, { size: 88, weight: 800, color: C.ink, tracking: -3 });
    // a light sweep across the name once per loop
    const sw = seg(t, 0.3, 1.6, ease.inOutCubic);
    if (sw > 0 && sw < 1) {
      ctx.save();
      ctx.font = `800 88px ${FONTS.display}`; ctx.letterSpacing = '-3px';
      const nw = ctx.measureText(name).width;
      const sx = lerp(20, 60 + nw + 40, sw);
      const sg = ctx.createLinearGradient(sx - 90, 0, sx + 10, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.7, 'rgba(160,190,255,0.95)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg; ctx.fillText(name, 60, 196);
      ctx.restore();
    }

    // "I build <thing> <what it does>" with a caret
    const { k, show, lt } = phraseAt(t);
    const [noun, rest] = PHRASES[k];
    const full = `${noun} ${rest}`;
    const n = Math.floor(full.length * show + 1e-6);
    const typed = full.slice(0, n);
    const y = 262;
    let x = 64 + text(ctx, 'I build ', 64, y, { size: 30, family: FONTS.sans, weight: 500, color: C.muted });
    const accent = ['#6f9bff', '#a9a9ff', '#b6f07a', '#7cc4ad'][k];
    const nPart = typed.slice(0, Math.min(typed.length, noun.length));
    const rPart = typed.slice(noun.length);
    x += text(ctx, nPart, x, y, { size: 30, family: FONTS.sans, weight: 700, color: C.ink });
    x += text(ctx, rPart, x, y, { size: 30, family: FONTS.serif, italic: true, color: accent });
    if (Math.floor(t * 2.2) % 2 === 0 || (show > 0 && show < 1)) { ctx.fillStyle = accent; ctx.fillRect(x + 3, y - 26, 3, 32); }

    // project chips
    const chips = [['Orchestra', '#2f6fed'], ['Genome Firewall', '#7c7cf8'], ['Rice-leaf advisor', '#9be15d'], ['Leyrd', '#7cc4ad'], ['AgentMesh', '#5fb7f5']];
    let cx = 64;
    chips.forEach(([c, col], i) => {
      const lit = [[0], [1, 2], [0, 4], [3]][k].includes(i) ? clamp(show * 3) : 0;
      cx += pill(ctx, c, cx, 330, { size: 13, h: 30, pad: 12, dot: col, bg: rgba(col, 0.08 + 0.1 * lit), color: lit ? C.ink : C.muted, stroke: rgba(col, 0.15 + 0.4 * lit) }) + 10;
    });
  },
};
