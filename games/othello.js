// ───────────────────────────────────────────────────────────
//  오셀로 게임 모듈  (공통 서버가 호출하는 인터페이스 구현)
//  - 룰(보드/뒤집기)은 서버가 심판. 보드: 8x8, 값은 'B' | 'W' | null
//  - 2인 대국 + 승자 잔류 대기열(나머지는 관전)
// ───────────────────────────────────────────────────────────
const SIZE = 8;
const TURN_MS = Number(process.env.OTHELLO_TURN_MS) || 30000;   // 착수 제한(기본 30초)
const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];
const opp = (p) => (p === 'B' ? 'W' : 'B');
const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

function initBoard() {
  const b = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  b[3][3] = 'W'; b[3][4] = 'B';
  b[4][3] = 'B'; b[4][4] = 'W';
  return b;
}
// (r,c)에 p를 두면 뒤집히는 돌 좌표 목록. 둘 수 없으면 빈 배열.
function flips(board, r, c, p) {
  if (!inBounds(r, c) || board[r][c]) return [];
  const out = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc) && board[nr][nc] === opp(p)) { line.push([nr, nc]); nr += dr; nc += dc; }
    if (line.length && inBounds(nr, nc) && board[nr][nc] === p) out.push(...line);
  }
  return out;
}
function legalMoves(board, p) {
  const moves = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (flips(board, r, c, p).length) moves.push([r, c]);
  return moves;
}
function applyMove(board, r, c, p) {
  const f = flips(board, r, c, p);
  if (!f.length) return null;
  board[r][c] = p;
  for (const [fr, fc] of f) board[fr][fc] = p;
  return f;
}
function score(board) {
  let B = 0, W = 0;
  for (const row of board) for (const v of row) { if (v === 'B') B++; else if (v === 'W') W++; }
  return { B, W };
}

// ---- 모듈 헬퍼 ----
const colorOf = (gs, ws) => (gs.players.B === ws ? 'B' : gs.players.W === ws ? 'W' : null);
const isActive = (room, ws) => room.queue.indexOf(ws) === 0 || room.queue.indexOf(ws) === 1;
const enoughPlayers = (room) => room.queue.length >= 2;

function clearTurnTimer(gs) {
  if (gs.moveTimer) clearTimeout(gs.moveTimer);
  gs.moveTimer = null; gs.deadline = null;
}
function startTurnTimer(room) {
  const gs = room.gs;
  clearTurnTimer(gs);
  gs.deadline = Date.now() + TURN_MS;
  gs.moveTimer = setTimeout(() => onTimeout(room), TURN_MS);
}
function onTimeout(room) {
  const gs = room.gs;
  if (room.phase !== 'playing') return;
  const loserName = (gs.turn === 'B' ? gs.players.B : gs.players.W)?.name;
  gs.winner = opp(gs.turn);
  conclude(room, `${loserName}님 시간 초과(${TURN_MS / 1000}초) — 패배. ${gs.winner === 'B' ? '흑 ●' : '백 ○'} 승리`);
  room.ctx.broadcastRoom(room);
  room.ctx.broadcastLobby();
}

// 착수 후 차례 진행. 패스/종료 정보 반환.
function advanceTurn(gs) {
  const next = opp(gs.turn);
  if (legalMoves(gs.board, next).length) { gs.turn = next; return {}; }
  const passName = (next === 'B' ? gs.players.B : gs.players.W)?.name;
  if (legalMoves(gs.board, gs.turn).length) return { passName };
  const { B, W } = score(gs.board);
  gs.winner = B === W ? 'draw' : B > W ? 'B' : 'W';
  return { passName, finished: true };
}

// 승자 잔류, 패자 맨 뒤. 무승부는 둘 다 뒤로. 방장 = 큐 선두 유지.
function reorderQueueAfterGame(room) {
  const gs = room.gs;
  const oldHost = room.host;
  const p0 = room.queue[0], p1 = room.queue[1];
  const rest = room.queue.slice(2);
  if (gs.winner === 'draw') {
    room.queue = [...rest, p0, p1].filter(Boolean);
    room.ctx.notify(room, '무승부 — 두 분 모두 대기열 뒤로, 다음 대기자가 올라옵니다.');
  } else {
    const winnerWs = gs.winner === 'B' ? gs.players.B : gs.players.W;
    const loserWs = gs.winner === 'B' ? gs.players.W : gs.players.B;
    room.queue = [winnerWs, ...rest, loserWs].filter(Boolean);
    const next = room.queue[1];
    room.ctx.notify(room, `${loserWs?.name}님 → 대기열 맨 뒤로.` +
      (next && next !== winnerWs ? ` 다음 도전자: ${next.name}` : ''));
  }
  room.host = room.queue[0] || null;
  if (room.host && room.host !== oldHost) room.ctx.notify(room, `이제 ${room.host.name}님이 방장입니다.`);
}

function conclude(room, text) {
  clearTurnTimer(room.gs);
  room.phase = 'finished';
  room.ctx.notify(room, text);
  reorderQueueAfterGame(room);
}

function roleOf(room, ws) {
  if (room.phase === 'playing') return colorOf(room.gs, ws) || 'S';
  return isActive(room, ws) ? 'seated' : 'S';
}

// ───────── 봇 AI: 미니맥스 + 알파베타 가지치기 + 위치 가중치 ─────────
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
function applyOn(board, r, c, p) {                 // 보드 복제 후 착수(원본 불변)
  const nb = board.map((row) => row.slice());
  const f = flips(nb, r, c, p);
  nb[r][c] = p; for (const [fr, fc] of f) nb[fr][fc] = p;
  return nb;
}
// 강화 평가: 위치가중치 + 기동성(국면별) + frontier(노출 돌) + 코너점유 + 종반 돌수
function evalBoard(board, me) {
  const o = opp(me);
  let pos = 0, my = 0, op = 0, myF = 0, opF = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const v = board[r][c];
    if (!v) continue;
    let front = false;
    for (const [dr, dc] of DIRS) { const nr = r + dr, nc = c + dc; if (inBounds(nr, nc) && !board[nr][nc]) { front = true; break; } }
    if (v === me) { pos += POS_W[r][c]; my++; if (front) myF++; }
    else { pos -= POS_W[r][c]; op++; if (front) opF++; }
  }
  // 코너 점유 추가 보너스(매우 중요)
  let corner = 0;
  for (const [r, c] of [[0, 0], [0, 7], [7, 0], [7, 7]]) { if (board[r][c] === me) corner += 35; else if (board[r][c] === o) corner -= 35; }
  const mob = legalMoves(board, me).length - legalMoves(board, o).length;
  const empties = 64 - my - op;
  let s = pos + corner + (opF - myF) * 8;     // frontier 적을수록(상대 많을수록) 유리
  if (empties > 12) s += mob * 16;            // 초·중반: 기동성 최우선
  else s += mob * 5 + (my - op) * 24;         // 종반: 돌 수 비중↑
  return s;
}
// 이동순서: 위치가중치 높은 수 먼저 평가 → 알파베타 가지치기 효율↑(더 깊이 탐색 가능)
function ordered(moves) { return moves.sort((a, b) => POS_W[b[0]][b[1]] - POS_W[a[0]][a[1]]); }
// 시간제한 탐색용 전역(반복심화 중단 신호). 고정깊이 호출은 _deadline=Infinity로 중단 안 함.
let _nodes = 0, _deadline = Infinity, _aborted = false;
function minimax(board, me, toMove, depth, alpha, beta) {
  if (_aborted) return 0;
  if ((++_nodes & 4095) === 0 && Date.now() > _deadline) { _aborted = true; return 0; }   // 시간초과 중단
  if (depth <= 0) return evalBoard(board, me);
  const moves = legalMoves(board, toMove);
  const o = opp(toMove);
  if (!moves.length) {
    if (!legalMoves(board, o).length) {            // 양쪽 다 못 둠 → 종국 확정 점수
      const sc = score(board), my = me === 'B' ? sc.B : sc.W, op = me === 'B' ? sc.W : sc.B;
      return (my > op ? 1e6 : my < op ? -1e6 : 0) + (my - op);
    }
    return minimax(board, me, o, depth - 1, alpha, beta);   // 패스
  }
  ordered(moves);
  const maxing = toMove === me;
  let best = maxing ? -Infinity : Infinity;
  for (const [r, c] of moves) {
    const v = minimax(applyOn(board, r, c, toMove), me, o, depth - 1, alpha, beta);
    if (maxing) { if (v > best) best = v; if (best > alpha) alpha = best; }
    else { if (v < best) best = v; if (best < beta) beta = best; }
    if (beta <= alpha) break;                       // 알파베타 가지치기
  }
  return best;
}
// 고정 깊이 탐색(쉬움/보통). _deadline=Infinity → 중단 없음.
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
// 시간제한 반복심화(어려움). budgetMs 안에서 갈 수 있는 만큼 깊이↑.
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
    if (_aborted) break;                            // 이 깊이 미완 → 직전 깊이 결과 유지
    best = bm;
    moves.splice(moves.indexOf(bm), 1); moves.unshift(bm);   // 다음 깊이 위해 최선수 앞으로
    if (Math.abs(bv) >= 1e6) break;                 // 승부 확정 → 더 볼 필요 없음
    if (Date.now() > _deadline) break;
  }
  return best;
}
// 난이도: 쉬움=깊이2 / 보통=깊이4(종반 ≤9 완전탐색) / 어려움=5초 반복심화(보통 8~12수)
function bestMove(board, me, level) {
  const moves = legalMoves(board, me);
  if (!moves.length) return null;
  if (level === 'hard') return searchTimed(board, me, 4500);
  const sc = score(board), empties = 64 - sc.B - sc.W;
  const depth = level === 'easy' ? 2 : (empties <= 9 ? empties : 4);
  return searchFixed(board, me, depth);
}

module.exports = {
  type: 'othello',
  title: '오셀로',
  emoji: '⚫',
  minPlayers: 2,
  maxPlayers: 2,         // 동시 대국 2인 (그 외 관전/대기)

  init(room) {
    room.gs = {
      board: initBoard(), turn: 'B', winner: null,
      players: { B: null, W: null }, lastMove: null, moveSeq: 0,
      deadline: null, moveTimer: null,
    };
  },

  canStart(room) {
    return (room.phase === 'lobby' || room.phase === 'finished') && enoughPlayers(room);
  },

  start(room) {
    const gs = room.gs;
    const order = Math.random() < 0.5 ? [room.queue[0], room.queue[1]] : [room.queue[1], room.queue[0]];
    gs.players.B = order[0]; gs.players.W = order[1];
    gs.board = initBoard(); gs.turn = 'B'; gs.winner = null; gs.lastMove = null;
    room.phase = 'playing';
    room.ctx.notify(room, `게임 시작! 흑 ●: ${gs.players.B.name}  /  백 ○: ${gs.players.W.name} (랜덤 배정)`);
    startTurnTimer(room);
  },

  // 대국자가 게임 중에 로비로 나가려는지 판단(서버가 차단용으로 호출)
  isLocked(room, ws) {
    return room.phase === 'playing' && !!colorOf(room.gs, ws);
  },

  onLeave(room, ws) {
    const gs = room.gs;
    const myColor = colorOf(gs, ws);
    if (myColor && room.phase === 'playing') {        // 대국 중 나가기 = 기권 → 상대 승
      gs.winner = opp(myColor);
      conclude(room, `${ws.name || '참가자'}님이 나가 기권 — ${gs.winner === 'B' ? '흑 ●' : '백 ○'} 승리`);
    }
    if (gs.players.B === ws) gs.players.B = null;
    if (gs.players.W === ws) gs.players.W = null;
  },

  cleanup(room) { clearTurnTimer(room.gs); },

  reattach(room, oldWs, newWs) {
    const gs = room.gs;
    if (gs.players.B === oldWs) gs.players.B = newWs;
    if (gs.players.W === oldWs) gs.players.W = newWs;
  },

  action(room, ws, msg) {
    const gs = room.gs;
    if (msg.type === 'move') {
      if (room.phase !== 'playing' || colorOf(gs, ws) !== gs.turn) return false;
      const { r, c } = msg;
      if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= 8 || c < 0 || c >= 8) return false;
      const flipped = applyMove(gs.board, r, c, gs.turn);
      if (!flipped) return false;
      gs.lastMove = {
        seq: ++gs.moveSeq, placed: { r, c }, color: gs.turn,
        flipped: flipped.map(([fr, fc]) => ({ r: fr, c: fc, d: Math.max(Math.abs(fr - r), Math.abs(fc - c)) })),
      };
      const res = advanceTurn(gs);
      if (res.passName) { room.ctx.notify(room, `${res.passName}님이 둘 곳이 없습니다 (패스)`); gs.passSeq = (gs.passSeq || 0) + 1; gs.passName = res.passName; }
      if (res.finished) {
        const sc = score(gs.board);
        const w = gs.winner === 'draw' ? '무승부' : `${gs.winner === 'B' ? '흑 ●' : '백 ○'} 승리`;
        conclude(room, `게임 종료 — ${w} (● ${sc.B} : ${sc.W} ○)`);
      } else startTurnTimer(room);
      return true;

    } else if (msg.type === 'defer') {
      if (room.phase === 'playing' && colorOf(gs, ws)) return false;
      const i = room.queue.indexOf(ws);
      if (i < 0 || room.queue.length < 2 || i === room.queue.length - 1) return false;
      room.queue.splice(i, 1); room.queue.push(ws);
      room.host = room.queue[0];
      room.ctx.notify(room, `${ws.name}님이 순위를 뒤로 미뤘습니다.`);
      return true;

    } else if (msg.type === 'resign') {
      if (room.phase !== 'playing') return false;
      const color = colorOf(gs, ws);
      if (!color) return false;
      gs.winner = opp(color);
      conclude(room, `${ws.name}님 기권 — ${gs.winner === 'B' ? '흑 ●' : '백 ○'} 승리`);
      return true;
    }
    return false;
  },

  // 방 상태 직렬화(게임 고유 필드). 공통 필드는 서버가 채움.
  state(room, ws) {
    const gs = room.gs;
    const idx = room.queue.indexOf(ws);
    return {
      board: gs.board, turn: gs.turn, score: score(gs.board),
      yourRole: roleOf(room, ws),
      canStart: room.host === ws && module.exports.canStart(room),
      canResign: room.phase === 'playing' && !!colorOf(gs, ws),
      canDefer: room.queue.length >= 2 && !(room.phase === 'playing' && !!colorOf(gs, ws)) && idx >= 0 && idx < room.queue.length - 1,
      legal: room.phase === 'playing' ? legalMoves(gs.board, gs.turn) : [],
      winner: gs.winner,
      blackName: gs.players.B?.name || null,
      whiteName: gs.players.W?.name || null,
      queue: room.queue.map((w, i) => ({
        name: w.name, color: w.color,
        seat: i < 2 ? (room.phase === 'playing' ? colorOf(gs, w) : 'next') : null,
        host: w === room.host,
      })),
      yourQueueIndex: idx,
      waitPos: idx >= 2 ? idx - 1 : 0,
      secondsLeft: room.phase === 'playing' && gs.deadline ? Math.max(0, Math.ceil((gs.deadline - Date.now()) / 1000)) : null,
      lastMove: gs.lastMove,
      passSeq: gs.passSeq || 0,
      passName: gs.passName || null,
      blackColor: gs.players.B?.color || null,
      whiteColor: gs.players.W?.color || null,
    };
  },

  lobbyInfo(room) {
    return { count: room.queue.length, max: '2인 + 관전' };
  },

  // ---- 봇전: 내 차례면 미니맥스로 최선수 ----
  botWants(room, ws) {
    return room.phase === 'playing' && colorOf(room.gs, ws) === room.gs.turn;
  },
  bot(room, ws) {
    const gs = room.gs;
    const color = colorOf(gs, ws);
    if (room.phase !== 'playing' || color !== gs.turn) return null;
    const mv = bestMove(gs.board, color, room.botLevel || 'normal');
    return mv ? { type: 'move', r: mv[0], c: mv[1] } : null;
  },
};
