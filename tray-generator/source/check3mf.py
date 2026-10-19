import sys, zipfile, xml.etree.ElementTree as ET
from collections import Counter
path, holes, kind = sys.argv[1], int(sys.argv[2]), sys.argv[3]
z = zipfile.ZipFile(path); assert z.testzip() is None
assert set(z.namelist()) == {'[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model'}
ns = {'m': 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
root = ET.fromstring(z.read('3D/3dmodel.model'))
objs = root.find('m:resources', ns).findall('m:object', ns)
res = []
for o in objs:
    vs = o.findall('.//m:vertex', ns); ts = o.findall('.//m:triangle', ns); E = Counter()
    for t in ts:
        a, b, c = (int(t.get(k)) for k in ('v1', 'v2', 'v3'))
        for e in ((a, b), (b, c), (c, a)): E[e] += 1
    bad = sum(1 for e, n in E.items() if n != 1 or E.get((e[1], e[0])) != 1)
    eul = len(vs) - len(E) // 2 + len(ts)
    exp = 2 if o.get('name').startswith('Lid') else 2 - 2 * holes
    minz = min(float(v.get('z')) for v in vs)
    res.append((o.get('name'), len(ts), bad, eul, exp, minz))
good = all(r[2] == 0 and r[3] == r[4] for r in res) and len(objs) == (2 if kind == 'both' else 1) and len(root.find('m:build', ns)) == len(objs)
print(('OK ' if good else 'BAD ') + '; '.join(f'{n}: {t} tris, bad {b}, euler {e}' for n, t, b, e, x, mz in res))
