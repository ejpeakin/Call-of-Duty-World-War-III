"""Bakes assets/car.glb into src/76_carmodel.js.
Drops the badge geometry (node 'Circle.014': front/rear/side emblems and model script),
groups materials into recolourable categories, splits out the four wheels so they can spin."""
import struct, json, base64, sys, numpy as np
src = sys.argv[1] if len(sys.argv) > 1 else 'assets/car.glb'
out = sys.argv[2] if len(sys.argv) > 2 else 'src/76_carmodel.js'
d = open(src, 'rb').read()
off = 12; ch = []
while off < len(d):
    clen, ct = struct.unpack('<I4s', d[off:off + 8]); ch.append(d[off + 8:off + 8 + clen]); off += 8 + clen
J = json.loads(ch[0]); BIN = ch[1]
DT = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
def acc(i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]; n = NC[a['type']]
    arr = np.frombuffer(BIN, dtype=DT[a['componentType']], count=a['count'] * n, offset=bv.get('byteOffset', 0) + a.get('byteOffset', 0))
    return arr.reshape(a['count'], n) if n > 1 else arr
def nodeM(n):
    if 'matrix' in n: return np.array(n['matrix'], dtype=np.float64).reshape(4, 4).T
    return np.eye(4)
world = {}
def walk(i, P):
    M = P @ nodeM(J['nodes'][i]); world[i] = M
    for c in J['nodes'][i].get('children', []): walk(c, M)
for r in J['scenes'][0]['nodes']: walk(r, np.eye(4))
parent = {}
for i, n in enumerate(J['nodes']):
    for c in n.get('children', []): parent[c] = i

DROP = ('Circle.014',)  # badges / emblems / model script
# category ids: 0 paint 1 black 2 glass 3 chrome 4 rim 5 tire 6 disc 7 caliper 8 lens | glow: 10 front 11 orange 12 red 13 amber
MATCAT = {0: 7, 1: 4, 2: 6, 3: 5, 4: 3, 5: 1, 7: 2, 9: 8, 10: 1, 16: 13, 17: 12, 21: 1, 22: 1, 23: 3, 25: 1, 26: 3, 27: 3, 28: 10, 29: 11, 30: 12}
PAINT = {6, 8, 11, 12, 13, 14, 15, 18, 19, 20, 24}
WHEELS = {'Cube.001': 0, 'Cube.002': 1, 'Cube.003': 2, 'Cube.004': 3}
SCALE, LIFT = 1.05, 0.024

groups = {'body': [], 'glow': [], 'w0': [], 'w1': [], 'w2': [], 'w3': []}
for i, n in enumerate(J['nodes']):
    if 'mesh' not in n: continue
    pname = J['nodes'][parent[i]]['name']
    if pname in DROP or any(n['name'].startswith(p) for p in DROP): continue
    M = world[i]; R = M[:3, :3]; Nm = np.linalg.inv(R).T; flip = np.linalg.det(R) < 0
    for p in J['meshes'][n['mesh']]['primitives']:
        mi = p['material']; cat = 0 if mi in PAINT else MATCAT[mi]
        pos = acc(p['attributes']['POSITION']).astype(np.float64)
        nrm = acc(p['attributes']['NORMAL']).astype(np.float64)
        w = (np.c_[pos, np.ones(len(pos))] @ M.T)[:, :3]
        w[:, 1] += LIFT; w *= SCALE
        nn = nrm @ Nm.T; nn /= np.maximum(np.linalg.norm(nn, axis=1, keepdims=True), 1e-9)
        idx = acc(p['indices']).astype(np.int64).reshape(-1, 3)
        if flip: idx = idx[:, ::-1]
        if pname in WHEELS and cat in (4, 5, 6): g = 'w%d' % WHEELS[pname]
        elif cat >= 10: g = 'glow'
        else: g = 'body'
        groups[g].append((w, nn, np.full(len(w), cat, np.uint8), idx))

def pack(parts, center=None):
    P = np.vstack([q[0] for q in parts]); N = np.vstack([q[1] for q in parts]); C = np.concatenate([q[2] for q in parts])
    I = []; base = 0
    for q in parts: I.append(q[3] + base); base += len(q[0])
    I = np.vstack(I).reshape(-1)
    if center is not None: P = P - center
    assert len(P) < 65536 and np.abs(P).max() < 4.0
    b64 = lambda a: base64.b64encode(a.tobytes()).decode()
    return {'p': b64(np.round(P * 8000).astype('<i2')), 'n': b64(np.round(N * 127).astype(np.int8)), 'c': b64(C), 'i': b64(I.astype('<u2')), 'v': int(len(P)), 't': int(len(I) // 3)}
outd = {'q': 1 / 8000, 'body': pack(groups['body']), 'glow': pack(groups['glow']), 'wheels': []}
for k in range(4):
    parts = groups['w%d' % k]; allp = np.vstack([q[0] for q in parts])
    tire = np.vstack([q[0] for q in parts if q[2][0] == 5])
    c = (tire.min(0) + tire.max(0)) / 2
    e = pack(parts, c); e['at'] = [round(float(x), 4) for x in c]; e['front'] = bool(c[2] > 0); outd['wheels'].append(e)
allb = np.vstack([q[0] for g in groups.values() for q in g])
outd['size'] = [round(float(x), 3) for x in (allb.max(0) - allb.min(0))]
js = ('// Baked from assets/car.glb by tools/convert_car.py (badges removed).\n'
      '// Model: "Goodbye And Good Riddance Nissan Car FBX" by PixelGTT, https://sketchfab.com/3d-models/goodbye-and-good-riddance-nissan-car-fbx-ba71611bcba3445db89287411ca85c87\n'
      '// Licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes: emblems/badges removed, windows tinted, paint recolourable.\n'
      'const CAR_DATA = ' + json.dumps(outd, separators=(',', ':')) + ';\n')
open(out, 'w').write(js)
print('body tris', outd['body']['t'], 'glow', outd['glow']['t'], 'wheels', [w['t'] for w in outd['wheels']], 'size', outd['size'], 'bytes', len(js))
print('wheel centres', [w['at'] for w in outd['wheels']])
