// Random-parameter fuzz test: node fuzz.js [count]
const G = require('./container-geom.js'), caster = require('./caster.js');
let seed = 9137; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rnd() * a.length)];
function topo(m) {
  const I = m.indices, dir = new Map();
  for (let i = 0; i < I.length; i += 3) for (const [a, b] of [[I[i], I[i + 1]], [I[i + 1], I[i + 2]], [I[i + 2], I[i]]]) { const k = a * 4194304 + b; dir.set(k, (dir.get(k) || 0) + 1); }
  let bad = 0; for (const [k, n] of dir) { const a = Math.floor(k / 4194304), b = k % 4194304; if (n !== 1 || dir.get(b * 4194304 + a) !== 1) bad++; }
  return { bad, eul: m.positions.length / 3 - dir.size / 2 + I.length / 3 };
}
function parity(m) {
  const cast = caster(m), b = G.bounds(m); let bad = 0;
  for (let a = 0; a < 50; a++) for (let c = 0; c < 50; c++) {
    const h = cast(b[0] + (a + 0.431) / 50 * (b[1] - b[0]), b[2] + (c + 0.587) / 50 * (b[3] - b[2]));
    if (h.length % 2 || h.some((k, i) => k.up !== (i % 2 === 1))) bad++;
  }
  return { bad, cast };
}
function intrusions(A, castB) {
  const P = A.positions; let n = 0;
  for (let i = 0; i < P.length; i += 3 * 3) { const h = castB(P[i] + 0.00137, P[i + 1] + 0.00071); for (let k = 0; k + 1 < h.length; k += 2) if (Math.min(P[i + 2] - h[k].z, h[k + 1].z - P[i + 2]) > 0.02) n++; }
  return n;
}
function deco(rw, rh) {
  const nx = Math.round(rw * 3) + 1, ny = Math.round(rh * 3) + 1, data = new Float32Array(nx * ny), cx = rnd() * rw, cy = rnd() * rh, R = 1 + rnd() * rh / 2;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const x = i / (nx - 1) * rw, y = j / (ny - 1) * rh; data[j * nx + i] = Math.max(R - Math.hypot(x - cx, y - cy), 0.8 - Math.abs(y - rh / 2) - (x < rw * 0.1 || x > rw * 0.9 ? 5 : 0)); }
  return { u: rnd(), z: rnd() * 80, w: rw, h: rh, depth: 0.3 + rnd() * 1.7, engrave: rnd() < 0.3, sdf: { nx, ny, data } };
}
const N = Number(process.argv[2]) || 150;
let fails = 0, tris = 0, lids = 0, stacks = 0;
const dump = (tag, p) => { if (process.env.DUMP) require('fs').writeFileSync(`${process.env.DUMP}/fail_${tag}_${Date.now()}.json`, JSON.stringify(p, (k, v) => v instanceof Float32Array ? Array.from(v) : v)); };
for (let n = 0; n < N; n++) {
  const shape = pick(G.SHAPES).id, W = 25 + rnd() * 150;
  const p = {
    shape, W, D: rnd() < 0.5 ? W * G.naturalAspect(shape) : 25 + rnd() * 150, H: 10 + rnd() * 100, R: rnd() * 15,
    t: 0.8 + rnd() * 2.4, tb: 0.6 + rnd() * 3, stack: rnd() < 0.4, sc: 0.1 + rnd() * 0.4,
    lid: { type: pick(G.LIDS), c: 0.1 + rnd() * 0.4, depth: 3 + rnd() * 14, top: 0.8 + rnd() * 2, pitch: 2.5 + rnd() * 4, sh: 4 + rnd() * 12 },
    texture: rnd() < 0.6 ? { type: pick(G.TEXTURES), size: 2 + rnd() * 14, depth: 0.2 + rnd() * 2 } : { type: 'none' },
    decos: rnd() < 0.4 ? Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => deco(5 + rnd() * 40, 4 + rnd() * 15)) : [],
    res: pick([0.8, 0.5])
  };
  let r;
  try { r = G.build(p); } catch (e) { fails++; console.log('THROW', e.message, JSON.stringify(Object.assign({}, p, { decos: p.decos.length }))); continue; }
  tris += r.container.indices.length / 3;
  const parts = [['container', r.container]]; if (r.lid) { parts.push(['lid', r.lid]); lids++; }
  const casts = {};
  for (const [nm, m] of parts) {
    const T = topo(m), oh = G.maxOverhang(m), pr = parity(m); casts[nm] = pr.cast;
    if (T.bad || T.eul !== 2 || !(m.volume > 0) || oh.deg > 45.05 || pr.bad) { fails++; dump('solid', p); console.log('FAIL', nm, JSON.stringify({ bad: T.bad, eul: T.eul, vol: m.volume, oh: oh.deg, parity: pr.bad }), JSON.stringify(Object.assign({}, p, { decos: p.decos.length }))); }
  }
  if (r.lid) {
    const pl = r.lidInfo.place, LA = pl.flip ? G.transformMesh(r.lid, { flip: true, dz: pl.z }) : G.transformMesh(r.lid, { dz: pl.z });
    const k = intrusions(LA, casts.container) + intrusions(r.container, caster(LA));
    if (k) { fails++; dump('lid', p); console.log('LID COLLISION', k, JSON.stringify(Object.assign({}, p, { decos: p.decos.length }))); }
  }
  if (r.params.stack) {
    stacks++;
    const up = G.transformMesh(r.container, { dz: r.stackOffset });
    const k = intrusions(up, casts.container) + intrusions(r.container, caster(up));
    if (k || r.stackOffset >= r.params.H) { fails++; dump('stack', p); console.log('STACK', k, r.stackOffset, JSON.stringify(Object.assign({}, p, { decos: p.decos.length }))); }
  }
}
console.log(fails ? `${fails} fuzz failures` : `FUZZ: ${N} random containers (${lids} lids, ${stacks} stackable, ${(tris / 1e6).toFixed(1)}M triangles): all closed, manifold, no self-overlap, nothing steeper than 45°, lids and stacks never collide`);
process.exit(fails ? 1 : 0);
