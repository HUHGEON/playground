// 브라우저 Web Worker — 오셀로 봇 수 계산(페이지 메인스레드 안 멈춤).
// 1순위: Edax 엔진(WASM, 초인간). 실패 시 자체 미니맥스(othello-ai.js)로 폴백.
importScripts('othello-ai.js');                 // 폴백용 (self.OthelloAI)

let edaxBest = null;                             // 준비되면 cwrap된 edax_bestmove
let edaxInit = null;                             // 준비 Promise(1회)

function ensureEdax() {
  if (edaxInit) return edaxInit;
  edaxInit = new Promise((resolve) => {
    try {
      importScripts('edax.js');                  // createEdax 팩토리 정의(MODULARIZE)
      self.createEdax().then((M) => {
        M.ccall('edax_boot', null, [], []);      // eval.dat 로드(1회, ~0.2초)
        edaxBest = (s, lv, ms) => M.ccall('edax_bestmove', 'number', ['string', 'number', 'number'], [s, lv, ms]);
        resolve(true);
      }).catch(() => resolve(false));
    } catch (e) { resolve(false); }
  });
  return edaxInit;
}

// 난이도 → Edax 레벨(탐색 깊이). 쉬움1(입문) 보통4(중급) 어려움7(고수) 헬18(세계챔피언급).
function edaxLevel(level) {
  return level === 'hell' ? 18 : level === 'hard' ? 7 : level === 'normal' ? 4 : 1;
}
var EDAX_TIME_CAP = 5000;   // 한 수 최대 5초(헬 레벨15가 종반서 넘으면 그 안의 최선수)

// 8x8 보드('B'/'W'/null) + 둘 색(me) → Edax 보드 문자열(둘 차례='X', 상대='O')
function toEdax(board, me) {
  const opp = me === 'B' ? 'W' : 'B';
  let s = '';
  for (let i = 0; i < 64; i++) { const v = board[i >> 3][i & 7]; s += v === me ? 'X' : v === opp ? 'O' : '-'; }
  return s + ' X';
}

onmessage = function (e) {
  const { board, me, level, budgetMs } = e.data;
  ensureEdax().then((ok) => {
    if (ok && edaxBest) {
      try {
        const idx = edaxBest(toEdax(board, me), edaxLevel(level), EDAX_TIME_CAP);
        if (idx >= 0 && idx < 64) { postMessage([idx >> 3, idx & 7]); return; }
      } catch (err) { /* 폴백으로 */ }
    }
    postMessage(self.OthelloAI.bestMove(board, me, level, budgetMs));   // 폴백: 미니맥스
  });
};
