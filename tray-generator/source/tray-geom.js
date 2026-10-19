/* Tray geometry engine — exact, watertight, z-monotone tray + lid meshes.
 * Units: mm. X = width, Y = depth, Z = up.  Works in browser and Node.
 *
 * Every surface is a loft between rounded-rectangle contours that share the
 * same vertex layout, so results are closed and manifold without any CSG.
 *
 * Compartment layout is a tree of splits (any region can be split on its own):
 *   leaf  = {}                                   (one compartment)
 *   split = { d: 'x'|'y', w: [weights], c: [child nodes] }
 */
(function (root) {
  'use strict';
  const SQ2 = Math.SQRT2, PI = Math.PI, EPS = 1e-6, MIN_LEAF = 3;
  const PATTERNS = ['hex', 'circle', 'diamond', 'slots'];

  const DEFAULTS = {
    W: 80, D: 160, H: 20, t: 0.8, f: 1, hp: 18,
    layout: null, nx: 1, ny: 2,
    stack: false, s: 2.4, seg: 0,
    lid: null            // { style: 'inset'|'cap'|'stack', c: 0.2, L: 4 }
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r2 = v => Math.round(v * 100) / 100;

  /* ---------------- layout tree ---------------- */
  function gridTree(nx, ny) {
    nx = Math.max(1, Math.round(nx || 1)); ny = Math.max(1, Math.round(ny || 1));
    const leaves = n => Array.from({ length: n }, () => ({}));
    if (nx > 1 && ny > 1) return { d: 'x', w: Array(nx).fill(1), c: Array.from({ length: nx }, () => ({ d: 'y', w: Array(ny).fill(1), c: leaves(ny) })) };
    if (nx > 1) return { d: 'x', w: Array(nx).fill(1), c: leaves(nx) };
    if (ny > 1) return { d: 'y', w: Array(ny).fill(1), c: leaves(ny) };
    return {};
  }
  const isSplit = n => !!(n && (n.d === 'x' || n.d === 'y') && Array.isArray(n.c) && n.c.length >= 2);

  // returns { leaves:[{r:[x0,x1,y0,y1], path}], dividers:[...], hidden:bool }
  function layoutTree(tree, rect, t) {
    const leaves = [], dividers = []; let hidden = false;
    (function rec(node, r, path) {
      if (!isSplit(node)) { leaves.push({ r, path }); return; }
      const n = node.c.length, ax = node.d === 'x' ? 0 : 1;
      const lo = r[ax * 2], hi = r[ax * 2 + 1], avail = hi - lo - (n - 1) * t;
      const w = (Array.isArray(node.w) && node.w.length === n ? node.w : Array(n).fill(1)).map(v => Math.max(1e-6, Number(v) || 1));
      const sum = w.reduce((a, b) => a + b, 0), sizes = w.map(v => avail * v / sum);
      const other = ax === 0 ? [r[2], r[3]] : [r[0], r[1]];
      if (avail <= 0 || Math.min(...sizes) < MIN_LEAF || other[1] - other[0] < MIN_LEAF) { hidden = true; leaves.push({ r, path }); return; }
      let pos = lo;
      for (let i = 0; i < n; i++) {
        const cr = r.slice(); cr[ax * 2] = pos; cr[ax * 2 + 1] = i === n - 1 ? hi : pos + sizes[i];
        rec(node.c[i], cr, path === '' ? String(i) : path + '.' + i);
        if (i < n - 1) dividers.push({ path, i, ax, center: cr[ax * 2 + 1] + t / 2, from: other[0], to: other[1], lo, hi, sizes, t });
        pos = cr[ax * 2 + 1] + t;
      }
    })(tree, rect, '');
    return { leaves, dividers, hidden };
  }

  /* ---------------- parameter resolution ---------------- */
  function resolve(p) {
    const q = Object.assign({}, DEFAULTS, p || {});
    const warn = [];
    const num = (k, lo, hi) => {
      let v = Number(q[k]); if (!isFinite(v)) v = DEFAULTS[k];
      const c = clamp(v, lo, hi);
      if (Math.abs(c - v) > 1e-9) warn.push(`${k} limited to ${r2(c)}`);
      q[k] = c;
    };
    num('t', 0.4, 5); num('W', 10, 600); num('D', 10, 600); num('H', 0.1, 300);
    q.stack = !!q.stack;
    const t = q.t;
    q.tree = q.layout ? q.layout : gridTree(q.nx, q.ny);
    const lay = layoutTree(q.tree, [t, q.W - t, t, q.D - t], t);
    if (lay.hidden) warn.push('some partitions skipped – their compartments would be smaller than 3 mm');
    q.leaves = lay.leaves; q.dividers = lay.dividers;
    q.single = q.leaves.length === 1;
    let minW = 1e9, minD = 1e9;
    for (const L of q.leaves) { minW = Math.min(minW, L.r[1] - L.r[0]); minD = Math.min(minD, L.r[3] - L.r[2]); }
    q.minLeaf = Math.min(minW, minD);

    const fmax = Math.max(0.2, q.minLeaf / 2 - 0.3);
    num('f', 0.2, fmax);

    if (q.stack) {
      num('s', t + 0.4, Math.max(t + 0.4, q._quietH ? 8 : Math.min(8, Math.max(q.H, 6) / 3)));
      q.flush = q.flush !== false; q.wtop = q.flush ? Math.min(0.3, t / 2) : t;   // flat on top of the rim
      q.nest = q.s - q.wtop; q.cin = q.s + (SQ2 - 2) * t;
    } else { q.nest = 0; q.cin = 0; q.flush = false; q.wtop = t; }

    // stacking chamfer must fit inside the smallest wall-touching compartment
    if (q.stack) {
      let need = 1e9;
      for (const L of q.leaves) {
        const o = outerFlags(L.r, q);
        const w = L.r[1] - L.r[0], h = L.r[3] - L.r[2];
        const nx = (o[1] ? 1 : 0) + (o[3] ? 1 : 0), ny = (o[0] ? 1 : 0) + (o[2] ? 1 : 0);
        if (nx) need = Math.min(need, (w - 1.2) / nx);
        if (ny) need = Math.min(need, (h - 1.2) / ny);
      }
      if (q.cin > need) {
        q.cin = Math.max(0.2, need); q.s = q.cin - (SQ2 - 2) * t;
        if (q.s < t + 0.2) { q.stack = false; q.s = 0; q.cin = 0; q.nest = 0; warn.push('stacking disabled – compartments too small'); }
        else { q.nest = q.s - q.wtop; warn.push(`stack chamfer reduced to ${r2(q.s)} to fit small compartments`); }
      }
    }
    q.fb = q.f;

    const depth = Math.max(q.fb, q.stack ? q.cin : 0);
    const Hmin = t + depth + 1.5 + (q.stack ? q.nest : 0);
    if (q.H < Hmin) { if (!q._quietH) warn.push(`height raised to ${r2(Hmin)}`); q.H = Hmin; }
    // flush stacking: inner top edge chamfered at 45° from inset t (at zc) to inset wtop (at H)
    q.zc = q.stack && q.flush ? q.H - (t - q.wtop) : q.H;
    if (q.single) q.hp = q.H;
    else {
      const hpMax = q.stack ? q.H - q.nest - 0.2 : q.H, hpMin = t + depth + 0.5;
      let hp = Number(q.hp); if (!isFinite(hp)) hp = q.H;
      const c = clamp(hp, hpMin, Math.max(hpMin, hpMax));
      if (Math.abs(c - hp) > 1e-9) warn.push(q.stack && hp > hpMax ? `partition height limited to ${r2(c)} so trays can stack` : `partition height limited to ${r2(c)}`);
      q.hp = c;
    }
    q.N = q.seg > 0 ? Math.round(q.seg) : (q.f + t < 1.5 ? 6 : q.f + t < 4 ? 8 : 12);
    q.Nf = q.fb < 1 ? 3 : q.fb < 3 ? 6 : 8;
    // wall pattern
    const pt = q.pattern;
    if (pt && PATTERNS.includes(pt.type)) {
      const size = clamp(Number(pt.size) || 6, 2, 40), dens = clamp(Number(pt.density) || 50, 10, 80) / 100;
      const bmin = Math.max(1.0, 1.5 * t);
      let bar;
      if (pt.type === 'hex') bar = size * (1 / Math.sqrt(dens) - 1);
      else if (pt.type === 'circle') bar = size * (Math.sqrt(Math.min(0.9, PI / (2 * Math.sqrt(3))) / dens) - 1);
      else if (pt.type === 'diamond') bar = size * (1 / Math.sqrt(dens) - 1) / SQ2;
      else bar = size * (1 / dens - 1);
      q.pat = { type: pt.type, size, bar: Math.max(bmin, bar), barLimited: bar < bmin };
    } else q.pat = null;
    q.warnings = warn;
    return q;
  }
  function outerFlags(r, q) {   // B, R, T, L sides on the outer wall?
    return [r[2] <= q.t + EPS, r[1] >= q.W - q.t - EPS, r[3] >= q.D - q.t - EPS, r[0] <= q.t + EPS];
  }

  /* ---------------- contour helpers ---------------- */
  // b = [x0,x1,y0,y1]; corners 0=BL 1=BR 2=TR 3=TL; sides 0=B 1=R 2=T 3=L; CCW seen from +Z
  const snap = v => (Math.abs(v) < 1e-12 ? 0 : v);
  function arcPt(b, k, r, a) {
    const cx = (k === 0 || k === 3) ? b[0] + r : b[1] - r, cy = (k === 0 || k === 1) ? b[2] + r : b[3] - r;
    return [cx + r * snap(Math.cos(a)), cy + r * snap(Math.sin(a))];
  }
  function sidePt(b, s, u) { return s === 0 ? [u, b[2]] : s === 1 ? [b[1], u] : s === 2 ? [u, b[3]] : [b[0], u]; }
  function arcDesc(k, N) { const out = [], a0 = PI + k * PI / 2; for (let j = 0; j <= N; j++) out.push({ k, a: a0 + (j / N) * PI / 2 }); return out; }
  function contour(desc, b, r, z) {
    return desc.map(d => {
      let p;
      if (d.k !== undefined) p = arcPt(b, d.k, Array.isArray(r) ? r[d.k] : r, d.a);
      else {
        const rr = Array.isArray(r) ? Math.max(...r) : r, h = d.s === 0 || d.s === 2;
        p = sidePt(b, d.s, clamp(d.u, h ? b[0] + rr : b[2] + rr, h ? b[1] - rr : b[3] - rr));
      }
      return [p[0], p[1], z];
    });
  }

  /* ---------------- mesh assembly helpers ---------------- */
  function MeshBuilder() {
    const tris = [];
    const tri = (a, b, c) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
      if (x * x + y * y + z * z < 1e-16) return; tris.push(a, b, c);
    };
    return {
      tri,
      loftOut(L, U) { const n = L.length; for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(L[i], L[j], U[j]); tri(L[i], U[j], U[i]); } },
      loftIn(L, U) { const n = L.length; for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(L[i], U[j], L[j]); tri(L[i], U[i], U[j]); } },
      zipUp(E, C) { const n = E.length; for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(E[i], E[j], C[j]); tri(E[i], C[j], C[i]); } },
      fan(P, up) {
        let cx = 0, cy = 0; for (const p of P) { cx += p[0]; cy += p[1]; }
        const c = [cx / P.length, cy / P.length, P[0][2]], n = P.length;
        for (let i = 0; i < n; i++) { const j = (i + 1) % n; up ? tri(c, P[i], P[j]) : tri(c, P[j], P[i]); }
      },
      removeIf(pred) { const keep = []; for (let i = 0; i < tris.length; i += 3) if (!pred(tris[i], tris[i + 1], tris[i + 2])) keep.push(tris[i], tris[i + 1], tris[i + 2]); tris.length = 0; for (const v of keep) tris.push(v); },
      finish() {
        const map = new Map(), pos = [], idx = [];
        const vid = p => {
          const k = Math.round(p[0] * 1e5) + ',' + Math.round(p[1] * 1e5) + ',' + Math.round(p[2] * 1e5);
          let i = map.get(k); if (i === undefined) { i = pos.length / 3; map.set(k, i); pos.push(p[0], p[1], p[2]); } return i;
        };
        for (let i = 0; i < tris.length; i += 3) { const a = vid(tris[i]), b = vid(tris[i + 1]), c = vid(tris[i + 2]); if (a !== b && b !== c && a !== c) idx.push(a, b, c); }
        let vol = 0;
        for (let i = 0; i < idx.length; i += 3) {
          const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
          vol += (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6;
        }
        return { positions: new Float32Array(pos), indices: new Uint32Array(idx), volume: vol };
      }
    };
  }

  /* ---------------- compartment profiles ---------------- */
  function cupLevels(q) {
    const { t, fb, Nf, stack, cin } = q, ztop = q.single ? q.zc : q.hp, s = [ztop, t];
    for (let k = 0; k < Nf; k++) s.push(t + fb * (1 - Math.sin((k / Nf) * PI / 2)));
    if (stack) s.push(t + cin);
    return s.filter(z => z <= ztop + 1e-9 && z >= t - 1e-9).sort((a, b) => b - a).filter((z, i, a) => i === 0 || a[i - 1] - z > 1e-6);
  }
  function cupProfile(q, outer) {
    const { t, fb, f, stack, cin } = q;
    const roundIn = R => z => { if (R <= 0 || z >= t + R) return 0; const dz = t + R - z; return R - Math.sqrt(Math.max(R * R - dz * dz, 0)); };
    const chamIn = C => z => (z >= t + C ? 0 : C - (z - t));
    const prof = outer.map(o => (stack && o ? chamIn(cin) : roundIn(fb)));
    return z => {
      const i = prof.map(fn => fn(z));
      const rad = [Math.max(i[3], i[0]), Math.max(i[0], i[1]), Math.max(i[1], i[2]), Math.max(i[2], i[3])].map(m => Math.max(f - m, 0.05));
      return { i, rad };
    };
  }
  function cupsFit(q) {
    const lv = cupLevels(q);
    for (const L of q.leaves) {
      const pf = cupProfile(q, outerFlags(L.r, q)), cw = L.r[1] - L.r[0], ch = L.r[3] - L.r[2];
      for (const z of lv) {
        const { i, rad } = pf(z), w = cw - i[1] - i[3], h = ch - i[0] - i[2];
        if (w - rad[0] - rad[1] < 0.02 || w - rad[3] - rad[2] < 0.02 || h - rad[0] - rad[3] < 0.02 || h - rad[1] - rad[2] < 0.02) return false;
      }
    }
    return true;
  }


  /* ---------------- wall patterns ---------------- */
  // hole polygons (CCW in (u,z)) laid out in the zone [U0,U1]x[Z0,Z1]
  function patternHoles(pat, U0, U1, Z0, Z1) {
    const Wz = U1 - U0, Hz = Z1 - Z0, b = pat.bar, holes = [];
    if (Wz <= 0 || Hz <= 0) return holes;
    let w, h, px, pz, stagger = true, shape;
    if (pat.type === 'hex') { w = pat.size; const R = w / Math.sqrt(3); h = 2 * R; px = w + b; pz = px * Math.sqrt(3) / 2;
      shape = (cu, cz) => [30, 90, 150, 210, 270, 330].map(a => [cu + R * Math.cos(a * PI / 180), cz + R * Math.sin(a * PI / 180)]); }
    else if (pat.type === 'circle') { w = h = pat.size; px = w + b; pz = px * Math.sqrt(3) / 2; const n = w >= 10 ? 24 : w >= 4 ? 16 : 12;
      shape = (cu, cz) => Array.from({ length: n }, (_, k) => { const a = -PI / 2 + k * 2 * PI / n; return [cu + w / 2 * Math.cos(a), cz + w / 2 * Math.sin(a)]; }); }
    else if (pat.type === 'diamond') { w = h = pat.size; px = w + b * SQ2; pz = px / 2;
      shape = (cu, cz) => [[cu, cz - h / 2], [cu + w / 2, cz], [cu, cz + h / 2], [cu - w / 2, cz]]; }
    else { w = pat.size; h = Hz; px = w + b; pz = 1e9; stagger = false;
      if (h < 1.2 * w) return holes;
      shape = (cu, cz) => [[cu - w / 2, cz - h / 2 + w / 2], [cu, cz - h / 2], [cu + w / 2, cz - h / 2 + w / 2], [cu + w / 2, cz + h / 2 - w / 2], [cu, cz + h / 2], [cu - w / 2, cz + h / 2 - w / 2]]; }
    if (Wz < w || Hz < h) return holes;
    const rows = stagger ? Math.floor((Hz - h) / pz) + 1 : 1;
    const nE = Math.floor((Wz - w) / px) + 1;
    const z0 = Z0 + (Hz - ((rows - 1) * (stagger ? pz : 0) + h)) / 2 + h / 2;
    const u0 = U0 + (Wz - ((nE - 1) * px + w)) / 2 + w / 2;
    for (let r = 0; r < rows; r++) {
      const odd = stagger && (r % 2 === 1), n = odd ? nE - 1 : nE;
      for (let k = 0; k < n; k++) holes.push(shape(u0 + k * px + (odd ? px / 2 : 0), z0 + r * pz));
    }
    return holes;
  }
  const polyArea = P => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

  // Triangulate a rectangular wall panel with convex holes, conforming (no T-junctions).
  // fr = {ua,ub,za,zb,leftZ:[...],rightZ:[...]} (extra boundary points), zn = {U0,U1,Z0,Z1} hole zone.
  // Returns { tris: [[p,q,r]...] 2D, holes: augmented hole polygons }.
  function panelMesh(fr, zn, holesIn) {
    const Q = v => Math.round(v * 1e5) / 1e5;
    let holes = holesIn.map(hh => hh.map(p => [Q(p[0]), Q(p[1])]));
    let xs = [zn.U0, zn.U1]; for (const hh of holes) for (const p of hh) xs.push(p[0]);
    xs.sort((a, b) => a - b); xs = xs.filter((x, i, a) => i === 0 || x - a[i - 1] > 1e-6);
    const snapU = u => { let lo = 0, hi = xs.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] < u) lo = m; else hi = m; } return Math.abs(xs[lo] - u) <= Math.abs(xs[hi] - u) ? xs[lo] : xs[hi]; };
    holes = holes.map(hh => hh.map(p => [snapU(p[0]), p[1]]).filter((p, i, a) => { const q = a[(i + a.length - 1) % a.length]; return Math.abs(p[0] - q[0]) > 1e-9 || Math.abs(p[1] - q[1]) > 1e-9; }));
    const xIndex = new Map(xs.map((x, i) => [x, i]));
    const aug = holes.map(hh => {
      const out = [];
      for (let i = 0; i < hh.length; i++) {
        const a = hh[i], b = hh[(i + 1) % hh.length]; out.push(a);
        if (a[0] === b[0]) continue;
        const ia = xIndex.get(a[0]), ib = xIndex.get(b[0]), st = ia < ib ? 1 : -1;
        for (let k = ia + st; k !== ib; k += st) { const x = xs[k]; out.push([x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])]); }
      }
      return out;
    });
    // vertices on each vertical line, and per-strip lower/upper edges of each hole
    const V = xs.map(() => []);
    const strips = xs.map(() => new Map());
    aug.forEach((hh, hi) => {
      for (let i = 0; i < hh.length; i++) {
        const a = hh[i], b = hh[(i + 1) % hh.length];
        V[xIndex.get(a[0])].push(a[1]);
        if (a[0] === b[0]) continue;
        const ia = xIndex.get(a[0]), ib = xIndex.get(b[0]), k = Math.min(ia, ib);
        const e = strips[k].get(hi) || {}; 
        if (ia < ib) e.lo = [a[1], b[1]]; else e.up = [b[1], a[1]];
        strips[k].set(hi, e);
      }
    });
    const tris = [];
    const fanPoly = P => {
      let cx = 0, cz = 0; for (const p of P) { cx += p[0]; cz += p[1]; } const c = [cx / P.length, cz / P.length];
      for (let i = 0; i < P.length; i++) tris.push([c, P[i], P[(i + 1) % P.length]]);
    };
    for (let k = 0; k + 1 < xs.length; k++) {
      const xa = xs[k], xb = xs[k + 1];
      const hs = [...strips[k].values()].filter(e => e.lo && e.up).sort((p, q) => (p.lo[0] + p.lo[1]) - (q.lo[0] + q.lo[1]));
      let cur = [zn.Z0, zn.Z0];
      const piece = (bot, top) => {
        const P = [[xa, bot[0]], [xb, bot[1]]];
        for (const z of V[k + 1].filter(z => z > bot[1] + 1e-9 && z < top[1] - 1e-9).sort((a, b) => a - b)) P.push([xb, z]);
        P.push([xb, top[1]], [xa, top[0]]);
        for (const z of V[k].filter(z => z > bot[0] + 1e-9 && z < top[0] - 1e-9).sort((a, b) => b - a)) P.push([xa, z]);
        fanPoly(P);
      };
      for (const e of hs) { piece(cur, e.lo); cur = e.up; }
      piece(cur, [zn.Z1, zn.Z1]);
    }
    // frame between panel rectangle and hole zone: four monotone zips
    const zip = (A, B, ax) => {     // A,B chains sorted along axis ax
      let i = 0, j = 0;
      while (i < A.length - 1 || j < B.length - 1) {
        if (j >= B.length - 1 || (i < A.length - 1 && A[i + 1][ax] <= B[j + 1][ax])) { tris.push([A[i], A[i + 1], B[j]]); i++; }
        else { tris.push([A[i], B[j + 1], B[j]]); j++; }
      }
    };
    const { ua, ub, za, zb } = fr, { U0, U1, Z0, Z1 } = zn;
    zip([[ua, za], [ub, za]], xs.map(x => [x, Z0]), 0);
    zip([[ua, zb], [ub, zb]], xs.map(x => [x, Z1]), 0);
    zip([[ua, za], ...fr.leftZ.map(z => [ua, z]), [ua, zb]], [[U0, Z0], [U0, Z1]], 1);
    zip([[ub, za], ...fr.rightZ.map(z => [ub, z]), [ub, zb]], [[U1, Z0], [U1, Z1]], 1);
    return { tris, holes: aug };
  }

  // cut the pattern into every straight outer-wall segment (one per wall-touching compartment)
  function applyPattern(M, q, cells, levels) {
    const { W, D, H, t, f, pat } = q;
    const z1 = levels.length > 1 ? levels[1] : q.t, zo0 = q.stack ? q.s : 0;
    const hpPt = !q.single && q.hp < q.zc - 1e-9 ? [q.hp] : [];
    const bord = clamp(pat.bar, Math.max(1.5, 1.5 * t), 3), mU = bord, mZ = bord, mTop = Math.max(2, bord);   // solid frame around the holes
    const P = (side, inner, u, z) => side === 0 ? [u, inner ? t : 0, z] : side === 1 ? [inner ? W - t : W, u, z] : side === 2 ? [u, inner ? D - t : D, z] : [inner ? t : 0, u, z];
    const outSign = [1, 1, -1, -1];
    let holeCount = 0, openArea = 0, panelArea = 0, holeHeight = 0;
    for (const C of cells) for (let side = 0; side < 4; side++) {
      if (!C.o[side]) continue;
      const r = C.r, horiz = side === 0 || side === 2;
      const ua = (horiz ? r[0] : r[2]) + f, ub = (horiz ? r[1] : r[3]) - f;
      const zn = { U0: ua + mU, U1: ub - mU, Z0: Math.max(z1, zo0) + mZ, Z1: Math.min(H, q.zc) - mTop };   // solid band under the rim (and under the flush-rim chamfer)
      panelArea += Math.max(0, ub - ua) * (H - zo0);
      const holes = patternHoles(pat, zn.U0, zn.U1, zn.Z0, zn.Z1);
      if (!holes.length) continue;
      const plane = (inner) => side === 0 ? (inner ? t : 0) : side === 1 ? (inner ? W - t : W) : side === 2 ? (inner ? D - t : D) : (inner ? t : 0);
      const coord = (v) => horiz ? v[1] : v[0], ucoord = v => horiz ? v[0] : v[1];
      const inRange = (v, inner) => Math.abs(coord(v) - plane(inner)) < 1e-7 && ucoord(v) >= ua - 1e-7 && ucoord(v) <= ub + 1e-7 && v[2] >= (inner ? z1 : zo0) - 1e-7 && v[2] <= (inner ? q.zc : H) + 1e-7;
      M.removeIf((a, b, c) => (inRange(a, false) && inRange(b, false) && inRange(c, false)) || (inRange(a, true) && inRange(b, true) && inRange(c, true)));
      for (const inner of [false, true]) {
        const fr = { ua, ub, za: inner ? z1 : zo0, zb: inner ? q.zc : H, leftZ: inner ? hpPt : [], rightZ: inner ? hpPt : [] };
        const { tris, holes: aug } = panelMesh(fr, zn, holes);
        const sign = inner ? -outSign[side] : outSign[side];
        for (let [a, b, c] of tris) {
          const ar = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
          if (ar < 0) [b, c] = [c, b];
          if (sign < 0) [b, c] = [c, b];
          M.tri(P(side, inner, a[0], a[1]), P(side, inner, b[0], b[1]), P(side, inner, c[0], c[1]));
        }
        if (!inner) {      // hole tubes (once)
          for (const hh of aug) {
            let cu = 0, cz = 0; for (const p of hh) { cu += p[0]; cz += p[1]; } cu /= hh.length; cz /= hh.length;
            for (let i = 0; i < hh.length; i++) {
              const a = hh[i], b = hh[(i + 1) % hh.length];
              const A = P(side, false, a[0], a[1]), B = P(side, false, b[0], b[1]), A2 = P(side, true, a[0], a[1]), B2 = P(side, true, b[0], b[1]);
              const C3 = P(side, false, cu, cz), mid = P(side, false, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
              const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [B2[0] - A[0], B2[1] - A[1], B2[2] - A[2]];
              const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
              const d = n[0] * (C3[0] - mid[0]) + n[1] * (C3[1] - mid[1]) + n[2] * (C3[2] - mid[2]);
              if (d > 0) { M.tri(A, B, B2); M.tri(A, B2, A2); } else { M.tri(A, B2, B); M.tri(A, A2, B2); }
            }
            holeCount++; openArea += Math.abs(polyArea(hh));
            { let lo = Infinity, hi = -Infinity; for (const p of hh) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); } holeHeight += hi - lo; }
          }
        }
      }
    }
    return { holes: holeCount, openArea, savedVolume: openArea * t, panelArea, holeHeight };
  }

  /* ---------------- tray ---------------- */
  function build(params) {
    const q = resolve(params);
    {
      let guard = 0, changed = false;
      while (!cupsFit(q) && guard++ < 60) {
        changed = true;
        if (q.f > 0.2 + 1e-9) q.f = Math.max(0.2, q.f * 0.85); else q.fb *= 0.7;
        q.fb = Math.min(q.fb, q.f); q.Nf = q.fb < 1 ? 3 : q.fb < 3 ? 6 : 8;
      }
      if (changed) q.warnings.push(`fillet reduced to ${r2(q.f)} to fit the small compartments`);
    }
    const { W, D, H, t, f, stack, s, hp, N } = q;
    const M = MeshBuilder();
    const ztop = q.single ? q.zc : hp;

    // per-leaf cell (compartment grown to partition centre lines) + corners
    const cells = q.leaves.map(L => {
      const r = L.r, o = outerFlags(r, q);
      const c = [o[3] ? r[0] : r[0] - t / 2, o[1] ? r[1] : r[1] + t / 2, o[0] ? r[2] : r[2] - t / 2, o[2] ? r[3] : r[3] + t / 2];
      return { r, o, c, corners: [[c[0], c[2]], [c[1], c[2]], [c[1], c[3]], [c[0], c[3]]], tray: [o[0] && o[3], o[0] && o[1], o[1] && o[2], o[2] && o[3]] };
    });
    // all junction points (cell corners), deduped
    const J = []; const jk = new Set();
    for (const C of cells) for (const p of C.corners) { const k = Math.round(p[0] * 1e5) + ',' + Math.round(p[1] * 1e5); if (!jk.has(k)) { jk.add(k); J.push(p); } }

    // inner-wall contour (Rin) descriptors: corner arcs + points along the walls
    const sideU = [[], [], [], []];
    for (const C of cells) {
      const r = C.r, o = C.o;
      if (o[0]) { if (!o[3]) sideU[0].push(r[0] + f, C.c[0]); if (!o[1]) sideU[0].push(r[1] - f, C.c[1]); }
      if (o[1]) { if (!o[0]) sideU[1].push(r[2] + f, C.c[2]); if (!o[2]) sideU[1].push(r[3] - f, C.c[3]); }
      if (o[2]) { if (!o[1]) sideU[2].push(r[1] - f, C.c[1]); if (!o[3]) sideU[2].push(r[0] + f, C.c[0]); }
      if (o[3]) { if (!o[2]) sideU[3].push(r[3] - f, C.c[3]); if (!o[0]) sideU[3].push(r[2] + f, C.c[2]); }
    }
    const R = [];
    for (let k = 0; k < 4; k++) {
      R.push(...arcDesc(k, N));
      const us = sideU[k].sort((a, b) => (k < 2 ? a - b : b - a)).filter((u, i, a) => i === 0 || Math.abs(u - a[i - 1]) > 1e-7);
      for (const u of us) R.push({ s: k, u });
    }

    const rinB = [t, W - t, t, D - t], rbMin = 0.2;
    const outerAt = z => {
      if (stack && z < s - 1e-12) { const d = s - z; return contour(R, [d, W - d, d, D - d], Math.max(f + t - d, rbMin), z); }
      return contour(R, [0, W, 0, D], f + t, z);
    };
    const zl = [0];
    if (stack) { const zs = s - (f + t - rbMin); if (zs > 1e-6 && zs < s - 1e-6) zl.push(zs); zl.push(s); }
    zl.push(H);
    const rings = zl.map(outerAt);
    M.fan(rings[0], false);
    for (let i = 0; i + 1 < rings.length; i++) M.loftOut(rings[i], rings[i + 1]);
    const zc = q.zc, rinTop = contour(R, rinB, f, zc);
    if (zc < H - 1e-9) {          // flush rim: narrow flat + inner 45° chamfer the next tray sits on
      const w = q.wtop, rimIn = contour(R, [w, W - w, w, D - w], f + t - w, H);
      M.zipUp(rings[rings.length - 1], rimIn);
      M.loftIn(rinTop, rimIn);
    } else M.zipUp(rings[rings.length - 1], rinTop);
    if (!q.single && hp < zc - 1e-9) M.loftIn(contour(R, rinB, f, hp), rinTop);

    // compartments
    const levels = cupLevels(q);
    for (const C of cells) {
      // cup descriptors: corner arcs + T-junction points on interior sides
      const desc = [], Emap = [];
      const cc = C.c;
      for (let k = 0; k < 4; k++) {
        for (const d of arcDesc(k, N)) { desc.push(d); Emap.push(C.tray[k] ? null : C.corners[k]); }
        if (C.o[k]) continue;
        const pts = J.filter(p => {
          if (k === 0) return Math.abs(p[1] - cc[2]) < 1e-6 && p[0] > cc[0] + 1e-6 && p[0] < cc[1] - 1e-6;
          if (k === 1) return Math.abs(p[0] - cc[1]) < 1e-6 && p[1] > cc[2] + 1e-6 && p[1] < cc[3] - 1e-6;
          if (k === 2) return Math.abs(p[1] - cc[3]) < 1e-6 && p[0] > cc[0] + 1e-6 && p[0] < cc[1] - 1e-6;
          return Math.abs(p[0] - cc[0]) < 1e-6 && p[1] > cc[2] + 1e-6 && p[1] < cc[3] - 1e-6;
        });
        pts.sort((a, b) => k === 0 ? a[0] - b[0] : k === 1 ? a[1] - b[1] : k === 2 ? b[0] - a[0] : b[1] - a[1]);
        for (const p of pts) { desc.push({ s: k, u: (k === 0 || k === 2) ? p[0] : p[1] }); Emap.push(p); }
      }
      const pf = cupProfile(q, C.o), r = C.r;
      const rs = levels.map(z => { const { i, rad } = pf(z); return contour(desc, [r[0] + i[3], r[1] - i[1], r[2] + i[0], r[3] - i[2]], rad, z); });
      for (let k = 0; k + 1 < rs.length; k++) M.loftIn(rs[k + 1], rs[k]);
      M.fan(rs[rs.length - 1], true);
      if (!q.single) {
        const top = rs[0];
        M.zipUp(Emap.map((e, i) => (e ? [e[0], e[1], ztop] : top[i])), top);
      }
    }
    const patternInfo = q.pat ? applyPattern(M, q, cells, levels) : null;
    if (q.pat && patternInfo && !patternInfo.holes) q.warnings.push('wall pattern does not fit – make holes smaller or the tray taller');
    if (q.pat && q.pat.barLimited) q.warnings.push(`pattern density limited so bars stay ≥ ${r2(q.pat.bar)} mm`);
    const m = M.finish();
    return Object.assign(m, { params: q, warnings: q.warnings, stackOffset: q.stack ? q.H - q.nest : q.H, kind: 'tray', patternInfo });
  }

  /* ---------------- lid ---------------- */
  // Returns lid mesh in print orientation + how to place it on the tray:
  //   place = { flip:true, z0 }  -> world = (x, D - y, z0 - z)   (inset / cap: plate printed face-down)
  //   place = { flip:false, z0 } -> world = (x, y, z + z0)        (stacking lid)
  function buildLid(params, trayMesh) {
    const tray = trayMesh || build(params);
    const q = tray.params, warn = [];
    const lp = Object.assign({ style: 'inset', c: 0.2, L: 4 }, (params && params.lid) || {});
    let style = lp.style;
    const c = clamp(Number(lp.c) || 0.2, 0.05, 1), t = q.t, f = q.f, W = q.W, D = q.D, H = q.H, N = q.N;
    if (style === 'stack' && !q.stack) { style = 'inset'; warn.push('stacking lid needs a stackable tray – using inset lid'); }
    if (style === 'inset') {
      const room = q.single ? H - t - 1 : H - q.hp - 0.3;
      if (room < 1) { style = 'cap'; warn.push('partitions reach the rim – using a cap lid instead of an inset lid'); }
    }
    let L = Number(lp.L) || 4;
    if (style === 'inset') {
      const Lmax = q.single ? H - t - 1 : H - q.hp - 0.3;
      if (L > Lmax) { warn.push(`lid skirt shortened to ${r2(Lmax)} mm to clear the partitions`); L = Lmax; }
      L = Math.max(1, L);
    } else if (style === 'cap') {
      const Lmax = H - (q.stack ? q.s : 0) - 0.5;
      if (L > Lmax) { warn.push(`lid skirt shortened to ${r2(Lmax)} mm`); L = Lmax; }
      L = Math.max(1, L);
    }
    const D4 = [...arcDesc(0, N), ...arcDesc(1, N), ...arcDesc(2, N), ...arcDesc(3, N)];
    const M = MeshBuilder(), tl = t;
    let place, footprint;
    if (style === 'inset') {
      const O = z => contour(D4, [0, W, 0, D], f + t, z);
      const So = z => contour(D4, [t + c, W - t - c, t + c, D - t - c], Math.max(f - c, 0.2), z);
      const Si = z => contour(D4, [2 * t + c, W - 2 * t - c, 2 * t + c, D - 2 * t - c], Math.max(f - c - t, 0.2), z);
      M.fan(O(0), false); M.loftOut(O(0), O(tl)); M.zipUp(O(tl), So(tl));
      M.loftOut(So(tl), So(tl + L)); M.zipUp(So(tl + L), Si(tl + L));
      M.loftIn(Si(tl), Si(tl + L)); M.fan(Si(tl), true);
      place = { flip: true, z0: H + tl }; footprint = [0, W, 0, D];
    } else if (style === 'cap') {
      const Ci = z => contour(D4, [-c, W + c, -c, D + c], f + t + c, z);
      const Co = z => contour(D4, [-c - t, W + c + t, -c - t, D + c + t], f + 2 * t + c, z);
      M.fan(Co(0), false); M.loftOut(Co(0), Co(tl + L)); M.zipUp(Co(tl + L), Ci(tl + L));
      M.loftIn(Ci(tl), Ci(tl + L)); M.fan(Ci(tl), true);
      place = { flip: true, z0: H + tl }; footprint = [-c - t, W + c + t, -c - t, D + c + t];
    } else {
      const lidTray = build({ W, D, t, f: q.f, H: 0.1, _quietH: true, layout: {}, stack: true, s: q.s, seg: q.seg, flush: q.flush });
      const m = lidTray;
      return Object.assign({}, m, { kind: 'lid', style, warnings: warn, place: { flip: false, z0: tray.stackOffset },
        footprint: [0, W, 0, D], height: m.params.H, L: 0, c: 0, stackOffset: m.params.H - m.params.nest });
    }
    const m = M.finish();
    return Object.assign(m, { kind: 'lid', style, warnings: warn, place, footprint, height: tl + L, L, c });
  }

  // apply a placement (flip / offset) to a mesh, returning a new mesh
  function transformMesh(mesh, { flip = false, z0 = 0, D = 0, dx = 0, dy = 0, dz = 0 } = {}) {
    const P = mesh.positions, out = new Float32Array(P.length);
    for (let i = 0; i < P.length; i += 3) {
      out[i] = P[i] + dx;
      out[i + 1] = (flip ? D - P[i + 1] : P[i + 1]) + dy;
      out[i + 2] = (flip ? z0 - P[i + 2] : P[i + 2] + z0) + dz;
    }
    return { positions: out, indices: mesh.indices, volume: mesh.volume };
  }
  function mergeMeshes(list) {
    let nv = 0, ni = 0; for (const m of list) { nv += m.positions.length; ni += m.indices.length; }
    const P = new Float32Array(nv), I = new Uint32Array(ni); let po = 0, io = 0, vo = 0;
    for (const m of list) { P.set(m.positions, po); for (let i = 0; i < m.indices.length; i++) I[io + i] = m.indices[i] + vo; po += m.positions.length; io += m.indices.length; vo += m.positions.length / 3; }
    return { positions: P, indices: I, volume: list.reduce((a, m) => a + m.volume, 0) };
  }

  /* ---------------- binary STL ---------------- */
  function toSTL(mesh, name) {
    const P = mesh.positions, I = mesh.indices, n = I.length / 3;
    let minx = Infinity, miny = Infinity, minz = Infinity;
    for (let i = 0; i < P.length; i += 3) { minx = Math.min(minx, P[i]); miny = Math.min(miny, P[i + 1]); minz = Math.min(minz, P[i + 2]); }
    const buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf), hdr = (name || 'tray').slice(0, 79);
    for (let i = 0; i < hdr.length; i++) dv.setUint8(i, hdr.charCodeAt(i) & 127);
    dv.setUint32(80, n, true);
    let o = 84;
    for (let i = 0; i < n; i++) {
      const a = I[3 * i] * 3, b = I[3 * i + 1] * 3, c = I[3 * i + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
      dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true); o += 12;
      for (const v of [a, b, c]) { dv.setFloat32(o, P[v] - minx, true); dv.setFloat32(o + 4, P[v + 1] - miny, true); dv.setFloat32(o + 8, P[v + 2] - minz, true); o += 12; }
      o += 2;
    }
    return buf;
  }



  /* ---------------- print time estimate ---------------- */
  // Printer presets: effective average extrusion speed (mm/s, includes acceleration losses),
  // per-layer overhead (layer change, travel, z-hop) and per hole-per-layer overhead (retract + travel).
  const PRINTERS = {
    fast:     { name: 'Fast – Bambu / Klipper',          speed: 130, layer: 1.0, hole: 0.15 },
    standard: { name: 'Standard – Prusa MK4 / shaping',  speed: 75,  layer: 1.6, hole: 0.25 },
    classic:  { name: 'Classic – Ender 3 / stock',       speed: 38,  layer: 2.6, hole: 0.40 }
  };
  // opts: { printer, layer (mm), nozzle (mm), factor }
  function printTime(mesh, opts) {
    const o = Object.assign({ printer: 'standard', layer: 0.2, nozzle: 0.4, factor: 1 }, opts || {});
    const pr = PRINTERS[o.printer] || PRINTERS.standard, lh = Math.max(0.05, o.layer), lw = o.nozzle * 1.05;
    const P = mesh.positions; let zmin = Infinity, zmax = -Infinity;
    for (let i = 2; i < P.length; i += 3) { zmin = Math.min(zmin, P[i]); zmax = Math.max(zmax, P[i]); }
    const layers = Math.ceil((zmax - zmin) / lh);
    const path = mesh.volume / (lh * lw);                         // mm of extruded line
    const speedScale = Math.min(1.6, Math.max(0.6, o.nozzle / 0.4)) * (lh / 0.2) ** 0.15;  // bigger nozzle / layers flow a bit faster
    const extrude = path / (pr.speed * speedScale);
    const layerT = layers * pr.layer;
    const holeT = mesh.patternInfo ? (mesh.patternInfo.holeHeight / lh) * pr.hole : 0;
    const raw = extrude + layerT + holeT;
    return { seconds: raw * (o.factor || 1), raw, extrude, layerT, holeT, layers, path };
  }
  function fmtTime(sec) {
    const m = Math.max(1, Math.round(sec / 60));
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
  }

  /* ---------------- 3MF (zip, stored) ---------------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zipStore(files) {   // files: [{name, data:Uint8Array}]
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    for (const f of files) {
      const nm = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0, true); h.setUint16(8, 0, true);
      h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true);
      h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), nm, f.data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0, true); c.setUint16(10, 0, true);
      c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true);
      c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), nm);
      off += 30 + nm.length + f.data.length;
    }
    const cdSize = central.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
    const all = [...parts, ...central, new Uint8Array(e.buffer)], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
    let o = 0; for (const a of all) { out.set(a, o); o += a.length; }
    return out;
  }
  // objects: [{ name, mesh }] (positions already placed); everything is shifted so the min corner is at 0
  function to3MF(objects, title) {
    let mx = Infinity, my = Infinity, mz = Infinity;
    for (const { mesh } of objects) { const P = mesh.positions; for (let i = 0; i < P.length; i += 3) { mx = Math.min(mx, P[i]); my = Math.min(my, P[i + 1]); mz = Math.min(mz, P[i + 2]); } }
    const num = v => String(Math.round(v * 1e5) / 1e5);
    const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    const chunks = [`<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n<metadata name="Title">${esc(title || 'Tray')}</metadata>\n<metadata name="Application">Tray Generator v7</metadata>\n<resources>\n`];
    objects.forEach(({ name, mesh }, k) => {
      const P = mesh.positions, I = mesh.indices, v = [], t = [];
      for (let i = 0; i < P.length; i += 3) v.push(`<vertex x="${num(P[i] - mx)}" y="${num(P[i + 1] - my)}" z="${num(P[i + 2] - mz)}"/>`);
      for (let i = 0; i < I.length; i += 3) t.push(`<triangle v1="${I[i]}" v2="${I[i + 1]}" v3="${I[i + 2]}"/>`);
      chunks.push(`<object id="${k + 1}" type="model" name="${esc(name)}"><mesh><vertices>\n${v.join('\n')}\n</vertices><triangles>\n${t.join('\n')}\n</triangles></mesh></object>\n`);
    });
    chunks.push('</resources>\n<build>\n' + objects.map((o, k) => `<item objectid="${k + 1}"/>`).join('\n') + '\n</build>\n</model>\n');
    const enc = new TextEncoder();
    return zipStore([
      { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>') },
      { name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>') },
      { name: '3D/3dmodel.model', data: enc.encode(chunks.join('')) }
    ]);
  }

  const api = { printTime, fmtTime, PRINTERS, to3MF, crc32, PATTERNS, panelMesh, build, buildLid, resolve, toSTL, transformMesh, mergeMeshes, gridTree, layoutTree, isSplit, DEFAULTS, MIN_LEAF };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrayGeom = api;
})(typeof window !== 'undefined' ? window : globalThis);
