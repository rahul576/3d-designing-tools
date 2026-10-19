"""Self-tests for parametric_box.py"""
import itertools
from collections import Counter

import numpy as np

import parametric_box as pb


def blocks_grid(block_sets):
    """Put several block sets on one shared grid; return list of bool grids + cell volumes."""
    r = lambda v: round(float(v), 5)
    allb = [b for s in block_sets for b in s]
    axes = [sorted({r(b[2*i]) for b in allb} | {r(b[2*i+1]) for b in allb}) for i in range(3)]
    grids = []
    for s in block_sets:
        g = np.zeros([len(a) - 1 for a in axes], bool)
        for b in s:
            g[tuple(slice(axes[i].index(r(b[2*i])), axes[i].index(r(b[2*i+1]))) for i in range(3))] = True
        grids.append(g)
    d = [np.diff(a) for a in axes]
    vol = d[0][:, None, None] * d[1][None, :, None] * d[2][None, None, :]
    return grids, vol


def move(blocks, dx=0, dy=0, dz=0):
    return [(b[0]+dx, b[1]+dx, b[2]+dy, b[3]+dy, b[4]+dz, b[5]+dz) for b in blocks]


def flip_z(blocks, top):
    return [(b[0], b[1], b[2], b[3], top - b[5], top - b[4]) for b in blocks]


def zmax(blocks):
    return max(b[5] for b in blocks)


def check_mesh(name, blocks):
    T, grid, coords = pb.mesh_from_blocks(blocks)
    # 1. manifold + watertight: each undirected edge used by exactly 2 triangles,
    #    each directed edge exactly once (consistent orientation)
    V = np.round(T, 5)
    directed = Counter()
    for tri in V:
        for a, b in ((0, 1), (1, 2), (2, 0)):
            directed[(tuple(tri[a]), tuple(tri[b]))] += 1
    bad_dir = sum(1 for e, n in directed.items() if n != 1 or directed.get((e[1], e[0]), 0) != 1)
    # 2. volume: mesh (divergence theorem) vs voxel sum, must be positive (outward normals)
    d = [np.diff(c) for c in coords]
    vox = float((grid * (d[0][:, None, None] * d[1][None, :, None] * d[2][None, None, :])).sum())
    vm = pb.mesh_volume(T)
    # 3. one connected piece (face-connected flood fill)
    seen = np.zeros_like(grid)
    start = tuple(np.argwhere(grid)[0]); stack = [start]; seen[start] = True
    while stack:
        c = stack.pop()
        for ax in range(3):
            for s in (-1, 1):
                n = list(c); n[ax] += s; n = tuple(n)
                if 0 <= n[ax] < grid.shape[ax] and grid[n] and not seen[n]:
                    seen[n] = True; stack.append(n)
    pieces_ok = seen.sum() == grid.sum()
    # 4. thinnest solid run along X/Y (walls) and Z (floors)
    def min_run(ax):
        g = np.moveaxis(grid, ax, -1); w = d[ax]; best = 1e9
        for line in g.reshape(-1, g.shape[-1]):
            run = 0.0
            for f, ww in zip(line, w):
                if f: run += ww
                elif run: best = min(best, run); run = 0.0
            if run: best = min(best, run)
        return best
    thin = min(min_run(0), min_run(1)), min_run(2)
    ok = bad_dir == 0 and abs(vm - vox) < 1e-6 * max(1, vox) and vm > 0 and pieces_ok
    print(f"  {name:22s} tris={len(T):6d} vol={vm/1000:7.3f}cm3 "
          f"badEdges={bad_dir} onePiece={pieces_ok} minWallXY={thin[0]:.2f} minZ={thin[1]:.2f} "
          f"-> {'PASS' if ok else 'FAIL'}")
    return ok, thin


def check_fit(p):
    box, lid = pb.make_box(p), pb.make_lid(p)
    H = p["height"]
    ok = True
    if not p["stackable"]:
        lid_a = flip_z(lid, zmax(lid))                # turned over: skirt 0..depth, plate above
        lid_a = move(lid_a, dz=H - p["lid_depth"])     # plate underside on the wall top
        pairs = {"lid on box": (box, lid_a)}
    else:
        # lid tray sits with its flange step resting on the wall top
        lid_a = lid
        # lowest flange block that is above the wall footprint
        W = p["inner"] + 2 * p["wall"]
        def over_wall(b):
            return b[0] < p["wall"] or b[1] > W - p["wall"] or b[2] < p["wall"] or b[3] > W - p["wall"]
        seat = min(b[4] for b in lid if over_wall(b))
        lid_a = move(lid, dz=H - seat)
        box2 = move(box, dz=zmax(lid_a))
        box2 = move(box2, dz=-zmax(lid_a))           # start at z=0, then drop until contact
        # find resting height of box2 on top of lid_a: smallest dz with no overlap
        lo, hi = 0.0, zmax(lid_a) + 1
        for _ in range(40):
            mid = (lo + hi) / 2
            (g1, g2), vol = blocks_grid([lid_a + box, move(box2, dz=mid)])
            if (g1 & g2).any(): lo = mid
            else: hi = mid
        rest = hi
        box2 = move(box2, dz=rest)
        pairs = {"lid on box": (box, lid_a), "box stacked on lid": (lid_a + box, box2)}
        nest = zmax(lid_a) - rest
        print(f"    stacked box rests at z={rest:.2f}, foot nests {nest:.2f} mm into the lid "
              f"(lateral lock {'YES' if nest > 0.5 else 'NO'})")
        ok &= nest > 0.5
    for label, (a, b) in pairs.items():
        (g1, g2), vol = blocks_grid([a, b])
        overlap = float((vol * (g1 & g2)).sum())
        # it must be resting (touching): 0.05 mm lower -> overlap
        (g1, g3), vol2 = blocks_grid([a, move(b, dz=-0.05)])
        touching = (g1 & g3).any()
        # lateral play: shifting 0.15 mm sideways must still be free, 0.3 mm must collide
        free = []
        for dx in (p["clearance"] * 0.75, p["clearance"] * 1.5):
            (h1, h2), _ = blocks_grid([a, move(b, dx=dx)])
            free.append(not (h1 & h2).any())
        good = overlap == 0 and touching and free[0] and not free[1]
        print(f"    {label:20s} overlap={overlap:.3f}mm3 resting={touching} "
              f"play<{p['clearance']*1.5:.2f}mm={'yes' if free[0] and not free[1] else 'NO'} "
              f"-> {'PASS' if good else 'FAIL'}")
        ok &= good
    return ok


if __name__ == "__main__":
    all_ok = True
    cases = list(itertools.product([20, 50, 85.5], [15, 30, 60], [False, True]))
    for inner, h, st in cases:
        p = dict(inner=inner, height=h, wall=0.8, clearance=0.2, lid_depth=4.0,
                 stackable=st, step=0.2)
        print(f"inner={inner} height={h} stackable={st}")
        for name, blocks in (("box", pb.make_box(p)), ("lid", pb.make_lid(p))):
            ok, thin = check_mesh(name, blocks)
            # floor / lid plate thickness at the centre must equal the wall setting
            W = inner + 1.6
            centre = [b for b in blocks if b[0] < W/2 < b[1] and b[2] < W/2 < b[3]]
            plate_t = sum(b[5] - b[4] for b in centre)
            print(f"    centre plate thickness = {plate_t:.2f} mm")
            all_ok &= ok and thin[0] >= 0.8 - 1e-6 and abs(plate_t - 0.8) < 1e-9
        all_ok &= check_fit(p)
    print("\nALL TESTS PASSED" if all_ok else "\nSOME TESTS FAILED")
