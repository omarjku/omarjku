// Orchestra: agents pick up unlocked tasks, report, submit; finishing work
// unlocks the next task; a human approves the milestone at the end.
import { clamp, lerp, ease, seg, rgba, mix, rr, circle, text, pill, light, dotGrid, FONTS, TAU, bez, window_, typed } from '../engine/lib.js';

const W = 1280, H = 640, D = 12;
const C = {
  bg: '#0b0e14', panel: '#121722', line: '#232a38', ink: '#e9edf5', muted: '#8b94a7',
  blue: '#2f6fed', purple: '#8b6cff', amber: '#f5a524', green: '#3fcf6e', red: '#ff6b6b',
};
const PEOPLE = {
  H: { name: "Hassan's Claude Code", c: C.purple },
  O: { name: "Omar's Claude Code", c: C.blue },
  J: { name: "John's agent", c: C.amber },
  S: { name: "Sara's agent", c: '#22c3c3' },
  L: { name: 'Layla (PM), a human', c: '#e9edf5' },
};
// x, y = card top-left. a/b = work start/end. who = worker.
const T = {
  'T-1': { title: 'Data model', x: 60, y: 168, a: 1.0, b: 2.7, who: 'H', deps: [] },
  'T-2': { title: 'Auth + roles', x: 60, y: 288, a: 1.2, b: 3.4, who: 'O', deps: [] },
  'T-4': { title: 'Brand + copy', x: 60, y: 470, a: 1.4, b: 5.6, who: 'J', deps: [] },
  'T-3': { title: 'REST + MCP', x: 262, y: 228, a: 3.7, b: 5.3, who: 'O', deps: ['T-1', 'T-2'] },
  'T-5': { title: 'Cost charts', x: 464, y: 168, a: 5.5, b: 7.0, who: 'S', deps: ['T-3'] },
  'T-6': { title: 'CI + staging', x: 464, y: 318, a: 5.6, b: 7.5, who: 'H', deps: ['T-3'] },
  'T-7': { title: 'Landing page', x: 464, y: 470, a: 6.1, b: 8.4, who: 'J', deps: ['T-3', 'T-4'] },
};
const CW = 168, CH = 62;
const MS = { x: 666, y: 318, w: 200, h: 96, deps: ['T-6', 'T-7'], ready: 8.75, approve: 9.7 };

const unlockAt = (id) => Math.max(0, ...T[id].deps.map((d) => T[d].b));

function bars(ctx, x, y, s, t) {
  // The Orchestra mark: three bars breathing, like the animated logo.svg.
  ctx.save();
  ctx.translate(x, y); ctx.scale(s / 24, s / 24);
  rr(ctx, 0, 0, 24, 24, 5.5); ctx.fillStyle = C.blue; ctx.fill();
  ctx.translate(4.2, 4.2); ctx.scale(0.65, 0.65);
  [[4, 13, 7, 0], [10.4, 8, 12, 0.6], [16.8, 4, 16, 1.2]].forEach(([bx, by, bh, d], i) => {
    const k = lerp(1, 0.55, 0.5 - 0.5 * Math.cos(TAU * ((t + d) / 1.8)));
    ctx.fillStyle = rgba('#ffffff', [1, 0.85, 0.7][i]);
    rr(ctx, bx, 20 - bh * k, 3.2, bh * k, 1.6); ctx.fill();
  });
  ctx.restore();
}

function avatar(ctx, x, y, who, t, working) {
  const p = PEOPLE[who];
  if (working > 0) {
    const r = 15 + 5 * (0.5 - 0.5 * Math.cos(TAU * t * 1.2));
    circle(ctx, x, y, r); ctx.strokeStyle = rgba(C.green, 0.65 * working); ctx.lineWidth = 2; ctx.stroke();
  }
  circle(ctx, x, y, 12); ctx.fillStyle = p.c; ctx.fill();
  text(ctx, who, x, y + 1, { size: 12, family: FONTS.sans, weight: 700, color: '#fff', align: 'center', baseline: 'middle' });
}

function lock(ctx, x, y, open, a) {
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.strokeStyle = C.muted; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y - 4 - open * 4, 5, Math.PI, 0); ctx.stroke();
  rr(ctx, x - 7, y - 3, 14, 11, 2.5); ctx.fillStyle = C.muted; ctx.fill();
  ctx.restore();
}

function check(ctx, x, y, s, p, color = C.green) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pts = [[x - s * 0.5, y], [x - s * 0.15, y + s * 0.35], [x + s * 0.55, y - s * 0.4]];
  const l1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
  const l2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
  const L = (l1 + l2) * clamp(p);
  ctx.beginPath(); ctx.moveTo(...pts[0]);
  if (L <= l1) ctx.lineTo(lerp(pts[0][0], pts[1][0], L / l1), lerp(pts[0][1], pts[1][1], L / l1));
  else { ctx.lineTo(...pts[1]); const k = (L - l1) / l2; ctx.lineTo(lerp(pts[1][0], pts[2][0], k), lerp(pts[1][1], pts[2][1], k)); }
  ctx.stroke();
  ctx.restore();
}

function edge(ctx, from, to, t, doneAt) {
  const p0 = [from.x + from.w, from.y + from.h / 2], p3 = [to.x, to.y + to.h / 2];
  const mx = (p0[0] + p3[0]) / 2;
  const p1 = [mx, p0[1]], p2 = [mx, p3[1]];
  ctx.save();
  ctx.strokeStyle = C.line; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(...p0); ctx.bezierCurveTo(...p1, ...p2, ...p3); ctx.stroke();
  // When the source finishes, a signal runs down the edge and leaves it lit.
  const k = seg(t, doneAt, doneAt + 0.45, ease.inOutCubic);
  if (k > 0) {
    const pts = [];
    for (let i = 0; i <= 40; i++) pts.push(bez(p0, p1, p2, p3, (i / 40) * k));
    ctx.strokeStyle = rgba(C.green, 0.75); ctx.lineWidth = 2.4;
    ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q))); ctx.stroke();
    if (k < 1) { const q = pts[pts.length - 1]; circle(ctx, q[0], q[1], 5); ctx.fillStyle = C.green; ctx.shadowColor = C.green; ctx.shadowBlur = 14; ctx.fill(); }
  }
  ctx.restore();
}

function card(ctx, id, n, t) {
  const un = unlockAt(id);
  const unlocked = seg(t, un, un + 0.35);
  const work = seg(t, n.a, n.b);
  const done = seg(t, n.b, n.b + 0.3, ease.outCubic);
  const active = n.a <= t && t < n.b;
  ctx.save();
  rr(ctx, n.x, n.y, CW, CH, 12);
  ctx.fillStyle = mix(C.panel, '#0f2a1b', done * 0.7); ctx.fill();
  ctx.strokeStyle = done > 0 ? rgba(C.green, 0.4 + 0.3 * done) : active ? rgba(PEOPLE[n.who].c, 0.8) : C.line;
  ctx.lineWidth = active ? 1.6 : 1; ctx.stroke();
  ctx.globalAlpha *= lerp(0.45, 1, unlocked);
  text(ctx, id, n.x + 14, n.y + 22, { size: 12, family: FONTS.mono, weight: 600, color: C.muted });
  text(ctx, n.title, n.x + 14, n.y + 46, { size: 16, family: FONTS.sans, weight: 600, color: C.ink });
  ctx.restore();
  // status at the top right: lock → progress ring → check
  const sx = n.x + CW - 24, sy = n.y + 20;
  if (unlocked < 1) lock(ctx, sx, sy + 2, unlocked, 1 - unlocked);
  if (work > 0 && done <= 0) {
    circle(ctx, sx, sy + 2, 8); ctx.strokeStyle = C.line; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy + 2, 8, -Math.PI / 2, -Math.PI / 2 + TAU * work);
    ctx.strokeStyle = PEOPLE[n.who].c; ctx.stroke();
  }
  if (done > 0) check(ctx, sx, sy + 2, 14, done);
  // the agent working on it
  const ap = seg(t, n.a - 0.35, n.a, ease.outBack);
  if (ap > 0) {
    ctx.save();
    ctx.globalAlpha *= clamp(ap);
    avatar(ctx, n.x + CW - 22, n.y + CH - 4, n.who, t, active ? 1 : 0);
    ctx.restore();
  }
}

function milestone(ctx, t) {
  const ready = seg(t, MS.ready, MS.ready + 0.4);
  const ok = seg(t, MS.approve, MS.approve + 0.4, ease.outBack);
  const { x, y, w, h } = MS;
  ctx.save();
  if (ok > 0) { ctx.shadowColor = rgba(C.green, 0.6); ctx.shadowBlur = 30 * ok; }
  rr(ctx, x, y, w, h, 16);
  ctx.fillStyle = mix(C.panel, '#0f2a1b', ok * 0.8); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.setLineDash(ok > 0 ? [] : [6, 6]);
  ctx.strokeStyle = ok > 0 ? C.green : ready > 0 ? C.amber : C.line; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.setLineDash([]);
  text(ctx, 'MILESTONE M-2', x + 16, y + 26, { size: 11, family: FONTS.mono, weight: 700, color: C.muted, tracking: 1.5 });
  text(ctx, 'Launch', x + 16, y + 54, { size: 22, weight: 700, color: C.ink });
  const label = ok > 0 ? 'approved · Layla (PM)' : ready > 0 ? 'ready for review' : 'waiting on T-6, T-7';
  text(ctx, label, x + 16, y + 80, { size: 13, family: FONTS.mono, weight: 500, color: ok > 0 ? C.green : ready > 0 ? C.amber : C.muted });
  ctx.restore();
  // The approve button and a human cursor clicking it.
  const bp = seg(t, MS.ready + 0.2, MS.ready + 0.6, ease.outBack);
  if (bp > 0 && ok < 1) {
    const bx = x + 28, by = y + h + 18;
    ctx.save();
    ctx.globalAlpha *= clamp(bp) * (1 - ok);
    const press = seg(t, MS.approve - 0.12, MS.approve, ease.outQuad) * (1 - seg(t, MS.approve, MS.approve + 0.15));
    ctx.translate(bx + 60, by + 18); ctx.scale(1 - 0.06 * press, 1 - 0.06 * press); ctx.translate(-(bx + 60), -(by + 18));
    rr(ctx, bx, by, 120, 36, 10); ctx.fillStyle = C.green; ctx.fill();
    text(ctx, 'Approve', bx + 60, by + 19, { size: 15, family: FONTS.sans, weight: 700, color: '#06210f', align: 'center', baseline: 'middle' });
    ctx.restore();
  }
  const cm = seg(t, MS.ready + 0.4, MS.approve - 0.1, ease.inOutCubic);
  if (cm > 0 && t < MS.approve + 0.9) {
    const cx = lerp(x + w + 120, x + 96, cm), cy = lerp(y + h + 120, y + h + 40, cm);
    ctx.save();
    ctx.globalAlpha *= 1 - seg(t, MS.approve + 0.5, MS.approve + 0.9);
    ctx.translate(cx, cy);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 22); ctx.lineTo(6, 16); ctx.lineTo(11, 26); ctx.lineTo(15, 24); ctx.lineTo(10, 15); ctx.lineTo(18, 15); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }
  if (ok > 0) check(ctx, x + w - 26, y + 24, 16, seg(t, MS.approve + 0.1, MS.approve + 0.5));
}

// Developer check in the terminal, as Claude Code shows it before an update.
function terminal(ctx, t) {
  const a = 2.85, b = 3.75;
  const p = window_(t, a, b, 0.2, 0.2);
  if (p <= 0) return;
  const x = 196, y = 392, w = 300, h = 128;
  ctx.save();
  ctx.globalAlpha *= p;
  ctx.translate(0, (1 - p) * 10);
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 30;
  rr(ctx, x, y, w, h, 12); ctx.fillStyle = '#05070b'; ctx.fill();
  ctx.shadowBlur = 0; ctx.strokeStyle = C.line; ctx.stroke();
  const L = (s, i, c = C.muted, wgt = 500) => text(ctx, s, x + 16, y + 26 + i * 20, { size: 12.5, family: FONTS.mono, weight: wgt, color: c });
  L('orchestra - submit_task (MCP)', 0, C.ink, 600);
  L('task_id: "T-2"', 1);
  L('Do you want to proceed?', 2, C.ink);
  const yes = t > a + 0.5;
  L(`${yes ? '❯' : ' '} 1. Yes`, 3, yes ? C.green : C.muted, 700);
  L('  3. No, and tell Claude why', 4);
  ctx.restore();
}

const FEED = [
  [1.0, 'H', 'start_task', 'T-1'], [1.2, 'O', 'start_task', 'T-2'], [1.4, 'J', 'start_task', 'T-4'],
  [2.7, 'H', 'submit_task', 'T-1'], [3.4, 'O', 'submit_task', 'T-2'], [3.7, 'O', 'start_task', 'T-3'],
  [5.3, 'O', 'submit_task', 'T-3'], [5.5, 'S', 'start_task', 'T-5'], [5.6, 'J', 'submit_task', 'T-4'],
  [5.6, 'H', 'start_task', 'T-6'], [6.1, 'J', 'start_task', 'T-7'], [7.0, 'S', 'submit_task', 'T-5'],
  [7.5, 'H', 'submit_task', 'T-6'], [8.4, 'J', 'submit_task', 'T-7'], [9.75, 'L', 'approved', 'M-2'],
];

function feed(ctx, t) {
  const x = 906, y = 120, w = 334, h = 470;
  rr(ctx, x, y, w, h, 18); ctx.fillStyle = rgba('#ffffff', 0.025); ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.06); ctx.lineWidth = 1; ctx.stroke();
  text(ctx, 'ACTIVITY', x + 20, y + 32, { size: 11, family: FONTS.mono, weight: 700, color: C.muted, tracking: 2 });
  pill(ctx, 'live', x + w - 20, y + 28, { size: 11, align: 'right', dot: C.green, bg: rgba(C.green, 0.12), color: C.green, h: 22, pad: 9 });
  const shown = FEED.filter(([at]) => t >= at);
  const rows = shown.slice(-8).reverse();
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y + 48, w, h - 52); ctx.clip();
  rows.forEach(([at, who, tool, id], i) => {
    const k = seg(t, at, at + 0.3, ease.outCubic);
    const ry = y + 76 + i * 50 + (i === 0 ? (1 - k) * -14 : 0);
    ctx.save();
    ctx.globalAlpha *= i === 0 ? k : 1;
    circle(ctx, x + 32, ry + 6, 11); ctx.fillStyle = PEOPLE[who].c; ctx.fill();
    text(ctx, who, x + 32, ry + 7, { size: 11, family: FONTS.sans, weight: 700, color: who === 'L' ? '#0b0e14' : '#fff', align: 'center', baseline: 'middle' });
    text(ctx, PEOPLE[who].name, x + 54, ry + 2, { size: 13.5, family: FONTS.sans, weight: 600, color: C.ink });
    text(ctx, `${tool} · ${id}`, x + 54, ry + 21, { size: 12, family: FONTS.mono, weight: 500, color: tool === 'start_task' ? C.muted : C.green });
    ctx.restore();
  });
  ctx.restore();
}

export default {
  width: W, height: H, duration: D, fps: 30,
  draw(ctx, t) {
    const out = 1 - seg(t, D - 0.6, D, ease.inCubic);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    dotGrid(ctx, W, H, 28, '#ffffff', 0.035);
    light(ctx, 420, 360, 520, C.blue, 0.08);
    light(ctx, 1100, 120, 360, C.purple, 0.06);

    ctx.save();
    ctx.globalAlpha = out;
    bars(ctx, 60, 44, 44, t);
    text(ctx, 'Orchestra', 118, 78, { size: 36, weight: 700, color: C.ink, tracking: -0.5, alpha: seg(t, 0.1, 0.6) });
    text(ctx, typed("your team's AI agents, working in the open", seg(t, 0.4, 1.6)), 290, 77, { size: 24, family: FONTS.serif, italic: true, color: C.muted });

    const nodes = Object.fromEntries(Object.entries(T).map(([k, n]) => [k, { x: n.x, y: n.y, w: CW, h: CH }]));
    nodes.MS = { x: MS.x, y: MS.y, w: MS.w, h: MS.h };
    const appear = seg(t, 0.2, 0.9, ease.outCubic);
    ctx.save();
    ctx.globalAlpha *= appear;
    for (const [id, n] of Object.entries(T)) for (const d of n.deps) edge(ctx, nodes[d], nodes[id], t, T[d].b);
    for (const d of MS.deps) edge(ctx, nodes[d], nodes.MS, t, T[d].b);
    Object.entries(T).forEach(([id, n]) => card(ctx, id, n, t));
    milestone(ctx, t);
    ctx.restore();
    terminal(ctx, t);
    feed(ctx, t);

    // footer chips: what the board is made of
    const chips = ['MCP · 9 tools', 'locked until deps done', 'humans approve milestones'];
    let fx = 60;
    chips.forEach((c, i) => { fx += pill(ctx, c, fx, 604, { size: 12.5, alpha: seg(t, 0.8 + i * 0.15, 1.2 + i * 0.15), color: C.muted, bg: rgba('#ffffff', 0.05) }) + 10; });
    ctx.restore();
  },
};
