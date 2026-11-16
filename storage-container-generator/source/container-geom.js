/* Storage container geometry engine: exact, watertight, support-free container + lid meshes.
 * Units: mm. X = width, Y = depth, Z = up. Works in the browser and in Node.
 *
 * Every part is a stack of closed rings that share one angle set around a centre
 * point (all shapes are star-shaped about their centre). Consecutive rings are
 * joined by quads and the first and last ring are closed by fans, so every part
 * is closed and manifold by construction, with no CSG.
 *
 * Printability: every surface that faces downward (except the bed face) leans
 * at most 45 degrees from vertical. Chamfers, shoulders and threads are built
 * at 45 degrees or steeper, and wall textures, text and clipart are filtered so
 * that the outer wall never moves outward faster than it rises.
 */
(function (root) {
  'use strict';
  const PI = Math.PI, TAU = 2 * PI, SQ2 = Math.SQRT2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r2 = v => Math.round(v * 100) / 100;

  /* ---------------- shapes ---------------- */
  // aspect = natural depth / width; corner = uses the corner radius
  const SHAPES = [
    { id: 'round', name: 'Round', aspect: 1, corner: false },
    { id: 'oval', name: 'Oval', aspect: 0.65, corner: false },
    { id: 'square', name: 'Square', aspect: 1, corner: true },
    { id: 'rect', name: 'Rectangle', aspect: 0.6, corner: true },
    { id: 'pill', name: 'Pill', aspect: 0.5, corner: false },
    { id: 'triangle', name: 'Triangle', aspect: 0, corner: true },
    { id: 'pentagon', name: 'Pentagon', aspect: 0, corner: true },
    { id: 'hexagon', name: 'Hexagon', aspect: 0, corner: true },
    { id: 'octagon', name: 'Octagon', aspect: 1, corner: true },
    { id: 'heart', name: 'Heart', aspect: 0, corner: true },
    { id: 'star', name: 'Star', aspect: 0, corner: true },
    { id: 'flower', name: 'Flower', aspect: 0, corner: false }
  ];
  const SHAPE = Object.fromEntries(SHAPES.map(s => [s.id, s]));
  const LIDS = ['none', 'plug', 'cap', 'screw', 'stack'];
  const TEXTURES = ['none', 'ribs', 'flutes', 'waves', 'twist', 'knurl', 'bricks', 'honeycomb', 'dots'];

  function ngon(n, rot) { const a = []; for (let k = 0; k < n; k++) { const t = rot + TAU * k / n; a.push([Math.cos(t), Math.sin(t)]); } return a; }
  function heartPts() {
    const a = [];
    for (let i = 0; i < 720; i++) { const t = TAU * i / 720, s = Math.sin(t); a.push([16 * s * s * s, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)]); }
    return a.reverse();   // make it counter-clockwise
  }
  function rawShape(id) {   // unit-ish outline, any scale, counter-clockwise, plus whether it is a sharp polygon
    switch (id) {
      case 'round': case 'oval': return { pts: ngon(720, 0), poly: false };
      case 'square': case 'rect': case 'pill': return { pts: [[-1, -1], [1, -1], [1, 1], [-1, 1]], poly: true };
      case 'triangle': return { pts: ngon(3, PI / 2), poly: true };
      case 'pentagon': return { pts: ngon(5, PI / 2), poly: true };
      case 'hexagon': return { pts: ngon(6, 0), poly: true };
      case 'octagon': return { pts: ngon(8, PI / 8), poly: true };
      case 'star': { const a = []; for (let k = 0; k < 10; k++) { const t = PI / 2 + PI * k / 5, r = k % 2 ? 0.5 : 1; a.push([r * Math.cos(t), r * Math.sin(t)]); } return { pts: a, poly: true }; }
      case 'flower': { const a = []; for (let i = 0; i < 1440; i++) { const t = TAU * i / 1440, r = 1 + 0.16 * Math.cos(6 * t + PI / 2); a.push([r * Math.cos(t), r * Math.sin(t)]); } return { pts: a, poly: false }; }
      case 'heart': return { pts: heartPts(), poly: false };
    }
    return rawShape('round');
  }
  function bbox(pts) { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [x0, x1, y0, y1]; }
  function naturalAspect(id) { const s = SHAPE[id] || SHAPE.round; if (s.aspect) return s.aspect; const b = bbox(rawShape(id).pts); return (b[3] - b[2]) / (b[1] - b[0]); }

  // classic tangent fillet at every vertex of a simple polygon (convex and concave corners)
  function fillet(pts, radii) {
    const n = pts.length, out = [];
    const tl = new Array(n), rr = new Array(n);
    for (let i = 0; i < n; i++) {
      const v = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
      const u1 = [a[0] - v[0], a[1] - v[1]], u2 = [b[0] - v[0], b[1] - v[1]], l1 = Math.hypot(...u1), l2 = Math.hypot(...u2);
      const cosA = clamp((u1[0] * u2[0] + u1[1] * u2[1]) / (l1 * l2), -1, 1), half = Math.acos(cosA) / 2;
      let r = Math.max(0, radii[i]), L = r / Math.tan(half);
      const Lmax = 0.499 * Math.min(l1, l2);
      if (L > Lmax) { L = Lmax; r = L * Math.tan(half); }
      tl[i] = L; rr[i] = r;
    }
    for (let i = 0; i < n; i++) {
      const v = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
      if (rr[i] < 1e-3) { out.push([v[0], v[1]]); continue; }
      const l1 = Math.hypot(a[0] - v[0], a[1] - v[1]), l2 = Math.hypot(b[0] - v[0], b[1] - v[1]);
      const u1 = [(a[0] - v[0]) / l1, (a[1] - v[1]) / l1], u2 = [(b[0] - v[0]) / l2, (b[1] - v[1]) / l2];
      const bis = [u1[0] + u2[0], u1[1] + u2[1]], bl = Math.hypot(...bis);
      const half = Math.acos(clamp(u1[0] * u2[0] + u1[1] * u2[1], -1, 1)) / 2;
      const c = [v[0] + bis[0] / bl * rr[i] / Math.sin(half), v[1] + bis[1] / bl * rr[i] / Math.sin(half)];
      const t1 = [v[0] + u1[0] * tl[i], v[1] + u1[1] * tl[i]], t2 = [v[0] + u2[0] * tl[i], v[1] + u2[1] * tl[i]];
      const s0 = Math.atan2(t1[1] - c[1], t1[0] - c[0]), s1 = Math.atan2(t2[1] - c[1], t2[0] - c[0]);
      let d = s1 - s0; while (d > PI) d -= TAU; while (d < -PI) d += TAU;
      const steps = Math.max(2, Math.ceil(Math.abs(d) / (PI / 60)), Math.ceil(Math.abs(d) * rr[i] / 0.3));
      for (let k = 0; k <= steps; k++) { const t = s0 + d * k / steps; out.push([c[0] + rr[i] * Math.cos(t), c[1] + rr[i] * Math.sin(t)]); }
    }
    return out;
  }
  function dedupe(pts, tol) {
    const out = [];
    for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > tol) out.push(p); }
    while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= tol) out.pop();
    return out;
  }
  function subdivide(pts, maxLen) {
    const out = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / maxLen));
      for (let j = 0; j < k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
    }
    return out;
  }
  function areaCentroid(pts) {
    let A = 0, cx = 0, cy = 0; const n = pts.length;
    for (let i = 0; i < n; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n], c = x0 * y1 - x1 * y0; A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c; }
    return { A: A / 2, cx: cx / (3 * A), cy: cy / (3 * A) };
  }

  /* ---------------- distance queries + ray offsets ---------------- */
  function segIndex(pts, margin) {
    const n = pts.length, X = new Float64Array(n + 1), Y = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) { X[i] = pts[i % n][0]; Y[i] = pts[i % n][1]; }
    const b = bbox(pts), x0 = b[0] - margin, y0 = b[2] - margin;
    let per = 0; for (let i = 0; i < n; i++) per += Math.hypot(X[i + 1] - X[i], Y[i + 1] - Y[i]);
    const h = Math.max(0.5, Math.sqrt((b[1] - b[0] + 2 * margin) * (b[3] - b[2] + 2 * margin) / 3000));
    const gx = Math.ceil((b[1] - b[0] + 2 * margin) / h) + 1, gy = Math.ceil((b[3] - b[2] + 2 * margin) / h) + 1;
    const cells = new Array(gx * gy);
    for (let i = 0; i < n; i++) {
      const i0 = Math.floor((Math.min(X[i], X[i + 1]) - x0) / h), i1 = Math.floor((Math.max(X[i], X[i + 1]) - x0) / h);
      const j0 = Math.floor((Math.min(Y[i], Y[i + 1]) - y0) / h), j1 = Math.floor((Math.max(Y[i], Y[i + 1]) - y0) / h);
      for (let a = i0; a <= i1; a++) for (let c = j0; c <= j1; c++) { const k = c * gx + a; (cells[k] || (cells[k] = [])).push(i); }
    }
    function segDist(i, px, py) {
      const ax = X[i], ay = Y[i], dx = X[i + 1] - ax, dy = Y[i + 1] - ay, L = dx * dx + dy * dy;
      let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + t * dx - px, ey = ay + t * dy - py; return ex * ex + ey * ey;
    }
    function dist(px, py) {
      const ci = Math.floor((px - x0) / h), cj = Math.floor((py - y0) / h);
      let best = Infinity;
      for (let k = 0; k < Math.max(gx, gy); k++) {
        for (let a = ci - k; a <= ci + k; a++) for (let c = cj - k; c <= cj + k; c++) {
          if (Math.max(Math.abs(a - ci), Math.abs(c - cj)) !== k || a < 0 || c < 0 || a >= gx || c >= gy) continue;
          const L = cells[c * gx + a]; if (!L) continue;
          for (const i of L) { const d = segDist(i, px, py); if (d < best) best = d; }
        }
        if (best <= (k * h) * (k * h)) break;
      }
      return Math.sqrt(best);
    }
    // outermost crossing of the ray from (cx,cy) at angle th
    function ray(cx, cy, th) {
      const ux = Math.cos(th), uy = Math.sin(th); let best = 0;
      for (let i = 0; i < n; i++) {
        const ax = X[i] - cx, ay = Y[i] - cy, ex = X[i + 1] - X[i], ey = Y[i + 1] - Y[i];
        const den = ux * ey - uy * ex; if (Math.abs(den) < 1e-14) continue;
        const r = (ax * ey - ay * ex) / den, s = (ax * uy - ay * ux) / den;
        if (s >= -1e-9 && s <= 1 + 1e-9 && r > best) best = r;
      }
      return best;
    }
    return { dist, ray, per };
  }
  // radius along each ray of the contour offset by d (d < 0 inward)
  function offsetRadii(idx, cx, cy, angles, rB, d) {
    const n = angles.length, out = new Float64Array(n);
    if (Math.abs(d) < 1e-9) { out.set(rB); return out; }
    const D = Math.abs(d), dir = d > 0 ? 1 : -1, minStep = Math.max(0.004, 0.03 * D);
    for (let j = 0; j < n; j++) {
      const ux = Math.cos(angles[j]), uy = Math.sin(angles[j]);
      let prev = rB[j], r = rB[j] + dir * D * 0.999, found = false;
      for (let it = 0; it < 400; it++) {
        if (r <= 0) { r = 0; found = true; break; }
        const del = idx.dist(cx + r * ux, cy + r * uy);
        if (del >= D) {
          let lo = prev, hi = r;   // lo: inside the offset band, hi: past it
          for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (idx.dist(cx + m * ux, cy + m * uy) >= D) hi = m; else lo = m; }
          r = (lo + hi) / 2; found = true; break;
        }
        prev = r; r += dir * Math.max(D - del, minStep);
      }
      out[j] = found ? r : prev;
    }
    return out;
  }
  // morphological rounding of a dense star-shaped outline (closing rounds concave corners, opening convex ones)
  function roundGeneric(pts, cx, cy, Rconcave, Rconvex) {
    const A = new Float64Array(1800); for (let i = 0; i < A.length; i++) A[i] = TAU * i / A.length;
    let cur = pts;
    const step = d => {
      const idx = segIndex(cur, Math.abs(d) + 2), rB = new Float64Array(A.length);
      for (let j = 0; j < A.length; j++) rB[j] = idx.ray(cx, cy, A[j]);
      const r = offsetRadii(idx, cx, cy, A, rB, d);
      cur = Array.from(A, (t, j) => [cx + r[j] * Math.cos(t), cy + r[j] * Math.sin(t)]);
    };
    if (Rconcave > 0) { step(Rconcave); step(-Rconcave); }
    if (Rconvex > 0) { step(-Rconvex); step(Rconvex); }
    return cur;
  }

  /* outline in mm: bbox W x D centred on the origin, counter-clockwise, dense */
  const OUTLINE_CACHE = new Map();
  function outline(id, W, D, R) {
    const key = [id, W, D, R].join('|');
    if (OUTLINE_CACHE.has(key)) return OUTLINE_CACHE.get(key);
    const o = outline_(id, W, D, R);
    OUTLINE_CACHE.set(key, o); if (OUTLINE_CACHE.size > 12) OUTLINE_CACHE.delete(OUTLINE_CACHE.keys().next().value);
    return o;
  }
  function outline_(id, W, D, R) {
    const raw = rawShape(id), b = bbox(raw.pts), sx = W / (b[1] - b[0]), sy = D / (b[3] - b[2]);
    let pts = raw.pts.map(([x, y]) => [(x - (b[0] + b[1]) / 2) * sx, (y - (b[2] + b[3]) / 2) * sy]);
    const minWD = Math.min(W, D);
    if (raw.poly) {
      let radii;
      if (id === 'pill') radii = pts.map(() => minWD / 2);
      else if (id === 'star') radii = pts.map((p, i) => i % 2 ? Math.max(3, R * 0.6) : R);
      else radii = pts.map(() => R);
      pts = fillet(pts, radii);
    }
    pts = dedupe(subdivide(dedupe(pts, 1e-4), 0.4), 1e-4);
    let c = areaCentroid(pts);
    if (id === 'heart') { pts = roundGeneric(pts, c.cx, c.cy, Math.max(3, minWD * 0.05), Math.max(R, 1.5)); pts = dedupe(pts, 1e-4); c = areaCentroid(pts); }
    // rounding shrinks the outline: stretch it back so the outside is exactly W x D
    { const bb = bbox(pts), kx = W / (bb[1] - bb[0]), ky = D / (bb[3] - bb[2]), mx = (bb[0] + bb[1]) / 2, my = (bb[2] + bb[3]) / 2;
      pts = pts.map(([x, y]) => [(x - mx) * kx, (y - my) * ky]); c = areaCentroid(pts); }
    if (c.A < 0) { pts.reverse(); c = areaCentroid(pts); }
    return { pts, cx: c.cx, cy: c.cy, area: Math.abs(c.A) };
  }

  /* ---------------- parameters ---------------- */
  const DEFAULTS = {
    shape: 'round', W: 80, D: 80, H: 60, R: 6, t: 1.6, tb: 1.2,
    stack: false, sc: 0.2,
    lid: { type: 'plug', c: 0.2, depth: 6, top: 1.6, pitch: 4, sh: 8 },
    texture: { type: 'none', size: 6, depth: 0.8 },
    decos: [],
    res: 0.5
  };
  function resolve(p) {
    p = p || {};
    const q = Object.assign({}, DEFAULTS, p), warn = [];
    q.lid = Object.assign({}, DEFAULTS.lid, p.lid || {});
    q.texture = Object.assign({}, DEFAULTS.texture, p.texture || {});
    q.decos = Array.isArray(p.decos) ? p.decos.filter(d => d && d.sdf && d.w > 0 && d.h > 0).slice(0, 12) : [];
    if (!SHAPE[q.shape]) q.shape = 'round';
    if (!LIDS.includes(q.lid.type)) q.lid.type = 'none';
    if (!TEXTURES.includes(q.texture.type)) q.texture.type = 'none';
    const num = (o, k, lo, hi, label, dflt) => {
      let v = Number(o[k]); if (!isFinite(v)) v = dflt;
      const c = clamp(v, lo, hi); if (Math.abs(c - v) > 1e-9) warn.push(`${label} limited to ${r2(c)} mm`); o[k] = c;
    };
    num(q, 'W', 20, 400, 'Width', 80); num(q, 'D', 20, 400, 'Depth', 80); num(q, 'H', 8, 400, 'Height', 60);
    num(q, 't', 0.8, 5, 'Wall', 1.6); num(q, 'tb', 0.6, 6, 'Bottom', 1.2);
    num(q, 'R', 0, Math.min(q.W, q.D) / 2 - 0.5, 'Corner radius', 6);
    num(q, 'sc', 0.05, 1, 'Stack clearance', 0.2);
    num(q, 'res', 0.25, 1.2, 'Detail', 0.5);
    const L = q.lid;
    num(L, 'c', 0.05, 1, 'Lid clearance', 0.2); num(L, 'top', 0.8, 5, 'Lid top', 1.6);
    num(L, 'depth', 3, 30, 'Lid depth', 6); num(L, 'pitch', 2.5, 8, 'Thread pitch', 4); num(L, 'sh', 4, 60, 'Stacking lid height', 8);
    const T = q.texture; num(T, 'size', 2, 40, 'Texture size', 6); num(T, 'depth', 0.2, 3, 'Texture depth', 0.8);
    if (L.type === 'screw') {
      const o = outline(q.shape, q.W, q.D, SHAPE[q.shape].corner ? q.R : 0), idx = segIndex(o.pts, 2);
      let rin = Infinity; for (let k = 0; k < 360; k++) rin = Math.min(rin, idx.ray(o.cx, o.cy, TAU * k / 360));
      const th = threadSpec(L.pitch, Math.max(0.3, L.c + 0.1)), need = 8 + Math.max(1.2, q.t) + th.td + th.cr;
      if (rin < need) { L.type = 'plug'; warn.push(`too small for a screw lid (it needs about ${Math.ceil(Math.min(q.W, q.D) + 2 * (need - rin))} mm across) – using a push-fit lid`); }
    }
    if (q.stack && (L.type === 'cap' || L.type === 'screw')) { q.stack = false; warn.push('stacking needs no lid, a push-fit lid or a stacking lid'); }
    if (L.type === 'stack') q.stack = true;
    return { q, warn };
  }

  /* ---------------- mesh assembly from rings ---------------- */
  // rings: [{ z, x: Float64Array, y: Float64Array }] all with N points; first and last closed by fans
  function ringsToMesh(rings, cx, cy) {
    const R = rings.length, N = rings[0].x.length, V = R * N + 2;
    const P = new Float32Array(V * 3), I = new Uint32Array((2 * N * (R - 1) + 2 * N) * 3);
    let o = 0;
    for (const r of rings) for (let j = 0; j < N; j++) { P[o++] = r.x[j]; P[o++] = r.y[j]; P[o++] = r.z; }
    const c0 = R * N, c1 = c0 + 1;
    P[o++] = cx; P[o++] = cy; P[o++] = rings[0].z; P[o++] = cx; P[o++] = cy; P[o++] = rings[R - 1].z;
    let k = 0;
    for (let j = 0; j < N; j++) { const j1 = (j + 1) % N; I[k++] = c0; I[k++] = j1; I[k++] = j; }
    for (let i = 0; i + 1 < R; i++) for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N, a = i * N + j, b = i * N + j1, c = (i + 1) * N + j1, d = (i + 1) * N + j;
      I[k++] = a; I[k++] = b; I[k++] = c; I[k++] = a; I[k++] = c; I[k++] = d;
    }
    const L = (R - 1) * N;
    for (let j = 0; j < N; j++) { const j1 = (j + 1) % N; I[k++] = c1; I[k++] = L + j; I[k++] = L + j1; }
    const m = { positions: P, indices: I, volume: 0 };
    m.volume = volumeOf(m);
    if (m.volume < 0) { for (let t = 0; t < I.length; t += 3) { const s = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = s; } m.volume = -m.volume; }
    return m;
  }
  function volumeOf(m) {
    const P = m.positions, I = m.indices; let v = 0;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
    }
    return v / 6;
  }
  function transformMesh(m, o) {   // o: { dx, dy, dz, flip } flip = rotate 180 degrees about X (y -> -y, z -> -z)
    const P = m.positions, out = new Float32Array(P.length), f = o.flip ? -1 : 1;
    for (let i = 0; i < P.length; i += 3) { out[i] = P[i] + (o.dx || 0); out[i + 1] = f * P[i + 1] + (o.dy || 0); out[i + 2] = f * P[i + 2] + (o.dz || 0); }
    return Object.assign({}, m, { positions: out });
  }
  function mergeMeshes(list) {
    let nv = 0, ni = 0; for (const m of list) { nv += m.positions.length; ni += m.indices.length; }
    const P = new Float32Array(nv), I = new Uint32Array(ni); let po = 0, io = 0, vo = 0;
    for (const m of list) { P.set(m.positions, po); for (let i = 0; i < m.indices.length; i++) I[io + i] = m.indices[i] + vo; po += m.positions.length; io += m.indices.length; vo += m.positions.length / 3; }
    return { positions: P, indices: I, volume: list.reduce((a, m) => a + m.volume, 0) };
  }
  function bounds(m) {
    const P = m.positions, b = [1e9, -1e9, 1e9, -1e9, 1e9, -1e9];
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { b[2 * k] = Math.min(b[2 * k], P[i + k]); b[2 * k + 1] = Math.max(b[2 * k + 1], P[i + k]); }
    return b;
  }
  // steepest downward-facing surface, in degrees from vertical (bed faces at the lowest z are ignored)
  function maxOverhang(m) {
    const P = m.positions, I = m.indices; let zmin = Infinity, worst = 0, area = 0;
    for (let i = 2; i < P.length; i += 3) zmin = Math.min(zmin, P[i]);
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      if (P[a + 2] < zmin + 1e-4 && P[b + 2] < zmin + 1e-4 && P[c + 2] < zmin + 1e-4) continue;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
      if (l < 1e-9 || nz >= 0) continue;
      const ang = Math.asin(Math.min(1, -nz / l)) * 180 / PI;
      if (ang > worst) worst = ang;
      if (ang > 45.5) area += l / 2;
    }
    return { deg: worst, badArea: area };
  }

  /* ---------------- textures (outward relief, mm) ---------------- */
  const tri = x => { x = x - Math.floor(x); return 1 - Math.abs(2 * x - 1); };   // 0..1..0 triangle wave
  function hexSdf(px, py, lam) {   // signed distance inside the nearest pointy-top hexagon, cells lam wide
    const ap = lam / 2, r = ap * 2 / Math.sqrt(3), sy = 3 * r;
    let best = Infinity;
    for (const [ox, oy] of [[0, 0], [ap, 1.5 * r]]) {
      const gx = Math.round((px - ox) / lam) * lam + ox, gy = Math.round((py - oy) / sy) * sy + oy;
      const dx = Math.abs(px - gx), dy = Math.abs(py - gy);
      best = Math.min(best, Math.max(dx, dx * 0.5 + dy * Math.sqrt(3) / 2));
    }
    return ap - best;
  }
  function textureFn(T, P) {
    const A = T.depth;
    let lam = T.size; const nAround = Math.max(3, Math.round(P / lam)); lam = P / nAround;   // seamless around the wall
    switch (T.type) {
      case 'ribs': return (s, z) => A * 0.5 * (1 + Math.cos(TAU * s / lam));
      case 'flutes': return (s, z) => { const u = (s / lam) % 1 * 2 - 1; return A * Math.sqrt(Math.max(0, 1 - u * u)); };
      case 'waves': { const a = Math.min(A, 0.95 * T.size / PI); return (s, z) => a * 0.5 * (1 + Math.sin(TAU * z / T.size)); }
      case 'twist': { const a = Math.min(A, 0.95 * lam / PI); return (s, z) => a * 0.5 * (1 + Math.cos(TAU * (s - z) / lam)); }
      case 'knurl': { const a = Math.min(A, 0.95 * lam / 2); return (s, z) => a * Math.min(tri((s + z) / lam), tri((s - z) / lam)); }
      case 'bricks': {
        const bw = lam, bh = Math.max(2, T.size * 0.45), g = Math.max(0.6, T.size * 0.08);
        return (s, z) => {
          const row = Math.floor(z / bh), off = row % 2 ? bw / 2 : 0;
          const u = ((s + off) % bw + bw) % bw, v = z - row * bh;
          const sd = Math.min(u - g / 2, bw - g / 2 - u, v - g / 2, bh - g / 2 - v);
          return clamp(sd, 0, A);
        };
      }
      case 'honeycomb': { const g = Math.max(0.6, T.size * 0.08); return (s, z) => clamp(hexSdf(s, z, lam) - g / 2, 0, A); }
      case 'dots': {
        const rad = lam * 0.28, rowH = lam * 0.866;
        return (s, z) => {
          const row = Math.round(z / rowH), off = row % 2 ? lam / 2 : 0;
          const cs = Math.round((s - off) / lam) * lam + off, d = Math.hypot(s - cs, z - row * rowH);
          return clamp(rad - d, 0, A);
        };
      }
    }
    return null;
  }

  /* ---------------- thread profile ---------------- */
  // normalised trapezoid ridge, centred at u = 0, crest half-width hc, base half-width hb (45 degree flanks)
  function threadSpec(pitch, cr) {
    const g = 0.35, hc = 0.3, hb = pitch / 2 - g, td = hb - hc;
    return { pitch, g, hc, hb, td, cr };
  }
  const ridge = (u, th) => clamp((th.hb - Math.abs(u)) / (th.hb - th.hc), 0, 1);
  // ridge height (0..1) of a helix z = z0 + pitch * phi / 2pi, phi in [0, PHI], at angle th and height z
  function helixAt(th, z, ang, z0, PHI) {
    const P = th.pitch, ramp = PI / 2;
    const k = Math.round(((z - z0) / P) - ang / TAU), phi = ang + TAU * k, u = z - (z0 + P * phi / TAU);
    if (phi < 0 || phi > PHI) {
      // neighbouring turns can still reach this point
      let best = 0;
      for (const kk of [k - 1, k + 1]) { const ph = ang + TAU * kk; if (ph < 0 || ph > PHI) continue; const uu = z - (z0 + P * ph / TAU); best = Math.max(best, ridge(uu, th) * clamp(Math.min(ph, PHI - ph) / ramp, 0, 1)); }
      return best;
    }
    return ridge(u, th) * clamp(Math.min(phi, PHI - phi) / ramp, 0, 1);
  }

  /* ---------------- build ---------------- */
  function build(params) {
    const { q, warn } = resolve(params);
    const t = q.t, tb = q.tb, L = q.lid, lt = L.type, T = q.texture;
    const shp = outline(q.shape, q.W, q.D, SHAPE[q.shape].corner ? q.R : 0);
    const cx = shp.cx, cy = shp.cy, idx = segIndex(shp.pts, 30);

    /* --- angle set: adaptive by arc length and turning, denser for textures and text --- */
    const pts0 = shp.pts, n0 = pts0.length;
    const ang0 = pts0.map(([x, y]) => { let a = Math.atan2(y - cy, x - cx); if (a < 0) a += TAU; return a; });
    let start = 0; for (let i = 1; i < n0; i++) if (ang0[i] < ang0[start]) start = i;
    const seq = []; for (let i = 0; i < n0; i++) seq.push((start + i) % n0);
    const sAt = new Float64Array(n0 + 1);
    for (let k = 1; k <= n0; k++) { const a = pts0[seq[k - 1]], b = pts0[seq[k % n0]]; sAt[k] = sAt[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]); }
    const Ptot0 = sAt[n0];
    const hasTex = T.type !== 'none';
    const decoRes = Math.min(q.res, 0.35);
    // deco s-ranges (on the dense outline; close enough to the final one for sampling density)
    const decoRanges = q.decos.map(d => { const sc = (((Number(d.u) || 0) % 1) + 1) % 1 * Ptot0; return [sc - d.w / 2 - 2, sc + d.w / 2 + 2]; });
    const inDeco = s => decoRanges.some(([a, b]) => { for (const o of [-Ptot0, 0, Ptot0]) if (s >= a + o && s <= b + o) return true; return false; });
    const angles = [];
    {
      let lastS = -1e9, lastDir = null, lastA = -1e9;
      for (let k = 0; k < n0; k++) {
        const i = seq[k], a = ang0[i], s = sAt[k];
        const nx = pts0[seq[(k + 1) % n0]], dir = Math.atan2(nx[1] - pts0[i][1], nx[0] - pts0[i][0]);
        const ds = inDeco(s) ? decoRes : hasTex ? q.res : 1.2;
        let turn = 0; if (lastDir !== null) { turn = Math.abs(dir - lastDir); if (turn > PI) turn = TAU - turn; }
        if (k === 0 || s - lastS >= ds - 1e-9 || turn > 5 * PI / 180 || a - lastA > 0.75 * PI / 180) {
          if (a > lastA + 1e-6) { angles.push(a); lastS = s; lastDir = dir; lastA = a; }
        }
      }
      // keep every gap under 0.75 degrees (also covers the closing gap)
      const out = [];
      for (let i = 0; i < angles.length; i++) {
        const a = angles[i], b = i + 1 < angles.length ? angles[i + 1] : angles[0] + TAU, m = Math.ceil((b - a) / (0.75 * PI / 180));
        for (let k = 0; k < m; k++) out.push(a + (b - a) * k / m);
      }
      angles.length = 0; for (const a of out) angles.push(a >= TAU ? a - TAU : a);
      angles.sort((a, b) => a - b);
    }
    const N = angles.length, A = Float64Array.from(angles), COS = A.map(Math.cos), SIN = A.map(Math.sin);
    const rB = new Float64Array(N); for (let j = 0; j < N; j++) rB[j] = idx.ray(cx, cy, A[j]);
    const cache = new Map();
    const insetR = d => { const k = d.toFixed(4); if (!cache.has(k)) cache.set(k, offsetRadii(idx, cx, cy, A, rB, -d)); return cache.get(k); };
    const ringR = (r, z) => { const x = new Float64Array(N), y = new Float64Array(N); for (let j = 0; j < N; j++) { x[j] = cx + r[j] * COS[j]; y[j] = cy + r[j] * SIN[j]; } return { z, x, y }; };
    const ringInset = (d, z) => ringR(insetR(d), z);
    const circleR = R => new Float64Array(N).fill(R);
    // base contour: arc length + outward normals
    const bx = new Float64Array(N), by = new Float64Array(N), sB = new Float64Array(N), nX = new Float64Array(N), nY = new Float64Array(N);
    for (let j = 0; j < N; j++) { bx[j] = cx + rB[j] * COS[j]; by[j] = cy + rB[j] * SIN[j]; }
    for (let j = 1; j < N; j++) sB[j] = sB[j - 1] + Math.hypot(bx[j] - bx[j - 1], by[j] - by[j - 1]);
    const Ptot = sB[N - 1] + Math.hypot(bx[0] - bx[N - 1], by[0] - by[N - 1]);
    for (let j = 0; j < N; j++) {
      const a = (j + N - 1) % N, b = (j + 1) % N, tx = bx[b] - bx[a], ty = by[b] - by[a], l = Math.hypot(tx, ty) || 1;
      nX[j] = ty / l; nY[j] = -tx / l;
    }
    // signed local radius of the wall (+ convex, - concave): relief may not exceed it, or the wall would fold over itself
    const radAt = new Float64Array(N);
    for (let j = 0; j < N; j++) {
      const a = (j + N - 1) % N, b = (j + 1) % N;
      let da = Math.atan2(nY[b], nX[b]) - Math.atan2(nY[a], nX[a]); da -= Math.round(da / TAU) * TAU;
      let ds = sB[b] - sB[a]; if (ds <= 0) ds += Ptot;
      radAt[j] = Math.abs(da) < 1e-9 ? 1e9 : ds / da;
    }
    // how far relief may push in (convex corners) or out (concave corners) at each column: limited by the corner
    // radius, growing at half the distance along the wall away from it (a 1D distance transform, run twice for the wrap)
    const limIn = new Float64Array(N), limOut = new Float64Array(N);
    for (let j = 0; j < N; j++) { limIn[j] = radAt[j] > 0 ? 0.8 * radAt[j] : 1e9; limOut[j] = radAt[j] < 0 ? -0.8 * radAt[j] : 1e9; }
    for (const L of [limIn, limOut]) for (let pass = 0; pass < 2; pass++) {
      for (let j = 1; j <= N; j++) { const a = (j - 1) % N, b = j % N, ds = (sB[b] - sB[a] + Ptot) % Ptot; L[b] = Math.min(L[b], L[a] + 0.5 * ds); }
      for (let j = N - 1; j >= 0; j--) { const a = (j + 1) % N, b = j, ds = (sB[a] - sB[b] + Ptot) % Ptot; L[b] = Math.min(L[b], L[a] + 0.5 * ds); }
    }
    let rMin = Infinity, rMax = 0; for (let j = 0; j < N; j++) { rMin = Math.min(rMin, rB[j]); rMax = Math.max(rMax, rB[j]); }

    /* --- vertical layout --- */
    // A chamfer between two contours leans at most 45 degrees when it rises at least as much as the
    // largest radial step between them (rays are not always normal to the wall, e.g. near corners).
    const maxGap = (a, b) => { let g = 0; for (let j = 0; j < N; j++) g = Math.max(g, Math.abs(a[j] - b[j])); return g; };
    let H = q.H;
    const F = t + q.sc, sf = 2, rr = 0.4, flush = q.stack && t >= rr + 0.4, dl = t * (SQ2 - 1);
    const rT = insetR(t), rF = q.stack ? insetR(F) : null;
    const hF = q.stack ? maxGap(rB, rF) : 0;                       // stacking-foot chamfer height
    const bc = Math.min(0.4, t / 2), hB = q.stack ? 0 : maxGap(rB, insetR(bc));   // small first-layer chamfer
    const zA = q.stack ? sf + hF : hB;   // bottom of the plain outer wall
    const Lw = Math.max(1.2, t), nk = Lw + L.c;   // cap lid wall and neck inset
    const hN = lt === 'cap' ? maxGap(rB, insetR(nk)) : 0, hNi = lt === 'cap' ? maxGap(rT, insetR(nk + t)) : 0;
    let th = null, Rno = 0, Rni = 0, hs = 0, zSh = 0, zn0 = 0, Rl = 0;
    if (lt === 'screw') {
      th = threadSpec(L.pitch, Math.max(0.3, L.c + 0.1));
      Rno = rMin - Lw - th.td - th.cr;
      Rni = Rno - Math.max(1.2, t);
      Rl = Rno + th.td + th.cr;
      hs = Math.max(0, rMax - Rno);
      const dMin = 1.6 + 2 * th.hb + 1.75 * th.pitch;   // at least 1.75 turns of thread (1.25 at full depth)
      if (L.depth < dMin) { L.depth = Math.ceil(dMin * 10) / 10; warn.push(`neck raised to ${L.depth} mm for at least 1¾ turns of thread`); }
    }
    // inner stacking-foot chamfer (cavity side, any slope is fine)
    const hFi = q.stack ? maxGap(rT, insetR(F + t)) : 0;
    const footTop = q.stack ? sf + dl + hFi : 0;            // top of the inner foot chamfer
    let minH = tb + 3;
    if (q.stack) minH = Math.max(minH, footTop + 1 + (flush ? hF : 0));
    if (lt === 'cap') minH = Math.max(minH, Math.max(tb, footTop) + t + hNi + L.depth + 2);
    if (lt === 'plug') minH = Math.max(minH, Math.max(tb, footTop) + L.depth + 2);
    if (lt === 'screw') minH = Math.max(minH, Math.max(tb, footTop) + t + 1 + hs + L.depth + 1);
    if (H < minH) { warn.push(`height raised to ${r2(minH)} mm to fit the ${lt === 'screw' ? 'shoulder, neck and thread' : lt === 'none' ? 'bottom' : 'lid'}`); H = minH; }
    q.H = H;
    let zB = H;
    if (lt === 'cap') zB = H - L.depth - hN;
    if (lt === 'screw') { zn0 = H - L.depth; zSh = zn0 - hs; zB = zSh; }

    /* --- outer wall rings with texture / text relief --- */
    const outer = [];
    if (q.stack) { outer.push(ringR(rF, 0), ringR(rF, sf)); }
    else outer.push(ringInset(bc, 0));
    // z samples in the plain wall zone
    const zs = new Set([zA, zB]);
    const fine = (a, b, d) => { a = Math.max(a, zA); b = Math.min(b, zB); if (b <= a) return; const m = Math.ceil((b - a) / d); for (let k = 0; k <= m; k++) zs.add(a + (b - a) * k / m); };
    if (hasTex) fine(zA, zB, Math.min(q.res, T.size / 8));
    const decos = q.decos.map(d => {
      const zc = clamp(Number(d.z) || 0, zA + d.h / 2 + 0.5, Math.max(zA + d.h / 2 + 0.5, zB - d.h / 2 - 0.5));
      const sc = (((Number(d.u) || 0) % 1) + 1) % 1 * Ptot;
      const depth = d.engrave ? -Math.min(Math.abs(d.depth || 0.8), t - 0.6) : clamp(Math.abs(d.depth || 0.8), 0.2, 3);
      return { sc, zc, w: d.w, h: d.h, sdf: d.sdf, depth };
    });
    for (const d of decos) fine(d.zc - d.h / 2 - 1, d.zc + d.h / 2 + 1, decoRes);
    const zList = [...zs].filter(z => z >= zA - 1e-9 && z <= zB + 1e-9).sort((a, b) => a - b).filter((z, i, a) => i === 0 || z - a[i - 1] > 0.02);
    const texF = hasTex ? textureFn(T, Ptot) : null;
    const sampleSdf = (g, x, y) => {   // bilinear, x/y in grid units
      if (x < 0 || y < 0 || x > g.nx - 1 || y > g.ny - 1) return -1;
      const i = Math.min(g.nx - 2, Math.floor(x)), k = Math.min(g.ny - 2, Math.floor(y)), fx = x - i, fy = y - k, D = g.data;
      return (D[k * g.nx + i] * (1 - fx) + D[k * g.nx + i + 1] * fx) * (1 - fy) + (D[(k + 1) * g.nx + i] * (1 - fx) + D[(k + 1) * g.nx + i + 1] * fx) * fy;
    };
    const wrapDs = (s, sc) => { let d = s - sc; d -= Math.round(d / Ptot) * Ptot; return d; };
    const relief = (j, z) => {
      const s = sB[j]; let tex = 0, sup = 1, deco = 0;
      for (const d of decos) {
        const ds = wrapDs(s, d.sc), dz = z - d.zc;
        const ex = Math.max(0, Math.abs(ds) - d.w / 2), ez = Math.max(0, Math.abs(dz) - d.h / 2);
        sup = Math.min(sup, clamp((Math.hypot(ex, ez) - 1) / 2, 0, 1));
        if (ex === 0 && ez === 0) {
          const g = d.sdf, v = sampleSdf(g, (ds + d.w / 2) / d.w * (g.nx - 1), (dz + d.h / 2) / d.h * (g.ny - 1));
          deco += d.depth > 0 ? clamp(v, 0, d.depth) : -clamp(v, 0, -d.depth);
        }
      }
      if (texF) tex = texF(s, z) * clamp((z - zA) / 1.5, 0, 1) * clamp((zB - z) / 1.5, 0, 1);
      return tex * sup + deco;
    };
    // engraving must climb back to the surface (at 45 degrees) before the wall thins at the top (flush stacking rim)
    const zEng = flush ? Math.min(zB, H - hF * (t - rr) / F - 0.3) : zB;
    const zoneRings = [];
    if (hasTex || decos.length) {
      const prev = new Float64Array(N); let zPrev = null;
      for (const z of zList) {
        const r = { z, x: new Float64Array(N), y: new Float64Array(N) };
        for (let j = 0; j < N; j++) {
          let d = relief(j, z);
          if (z === zA || z === zB) d = 0;
          d = clamp(d, -limIn[j], limOut[j]);
          d = Math.max(d, -(t - 0.6), -Math.max(0, zEng - z) * 0.999);                            // engraving climbs back out at 45 degrees by the top
          if (zPrev !== null) d = Math.min(d, prev[j] + (z - zPrev) * 0.999);   // never lean out more than 45 degrees
          prev[j] = d;
          r.x[j] = bx[j] + nX[j] * d; r.y[j] = by[j] + nY[j] * d;
        }
        zPrev = z; zoneRings.push(r);
      }
    } else zoneRings.push(ringR(rB, zA), ringR(rB, zB));
    outer.push(...zoneRings);

    /* --- top of the outer wall + inner wall, by lid type --- */
    const inner = [];   // top to bottom
    if (lt === 'cap') {
      outer.push(ringInset(nk, H - L.depth), ringInset(nk, H));
      inner.push(ringInset(nk + t, H), ringInset(nk + t, zB - t + hNi), ringR(rT, zB - t));
    } else if (lt === 'screw') {
      // 45 degree shoulder from the shape to the round neck
      const steps = Math.max(1, Math.ceil(hs / 0.8));
      for (let k = 1; k <= steps; k++) {
        const z = zSh + hs * k / steps, r = new Float64Array(N);
        for (let j = 0; j < N; j++) r[j] = Math.max(Rno, rB[j] - (z - zSh));
        outer.push(ringR(r, z));
      }
      // threaded neck
      const zt0 = zn0 + 0.8, zt1 = H - 0.8, PHI = Math.max(0, TAU * (zt1 - zt0 - 2 * th.hb) / th.pitch), z0 = zt0 + th.hb;
      th.neck = { z0, PHI };
      const m = Math.max(2, Math.ceil((H - zn0) / 0.25));
      for (let k = 1; k <= m; k++) {
        const z = zn0 + (H - zn0) * k / m, r = new Float64Array(N);
        for (let j = 0; j < N; j++) r[j] = Rno + (k < m ? th.td * helixAt(th, z, A[j], z0, PHI) : 0);
        outer.push(ringR(r, z));
      }
      // inner: neck, 45 degree inner shoulder, then the wall
      inner.push(ringR(circleR(Rni), H));
      const rI = insetR(t), zi1 = zSh + hs, zi0 = zSh - t;
      const si = Math.max(1, Math.ceil((zi1 - zi0) / 0.8));
      for (let k = si; k >= 0; k--) {
        const z = zi0 + (zi1 - zi0) * k / si, r = new Float64Array(N);
        for (let j = 0; j < N; j++) r[j] = Math.max(Rni, Math.min(rI[j], rB[j] - t * SQ2 - (z - zSh)));
        inner.push(ringR(r, z));
      }
    } else {
      outer.push(...[]);
      if (flush) inner.push(ringInset(rr, H), ringR(rT, H - hF * (t - rr) / F));
      else inner.push(ringR(rT, H));
    }
    // inner bottom: plain, or following the stacking foot
    const lastZ = inner[inner.length - 1].z;
    if (q.stack) {
      // cavity follows the foot: inset F+t up to sf+dl, then widens to the wall at footTop
      const rFi = insetR(F + t), z2 = sf + dl;
      if (footTop > tb + 1e-6 && footTop < lastZ - 1e-6) inner.push(ringR(rT, footTop));
      if (z2 > tb + 1e-6 && z2 < lastZ - 1e-6) inner.push(ringR(rFi, z2));
      if (tb >= z2) { const f = clamp((tb - z2) / hFi, 0, 1), r = new Float64Array(N); for (let j = 0; j < N; j++) r[j] = rFi[j] + (rT[j] - rFi[j]) * f; inner.push(ringR(r, tb)); }
      else inner.push(ringR(rFi, tb));
    } else inner.push(ringInset(t, tb));

    const container = ringsToMesh(outer.concat(inner), cx, cy);
    // capacity: the cavity closed at the rim
    const cavRings = inner.slice();
    const capacity = ringsToMesh(cavRings, cx, cy).volume;

    /* --- stacking offset: lowest seat where the upper foot clears the lower rim on every ray --- */
    let stackOffset = H;
    if (q.stack) {
      const h2 = flush ? hF * (t - rr) / F : 0, rR = flush ? insetR(rr) : rT, cl = 0.1;
      const lerp = (a, b, f) => a + (b - a) * clamp(f, 0, 1);
      let so = -Infinity;
      for (let j = 0; j < N; j++) {
        const up = z => z <= sf ? rF[j] : lerp(rF[j], rB[j], (z - sf) / hF);
        const lo = z => z <= H - h2 ? rT[j] : lerp(rT[j], rR[j], h2 > 0 ? (z - (H - h2)) / h2 : 1);
        const ok = off => { for (const z of [off, off + sf, off + sf + hF, H - h2, H]) if (z >= off - 1e-9 && z <= H + 1e-9 && up(z - off) > lo(z) - cl) return false; return true; };
        let a = H - sf - hF - 2, b = H;
        if (ok(a)) { so = Math.max(so, a); continue; }
        for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (ok(m)) b = m; else a = m; }
        so = Math.max(so, b);
      }
      stackOffset = so;
    }

    /* --- lid --- */
    let lid = null, lidInfo = null;
    const flipTo = (rings, zTop) => {   // build in assembled frame, then rotate 180 degrees about X for printing (top face on the bed)
      const m = ringsToMesh(rings, cx, cy); const f = transformMesh(m, { flip: true, dz: zTop }); f.volume = m.volume; return f;
    };
    if (lt === 'plug') {
      const lw = Math.max(1.2, t), ch = Math.min(0.6, lw / 2), o = t + L.c, top = H + L.top;
      const rings = [ringInset(0, top), ringInset(0, H), ringInset(o, H), ringInset(o, H - L.depth + ch), ringInset(o + ch, H - L.depth), ringInset(o + lw, H - L.depth), ringInset(o + lw, H)];
      lid = flipTo(rings, top);
      lidInfo = { name: 'push-fit', place: { flip: true, z: top } };
    } else if (lt === 'cap') {
      const top = H + L.top, zb = H - L.depth + 0.2;
      const rings = [ringInset(0, top), ringInset(0, zb), ringInset(Lw, zb), ringInset(Lw, H)];
      lid = flipTo(rings, top);
      lidInfo = { name: 'slip-over', place: { flip: true, z: top } };
    } else if (lt === 'screw') {
      const top = H + L.top, zb = zn0 + 0.6, Rlo = Rl + Lw, nr = Math.max(12, Math.round(TAU * Rlo / 4));
      const outerR = new Float64Array(N); for (let j = 0; j < N; j++) outerR[j] = Rlo + 0.6 * 0.5 * (1 + Math.cos(nr * A[j]));
      const ccx = cx, ccy = cy;
      const rings = [ringR(outerR, top), ringR(outerR, zb)];
      const zl0 = zb + 0.6, zl1 = H - 0.6, z0 = th.neck.z0 + th.pitch / 2;
      // lid ridges sit half a pitch from the neck ridges, inside [zl0, zl1]
      let k0 = Math.ceil((zl0 + th.hb - z0) / th.pitch); const zz0 = z0 + k0 * th.pitch;
      const PHI = Math.max(0, TAU * (zl1 - th.hb - zz0) / th.pitch);
      const m = Math.max(2, Math.ceil((H - zb) / 0.25));
      for (let k = 0; k <= m; k++) {
        const z = zb + (H - zb) * k / m, r = new Float64Array(N);
        for (let j = 0; j < N; j++) r[j] = Rl - (k > 0 && k < m ? th.td * helixAt(th, z, A[j], zz0, PHI) : 0);
        rings.push(ringR(r, z));
      }
      lid = flipTo(rings, top);
      lidInfo = { name: 'screw-on', place: { flip: true, z: top }, neckD: 2 * Rno, pitch: th.pitch, threadDepth: th.td, turns: th.neck.PHI / TAU };
      void ccx; void ccy;
    } else if (lt === 'stack') {
      const sub = build(Object.assign({}, params, { H: L.sh, lid: { type: 'none' }, stack: true, texture: { type: 'none' }, decos: [] }));
      lid = sub.container;
      lidInfo = { name: 'stacking', place: { flip: false, z: stackOffset }, H: sub.params.H, stackOffset: sub.stackOffset };
    }

    const zone = { zA, zB, P: Ptot };
    return {
      container, lid, lidInfo, params: q, warn, capacity, stackOffset, zone,
      outline: { cx, cy, angles: A, x: bx, y: by, s: sB, nx: nX, ny: nY, P: Ptot, rMin, rMax, area: shp.area },
      neck: lt === 'screw' ? { Rno, Rni, Rl, zn0, zSh, hs, thread: th } : null,
      rings: { N, outer: outer.length, inner: inner.length }
    };
  }

  /* angle (radians, 0..2pi) -> position u (0..1) around the outer wall */
  function uAtAngle(res, ang) {
    const o = res.outline, A = o.angles, N = A.length; ang = ((ang % TAU) + TAU) % TAU;
    let j = 0; while (j + 1 < N && A[j + 1] <= ang) j++;
    return o.s[j] / o.P;
  }

  /* ---------------- signed distance field from a binary mask (raster -> mm) ---------------- */
  function edt1d(f, n, d, v, z) {
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  }
  function edt(mask, w, h, inside) {   // squared distance (px) to the nearest pixel with mask === inside
    const INF = 1e20, g = new Float64Array(w * h), n = Math.max(w, h);
    const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    for (let i = 0; i < w * h; i++) g[i] = (mask[i] ? 1 : 0) === (inside ? 1 : 0) ? 0 : INF;
    for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = g[y * w + x]; edt1d(f, h, d, v, z); for (let y = 0; y < h; y++) g[y * w + x] = d[y]; }
    for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = g[y * w + x]; edt1d(f, w, d, v, z); for (let x = 0; x < w; x++) g[y * w + x] = d[x]; }
    return g;
  }
  // mask: Uint8Array w*h (1 = ink), row 0 = TOP of the artwork. Returns grid with row 0 = bottom (z up), values in mm (+ inside).
  function maskToSdf(mask, w, h, pxPerMm) {
    const dOut = edt(mask, w, h, true), dIn = edt(mask, w, h, false), data = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, o = (h - 1 - y) * w + x;
      data[o] = mask[i] ? (Math.sqrt(dIn[i]) - 0.5) / pxPerMm : -(Math.sqrt(dOut[i]) - 0.5) / pxPerMm;
    }
    return { nx: w, ny: h, data };
  }

  /* ---------------- binary STL ---------------- */
  function toSTL(mesh, name) {
    const P = mesh.positions, I = mesh.indices, n = I.length / 3;
    let minx = Infinity, miny = Infinity, minz = Infinity;
    for (let i = 0; i < P.length; i += 3) { minx = Math.min(minx, P[i]); miny = Math.min(miny, P[i + 1]); minz = Math.min(minz, P[i + 2]); }
    const buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf), hdr = (name || 'container').slice(0, 79);
    for (let i = 0; i < hdr.length; i++) dv.setUint8(i, hdr.charCodeAt(i) & 127);
    dv.setUint32(80, n, true);
    let o = 84;
    for (let i = 0; i < n; i++) {
      const a = I[3 * i] * 3, b = I[3 * i + 1] * 3, c = I[3 * i + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
      dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true); o += 12;
      for (const v of [a, b, c]) { dv.setFloat32(o, P[v] - minx, true); dv.setFloat32(o + 4, P[v + 1] - miny, true); dv.setFloat32(o + 8, P[v + 2] - minz, true); o += 12; }
      o += 2;
    }
    return buf;
  }

  /* ---------------- 3MF (zip, stored) ---------------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zipStore(files) {
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
  function to3MF(objects, title) {
    let mx = Infinity, my = Infinity, mz = Infinity;
    for (const { mesh } of objects) { const P = mesh.positions; for (let i = 0; i < P.length; i += 3) { mx = Math.min(mx, P[i]); my = Math.min(my, P[i + 1]); mz = Math.min(mz, P[i + 2]); } }
    const num = v => String(Math.round(v * 1e5) / 1e5);
    const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    const chunks = [`<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n<metadata name="Title">${esc(title || 'Container')}</metadata>\n<metadata name="Application">Storage Container Generator v1</metadata>\n<resources>\n`];
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

  const api = { SHAPES, SHAPE, LIDS, TEXTURES, DEFAULTS, naturalAspect, outline, resolve, build, uAtAngle, maskToSdf, toSTL, to3MF, crc32, transformMesh, mergeMeshes, bounds, maxOverhang, volumeOf, helixAt, threadSpec };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ContainerGeom = api;
})(typeof window !== 'undefined' ? window : globalThis);
