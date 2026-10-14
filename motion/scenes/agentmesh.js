// AgentMesh: post a task, agents bid, the most reliable one per sat wins,
// the work comes back verified, and a Lightning payment settles it.
// Agents, tiers, prices and reliability scores come from src/lib/mockData.ts.
import { clamp, lerp, ease, seg, rgba, mix, rr, circle, text, pill, light, dotGrid, FONTS, TAU, window_, typed, bez } from '../engine/lib.js';

const W = 1280, H = 640, D = 12;
const C = {
  bg: '#0a0a0b', panel: '#141416', line: '#26262b', ink: '#f2f2f2', muted: '#8e8e96',
  glow: '#5fb7f5', bolt: '#f7b500', ok: '#4ade80', elite: '#c4b5fd', verified: '#5fb7f5', unverified: '#8e8e96',
};
const AGENTS = [
  { name: 'PolyglotBot', tier: 'Unverified', rating: 3.2, rel: 64, bid: 10, y: 150 },
  { name: 'TranslatorPro', tier: 'Elite', rating: 4.9, rel: 97, bid: 50, y: 290, win: true },
  { name: 'LegalLens', tier: 'Verified', rating: 4.6, rel: 90, bid: 250, y: 430 },
];
const AX = 760, AW = 460, AH = 112;
const REQ = { x: 60, y: 196, w: 470, h: 176 };
const T_BIDS = 2.2, T_PICK = 4.2, T_WORK = 4.8, T_DONE = 6.6, T_PAY = 7.0, T_PAID = 7.9, T_RATE = 8.4;

function mark(ctx, x, y, s, t) {
  // Three nodes meshed together.
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 44, s / 44);
  rr(ctx, 0, 0, 44, 44, 11); ctx.fillStyle = '#fff'; ctx.fill();
  const pts = [[22, 11], [11, 31], [33, 31]];
  ctx.strokeStyle = '#0a0a0b'; ctx.lineWidth = 2.6;
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath(); ctx.stroke();
  pts.forEach(([px, py], i) => { circle(ctx, px, py, 4.6 + 0.8 * Math.sin(t * 3 + i * 2)); ctx.fillStyle = '#0a0a0b'; ctx.fill(); });
  ctx.restore();
}

function stars(ctx, x, y, n, size = 12, color = C.bolt) {
  for (let i = 0; i < 5; i++) {
    const f = clamp(n - i);
    const cx = x + i * (size + 4), cy = y;
    const path = new Path2D();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? size * 0.22 : size * 0.5, a = -Math.PI / 2 + (k * Math.PI) / 5;
      k ? path.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : path.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    path.closePath();
    ctx.fillStyle = C.line; ctx.fill(path);
    if (f > 0) { ctx.save(); ctx.beginPath(); ctx.rect(cx - size / 2, cy - size / 2, size * f, size); ctx.clip(); ctx.fillStyle = color; ctx.fill(path); ctx.restore(); }
  }
}

function boltPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x + 0.15 * s, y - 0.5 * s); ctx.lineTo(x - 0.3 * s, y + 0.08 * s); ctx.lineTo(x - 0.02 * s, y + 0.08 * s);
  ctx.lineTo(x - 0.15 * s, y + 0.5 * s); ctx.lineTo(x + 0.3 * s, y - 0.1 * s); ctx.lineTo(x + 0.02 * s, y - 0.1 * s); ctx.closePath();
}

function agentCard(ctx, a, t, i) {
  const appear = seg(t, 0.5 + i * 0.15, 1.0 + i * 0.15, ease.outCubic);
  const picked = seg(t, T_PICK, T_PICK + 0.4, ease.outCubic);
  const dim = a.win ? 0 : picked * 0.6;
  const x = AX + (1 - appear) * 40, y = a.y;
  ctx.save();
  ctx.globalAlpha *= appear * (1 - dim);
  if (a.win && picked > 0) { ctx.shadowColor = rgba(C.glow, 0.7); ctx.shadowBlur = 36 * picked; }
  rr(ctx, x, y, AW, AH, 18); ctx.fillStyle = C.panel; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = a.win && picked > 0 ? rgba(C.glow, 0.4 + 0.5 * picked) : C.line; ctx.lineWidth = 1.3; ctx.stroke();
  const tierC = a.tier === 'Elite' ? C.elite : a.tier === 'Verified' ? C.verified : C.unverified;
  // avatar
  const g = ctx.createLinearGradient(x + 20, y + 20, x + 68, y + 68);
  g.addColorStop(0, mix(tierC, '#fff', 0.2)); g.addColorStop(1, mix(tierC, '#000', 0.45));
  circle(ctx, x + 46, y + 46, 24); ctx.fillStyle = g; ctx.fill();
  text(ctx, a.name[0], x + 46, y + 47, { size: 20, weight: 800, color: '#0a0a0b', align: 'center', baseline: 'middle' });
  text(ctx, a.name, x + 84, y + 40, { size: 19, weight: 700, color: C.ink });
  pill(ctx, a.tier, x + 92 + measureName(ctx, a.name), y + 34, { size: 11, h: 22, pad: 8, bg: rgba(tierC, 0.14), color: tierC, weight: 700 });
  stars(ctx, x + 90, y + 66, a.rating, 12);
  text(ctx, a.rating.toFixed(1), x + 176, y + 70, { size: 12.5, family: FONTS.mono, color: C.muted });
  text(ctx, 'reliability', x + 84, y + 94, { size: 11.5, family: FONTS.mono, color: C.muted });
  rr(ctx, x + 172, y + 87, 120, 8, 4); ctx.fillStyle = C.line; ctx.fill();
  rr(ctx, x + 172, y + 87, 120 * (a.rel / 100) * appear, 8, 4); ctx.fillStyle = a.rel > 90 ? C.ok : a.rel > 75 ? C.bolt : '#f87171'; ctx.fill();
  text(ctx, String(a.rel), x + 300, y + 95, { size: 12, family: FONTS.mono, weight: 700, color: C.ink });
  // bid
  const bp = seg(t, T_BIDS + 0.35 + i * 0.3, T_BIDS + 0.8 + i * 0.3, ease.outBack);
  if (bp > 0) {
    ctx.save();
    ctx.globalAlpha *= clamp(bp);
    text(ctx, 'BID', x + AW - 24, y + 36, { size: 11, family: FONTS.mono, weight: 700, color: C.muted, align: 'right', tracking: 1.5 });
    text(ctx, `${a.bid}`, x + AW - 66, y + 74, { size: 30, weight: 800, color: C.ink, align: 'right', tracking: -1 });
    text(ctx, 'sats', x + AW - 24, y + 74, { size: 14, family: FONTS.mono, color: C.bolt, align: 'right' });
    ctx.restore();
  }
  // the winner works, then delivers
  if (a.win) {
    const wp = seg(t, T_WORK, T_DONE, ease.inOutSine);
    if (wp > 0) {
      const dp = seg(t, T_DONE, T_DONE + 0.3);
      text(ctx, dp > 0 ? '✓ delivered' : `working ${Math.round(wp * 100)}%`, x + 340, y + 95, { size: 12, family: FONTS.mono, weight: 700, color: dp > 0 ? C.ok : C.glow });
    }
  }
  ctx.restore();
}
function measureName(ctx, s) {
  ctx.save(); ctx.font = `700 19px ${FONTS.display}`; const w = ctx.measureText(s).width; ctx.restore(); return w;
}

export default {
  width: W, height: H, duration: D, fps: 30,
  draw(ctx, t) {
    const out = 1 - seg(t, D - 0.6, D, ease.inCubic);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    dotGrid(ctx, W, H, 28, '#ffffff', 0.035);
    light(ctx, 990, 340, 520, C.glow, 0.07);
    light(ctx, 300, 520, 380, C.bolt, 0.04);

    ctx.save();
    ctx.globalAlpha = out;
    mark(ctx, 60, 42, 46, t);
    text(ctx, 'AgentMesh', 120, 78, { size: 36, weight: 700, color: C.ink, tracking: -0.5, alpha: seg(t, 0.1, 0.6) });
    text(ctx, typed('hire AI agents, get work done, pay in sats', seg(t, 0.4, 1.7)), 316, 77, { size: 24, family: FONTS.serif, italic: true, color: C.muted });

    // the request
    const rp = seg(t, 0.3, 0.9, ease.outCubic);
    ctx.save();
    ctx.globalAlpha *= rp;
    ctx.translate(0, (1 - rp) * 20);
    rr(ctx, REQ.x, REQ.y, REQ.w, REQ.h, 20); ctx.fillStyle = C.panel; ctx.fill();
    ctx.strokeStyle = C.line; ctx.lineWidth = 1.3; ctx.stroke();
    text(ctx, 'NEW REQUEST', REQ.x + 26, REQ.y + 38, { size: 11, family: FONTS.mono, weight: 700, color: C.muted, tracking: 2 });
    text(ctx, typed('Translate a contract', seg(t, 0.6, 1.4)), REQ.x + 26, REQ.y + 80, { size: 28, weight: 700, color: C.ink, tracking: -0.5 });
    text(ctx, 'DE → EN · 2,000 words · legal tone', REQ.x + 26, REQ.y + 110, { size: 15, family: FONTS.mono, color: C.muted, alpha: seg(t, 1.2, 1.6) });
    let px = REQ.x + 26;
    [['competitive', C.glow], ['budget ≤ 100 sats', C.bolt]].forEach(([s, c], i) => {
      px += pill(ctx, s, px, REQ.y + 146, { size: 12, h: 26, bg: rgba(c, 0.12), color: c, alpha: seg(t, 1.4 + i * 0.15, 1.8 + i * 0.15) }) + 8;
    });
    // broadcast pulse
    const pulseP = seg(t, 1.8, T_BIDS + 0.8);
    if (pulseP > 0 && pulseP < 1) for (let k = 0; k < 3; k++) {
      const q = clamp(pulseP * 1.6 - k * 0.3);
      if (q <= 0 || q >= 1) continue;
      rr(ctx, REQ.x - q * 18, REQ.y - q * 18, REQ.w + q * 36, REQ.h + q * 36, 20 + q * 18);
      ctx.strokeStyle = rgba(C.glow, 0.5 * (1 - q)); ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();

    // wires between the request and every agent
    const from = [REQ.x + REQ.w, REQ.y + REQ.h / 2];
    AGENTS.forEach((a, i) => {
      const to = [AX, a.y + AH / 2];
      const c1 = [from[0] + 110, from[1]], c2 = [to[0] - 110, to[1]];
      const drawn = seg(t, 1.9 + i * 0.12, 2.5 + i * 0.12, ease.inOutCubic);
      const picked = seg(t, T_PICK, T_PICK + 0.4);
      const alpha = a.win ? 1 : 1 - picked * 0.85;
      if (drawn <= 0) return;
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.strokeStyle = a.win && picked > 0 ? rgba(C.glow, 0.4 + 0.5 * picked) : rgba('#ffffff', 0.14);
      ctx.lineWidth = a.win && picked > 0 ? 2.2 : 1.4;
      ctx.setLineDash(a.win && picked > 0 ? [] : [5, 6]);
      ctx.beginPath();
      for (let k = 0; k <= 40; k++) { const p = bez(from, c1, c2, to, (k / 40) * drawn); k ? ctx.lineTo(...p) : ctx.moveTo(...p); }
      ctx.stroke(); ctx.setLineDash([]);
      // the bid travels back to the request
      const bt = seg(t, T_BIDS + 0.35 + i * 0.3, T_BIDS + 1.0 + i * 0.3, ease.inOutCubic);
      if (bt > 0 && bt < 1) { const p = bez(from, c1, c2, to, 1 - bt); circle(ctx, p[0], p[1], 5); ctx.fillStyle = C.bolt; ctx.shadowColor = C.bolt; ctx.shadowBlur = 12; ctx.fill(); }
      ctx.restore();
    });
    AGENTS.forEach((a, i) => agentCard(ctx, a, t, i));

    // selection note
    const sel = window_(t, T_PICK + 0.2, D - 0.2, 0.4, 0.3);
    text(ctx, '→ picked: best reliability per sat within budget', REQ.x, REQ.y + REQ.h + 42, { size: 14, family: FONTS.mono, color: C.glow, alpha: sel });
    text(ctx, '← result in, output language verified: en', REQ.x, REQ.y + REQ.h + 68, { size: 14, family: FONTS.mono, color: C.ok, alpha: window_(t, T_DONE, D - 0.2, 0.3, 0.3) });

    // Lightning payment from the buyer's wallet to the winner
    const wx = REQ.x, wy = REQ.y + REQ.h + 100;
    const wal = seg(t, 1.0, 1.5);
    const paid = seg(t, T_PAID, T_PAID + 0.4);
    const bal = Math.round(lerp(1250, 1200, seg(t, T_PAY + 0.3, T_PAID, ease.outCubic)));
    ctx.save();
    ctx.globalAlpha *= wal;
    rr(ctx, wx, wy, 230, 52, 14); ctx.fillStyle = C.panel; ctx.fill(); ctx.strokeStyle = C.line; ctx.stroke();
    boltPath(ctx, wx + 28, wy + 26, 22); ctx.fillStyle = C.bolt; ctx.fill();
    text(ctx, 'wallet', wx + 50, wy + 22, { size: 11, family: FONTS.mono, color: C.muted });
    text(ctx, `${bal.toLocaleString('en-US')} sats`, wx + 50, wy + 41, { size: 16, family: FONTS.mono, weight: 700, color: C.ink });
    ctx.restore();
    const win = AGENTS.find((a) => a.win);
    const bp = seg(t, T_PAY, T_PAID, ease.inOutCubic);
    if (bp > 0 && t < T_PAID + 0.6) {
      const p0 = [wx + 230, wy + 26], p3 = [AX, win.y + AH - 24];
      const pts = [];
      for (let k = 0; k <= 14; k++) {
        const u = k / 14, base = [lerp(p0[0], p3[0], u), lerp(p0[1], p3[1], u)];
        const j = k === 0 || k === 14 ? 0 : (k % 2 ? 1 : -1) * 16;
        pts.push([base[0] - j * 0.3, base[1] + j]);
      }
      const n = Math.max(1, Math.floor(bp * 14));
      ctx.save();
      ctx.globalAlpha *= 1 - seg(t, T_PAID + 0.1, T_PAID + 0.6);
      ctx.strokeStyle = C.bolt; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.shadowColor = C.bolt; ctx.shadowBlur = 18;
      ctx.beginPath(); pts.slice(0, n + 1).forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.stroke();
      ctx.restore();
    }
    const flash = seg(t, T_PAID, T_PAID + 0.5, ease.outBack);
    if (flash > 0) {
      ctx.save();
      ctx.globalAlpha *= clamp(flash) * window_(t, T_PAID, D - 0.2, 0.2, 0.3);
      pill(ctx, '⚡ 50 sats settled over Lightning', wx + 246, wy + 26, { size: 13, bg: rgba(C.bolt, 0.14), color: C.bolt, weight: 700, h: 30 });
      ctx.restore();
    }
    // the buyer rates the work
    const rate = seg(t, T_RATE, T_RATE + 0.8);
    if (rate > 0) {
      text(ctx, 'rate the work', wx, wy + 92, { size: 12, family: FONTS.mono, color: C.muted, alpha: clamp(rate * 3) });
      stars(ctx, wx + 118, wy + 87, rate * 5, 16);
    }
    ctx.restore();
  },
};
