// 브라우저 Web Worker — 오셀로 봇 수 계산 + 코치 분석(페이지 메인스레드 안 멈춤).
// 1순위: Edax 엔진(WASM, 초인간). 실패 시 자체 미니맥스(othello-ai.js)로 폴백.
const VQ = self.location.search || '';          // 클라가 준 ?v=… → ai/edax/wasm 캐시 버스트에 전파
importScripts('othello-ai.js' + VQ);            // 폴백용 + 헬퍼(legalMoves/flips/applyOn)

let edaxBest = null;                             // cwrap된 edax_bestmove
let edaxEval = null;                             // cwrap된 edax_eval (코치용 국면 평가)
let edaxInit = null;

function ensureEdax() {
  if (edaxInit) return edaxInit;
  edaxInit = new Promise((resolve) => {
    try {
      importScripts('edax.js' + VQ);
      self.createEdax({ locateFile: (p) => p + VQ }).then((M) => {   // edax.wasm/edax.data도 버전 쿼리로
        M.ccall('edax_boot', null, [], []);
        edaxBest = (s, lv, ms) => M.ccall('edax_bestmove', 'number', ['string', 'number', 'number'], [s, lv, ms]);
        edaxEval = (s, lv, ms) => M.ccall('edax_eval', 'number', ['string', 'number', 'number'], [s, lv, ms]);
        resolve(true);
      }).catch(() => resolve(false));
    } catch (e) { resolve(false); }
  });
  return edaxInit;
}

// 난이도 → Edax 레벨. 쉬움1 보통4 어려움7 헬18.
function edaxLevel(level) {
  return level === 'hell' ? 18 : level === 'hard' ? 7 : level === 'normal' ? 4 : 1;
}
var EDAX_TIME_CAP = 5000;
// 코치 분석: 합법수마다 평가하므로 한 수당 시간 짧게(레벨도 충분히 강하지만 종반은 정확해짐)
var ANALYZE_LEVEL = 16, ANALYZE_CAP = 320;

// 8x8 보드('B'/'W'/null) + 둘 색(stm) → Edax 문자열(둘 차례='X', 상대='O')
function toEdax(board, stm) {
  const o = stm === 'B' ? 'W' : 'B';
  let s = '';
  for (let i = 0; i < 64; i++) { const v = board[i >> 3][i & 7]; s += v === stm ? 'X' : v === o ? 'O' : '-'; }
  return s + ' X';
}
const CORNERS = [[0, 0], [0, 7], [7, 0], [7, 7]];
const isCorner = (m) => CORNERS.some((c) => c[0] === m[0] && c[1] === m[1]);
function discDiff(board, me) { let a = 0, b = 0; for (const row of board) for (const v of row) { if (v === me) a++; else if (v) b++; } return a - b; }

// 종국 국면(둘 다 패스) → 실제 돌 차이를 평가값으로
function meValueOfChild(child, me, oppc) {
  const v = edaxEval(toEdax(child, oppc), ANALYZE_LEVEL, ANALYZE_CAP);   // 상대 관점 값
  if (v === -127) return discDiff(child, me);   // 종국: 돌 차이(me 기준)
  return -v;                                     // 상대 관점 음수화 = me 가치
}

// 왜 그 수가 최선인가(휴리스틱 설명) — 오셀로 원리 기반
function explainBest(board, bm, me) {
  const AI = self.OthelloAI, oppc = AI.opp(me);
  const child = AI.applyOn(board, bm[0], bm[1], me);
  const oppMob = AI.legalMoves(child, oppc).length;
  const rs = [];
  if (isCorner(bm)) rs.push('코너를 잡아 절대 안 뒤집히는 돌을 확보');
  if (oppMob === 0) rs.push('상대를 둘 곳 없게 만들어 한 번 더 두게 함');
  else if (oppMob <= 2) rs.push('상대가 둘 곳을 ' + oppMob + '곳으로 좁혀 기동력을 압박');
  // 빈 코너 옆(X·C자리)을 내가 안 채워 코너를 안 내줌
  const nearEmptyCorner = (m) => CORNERS.some((c) => board[c[0]][c[1]] == null && Math.abs(m[0] - c[0]) <= 1 && Math.abs(m[1] - c[1]) <= 1);
  if (!isCorner(bm) && !nearEmptyCorner(bm)) rs.push('코너 옆 위험 칸을 피한 안전한 자리');
  if (!rs.length) rs.push('수읽기상 가장 유리한 전개');
  return rs.join(' · ');
}
function moveWhyWorse(board, mv, me) {
  const oppc = self.OthelloAI.opp(me);
  if (CORNERS.some((c) => board[c[0]][c[1]] == null && Math.abs(mv[0] - c[0]) <= 1 && Math.abs(mv[1] - c[1]) <= 1) && !isCorner(mv))
    return '빈 코너 옆(X·C자리)이라 상대에게 코너를 내줄 위험';
  const child = self.OthelloAI.applyOn(board, mv[0], mv[1], me);
  if (self.OthelloAI.legalMoves(child, oppc).length >= 6) return '상대에게 둘 곳을 너무 많이 내줌(기동력 손해)';
  return null;
}

function analyze(boardBefore, move, me) {
  const AI = self.OthelloAI, oppc = AI.opp(me);
  const moves = AI.legalMoves(boardBefore, me);
  if (!moves.length) return null;
  const scored = moves.map((lm) => ({ m: lm, v: meValueOfChild(AI.applyOn(boardBefore, lm[0], lm[1], me), me, oppc) }));
  scored.sort((a, b) => b.v - a.v);
  const top = scored[0];
  const mine = scored.find((s) => s.m[0] === move[0] && s.m[1] === move[1]) || top;
  const rank = 1 + scored.filter((s) => s.v > mine.v).length;
  const loss = top.v - mine.v;
  const matchedBest = loss <= 0;                 // 동점이면 내 수도 최선으로 취급(다른 동점수 안 가리킴)
  const best = matchedBest ? mine.m : top.m;     // 표시용 최선수 = 내 수(동점) 또는 진짜 최선
  return {
    best, bestValue: top.v, myValue: mine.v, loss, rank, total: moves.length,
    why: explainBest(boardBefore, best, me),
    whyWorse: matchedBest ? null : moveWhyWorse(boardBefore, move, me),
  };
}

onmessage = function (e) {
  const d = e.data, type = d.type || 'move';
  ensureEdax().then((ok) => {
    if (type === 'analyze') {
      let res = null;
      if (ok && edaxEval) { try { res = analyze(d.boardBefore, d.move, d.me); } catch (err) { res = null; } }
      postMessage({ type: 'analyze', result: res });
      return;
    }
    // 봇 수
    if (ok && edaxBest) {
      try {
        const idx = edaxBest(toEdax(d.board, d.me), edaxLevel(d.level), EDAX_TIME_CAP);
        if (idx >= 0 && idx < 64) { postMessage({ type: 'move', mv: [idx >> 3, idx & 7] }); return; }
      } catch (err) { /* 폴백 */ }
    }
    postMessage({ type: 'move', mv: self.OthelloAI.bestMove(d.board, d.me, d.level, d.budgetMs) });
  });
};
