#!/usr/bin/env python3
"""
Parametric square box + lid generator (3D-printing, minimal weight).

Pure Python + NumPy, no CAD library needed. Writes binary STL files.

Features
  * Square box, every wall/floor/lid = WALL thickness (default 0.8 mm = 2 lines @ 0.4 nozzle)
  * STACKABLE = False -> plain box + flat lid with a plug skirt (lightest)
  * STACKABLE = True  -> box gets a recessed foot, lid is a recessed "tray" lid;
                         the box above stands on the lid's lip and its foot nests
                         into the recess, so stacks can't slide off.
                         Box foot step is a 45-degree staircase; the lid lip is a
                         ~1 mm overhang. Both print without supports.
  * Both parts are written in their print orientation (flat side on the bed).

Usage
  python parametric_box.py                       # defaults
  python parametric_box.py --size 60 --height 40 --stackable
  python parametric_box.py --size 50 --height 30 --wall 0.8 --clearance 0.2 --out mybox

How it works
  Every feature is an axis-aligned block, so the solid is built on a rectilinear
  grid whose planes are exactly the block faces. Only faces between a filled and
  an empty cell are emitted, which gives an exact, watertight, manifold mesh.
"""

import argparse
import math
import struct

import numpy as np

# ----------------------------------------------------------------------------
# Default parameters (all in mm)
# ----------------------------------------------------------------------------
INNER_SIZE = 50.0    # usable inside width of the box (square)
BOX_HEIGHT = 30.0    # outer height of the box body (without lid)
WALL = 0.8           # wall / floor / lid thickness
CLEARANCE = 0.2      # gap between mating parts (increase to 0.25-0.3 if fit is tight)
LID_DEPTH = 4.0      # how far the lid reaches into the box
STACKABLE = False
PLA_DENSITY = 1.24   # g/cm^3 (PETG ~1.27, ABS ~1.04)
STEP = 0.2           # stair-step size for 45-degree overhangs (use your layer height)


# ----------------------------------------------------------------------------
# Geometry helpers
# ----------------------------------------------------------------------------
def ring(W, inset, width, z0, z1):
    """Square ring (4 blocks). Outer edge is `inset` in from the WxW footprint."""
    a, b = inset, inset + width          # outer / inner inset
    lo, hi = a, W - a
    ilo, ihi = b, W - b
    if ihi <= ilo:                        # ring is fully solid
        return [plate(W, inset, z0, z1)]
    return [
        (lo, hi, lo, ilo, z0, z1),        # front
        (lo, hi, ihi, hi, z0, z1),        # back
        (lo, ilo, ilo, ihi, z0, z1),      # left
        (ihi, hi, ilo, ihi, z0, z1),      # right
    ]


def plate(W, inset, z0, z1):
    """Solid square slab, `inset` in from the WxW footprint."""
    return (inset, W - inset, inset, W - inset, z0, z1)


def stair(W, inset_bottom, inset_top, width, z0, step):
    """
    45-degree sloped wall made of stacked rings, moving from inset_bottom (at z0)
    to inset_top. Ring width is widened by sqrt(2) so the sloped wall keeps
    the nominal thickness measured perpendicular to the slope.
    Returns (blocks, z_top).
    """
    blocks = []
    direction = -1 if inset_top < inset_bottom else 1
    n = max(1, round(abs(inset_bottom - inset_top) / step))
    d = abs(inset_bottom - inset_top) / n
    w = width * math.sqrt(2)
    for k in range(n):
        ins = inset_bottom + direction * (k + 1) * d
        if direction < 0:
            blocks += ring(W, ins, w, z0 + k * d, z0 + (k + 1) * d)
        else:
            blocks += ring(W, ins - w + width, w, z0 + k * d, z0 + (k + 1) * d)
    return blocks, z0 + n * d


# ----------------------------------------------------------------------------
# Part definitions
# ----------------------------------------------------------------------------
def make_box(p):
    t, c = p["wall"], p["clearance"]
    W = p["inner"] + 2 * t
    H = p["height"]
    if not p["stackable"]:
        return [plate(W, 0, 0, t)] + ring(W, 0, t, 0, H)

    # Stackable: recessed foot that nests into the tray lid of the box below.
    foot_inset = 2 * t + 2 * c                 # fits inside the lid's tray with clearance c
    foot_h = p["lid_depth"] - c                # recess depth minus clearance -> stands on the lip
    blocks = [plate(W, foot_inset, 0, t)]      # floor
    blocks += ring(W, foot_inset, t, 0, foot_h)  # foot wall
    # 45-degree step out; first step already reaches over the lid lip (inner edge at
    # foot_inset - c) so the box stands on the lip, not on the lid's centre panel.
    st, z_top = stair(W, foot_inset - c, 0, t, foot_h, p["step"])
    blocks += st
    if z_top >= H:
        raise ValueError("Box height too small for the stackable foot.")
    blocks += ring(W, 0, t, z_top, H)          # main wall
    return blocks


def make_lid(p):
    t, c = p["wall"], p["clearance"]
    W = p["inner"] + 2 * t
    plug_inset = t + c                         # lid plug sits inside the box walls
    if not p["stackable"]:
        # Printed top-face-down: plate on bed, plug skirt pointing up.
        return [plate(W, 0, 0, t)] + ring(W, plug_inset, t, 0, t + p["lid_depth"])

    # Recessed tray lid, printed as used: plate on bed, tray wall up, flat lip on top.
    # The lip (wall + clearance wide overhang, ~1 mm) rests flat on the box wall top;
    # the box above stands on this lip and its foot drops into the recess.
    d = p["lid_depth"]
    blocks = [plate(W, plug_inset, 0, t)]
    blocks += ring(W, plug_inset, t, 0, d)                  # tray wall
    blocks += ring(W, 0, plug_inset + t, d, d + t)          # flat lip
    return blocks


# ----------------------------------------------------------------------------
# Rectilinear voxel mesher (exact, watertight)
# ----------------------------------------------------------------------------
def mesh_from_blocks(blocks, offset=(0.0, 0.0, 0.0)):
    r = lambda v: round(float(v), 5)
    axes = [sorted({r(b[2 * i]) for b in blocks} | {r(b[2 * i + 1]) for b in blocks})
            for i in range(3)]
    grid = np.zeros([len(a) - 1 for a in axes], dtype=bool)
    for b in blocks:
        idx = []
        for i in range(3):
            lo = axes[i].index(r(b[2 * i]))
            hi = axes[i].index(r(b[2 * i + 1]))
            idx.append(slice(min(lo, hi), max(lo, hi)))
        grid[tuple(idx)] = True

    coords = [np.array(a) for a in axes]
    P = np.pad(grid, 1)
    tris = []
    for ax in range(3):
        u, v = (ax + 1) % 3, (ax + 2) % 3       # right-handed: u x v = ax
        G = np.transpose(P, (ax, u, v))         # dims ordered (ax, u, v)
        A = G[:-1, 1:-1, 1:-1]
        B = G[1:, 1:-1, 1:-1]
        for normal_sign, mask in ((1, A & ~B), (-1, B & ~A)):
            i, j, k = np.nonzero(mask)
            if i.size == 0:
                continue
            a0 = coords[ax][i]
            u0, u1 = coords[u][j], coords[u][j + 1]
            v0, v1 = coords[v][k], coords[v][k + 1]

            def pt(uu, vv):
                q = np.zeros((i.size, 3))
                q[:, ax], q[:, u], q[:, v] = a0, uu, vv
                return q

            p00, p10, p11, p01 = pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1)
            if normal_sign > 0:
                tris += [np.stack([p00, p10, p11], 1), np.stack([p00, p11, p01], 1)]
            else:
                tris += [np.stack([p00, p11, p10], 1), np.stack([p00, p01, p11], 1)]
    T = np.concatenate(tris) + np.asarray(offset)
    return T, grid, coords


def mesh_volume(T):
    return float(np.einsum("ij,ij->i", T[:, 0], np.cross(T[:, 1], T[:, 2])).sum() / 6.0)


def write_stl(path, T, name="part"):
    n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
    n /= np.linalg.norm(n, axis=1, keepdims=True)
    data = np.zeros(len(T), dtype=[("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")])
    data["n"], data["v"] = n, T
    with open(path, "wb") as f:
        f.write(struct.pack("<80sI", name.encode()[:80].ljust(80, b" "), len(T)))
        f.write(data.tobytes())


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def generate(inner=INNER_SIZE, height=BOX_HEIGHT, wall=WALL, clearance=CLEARANCE,
             lid_depth=LID_DEPTH, stackable=STACKABLE, density=PLA_DENSITY,
             step=STEP, out="box"):
    p = dict(inner=inner, height=height, wall=wall, clearance=clearance,
             lid_depth=lid_depth, stackable=stackable, step=step)
    W = inner + 2 * wall
    box_T, *_ = mesh_from_blocks(make_box(p))
    lid_T, *_ = mesh_from_blocks(make_lid(p))
    tag = "stack" if stackable else "plain"
    files = {
        f"{out}_{tag}_box.stl": box_T,
        f"{out}_{tag}_lid.stl": lid_T,
        f"{out}_{tag}_plate.stl": np.concatenate([box_T, lid_T + [W + 5, 0, 0]]),
    }
    for fn, T in files.items():
        write_stl(fn, T, fn)
    vb, vl = mesh_volume(box_T), mesh_volume(lid_T)
    print(f"Outer size : {W:.2f} x {W:.2f} x {height:.2f} mm  (inside {inner:.2f} mm)")
    print(f"Box  : {vb/1000:.2f} cm^3  ~{vb/1000*density:.2f} g")
    print(f"Lid  : {vl/1000:.2f} cm^3  ~{vl/1000*density:.2f} g")
    print(f"Total: ~{(vb+vl)/1000*density:.2f} g  (solid, density {density} g/cm^3)")
    print("Wrote:", ", ".join(files))
    return files


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Parametric square box + lid")
    ap.add_argument("--size", type=float, default=INNER_SIZE, help="inner width (mm)")
    ap.add_argument("--height", type=float, default=BOX_HEIGHT, help="box outer height (mm)")
    ap.add_argument("--wall", type=float, default=WALL, help="wall thickness (mm)")
    ap.add_argument("--clearance", type=float, default=CLEARANCE, help="fit gap (mm)")
    ap.add_argument("--lid-depth", type=float, default=LID_DEPTH, help="lid insert depth (mm)")
    ap.add_argument("--stackable", action="store_true", help="make it stackable")
    ap.add_argument("--density", type=float, default=PLA_DENSITY, help="g/cm^3")
    ap.add_argument("--out", default="box", help="output file prefix")
    a = ap.parse_args()
    generate(a.size, a.height, a.wall, a.clearance, a.lid_depth, a.stackable,
             a.density, STEP, a.out)
