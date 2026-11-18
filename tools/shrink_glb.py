"""Makes the embedded models smaller so the page downloads and starts faster (helps Chromebooks):

  * animation keyframes that a straight line between their neighbours already reproduces are dropped
    (rotations within ~0.1 degree, positions within 0.2% of the track's size); a track that never
    changes keeps only its first and last key
  * every accessor shares one buffer view per kind of data instead of one view each, and the numbers
    in the file's index are rounded, which shrinks the JSON part a lot

Meshes, skins and textures are copied byte for byte.

Usage (from the repo root):  python3 tools/shrink_glb.py
It rewrites src/77b_character_data.js and src/77_creatures_data.js in place. Running it again is safe.
"""
import base64, json, re, struct, sys, math
from array import array

ROT_EPS = 0.0009      # quaternion component error allowed when dropping a key (~0.1 degree)
REL_EPS = 0.002       # translation / scale error allowed, relative to the track's largest value


def read_glb(b):
    off, ch = 12, []
    while off < len(b):
        cl, ct = struct.unpack('<II', b[off:off + 8]); ch.append((ct, b[off + 8:off + 8 + cl])); off += 8 + cl
    J = json.loads(ch[0][1]); BIN = ch[1][1] if len(ch) > 1 else b''
    return J, BIN


def write_glb(J, BIN):
    js = json.dumps(J, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    while len(BIN) % 4: BIN += b'\0'
    total = 12 + 8 + len(js) + 8 + len(BIN)
    return struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(BIN), 0x004E4942) + BIN


NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
CSIZE = {5126: 4, 5123: 2, 5125: 4, 5121: 1, 5122: 2, 5120: 1}
CFMT = {5126: 'f', 5123: 'H', 5125: 'I', 5121: 'B', 5122: 'h', 5120: 'b'}


def acc_data(J, BIN, ai):
    a = J['accessors'][ai]; v = J['bufferViews'][a['bufferView']]
    n, k, cs = a['count'], NCOMP[a['type']], CSIZE[a['componentType']]
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0); stride = v.get('byteStride', 0) or k * cs
    out = []
    for i in range(n):
        out.append(list(struct.unpack_from('<%d%s' % (k, CFMT[a['componentType']]), BIN, start + i * stride)))
    return out


def reduce_track(times, vals, is_rot):
    n = len(times)
    if n <= 2: return list(range(n))
    if is_rot: eps = ROT_EPS
    else: eps = max(1e-5, REL_EPS * max(max(abs(x) for x in v) for v in vals))
    first = vals[0]
    if all(max(abs(a - b) for a, b in zip(v, first)) <= eps for v in vals): return [0, n - 1]
    def lerp_ok(i0, i1):   # every key strictly between i0 and i1 is reproduced by a straight line i0 -> i1
        t0, t1 = times[i0], times[i1]; dt = (t1 - t0) or 1e-9
        for j in range(i0 + 1, i1):
            u = (times[j] - t0) / dt; a, b = vals[i0], vals[i1]
            if is_rot:
                d = sum(x * y for x, y in zip(a, b)); bb = b if d >= 0 else [-x for x in b]
                q = [x + (y - x) * u for x, y in zip(a, bb)]; m = math.sqrt(sum(x * x for x in q)) or 1; q = [x / m for x in q]
                vj = vals[j]; dj = sum(x * y for x, y in zip(q, vj)); vj = vj if dj >= 0 else [-x for x in vj]
                if max(abs(x - y) for x, y in zip(q, vj)) > eps: return False
            else:
                if max(abs(x + (y - x) * u - z) for x, y, z in zip(a, b, vals[j])) > eps: return False
        return True
    keep = [0]; i = 0
    while i < n - 1:
        j = i + 1
        while j + 1 < n and lerp_ok(i, j + 1): j += 1
        keep.append(j); i = j
    return keep


def shrink(b):
    J, BIN = read_glb(b)
    data = {}   # accessor index -> (bytes, componentType, type, count, extra)
    anim_out = set(); anim_in = set()
    for an in J.get('animations', []):
        for ch in an['channels']:
            s = an['samplers'][ch['sampler']]
            if s.get('interpolation', 'LINEAR') != 'LINEAR':
                anim_in.add(s['input']); anim_out.add(s['output']); continue
            t = [x[0] for x in acc_data(J, BIN, s['input'])]; v = acc_data(J, BIN, s['output'])
            if len(v) != len(t): anim_in.add(s['input']); anim_out.add(s['output']); continue
            keep = reduce_track(t, v, ch['target']['path'] == 'rotation')
            nt = [t[i] for i in keep]; nv = [v[i] for i in keep]
            # each sampler gets its own new accessors (old ones may be shared, so leave them alone)
            J['accessors'].append({'componentType': 5126, 'count': len(nt), 'type': 'SCALAR', 'min': [round(min(nt), 5)], 'max': [round(max(nt), 5)], '_raw': array('f', nt).tobytes()})
            ti = len(J['accessors']) - 1
            flat = [c for q in nv for c in q]
            J['accessors'].append({'componentType': 5126, 'count': len(nv), 'type': J['accessors'][s['output']]['type'], '_raw': array('f', flat).tobytes()})
            s['input'], s['output'] = ti, len(J['accessors']) - 1
            s['interpolation'] = 'LINEAR'
    # keep only accessors still referenced
    used = set()
    for m in J['meshes']:
        for p in m['primitives']:
            used.update(p['attributes'].values())
            if 'indices' in p: used.add(p['indices'])
            for tg in p.get('targets', []): used.update(tg.values())
    for s in J.get('skins', []):
        if 'inverseBindMatrices' in s: used.add(s['inverseBindMatrices'])
    for an in J.get('animations', []):
        for s in an['samplers']: used.update([s['input'], s['output']])
    # pack: mesh vertex data keeps its own views (targets differ); animation and skin data share one view
    newbin = bytearray(); views = []; accs = []; amap = {}
    def align(n):
        while len(newbin) % n: newbin.append(0)
    vertex_kinds = {}
    for m in J['meshes']:
        for p in m['primitives']:
            for ai in p['attributes'].values(): vertex_kinds[ai] = 34962
            if 'indices' in p: vertex_kinds[p['indices']] = 34963
    shared = None
    for ai in sorted(used, key=lambda i: (i not in vertex_kinds, i)):   # vertex data first, then one shared block
        a = dict(J['accessors'][ai]); raw = a.pop('_raw', None)
        if raw is None:
            v = J['bufferViews'][a['bufferView']]; k, cs = NCOMP[a['type']], CSIZE[a['componentType']]
            start = v.get('byteOffset', 0) + a.get('byteOffset', 0); stride = v.get('byteStride', 0)
            if stride and stride != k * cs: raw = b''.join(BIN[start + i * stride:start + i * stride + k * cs] for i in range(a['count']))
            else: raw = BIN[start:start + a['count'] * k * cs]
        a.pop('byteOffset', None)
        if ai in vertex_kinds:
            align(4); views.append({'buffer': 0, 'byteOffset': len(newbin), 'byteLength': len(raw), 'target': vertex_kinds[ai]}); newbin += raw
            a['bufferView'] = len(views) - 1
        else:
            if shared is None: align(4); shared = {'buffer': 0, 'byteOffset': len(newbin), 'byteLength': 0}; views.append(shared); shared_i = len(views) - 1; shared_start = len(newbin)
            align(4); a['bufferView'] = shared_i; a['byteOffset'] = len(newbin) - shared_start; newbin += raw
            if 'min' in a and a['type'] != 'SCALAR': a.pop('min', None); a.pop('max', None)   # only inputs need min/max
        if 'min' in a: a['min'] = [round(x, 5) for x in a['min']]; a['max'] = [round(x, 5) for x in a['max']]
        amap[ai] = len(accs); accs.append(a)
        if shared is not None and ai not in vertex_kinds: shared['byteLength'] = len(newbin) - shared['byteOffset']
    # images keep their bytes
    for im in J.get('images', []):
        if 'bufferView' in im:
            v = J['bufferViews'][im['bufferView']]; raw = BIN[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
            align(4); views.append({'buffer': 0, 'byteOffset': len(newbin), 'byteLength': len(raw)}); newbin += raw; im['bufferView'] = len(views) - 1
    for m in J['meshes']:
        for p in m['primitives']:
            p['attributes'] = {k: amap[v] for k, v in p['attributes'].items()}
            if 'indices' in p: p['indices'] = amap[p['indices']]
    for s in J.get('skins', []):
        if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = amap[s['inverseBindMatrices']]
    for an in J.get('animations', []):
        for s in an['samplers']: s['input'] = amap[s['input']]; s['output'] = amap[s['output']]
    J['accessors'] = accs; J['bufferViews'] = views; J['buffers'] = [{'byteLength': len(newbin)}]
    for n in J.get('nodes', []):   # trim float noise in node transforms
        for k in ('translation', 'rotation', 'scale'):
            if k in n: n[k] = [round(x, 6) for x in n[k]]
    return write_glb(J, bytes(newbin))


def redo(path, pattern):
    s = open(path).read(); total0 = total1 = 0
    def sub(m):
        nonlocal total0, total1
        b = base64.b64decode(m.group(2)); nb = shrink(b); total0 += len(b); total1 += len(nb)
        return m.group(1) + base64.b64encode(nb).decode() + m.group(3)
    s2 = re.sub(pattern, sub, s)
    open(path, 'w').write(s2)
    print('%s: %d -> %d bytes of model (%d%%)' % (path, total0, total1, round(100 * total1 / max(1, total0))))


if __name__ == '__main__':
    redo('src/77b_character_data.js', r"(const CHARACTER_GLB = ')([^']+)(')")
    redo('src/77_creatures_data.js', r"(\w+: ')([^']+)(')")
