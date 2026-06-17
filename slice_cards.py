# 화투 원본 이미지(_cards_src.png)를 20장 카드로 자동 분할 → public/cards/m-v.png
# 순수 표준 라이브러리만 사용(zlib). PIL 불필요.
import zlib, struct, os

SRC = "_cards_src.png"
OUT = "public/cards"
os.makedirs(OUT, exist_ok=True)

# ---- PNG 디코드 (8bit, colortype 2/6, interlace 0) ----
def decode_png(path):
    d = open(path, "rb").read()
    assert d[:8] == b"\x89PNG\r\n\x1a\n", "not png"
    pos = 8; idat = b""; W = H = ct = None
    while pos < len(d):
        ln = struct.unpack(">I", d[pos:pos+4])[0]
        typ = d[pos+4:pos+8]; chunk = d[pos+8:pos+8+ln]; pos += 12 + ln
        if typ == b"IHDR":
            W, H, bd, ct, comp, filt, inter = struct.unpack(">IIBBBBB", chunk)
        elif typ == b"IDAT":
            idat += chunk
        elif typ == b"IEND":
            break
    raw = zlib.decompress(idat)
    ch = 4 if ct == 6 else 3
    stride = W * ch
    def paeth(a, b, c):
        p = a + b - c; pa = abs(p-a); pb = abs(p-b); pc = abs(p-c)
        return a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
    out = bytearray(); prev = bytearray(stride); i = 0
    for y in range(H):
        ft = raw[i]; i += 1
        line = bytearray(raw[i:i+stride]); i += stride
        if ft == 1:
            for x in range(ch, stride): line[x] = (line[x] + line[x-ch]) & 255
        elif ft == 2:
            for x in range(stride): line[x] = (line[x] + prev[x]) & 255
        elif ft == 3:
            for x in range(stride):
                a = line[x-ch] if x >= ch else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255
        elif ft == 4:
            for x in range(stride):
                a = line[x-ch] if x >= ch else 0
                c = prev[x-ch] if x >= ch else 0
                line[x] = (line[x] + paeth(a, prev[x], c)) & 255
        out += line; prev = line
    return W, H, ch, bytes(out)

# ---- PNG 인코드 (RGBA, filter 0) ----
def encode_png(W, H, ch, px):
    def chunk(typ, data):
        return struct.pack(">I", len(data)) + typ + data + struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", W, H, 8, 6 if ch == 4 else 2, 0, 0, 0)
    stride = W * ch
    raw = bytearray()
    for y in range(H):
        raw.append(0)
        raw += px[y*stride:(y+1)*stride]
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")

W, H, ch, px = decode_png(SRC)
print(f"decoded {W}x{H} ch={ch}")

def is_ink(x, y):
    o = (y*W + x)*ch
    r, g, b = px[o], px[o+1], px[o+2]
    a = px[o+3] if ch == 4 else 255
    if a < 60: return False
    return not (r > 222 and g > 222 and b > 222)   # 흰 배경 제외

# 행 투영 → 행 밴드(카드 줄) 검출
rowink = [sum(1 for x in range(W) if is_ink(x, y)) for y in range(H)]
rth = W * 0.04
def bands(profile, thr, mingap=4, minlen=14):
    res = []; s = None; gap = 0
    for i, v in enumerate(profile):
        if v > thr:
            if s is None: s = i
            gap = 0
        else:
            if s is not None:
                gap += 1
                if gap >= mingap:
                    if i - gap - s >= minlen: res.append((s, i - gap))
                    s = None
    if s is not None and len(profile) - s >= minlen: res.append((s, len(profile)-1))
    return res

rowbands = bands(rowink, rth)
print("row bands:", rowbands)

def tight_box(x0, x1, y0, y1):
    xs0 = xs1 = ys0 = ys1 = None
    for y in range(y0, y1+1):
        for x in range(x0, x1+1):
            if is_ink(x, y):
                if xs0 is None or x < xs0: xs0 = x
                if xs1 is None or x > xs1: xs1 = x
                if ys0 is None or y < ys0: ys0 = y
                if ys1 is None or y > ys1: ys1 = y
    return xs0, xs1, ys0, ys1

def crop(x0, x1, y0, y1):
    w = x1 - x0 + 1; h = y1 - y0 + 1
    buf = bytearray(w*h*ch)
    for j, y in enumerate(range(y0, y1+1)):
        src = (y*W + x0)*ch
        buf[j*w*ch:(j+1)*w*ch] = px[src:src + w*ch]
    return w, h, bytes(buf)

cards = []  # (m, v, box)
for ri, (y0, y1) in enumerate(rowbands[:5]):
    rh = y1 - y0
    colink = [sum(1 for y in range(y0, y1+1) if is_ink(x, y)) for x in range(W)]
    cbands = bands(colink, rh*0.20, mingap=3, minlen=16)
    # 카드 = 세로 점유가 큰 밴드(숫자 라벨은 키가 작아 제외)
    cardbands = []
    for (x0, x1) in cbands:
        bx0, bx1, by0, by1 = tight_box(x0, x1, y0, y1)
        if by0 is None: continue
        if (by1 - by0) >= rh * 0.55 and (x1 - x0) >= 24:
            cardbands.append((bx0, bx1, by0, by1))
    cardbands.sort(key=lambda b: b[0])
    print(f"row {ri}: {len(cardbands)} cards", [(b[0],b[1]) for b in cardbands])
    if len(cardbands) != 4:
        continue
    m_left, m_right = ri+1, ri+6
    mapping = [(m_left,0),(m_left,1),(m_right,0),(m_right,1)]
    for (m, v), (bx0, bx1, by0, by1) in zip(mapping, cardbands):
        cards.append((m, v, (bx0, bx1, by0, by1)))

print(f"detected {len(cards)} cards")
for (m, v, (x0, x1, y0, y1)) in cards:
    w, h, buf = crop(x0, x1, y0, y1)
    open(f"{OUT}/{m}-{v}.png", "wb").write(encode_png(w, h, ch, buf))
print("done ->", OUT)
