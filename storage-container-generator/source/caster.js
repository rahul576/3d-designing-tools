// vertical ray caster with bucket grid
function caster(m) {
  const P = m.positions, I = m.indices, B = 2;
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (let i = 0; i < P.length; i += 3) { minx = Math.min(minx, P[i]); maxx = Math.max(maxx, P[i]); miny = Math.min(miny, P[i + 1]); maxy = Math.max(maxy, P[i + 1]); }
  const gx = Math.ceil((maxx - minx) / B) + 1, gy = Math.ceil((maxy - miny) / B) + 1, cells = Array.from({ length: gx * gy }, () => []);
  for (let t = 0; t < I.length; t += 3) {
    const xs = [P[I[t] * 3], P[I[t + 1] * 3], P[I[t + 2] * 3]], ys = [P[I[t] * 3 + 1], P[I[t + 1] * 3 + 1], P[I[t + 2] * 3 + 1]];
    const i0 = Math.floor((Math.min(...xs) - minx) / B), i1 = Math.floor((Math.max(...xs) - minx) / B);
    const j0 = Math.floor((Math.min(...ys) - miny) / B), j1 = Math.floor((Math.max(...ys) - miny) / B);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) cells[j * gx + i].push(t);
  }
  return (x, y) => {
    const i = Math.floor((x - minx) / B), j = Math.floor((y - miny) / B);
    if (i < 0 || j < 0 || i >= gx || j >= gy) return [];
    const hits = [];
    for (const t of cells[j * gx + i]) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const x1 = P[a], y1 = P[a + 1], x2 = P[b], y2 = P[b + 1], x3 = P[c], y3 = P[c + 1];
      const d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
      if (Math.abs(d) < 1e-14) continue;                 // vertical face
      const l1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / d;
      const l2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      hits.push({ z: l1 * P[a + 2] + l2 * P[b + 2] + l3 * P[c + 2], up: d > 0 });
    }
    return hits.sort((u, v) => u.z - v.z);
  };
}


module.exports=caster;
