// Geometry tests for container-geom.js  (node test-geom.js)
const G = require('./container-geom.js');
const caster = require('./caster.js');

let fails = [], passes = 0;
const check = (cond, msg) => { if (cond) passes++; else fails.push(msg); };

function topo(m) {
  const I = m.indices, V = m.positions.length / 3, F = I.length / 3, dir = new Map();
  for (let i = 0; i < I.length; i += 3) for (const [a, b] of [[I[i], I[i + 1]], [I[i + 1], I[i + 2]], [I[i + 2], I[i]]]) { const k = a + '_' + b; dir.set(k, (dir.get(k) || 0) + 1); }
  let bad = 0; for (const [k, n] of dir) { const [a, b] = k.split('_'); if (n !== 1 || dir.get(b + '_' + a) !== 1) bad++; }
  return { bad, euler: V - dir.size / 2 + F, F };
}
// closed, manifold, positive volume, no self-overlap along vertical rays, no overhang beyond 45 degrees
function solid(m, label, tmin, rLim) {
  const T = topo(m);
  check(T.bad === 0, `${label}: ${T.bad} non-manifold edges`);
  check(T.euler === 2, `${label}: euler ${T.euler}`);
  check(m.volume > 0, `${label}: volume ${m.volume}`);
  const oh = G.maxOverhang(m);
  check(oh.deg <= 45.05, `${label}: overhang ${oh.deg.toFixed(2)} deg`);
  const cast = caster(m), b = G.bounds(m);
  let bad = 0, minT = 1e9; const n = 90;
  for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) {
    const x = b[0] + (a + 0.4321) / n * (b[1] - b[0]), y = b[2] + (c + 0.5678) / n * (b[3] - b[2]);
    const h = cast(x, y); if (!h.length) continue;
    if (h.length % 2 || h.some((k, i) => k.up !== (i % 2 === 1))) { bad++; continue; }
    if (rLim && Math.hypot(x - rLim[0], y - rLim[1]) > rLim[2]) continue;
    for (let i = 0; i < h.length; i += 2) minT = Math.min(minT, h[i + 1].z - h[i].z);
  }
  check(bad === 0, `${label}: ${bad} vertical rays with bad crossings (self-intersection)`);
  if (tmin) check(minT >= tmin - 1e-3, `${label}: thinnest horizontal layer ${minT.toFixed(3)} < ${tmin}`);
  return { cast, oh };
}
// points of mesh A that lie deeper than tol inside mesh B (vertical-ray parity)
function intrusions(A, castB, tol) {
  const P = A.positions; let n = 0, worst = 0;
  for (let i = 0; i < P.length; i += 3) {
    const h = castB(P[i] + 0.00137, P[i + 1] + 0.00071); if (h.length < 2 || h.length % 2) continue;
    for (let k = 0; k < h.length; k += 2) { const d = Math.min(P[i + 2] - h[k].z, h[k + 1].z - P[i + 2]); if (d > tol) { n++; worst = Math.max(worst, d); } }
  }
  return { n, worst };
}
const assembled = (r) => r.lidInfo.place.flip ? G.transformMesh(r.lid, { flip: true, dz: r.lidInfo.place.z }) : G.transformMesh(r.lid, { dz: r.lidInfo.place.z });

// a synthetic deco: ring + bar, sdf in mm
function synthDeco(w, h, u, z, depth, engrave) {
  const nx = Math.round(w * 4) + 1, ny = Math.round(h * 4) + 1, data = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = i / (nx - 1) * w - w / 2, y = j / (ny - 1) * h - h / 2;
    const ring = 1.2 - Math.abs(Math.hypot(x + w / 4, y) - h / 3);
    const bar = Math.min(1 - Math.abs(y), w / 4 - Math.abs(x - w / 6));
    data[j * nx + i] = Math.max(ring, bar);
  }
  return { u, z, w, h, depth, engrave, sdf: { nx, ny, data } };
}

/* 1) every shape x every lid: closed, support-free, lid fits without collision, stacking clears */
for (const s of G.SHAPES) for (const lid of G.LIDS) {
  const W = 70, D = Math.round(70 * G.naturalAspect(s.id) * 100) / 100;
  const r = G.build({ shape: s.id, W, D, H: 50, lid: { type: lid } }), q = r.params, label = `${s.id}/${lid}`;
  const { cast } = solid(r.container, label + ' container', Math.min(q.t, q.tb), lid === 'screw' ? [r.outline.cx, r.outline.cy, r.neck.Rni] : null);
  if (lid === 'none') { check(!r.lid, label + ' has no lid'); continue; }
  check(!!r.lid, label + ' lid built');
  solid(r.lid, label + ' lid (print orientation)');
  const Lb = G.bounds(r.lid); check(Math.abs(Lb[4]) < 1e-4, `${label}: lid sits on the bed (zmin ${Lb[4]})`);
  const LA = assembled(r), la = intrusions(LA, cast, 0.02), cl = intrusions(r.container, caster(LA), 0.02);
  check(la.n === 0 && cl.n === 0, `${label}: lid collides with container (${la.n} + ${cl.n} points, ${Math.max(la.worst, cl.worst).toFixed(3)} mm)`);
  if (lid === 'stack' || q.stack) {
    const up = G.transformMesh(r.container, { dz: r.stackOffset });
    const a = intrusions(up, cast, 0.02), b2 = intrusions(r.container, caster(up), 0.02);
    check(a.n === 0 && b2.n === 0, `${label}: stacked container collides (${a.n}+${b2.n})`);
    check(r.stackOffset < q.H - 1, `${label}: stacked container drops into the one below (offset ${r.stackOffset.toFixed(2)} vs H ${q.H})`);
  }
}

/* 2) stackable containers without a lid, flush and plain rims */
for (const t of [0.8, 1.6, 2.4]) for (const shape of ['round', 'rect', 'heart', 'star']) {
  const r = G.build({ shape, W: 90, D: 60, H: 40, t, stack: true, lid: { type: 'plug' } });
  const { cast } = solid(r.container, `stack ${shape} t${t}`, Math.min(t, r.params.tb));
  const up = G.transformMesh(r.container, { dz: r.stackOffset });
  const a = intrusions(up, cast, 0.02), b = intrusions(r.container, caster(up), 0.02);
  check(a.n + b.n === 0, `stack ${shape} t${t}: collision ${a.n}+${b.n} (${Math.max(a.worst, b.worst).toFixed(3)})`);
  const seat = r.params.H - r.stackOffset;
  check(seat > 1.5 && seat < 8, `stack ${shape} t${t}: foot drops ${seat.toFixed(2)} mm into the one below`);
}

/* 3) screw thread: neck and lid ridges never touch (radial clearance), lid ridges really engage */
for (const [shape, pitch] of [['round', 4], ['round', 3], ['hexagon', 5], ['square', 4], ['heart', 3.5]]) {
  const r = G.build({ shape, W: 80, D: 80 * G.naturalAspect(shape), H: 60, lid: { type: 'screw', pitch } });
  const n = r.neck, th = n.thread, L = r.lid;
  const LA = assembled(r);
  // radial distance of every assembled-lid inner vertex vs the neck surface at the same angle/height
  const P = LA.positions, o = r.outline; let minGap = 1e9, engaged = 0;
  for (let i = 0; i < P.length; i += 3) {
    const dx = P[i] - o.cx, dy = P[i + 1] - o.cy, rr = Math.hypot(dx, dy), z = P[i + 2];
    if (rr > n.Rl + 0.01 || rr < n.Rni || z < n.zn0 || z > r.params.H - 0.3) continue;
    const a = (Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI);
    const rn = n.Rno + th.td * G.helixAt(th, z, a, th.neck.z0, th.neck.PHI);
    minGap = Math.min(minGap, rr - rn);
    if (rr < n.Rno + th.td - 0.3) engaged++;
  }
  check(minGap >= th.cr * 0.8, `screw ${shape} p${pitch}: radial clearance ${minGap.toFixed(3)} < ${th.cr}`);
  check(engaged > 50, `screw ${shape} p${pitch}: lid ridges reach under the neck ridges (${engaged} points)`);
  check(r.lidInfo.turns >= 1.7, `screw ${shape} p${pitch}: at least one full turn (${r.lidInfo.turns.toFixed(2)})`);
}

/* 4) every texture: closed, support-free, really raised, walls never thinner */
for (const tex of G.TEXTURES.filter(t => t !== 'none')) for (const shape of ['round', 'square', 'flower']) for (const lid of ['plug', 'cap', 'screw']) {
  const r0 = G.build({ shape, W: 70, D: 70, H: 45, lid: { type: lid } });
  const r = G.build({ shape, W: 70, D: 70, H: 45, lid: { type: lid }, texture: { type: tex, size: 6, depth: 1 } });
  const { cast } = solid(r.container, `texture ${tex} ${shape} ${lid}`);
  check(r.container.volume > r0.container.volume * 1.02, `texture ${tex} ${shape}: adds material (${(r.container.volume / r0.container.volume).toFixed(3)})`);
  const la = intrusions(assembled(r), cast, 0.02);
  check(la.n === 0, `texture ${tex} ${shape} ${lid}: lid collides with textured container (${la.n})`);
}

/* 5) text / clipart relief (raised and engraved), also over a texture and around corners */
for (const [shape, tex] of [['round', 'none'], ['square', 'knurl'], ['heart', 'ribs'], ['hexagon', 'bricks']]) for (const engrave of [false, true]) {
  const decos = [synthDeco(40, 14, 0.75, 25, 1, engrave), synthDeco(20, 10, 0.1, 15, 0.8, engrave), synthDeco(30, 12, 0.98, 35, 1.2, engrave)];
  const r0 = G.build({ shape, W: 80, D: 80, H: 50, texture: { type: tex } });
  const r = G.build({ shape, W: 80, D: 80, H: 50, texture: { type: tex }, decos });
  solid(r.container, `deco ${shape} ${tex} ${engrave ? 'engraved' : 'raised'}`);
  if (tex === 'none') check(engrave ? r.container.volume < r0.container.volume : r.container.volume > r0.container.volume, `deco ${shape} ${tex}: volume moves the right way`);
}

/* 6) numbers: capacity of a plain round cup, mask -> sdf */
{
  const r = G.build({ shape: 'round', W: 100, D: 100, H: 80, t: 2, tb: 2, lid: { type: 'none' } });
  const ideal = Math.PI * 48 * 48 * 78;
  check(Math.abs(r.capacity - ideal) / ideal < 0.005, `round capacity ${r.capacity.toFixed(0)} vs ${ideal.toFixed(0)}`);
  check(Math.abs(r.container.volume - (Math.PI * 50 * 50 * 80 - ideal)) / r.container.volume < 0.01, 'round container volume matches the formula');
  const w = 60, h = 40, mask = new Uint8Array(w * h);
  for (let y = 10; y < 30; y++) for (let x = 10; x < 50; x++) mask[y * w + x] = 1;
  const g = G.maskToSdf(mask, w, h, 10);
  check(Math.abs(g.data[20 * w + 30] - 0.95) < 0.06, `sdf centre of a 2 mm-tall bar ${g.data[20 * w + 30]}`);
  check(Math.abs(g.data[20 * w + 5] + 0.45) < 0.06, `sdf outside ${g.data[20 * w + 5]}`);
}

/* 6b) outside size is exactly W x D for every shape (rounding must not shrink it); tiny screw lids fall back */
for (const s of G.SHAPES) for (const [W, R] of [[80, 6], [25, 6], [120, 20]]) {
  const D = Math.max(20, Math.round(W * G.naturalAspect(s.id) * 100) / 100), b = G.bounds(G.build({ shape: s.id, W, D, R, lid: { type: 'none' } }).container);
  check(Math.abs(b[1] - b[0] - W) < 0.05 && Math.abs(b[3] - b[2] - D) < 0.05, `${s.id} ${W}: outside ${(b[1] - b[0]).toFixed(2)} x ${(b[3] - b[2]).toFixed(2)} vs ${W} x ${D}`);
}
for (const shape of ['triangle', 'star', 'heart']) {
  const r = G.build({ shape, W: 22, D: 22 * G.naturalAspect(shape), lid: { type: 'screw' } });
  check(r.params.lid.type === 'plug' && r.warn.some(w => /screw/.test(w)), `${shape} 22 mm: screw lid falls back to push-fit with a warning`);
  check(G.maxOverhang(r.container).deg <= 45.05, `${shape} 22 mm: still support-free`);
}
{ const r = G.build({ shape: 'round', lid: { type: 'screw', depth: 6 } }); check(r.lidInfo.turns >= 1.7, `screw lid gets at least 1.75 turns (${r.lidInfo.turns.toFixed(2)})`); }

/* 7) export: STL size, 3MF zip */
{
  const r = G.build({ shape: 'star', lid: { type: 'cap' } });
  const stl = G.toSTL(r.container, 'x');
  check(stl.byteLength === 84 + 50 * r.container.indices.length / 3, 'STL byte length');
  const z = G.to3MF([{ name: 'Container', mesh: r.container }, { name: 'Lid', mesh: r.lid }], 't');
  check(z[0] === 0x50 && z[1] === 0x4b, '3MF is a zip');
}

console.log(fails.length ? fails.map(f => 'FAIL ' + f).join('\n') + `\n${fails.length} failures, ${passes} passed` : `ALL ${passes} GEOMETRY CHECKS PASSED`);
process.exit(fails.length ? 1 : 0);
