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
  if (room.singleplayer) { gs.deadline = null; return; }   // 봇전(연습/코치)은 시간제한 없음 — 리뷰 중 타임아웃 방지
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
  room.host = room.queue.find((w) => !w.isBot) || room.queue[0] || null;   // 봇은 방장 불가 → 사람 우선
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

// 오셀로 봇 AI는 클라(브라우저 Web Worker)에서 계산 → 서버 부하 0.
// 완전정보(판이 다 공개)라 클라가 봇 수를 둬도 샐 정보가 없음. 서버는 합법성만 검증.

module.exports = {
  type: 'othello',
  order: 1,
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

  start(room, opts) {
    const gs = room.gs;
    let chosen = false;
    // 봇전: 사람이 흑(선)/백(후) 선택. 그 외엔 랜덤.
    if (room.singleplayer && opts && (opts.color === 'B' || opts.color === 'W')) {
      const human = room.queue.find((w) => !w.isBot), bot = room.queue.find((w) => w.isBot);
      if (human && bot) {
        if (opts.color === 'B') { gs.players.B = human; gs.players.W = bot; }
        else { gs.players.B = bot; gs.players.W = human; }
        chosen = true;
      }
    }
    if (!chosen) {
      const order = Math.random() < 0.5 ? [room.queue[0], room.queue[1]] : [room.queue[1], room.queue[0]];
      gs.players.B = order[0]; gs.players.W = order[1];
    }
    gs.board = initBoard(); gs.turn = 'B'; gs.winner = null; gs.lastMove = null;
    room.phase = 'playing';
    room.ctx.notify(room, `게임 시작! 흑 ●: ${gs.players.B.name}  /  백 ○: ${gs.players.W.name}${chosen ? '' : ' (랜덤 배정)'}`);
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
    if (msg.type === 'move' || msg.type === 'botMove') {
      if (room.phase !== 'playing') return false;
      if (msg.type === 'move') {
        if (colorOf(gs, ws) !== gs.turn) return false;        // 사람: 내 차례 + 내 돌만
      } else {
        // botMove: 클라가 봇 대신 둠(봇전·완전정보라 안전). 지금이 봇 차례 + 보낸이는 방 안 사람
        const turnWs = gs.players[gs.turn];
        if (!room.singleplayer || !turnWs || !turnWs.isBot || ws.isBot || !room.queue.includes(ws)) return false;
      }
      const { r, c } = msg;
      if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= 8 || c < 0 || c >= 8) return false;
      // 무르기용 스냅샷(봇전만) — 수 적용 전 상태 저장
      if (room.singleplayer) {
        gs.history = gs.history || [];
        gs.history.push({ board: gs.board.map((row) => row.slice()), turn: gs.turn, lastMove: gs.lastMove, winner: gs.winner, phase: room.phase });
        if (gs.history.length > 120) gs.history.shift();
      }
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

    } else if (msg.type === 'undo') {
      // 무르기(봇전 코치 모드) — 사람 차례가 될 때까지 되돌림
      if (!room.singleplayer || room.phase !== 'playing' || ws.isBot || !room.queue.includes(ws)) return false;
      const humanColor = colorOf(gs, ws); if (!humanColor) return false;
      if (!gs.history || !gs.history.length) return false;
      let popped = 0;
      do {
        const snap = gs.history.pop();
        gs.board = snap.board; gs.turn = snap.turn; gs.lastMove = snap.lastMove; gs.winner = snap.winner; room.phase = snap.phase;
        popped++;
      } while (gs.history.length && gs.turn !== humanColor && popped < 6);
      gs.winner = null; room.phase = 'playing';
      startTurnTimer(room);
      room.ctx.notify(room, `${ws.name}님이 무르기 했습니다.`);
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
      singleplayer: !!room.singleplayer,
      canUndo: !!room.singleplayer && room.phase === 'playing' && !!(gs.history && gs.history.length),
      canDefer: !room.singleplayer && room.queue.length >= 2 && !(room.phase === 'playing' && !!colorOf(gs, ws)) && idx >= 0 && idx < room.queue.length - 1,
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
      singleplayer: !!room.singleplayer,                 // 봇전이면 클라가 봇 수 계산
      botLevel: room.botLevel || null,
    };
  },

  lobbyInfo(room) {
    return { count: room.queue.length, max: '2인 + 관전' };
  },

  // 봇전 봇 수는 클라(브라우저)가 계산해 botMove로 보냄 → 서버는 봇을 직접 구동하지 않음
  clientBots: true,
};
