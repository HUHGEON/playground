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
  // 봇전 도발: 이긴 쪽이 봇이면 "쉽노ㅋ", 사람이면 "ㅈ같노 ㅋ"
  const w = room.gs.winner;
  if ((w === 'B' || w === 'W') && room.bots && room.bots.length) {
    const winner = room.gs.players[w];
    room.ctx.botSay(room, winner && winner.isBot ? '쉽노ㅋ' : 'ㅈ같노 ㅋ');
  }
  reorderQueueAfterGame(room);
}

function roleOf(room, ws) {
  if (room.phase === 'playing') return colorOf(room.gs, ws) || 'S';
  return isActive(room, ws) ? 'seated' : 'S';
}

// ───────── 봇 AI ─────────
// 순수 탐색은 othello-ai.js. 어려움/헬은 worker_thread에서 비동기 실행 → 서버(채팅·다른 게임) 안 멈춤.
const { Worker } = require("worker_threads");
const AI = require("./othello-ai");
const WORKER_PATH = require("path").join(__dirname, "othello-worker.js");
const BUDGET = { hard: 4500, hell: 9500 };
// 어려움/헬: 워커에서 시간제한 탐색 → Promise<[r,c]|null>. 워커 실패 시 동기(보통) 폴백.
function bestMoveAsync(board, me, level) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (mv) => { if (!done) { done = true; resolve(mv); } };
    let w;
    try { w = new Worker(WORKER_PATH, { workerData: { board, me, level, budgetMs: BUDGET[level] || 4500 } }); }
    catch (e) { return fin(AI.bestMove(board, me, "normal")); }
    w.on("message", (mv) => { fin(mv); try { w.terminate(); } catch (e) {} });
    w.on("error", () => { fin(AI.bestMove(board, me, "normal")); try { w.terminate(); } catch (e) {} });
    w.on("exit", () => fin(AI.bestMove(board, me, "normal")));
  });
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
    // 모든 난이도 워커(비동기)에서 탐색 → 어떤 난이도든 서버(채팅·다른 게임) 안 멈춤
    return bestMoveAsync(gs.board, color, room.botLevel || 'normal').then((mv) => (mv ? { type: 'move', r: mv[0], c: mv[1] } : null));
  },
};
