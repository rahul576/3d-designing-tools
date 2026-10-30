// Geometry tests for tray-geom.js  (node test-geom.js)
const G = require('./tray-geom.js');
const caster = require('./caster.js');

function topo(m) {
  const I = m.indices, V = m.positions.length / 3, F = I.length / 3, dir = new Map();
  for (let i = 0; i < I.length; i += 3) for (const [a, b] of [[I[i], I[i + 1]], [I[i + 1], I[i + 2]], [I[i + 2], I[i]]]) { const k = a + '_' + b; dir.set(k, (dir.get(k) || 0) + 1); }
  let bad = 0; for (const [k, n] of dir) { const [a, b] = k.split('_'); if (n !== 1 || dir.get(b + '_' + a) !== 1) bad++; }
  return { bad, euler: V - dir.size / 2 + F, F };
}
// shared checks for any closed z-monotone part
function solidChecks(m, tmin, label, fails, holes = 0) {
  const T = topo(m);
  if (T.bad) fails.push(`${label}: ${T.bad} non-manifold edges`);
  if (T.euler !== 2 - 2 * holes) fails.push(`${label}: euler ${T.euler} (expected ${2 - 2 * holes})`);
  if (!(m.volume > 0)) fails.push(`${label}: volume not positive`);
  const cast = caster(m), P = m.positions;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < P.length; i += 3) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); }
  let bad = 0, minT = 1e9; const n = 150;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    const x = x0 + (a + 0.4321 + 0.1 * Math.sin(a * 7.1 + b)) / n * (x1 - x0), y = y0 + (b + 0.5678 + 0.1 * Math.cos(b * 3.3 + a)) / n * (y1 - y0);
    const h = cast(x, y); if (!h.length) continue;
    if (h.length % 2 || h.some((k, i) => k.up !== (i % 2 === 1))) { bad++; continue; }
    for (let i = 0; i < h.length; i += 2) minT = Math.min(minT, h[i + 1].z - h[i].z);
  }
  if (bad) fails.push(`${label}: ${bad} rays with bad crossings`);
  if (minT < tmin - 1e-3) fails.push(`${label}: min thickness ${minT.toFixed(3)}`);
  return { T, cast, minT };
}
// min vertical gap (upper bottom - lower top) between two z-monotone parts, sampling given points
function minGap(castLo, castUp, pts) {
  let g = 1e9;
  for (const [x, y] of pts) { const lo = castLo(x, y), up = castUp(x, y); if (lo.length >= 2 && up.length >= 2) g = Math.min(g, up[0].z - lo[lo.length - 1].z); }
  return g;
}
// interval overlap (penetration depth) between two z-monotone parts
function maxOverlap(castA, castB, pts) {
  let o = -1e9;
  for (const [x, y] of pts) { const a = castA(x, y), b = castB(x, y);
    for (let i = 0; i + 1 < a.length; i += 2) for (let j = 0; j + 1 < b.length; j += 2) o = Math.max(o, Math.min(a[i + 1].z, b[j + 1].z) - Math.max(a[i].z, b[j].z)); }
  return o;
}
function samplePts(W, D, extra) {
  const pts = [];
  for (let a = 0; a < 140; a++) for (let b = 0; b < 140; b++) pts.push([-extra + (a + 0.37) / 140 * (W + 2 * extra), -extra + (b + 0.61) / 140 * (D + 2 * extra)]);
  // fine sweeps across all four walls
  for (let x = -extra; x < 8; x += 0.004) for (const y of [D * 0.37, D * 0.71]) { pts.push([x, y], [W - x, y]); }
  for (let y = -extra; y < 8; y += 0.004) for (const x of [W * 0.29, W * 0.63]) { pts.push([x, y], [x, D - y]); }
  return pts;
}
const shift = (m, dx, dy, dz) => G.transformMesh(m, { dx, dy, dz });

function run(params) {
  const fails = [];
  const m = G.build(params), q = m.params;
  const holes = m.patternInfo ? m.patternInfo.holes : 0;
  const { cast, minT, T } = solidChecks(m, q.pat ? Math.min(q.t, q.pat.bar) : q.t, 'tray', fails, holes);
  if (q.pat) {
    const m0 = G.build(Object.assign({}, params, { pattern: null }));
    const dv = m0.volume - m.volume, exp = m.patternInfo.savedVolume;
    if (!(holes > 0)) fails.push('pattern produced no holes');
    if (Math.abs(dv - exp) > 1e-3 * Math.max(1, exp)) fails.push(`pattern volume mismatch ${dv.toFixed(3)} vs ${exp.toFixed(3)}`);
  }
  let info = `tris=${T.F} ${(m.volume / 1000 * 1.24).toFixed(1)}g minT=${minT.toFixed(3)}` + (q.pat ? ` | ${q.pat.type}: ${holes} holes, saves ${(m.patternInfo.savedVolume / 1000 * 1.24).toFixed(1)}g` : '');
  const pts = samplePts(q.W, q.D, 2);

  if (q.stack) {
    const up = caster(shift(m, 0, 0, m.stackOffset));
    const g0 = minGap(cast, up, pts);
    const gLow = minGap(cast, caster(shift(m, 0, 0, m.stackOffset - 0.05)), pts);
    const ov = maxOverlap(cast, caster(shift(m, 0.3, 0, m.stackOffset)), pts);
    if (g0 < -1e-4) fails.push(`stack collide ${g0.toFixed(4)}`);
    if (g0 > 0.02) fails.push(`stack not resting ${g0.toFixed(3)}`);
    if (gLow >= 0) fails.push('stack could sink lower');
    if (!(ov > 0)) fails.push('stack has no lateral lock');
    // outer wall seam: where the upper tray reaches its full outline vs the lower tray's top
    const seam = m.stackOffset + q.s - q.H;
    if (q.flush && seam > q.wtop + 1e-6) fails.push(`flush seam too tall ${seam.toFixed(3)}`);
    if (q.flush && seam < -1e-6) fails.push('upper tray sinks below the rim line');
    info += ` | stack nests ${q.nest.toFixed(2)}, seam ${seam.toFixed(2)} mm${q.flush ? ' (flush)' : ''}`;
  }
  if (params.lid) {
    const lid = G.buildLid(params, m);
    const lq = { t: q.t };
    solidChecks(lid, q.t, 'lid', fails);
    const placed = lp => G.transformMesh(lid, Object.assign({ D: q.D }, lid.place, lp || {}));
    const castL = caster(placed());
    const g0 = minGap(cast, castL, pts);
    const ov0 = maxOverlap(cast, castL, pts);
    const gLow = maxOverlap(cast, caster(placed({ dz: -0.05 })), pts);
    if (ov0 > 1e-4) fails.push(`lid collides with tray (${ov0.toFixed(4)})`);
    if (lid.style === 'stack') {
      const ovS = maxOverlap(cast, caster(placed({ dx: 0.3 })), pts);
      if (!(ovS > 0)) fails.push('stack lid has no lateral lock');
    } else {
      const free = maxOverlap(cast, caster(placed({ dx: lid.c * 0.6 })), pts);
      const lock = maxOverlap(cast, caster(placed({ dx: lid.c + 0.08 })), pts);
      const lockY = maxOverlap(cast, caster(placed({ dy: lid.c + 0.08 })), pts);
      if (free > 1e-4) fails.push(`lid has no clearance (shift ${(lid.c * 0.6).toFixed(2)} collides)`);
      if (!(lock > 0 && lockY > 0)) fails.push('lid can slide sideways off the tray');
    }
    if (!(gLow > 0)) fails.push('lid is not resting on the tray');
    info += ` | lid ${lid.style} ${(lid.volume / 1000 * 1.24).toFixed(1)}g` + (lid.warnings.length ? ` (${lid.warnings.join('; ')})` : '');
  }
  const ok = !fails.length;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${params.name || ''} ${q.W}x${q.D}x${q.H} t=${q.t} leaves=${q.leaves.length} hp=${q.hp.toFixed(1)} stack=${q.stack} | ${info}` +
    (q.warnings.length ? ` | warn: ${q.warnings.join('; ')}` : '') + (ok ? '' : '\n      -> ' + fails.join('\n      -> ')));
  return ok;
}

// custom layouts
const L = (d, w, c) => ({ d, w, c }), leaf = () => ({});
const tShape = L('y', [1, 1], [L('x', [1, 2, 1], [leaf(), leaf(), leaf()]), leaf()]);              // T-junctions
const nested = L('x', [2, 1], [L('y', [1, 1, 1], [leaf(), L('x', [1, 1], [leaf(), L('y', [1, 1], [leaf(), leaf()])]), leaf()]), L('y', [1, 3], [leaf(), leaf()])]);
const aligned = L('x', [1, 1], [L('y', [1, 1], [leaf(), leaf()]), L('y', [1, 1], [leaf(), leaf()])]);     // + junction from two subtrees
const nearAligned = L('x', [1, 1], [L('y', [1, 1], [leaf(), leaf()]), L('y', [1.02, 1], [leaf(), leaf()])]);
const cases = [
  { name: 'screenshot', W: 80, D: 160, H: 20, t: 1, f: 1, hp: 18, nx: 1, ny: 2 },
  { name: 'stack', W: 80, D: 160, H: 20, t: 0.8, f: 1, hp: 18, nx: 1, ny: 2, stack: true },
  { name: 'T-shape', W: 120, D: 90, H: 25, t: 0.8, f: 1.5, hp: 20, layout: tShape },
  { name: 'T-shape stack', W: 120, D: 90, H: 25, t: 0.8, f: 1.5, hp: 20, layout: tShape, stack: true },
  { name: 'nested', W: 150, D: 120, H: 30, t: 0.8, f: 2, hp: 24, layout: nested },
  { name: 'nested stack', W: 150, D: 120, H: 30, t: 0.8, f: 2, hp: 24, layout: nested, stack: true, s: 3 },
  { name: 'nested full-h', W: 150, D: 120, H: 30, t: 1.2, f: 0.5, hp: 30, layout: nested },
  { name: '+ aligned', W: 100, D: 100, H: 20, t: 0.8, f: 1, hp: 15, layout: aligned },
  { name: 'near aligned', W: 100, D: 100, H: 20, t: 0.8, f: 1, hp: 15, layout: nearAligned, stack: true },
  // lids
  { name: 'lid inset', W: 80, D: 160, H: 20, t: 0.8, f: 1, hp: 15, nx: 1, ny: 2, lid: { style: 'inset', c: 0.2, L: 4 } },
  { name: 'lid inset single', W: 50, D: 50, H: 30, t: 0.8, f: 2, nx: 1, ny: 1, lid: { style: 'inset', c: 0.25, L: 6 } },
  { name: 'lid inset short', W: 80, D: 160, H: 20, t: 0.8, f: 1, hp: 18, nx: 2, ny: 2, lid: { style: 'inset', c: 0.2, L: 4 } },
  { name: 'lid inset->cap', W: 80, D: 160, H: 20, t: 0.8, f: 1, hp: 20, layout: tShape, lid: { style: 'inset', c: 0.2, L: 4 } },
  { name: 'lid cap', W: 120, D: 90, H: 25, t: 0.8, f: 1.5, hp: 25, layout: tShape, lid: { style: 'cap', c: 0.2, L: 5 } },
  { name: 'lid cap stack', W: 80, D: 160, H: 20, t: 0.8, f: 1, hp: 18, nx: 1, ny: 2, stack: true, lid: { style: 'cap', c: 0.3, L: 6 } },
  { name: 'lid stacking', W: 80, D: 160, H: 20, t: 0.8, f: 1, hp: 18, nx: 1, ny: 2, stack: true, lid: { style: 'stack' } },
  { name: 'lid inset on stack', W: 100, D: 70, H: 30, t: 1, f: 3, hp: 20, layout: nested, stack: true, lid: { style: 'inset', c: 0.2, L: 5 } },
  // flush vs classic rim
  { name: 'stack classic rim', W: 80, D: 160, H: 20, t: 0.8, f: 1, hp: 16, nx: 1, ny: 2, stack: true, flush: false },
  { name: 'flush t=1.2 f=3', W: 100, D: 80, H: 30, t: 1.2, f: 3, hp: 24, layout: tShape, stack: true, s: 3.5 },
  { name: 'flush t=0.4 single', W: 60, D: 60, H: 25, t: 0.4, f: 1, nx: 1, ny: 1, stack: true },
  { name: 'flush + inset lid', W: 80, D: 160, H: 30, t: 0.8, f: 1, hp: 20, nx: 2, ny: 2, stack: true, lid: { style: 'inset', c: 0.2, L: 4 } },
  { name: 'flush + cap lid + hex', W: 80, D: 160, H: 30, t: 0.8, f: 1, hp: 20, nx: 1, ny: 2, stack: true, pattern: { type: 'hex', size: 6, density: 50 }, lid: { style: 'cap', c: 0.2, L: 5 } },
  // wall patterns
  { name: 'hex', W: 80, D: 160, H: 30, t: 0.8, f: 1, hp: 25, nx: 1, ny: 2, pattern: { type: 'hex', size: 6, density: 50 } },
  { name: 'circle', W: 80, D: 160, H: 30, t: 0.8, f: 1, hp: 25, nx: 1, ny: 2, pattern: { type: 'circle', size: 5, density: 40 } },
  { name: 'diamond stack', W: 120, D: 90, H: 25, t: 0.8, f: 1.5, hp: 20, layout: tShape, stack: true, pattern: { type: 'diamond', size: 5, density: 50 } },
  { name: 'slots stack+lid', W: 80, D: 160, H: 30, t: 0.8, f: 1, hp: 26, nx: 1, ny: 2, stack: true, pattern: { type: 'slots', size: 4, density: 50 }, lid: { style: 'stack' } },
  { name: 'hex nested+cap', W: 150, D: 120, H: 30, t: 1.2, f: 2, hp: 30, layout: nested, pattern: { type: 'hex', size: 8, density: 70 }, lid: { style: 'cap', c: 0.25, L: 6 } },
  { name: 'hex inset lid', W: 100, D: 100, H: 40, t: 0.8, f: 2, hp: 30, layout: aligned, pattern: { type: 'hex', size: 10, density: 60 }, lid: { style: 'inset', c: 0.2, L: 6 } },
  // v8: pattern on the inner walls (partitions) too
  { name: 'hex inner', W: 80, D: 160, H: 30, t: 0.8, f: 1, hp: 25, nx: 1, ny: 2, pattern: { type: 'hex', size: 6, density: 50, inner: true } },
  { name: 'circle inner 3x3', W: 120, D: 120, H: 30, t: 0.8, f: 1, hp: 28, nx: 3, ny: 3, pattern: { type: 'circle', size: 4, density: 40, inner: true } },
  { name: 'diamond inner T stack', W: 120, D: 90, H: 25, t: 0.8, f: 1.5, hp: 20, layout: tShape, stack: true, pattern: { type: 'diamond', size: 5, density: 50, inner: true } },
  { name: 'slots inner nested+cap', W: 150, D: 120, H: 30, t: 1.2, f: 2, hp: 30, layout: nested, pattern: { type: 'slots', size: 4, density: 50, inner: true }, lid: { style: 'cap', c: 0.25, L: 6 } },
  { name: 'hex inner near-aligned', W: 100, D: 100, H: 20, t: 0.8, f: 1, hp: 15, layout: nearAligned, stack: true, pattern: { type: 'hex', size: 3, density: 50, inner: true }, lid: { style: 'stack' } },
];
let all = true;
for (const c of cases) all = run(c) && all;
console.log(all ? '\nALL GEOMETRY TESTS PASSED' : '\nSOME TESTS FAILED');
process.exit(all ? 0 : 1);
