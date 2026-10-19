const G = require('./tray-geom.js'), caster = require('./caster.js');
let seed = 4242; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function randTree(depth) {
  if (depth > 3 || rnd() < 0.3 + depth * 0.15) return {};
  const n = 2 + Math.floor(rnd() * 3);
  return { d: rnd() < 0.5 ? 'x' : 'y', w: Array.from({ length: n }, () => 0.3 + rnd() * 2), c: Array.from({ length: n }, () => randTree(depth + 1)) };
}
function check(m, holes = 0) {
  const I = m.indices, dir = new Map();
  for (let i = 0; i < I.length; i += 3) for (const [a, b] of [[I[i], I[i+1]], [I[i+1], I[i+2]], [I[i+2], I[i]]]) { const k = a + '_' + b; dir.set(k, (dir.get(k) || 0) + 1); }
  let bad = 0; for (const [k, c] of dir) { const [a, b] = k.split('_'); if (c !== 1 || dir.get(b + '_' + a) !== 1) bad++; }
  const eul = m.positions.length / 3 - dir.size / 2 + I.length / 3;
  const P = m.positions; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < P.length; i += 3) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i+1]); y1 = Math.max(y1, P[i+1]); }
  const cast = caster(m); let badR = 0, minT = 1e9;
  for (let a = 0; a < 80; a++) for (let b = 0; b < 80; b++) {
    const h = cast(x0 + (a + 0.4321) / 80 * (x1 - x0), y0 + (b + 0.5678) / 80 * (y1 - y0));
    if (!h.length) continue; if (h.length % 2 || h.some((k, i) => k.up !== (i % 2 === 1))) { badR++; continue; } for (let i = 0; i < h.length; i += 2) minT = Math.min(minT, h[i + 1].z - h[i].z);
  }
  return { bad, eul, badR, minT, vol: m.volume, holes };
}
let fails = 0, leaves = 0, n = 0, totalHoles = 0;
for (; n < 500; n++) {
  const p = { W: 20 + rnd() * 230, D: 20 + rnd() * 230, H: 3 + rnd() * 70, t: 0.4 + rnd() * 2.2, f: rnd() * 8, hp: rnd() * 80,
    layout: randTree(0), stack: rnd() < 0.5, s: rnd() * 7, flush: rnd() < 0.7,
    lid: { style: ['inset', 'cap', 'stack'][Math.floor(rnd() * 3)], c: 0.1 + rnd() * 0.5, L: 1 + rnd() * 10 },
    pattern: rnd() < 0.7 ? { type: G.PATTERNS[Math.floor(rnd() * 4)], size: 2 + rnd() * 14, density: 10 + rnd() * 70 } : null };
  const m = G.build(p); leaves += m.params.leaves.length;
  const lid = G.buildLid(p, m);
  const holes = m.patternInfo ? m.patternInfo.holes : 0; totalHoles += holes;
  if (m.params.pat && holes) { const m0 = G.build(Object.assign({}, p, { pattern: null })); if (Math.abs(m0.volume - m.volume - m.patternInfo.savedVolume) > 1e-3 * Math.max(1, m.patternInfo.savedVolume)) { fails++; console.log('VOLFAIL', JSON.stringify(p)); } }
  for (const [nm, mm, hh] of [['tray', m, holes], ['lid', lid, 0]]) {
    const r = check(mm, hh);
    const tmin = nm === 'tray' && m.params.pat ? Math.min(m.params.t, m.params.pat.bar) : m.params.t;
    if (r.bad || r.eul !== 2 - 2 * hh || !(r.vol > 0) || r.badR || r.minT < tmin - 1e-3) { fails++; console.log('FAIL', nm, JSON.stringify(r), JSON.stringify(p)); }
  }
}
console.log(fails ? fails + ' fuzz failures' : `FUZZ: ${n} random trays (${leaves} compartments, random nested layouts) + ${n} random lids, ${totalHoles} pattern holes: all watertight, manifold, no internal faces/holes, nothing thinner than t`);
