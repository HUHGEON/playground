# 화투 월별 strip(4컷)을 48장 + 보너스 strip을 개별 카드로 분할 → public/gostop/
# 순수 표준 라이브러리(zlib)만. PIL 불필요.
import zlib, struct, os, glob

T = "/var/folders/wn/3r1j41g55hx4q4x77p9x7bj00000gn/T"
def src(stamp):
    g = glob.glob(f"{T}/clipboard-2026-06-20-{stamp}-*.png")
    return g[0] if g else None

STRIPS = {1:"200425",2:"200432",3:"200437",4:"200443",5:"200605",6:"200612",
          7:"200617",8:"200624",9:"200629",10:"200634",11:"200640",12:"200714"}
BONUS = "200856"
OUT = "public/gostop"
os.makedirs(OUT, exist_ok=True)

def decode_png(path):
    d = open(path, "rb").read()
    assert d[:8] == b"\x89PNG\r\n\x1a\n", "not png"
    pos = 8; idat = b""; W = H = ct = None
    while pos < len(d):
        ln = struct.unpack(">I", d[pos:pos+4])[0]
        typ = d[pos+4:pos+8]; chunk = d[pos+8:pos+8+ln]; pos += 12 + ln
        if typ == b"IHDR": W, H, bd, ct, comp, filt, inter = struct.unpack(">IIBBBBB", chunk)
        elif typ == b"IDAT": idat += chunk
        elif typ == b"IEND": break
    raw = zlib.decompress(idat); ch = 4 if ct == 6 else 3; stride = W * ch
    def paeth(a,b,c):
        p=a+b-c; pa=abs(p-a); pb=abs(p-b); pc=abs(p-c)
        return a if (pa<=pb and pa<=pc) else (b if pb<=pc else c)
    out = bytearray(); prev = bytearray(stride); i = 0
    for y in range(H):
        ft = raw[i]; i += 1; line = bytearray(raw[i:i+stride]); i += stride
        if ft==1:
            for x in range(ch,stride): line[x]=(line[x]+line[x-ch])&255
        elif ft==2:
            for x in range(stride): line[x]=(line[x]+prev[x])&255
        elif ft==3:
            for x in range(stride):
                a=line[x-ch] if x>=ch else 0; line[x]=(line[x]+((a+prev[x])>>1))&255
        elif ft==4:
            for x in range(stride):
                a=line[x-ch] if x>=ch else 0; c=prev[x-ch] if x>=ch else 0
                line[x]=(line[x]+paeth(a,prev[x],c))&255
        out += line; prev = line
    return W, H, ch, bytes(out)

def encode_png(W, H, ch, px):
    def chunk(typ, data):
        return struct.pack(">I", len(data)) + typ + data + struct.pack(">I", zlib.crc32(typ+data)&0xffffffff)
    ihdr = struct.pack(">IIBBBBB", W, H, 8, 6 if ch==4 else 2, 0, 0, 0); stride = W*ch
    raw = bytearray()
    for y in range(H): raw.append(0); raw += px[y*stride:(y+1)*stride]
    return b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",ihdr)+chunk(b"IDAT",zlib.compress(bytes(raw),9))+chunk(b"IEND",b"")

def slice_into(path, n, prefix):
    W,H,ch,px = decode_png(path)
    def ink(x,y):
        o=(y*W+x)*ch; r,g,b=px[o],px[o+1],px[o+2]; a=px[o+3] if ch==4 else 255
        if a<60: return False
        return not (r>222 and g>222 and b>222)
    col = [sum(1 for y in range(H) if ink(x,y)) for x in range(W)]
    thr = H*0.05
    # 컬럼 밴드(카드 묶음) 찾기
    bands=[]; s=None; gap=0
    for i,v in enumerate(col+[0]*5):   # 끝에 여백 패딩 → 마지막 카드도 종료됨
        if v>thr:
            if s is None: s=i
            gap=0
        else:
            if s is not None:
                gap+=1
                if gap>=3:
                    if i-gap-s >= W//(n*3): bands.append((s,i-gap)); s=None
    bands.sort()
    print(f"{prefix}: {len(bands)} bands (expect {n})", [(b[0],b[1]) for b in bands])
    if len(bands)!=n:
        return False
    def crop(x0,x1):
        # 세로도 타이트하게(위아래 흰여백 제거)
        y0=y1=None
        for y in range(H):
            if any(ink(x,y) for x in range(x0,x1+1)):
                if y0 is None: y0=y
                y1=y
        w=x1-x0+1; h=y1-y0+1; buf=bytearray(w*h*ch)
        for j,y in enumerate(range(y0,y1+1)):
            so=(y*W+x0)*ch; buf[j*w*ch:(j+1)*w*ch]=px[so:so+w*ch]
        return w,h,buf
    for idx,(x0,x1) in enumerate(bands):
        w,h,buf = crop(x0,x1)
        open(f"{OUT}/{prefix}-{idx}.png","wb").write(encode_png(w,h,ch,bytes(buf)))
    return True

ok=0
for m,stamp in STRIPS.items():
    p=src(stamp)
    if p and slice_into(p, 4, str(m)): ok+=1
bp=src(BONUS)
if bp: slice_into(bp, 5, "bonus")
print(f"\n월별 성공: {ok}/12")
