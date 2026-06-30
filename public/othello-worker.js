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

// 좌표 표기, 코너 위험칸(X·C자리) 분류
const sq = (m) => String.fromCharCode(65 + m[1]) + (m[0] + 1);
const CORNER_DANGER = [
  { corner: [0, 0], x: [1, 1], c: [[0, 1], [1, 0]] },
  { corner: [0, 7], x: [1, 6], c: [[0, 6], [1, 7]] },
  { corner: [7, 0], x: [6, 1], c: [[7, 1], [6, 0]] },
  { corner: [7, 7], x: [6, 6], c: [[7, 6], [6, 7]] },
];
// 빈 코너에 대한 위험칸이면 {type:'X'|'C', corner} (코너가 이미 차있으면 위험 아님 → null)
function dangerClass(board, m) {
  for (const d of CORNER_DANGER) {
    if (board[d.corner[0]][d.corner[1]] != null) continue;
    if (m[0] === d.x[0] && m[1] === d.x[1]) return { type: 'X', corner: d.corner };
    if (d.c.some((cc) => cc[0] === m[0] && cc[1] === m[1])) return { type: 'C', corner: d.corner };
  }
  return null;
}
const onEdge = (m) => m[0] === 0 || m[0] === 7 || m[1] === 0 || m[1] === 7;
const oppMobAfter = (board, m, me) => self.OthelloAI.legalMoves(self.OthelloAI.applyOn(board, m[0], m[1], me), self.OthelloAI.opp(me)).length;
const flipN = (board, m, me) => self.OthelloAI.flips(board, m[0], m[1], me).length;

// 프런티어(빈칸에 닿은 돌) 수 — 적을수록 안정적
function frontier(board, me) {
  let n = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (board[r][c] !== me) continue;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc;
      if ((dr || dc) && nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] == null) { n++; dr = dc = 2; }
    }
  }
  return n;
}
// 왜 이 자리가 좋은가 — 초보도 이해되게 "여기 두면 ~해서 좋아요" 식
function explainBest(board, bm, me, bestValue, empties) {
  if (isCorner(bm)) return '🟢 모서리예요! 모서리는 한번 먹으면 절대 안 뒤집혀서 제일 좋은 자리예요.';
  const oppMob = oppMobAfter(board, bm, me);
  const fl = flipN(board, bm, me);
  const rs = [];
  if (oppMob === 0) rs.push('여기 두면 상대가 둘 곳이 없어져서 내가 한 번 더 둘 수 있어요');
  else if (oppMob <= 3) rs.push('여기 두면 상대가 둘 곳이 ' + oppMob + '곳밖에 안 남아서 상대가 곤란해져요');
  if (!dangerClass(board, bm)) {
    if (fl <= 2) rs.push('조금만(' + fl + '장) 뒤집어서 나중에 둘 자리를 아껴둬요');
    else if (onEdge(bm)) rs.push('가장자리라 잘 안 뒤집혀서 비교적 안전해요');
  }
  if (empties <= 16) rs.push('끝까지 계산하면 ' + Math.abs(bestValue) + '개 차이로 ' + (bestValue >= 0 ? '이겨요' : '지지만 이게 그나마 최선이에요'));
  if (!rs.length) rs.push('지금 판에서 가장 유리한 자리예요');
  return rs.slice(0, 2).join('. ') + '.';
}
// 왜 이 자리는 별로인가 — 초보용 결과 설명
function moveWhyWorse(board, mv, me, bestMove, loss) {
  const dc = dangerClass(board, mv);
  if (dc) return '여기 두면 상대가 다음에 ' + sq(dc.corner) + ' 모서리를 먹을 수 있어요. 모서리를 뺏기면 그 돌은 영영 못 바꿔서 손해예요.';
  const myMob = oppMobAfter(board, mv, me), bestMob = oppMobAfter(board, bestMove, me);
  if (myMob - bestMob >= 3) return '여기 두면 상대가 둘 곳이 ' + myMob + '곳이나 생겨요. 상대한테 선택지를 많이 주면 불리해요(최선은 ' + bestMob + '곳).';
  const myFl = flipN(board, mv, me), bestFl = flipN(board, bestMove, me);
  if (myFl - bestFl >= 4) return '지금 너무 많이(' + myFl + '장) 뒤집었어요. 욕심내서 많이 먹으면 나중에 둘 곳이 없어져서 손해예요.';
  if (isCorner(bestMove)) return '지금 ' + sq(bestMove) + ' 모서리를 바로 먹을 수 있었는데 놓쳤어요.';
  return '최선보다 살짝 손해예요(끝까지 보면 ' + loss + '개 차이).';
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
  const empties = boardBefore.reduce((n, row) => n + row.filter((v) => v == null).length, 0);
  return {
    best, bestValue: top.v, myValue: mine.v, loss, rank, total: moves.length, empties,
    why: explainBest(boardBefore, best, me, top.v, empties),
    whyWorse: matchedBest ? null : moveWhyWorse(boardBefore, move, me, best, loss),
  };
}

// 모든 합법수를 한 번에 평가(턴마다 1회 → hover는 캐시만 읽음)
function analyzeAll(board, me) {
  const AI = self.OthelloAI, oppc = AI.opp(me);
  const moves = AI.legalMoves(board, me);
  if (!moves.length) return null;
  const scored = moves.map((lm) => ({ m: lm, v: meValueOfChild(AI.applyOn(board, lm[0], lm[1], me), me, oppc) }));
  scored.sort((a, b) => b.v - a.v);
  const top = scored[0];
  const empties = board.reduce((n, row) => n + row.filter((v) => v == null).length, 0);
  const out = scored.map((s) => {
    const rank = 1 + scored.filter((x) => x.v > s.v).length;
    const loss = top.v - s.v;
    const isBest = loss <= 0;
    return {
      r: s.m[0], c: s.m[1], value: s.v, rank, loss,
      reason: isBest ? explainBest(board, s.m, me, s.v, empties) : moveWhyWorse(board, s.m, me, top.m, loss),
    };
  });
  return { best: top.m, bestValue: top.v, total: moves.length, moves: out };
}

onmessage = function (e) {
  const d = e.data, type = d.type || 'move';
  ensureEdax().then((ok) => {
    if (type === 'analyzeAll') {
      let res = null;
      if (ok && edaxEval) { try { res = analyzeAll(d.board, d.me); } catch (err) { res = null; } }
      postMessage({ type: 'analyzeAll', result: res, reqId: d.reqId });   // 어느 국면 분석인지 키 echo
      return;
    }
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
