# Edax 오셀로 엔진 (WebAssembly)

오셀로 봇 "어려움"은 초인간 엔진 **Edax**(공식 소스 https://github.com/abulmo/edax-reversi, v4.6)를
WebAssembly로 빌드해 **브라우저 Web Worker**에서 실행한다. (서버 부하 0, 완전정보라 정보 누출 없음)

## 산출물 (public/)
- `edax.js`   — emscripten glue (MODULARIZE: `createEdax()` 팩토리)
- `edax.wasm` — 엔진 (kindergarten 이식성 경로, SIMD/스레드 없음)
- `edax.data` — 평가 가중치 eval.dat(14MB)를 가상 FS `data/eval.dat`로 프리로드

## API (wasm_api.c — Edax의 인터랙티브 UI/입력스레드 우회)
- `edax_boot()`                     — 1회 초기화(eval 로드)
- `edax_bestmove(boardStr, level)`  — boardStr=64칸(둘 차례 'X'/상대 'O'/빈 '-')+" X", 반환=수 0~63

## 재빌드
```sh
tools/edax-wasm/build.sh      # docker 필요
```
난이도→레벨 매핑은 public/othello-worker.js (`edaxLevel`).
