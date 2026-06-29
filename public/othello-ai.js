// ───────────────────────────────────────────────────────────
//  오셀로 봇 AI (순수 함수) — 브라우저 Web Worker에서 실행(클라가 봇 수 계산).
//  미니맥스 + 알파베타 + 이동순서 + 강화 평가 + (어려움/헬) 시간제한 반복심화.
// ───────────────────────────────────────────────────────────
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const opp = (p) => (p === 'B' ? 'W' : 'B');
const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
function flips(b, r, c, p) {
  if (!inB(r, c) || b[r][c]) return [];
  const out = [];
  for (const [dr, dc] of DIRS) {
    const line = []; let nr = r + dr, nc = c + dc;
    while (inB(nr, nc) && b[nr][nc] === opp(p)) { line.push([nr, nc]); nr += dr; nc += dc; }
    if (line.length && inB(nr, nc) && b[nr][nc] === p) out.push(...line);
  }
  return out;
}
function legalMoves(b, p) {
  const m = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (flips(b, r, c, p).length) m.push([r, c]);
  return m;
}
function applyOn(b, r, c, p) {
  const nb = b.map((row) => row.slice());
  const f = flips(nb, r, c, p); nb[r][c] = p; for (const [fr, fc] of f) nb[fr][fc] = p;
  return nb;
}
function score(b) { let B = 0, W = 0; for (const row of b) for (const v of row) { if (v === 'B') B++; else if (v === 'W') W++; } return { B, W }; }

const POS_W = [
  [120, -20, 20, 5, 5, 20, -20, 120],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [120, -20, 20, 5, 5, 20, -20, 120],
];
function evalBoard(board, me) {
  const o = opp(me);
  let pos = 0, my = 0, op = 0, myF = 0, opF = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const v = board[r][c];
    if (!v) continue;
    let front = false;
    for (const [dr, dc] of DIRS) { const nr = r + dr, nc = c + dc; if (inB(nr, nc) && !board[nr][nc]) { front = true; break; } }
    if (v === me) { pos += POS_W[r][c]; my++; if (front) myF++; }
    else { pos -= POS_W[r][c]; op++; if (front) opF++; }
  }
  let corner = 0;
  for (const [r, c] of [[0, 0], [0, 7], [7, 0], [7, 7]]) { if (board[r][c] === me) corner += 35; else if (board[r][c] === o) corner -= 35; }
  const mob = legalMoves(board, me).length - legalMoves(board, o).length;
  const empties = 64 - my - op;
  let s = pos + corner + (opF - myF) * 8;
  if (empties > 12) s += mob * 16; else s += mob * 5 + (my - op) * 24;
  return s;
}
function ordered(moves) { return moves.sort((a, b) => POS_W[b[0]][b[1]] - POS_W[a[0]][a[1]]); }

let _nodes = 0, _deadline = Infinity, _aborted = false;
function minimax(board, me, toMove, depth, alpha, beta) {
  if (_aborted) return 0;
  if ((++_nodes & 4095) === 0 && Date.now() > _deadline) { _aborted = true; return 0; }
  if (depth <= 0) return evalBoard(board, me);
  const moves = legalMoves(board, toMove);
  const o = opp(toMove);
  if (!moves.length) {
    if (!legalMoves(board, o).length) {
      const sc = score(board), a = me === 'B' ? sc.B : sc.W, b = me === 'B' ? sc.W : sc.B;
      return (a > b ? 1e6 : a < b ? -1e6 : 0) + (a - b);
    }
    return minimax(board, me, o, depth - 1, alpha, beta);
  }
  ordered(moves);
  const maxing = toMove === me;
  let best = maxing ? -Infinity : Infinity;
  for (const [r, c] of moves) {
    const v = minimax(applyOn(board, r, c, toMove), me, o, depth - 1, alpha, beta);
    if (maxing) { if (v > best) best = v; if (best > alpha) alpha = best; }
    else { if (v < best) best = v; if (best < beta) beta = best; }
    if (beta <= alpha) break;
  }
  return best;
}
function searchFixed(board, me, depth) {
  _deadline = Infinity; _aborted = false;
  const moves = ordered(legalMoves(board, me));
  let best = moves[0], bestV = -Infinity, a = -Infinity;
  for (const mv of moves) {
    const v = minimax(applyOn(board, mv[0], mv[1], me), me, opp(me), depth - 1, a, Infinity);
    if (v > bestV) { bestV = v; best = mv; }
    if (v > a) a = v;
  }
  return best;
}
function searchTimed(board, me, budgetMs) {
  const moves = ordered(legalMoves(board, me));
  if (moves.length <= 1) return moves[0];
  _deadline = Date.now() + budgetMs;
  let best = moves[0];
  for (let depth = 3; depth <= 30; depth++) {
    _aborted = false;
    let bm = null, bv = -Infinity, a = -Infinity;
    for (const mv of moves) {
      const v = minimax(applyOn(board, mv[0], mv[1], me), me, opp(me), depth - 1, a, Infinity);
      if (_aborted) break;
      if (v > bv) { bv = v; bm = mv; }
      if (v > a) a = v;
    }
    if (_aborted) break;
    best = bm;
    moves.splice(moves.indexOf(bm), 1); moves.unshift(bm);
    if (Math.abs(bv) >= 1e6) break;
    if (Date.now() > _deadline) break;
  }
  return best;
}
// level: easy(깊이2)/normal(깊이4·종반완탐)/hard·hell(시간제한 반복심화). [r,c] 또는 null.
function bestMove(board, me, level, budgetMs) {
  const moves = legalMoves(board, me);
  if (!moves.length) return null;
  if (level === 'hard' || level === 'hell') return searchTimed(board, me, budgetMs || 4500);
  const sc = score(board), empties = 64 - sc.B - sc.W;
  return searchFixed(board, me, level === 'easy' ? 2 : (empties <= 9 ? empties : 4));
}

self.OthelloAI = { bestMove, legalMoves, flips, applyOn, opp };   // 워커/페이지 전역에 등록(코치 분석용 헬퍼 포함)
