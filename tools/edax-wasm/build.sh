#!/bin/sh
# Edax(오셀로 엔진)를 브라우저용 WebAssembly로 빌드 → public/edax.{js,wasm,data}
# 요구: docker (emscripten/emsdk 이미지 자동 사용)
# 출처: 공식 Edax 소스 https://github.com/abulmo/edax-reversi (v4.6)
set -e
WORK=$(mktemp -d)
git clone --depth 1 https://github.com/abulmo/edax-reversi.git "$WORK/edax"
# eval 가중치(eval.dat)는 v4.6 리눅스 바이너리 tarball에서 추출
curl -sL -o "$WORK/edax46.tgz" https://github.com/abulmo/edax-reversi/releases/download/v4.6/edax-4.6-linux-x86.tar.gz
tar xzf "$WORK/edax46.tgz" -C "$WORK"      # → $WORK/data/eval.dat
mkdir -p "$WORK/edax/data"; cp "$WORK/data/eval.dat" "$WORK/edax/data/eval.dat"
cp "$(dirname "$0")/wasm_api.c" "$WORK/edax/src/wasm_api.c"
# kindergarten=이식성(intrinsic 없는) 경로로 emcc 컴파일. 단일스레드, UI/스레드 우회.
docker run --rm -v "$WORK/edax:/src" -w /src/src emscripten/emsdk \
  emcc wasm_api.c -DMOVE_GENERATOR=1 -DCOUNT_LAST_FLIP=1 -DUSE_SIMD=0 -DNDEBUG -O3 -I. \
  -o /src/edax.js --preload-file /src/data/eval.dat@data/eval.dat \
  -sALLOW_MEMORY_GROWTH=1 -sMODULARIZE=1 -sEXPORT_NAME=createEdax \
  -sEXPORTED_RUNTIME_METHODS=ccall -sENVIRONMENT=web,worker,node \
  -sEXPORTED_FUNCTIONS=_edax_boot,_edax_bestmove,_edax_eval
OUT="$(cd "$(dirname "$0")/../../public" && pwd)"
cp "$WORK/edax/edax.js" "$WORK/edax/edax.wasm" "$WORK/edax/edax.data" "$OUT/"
echo "완료 → $OUT/edax.{js,wasm,data}"
