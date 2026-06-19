// ───────────────────────────────────────────────────────────
//  공통 게임 허브 서버 (게임 무관)
//  연결 · 세션/재접속 · 로비 · 방목록 · 채팅 · 온라인
//  방 생성 시 gameType(오셀로/섯다) 선택 → 게임 모듈에 위임.
// ───────────────────────────────────────────────────────────
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 45678;
const PUBLIC = path.join(__dirname, 'public');

// ---- 게임 모듈 레지스트리 ----
// games/ 폴더의 *.js 를 자동 로드 → 새 게임은 파일만 추가하면 등록됨(server.js 수정 불필요).
// 로비 표시 순서: 모듈의 order(작을수록 앞), 없으면 뒤. 동률은 type 알파벳순.
const GAMES = {};
fs.readdirSync(path.join(__dirname, 'games'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => require('./games/' + f))
  .filter((mod) => mod && mod.type)
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.type.localeCompare(b.type))
  .forEach((mod) => { GAMES[mod.type] = mod; });

const SBOT = require('./serverbots');   // 봇전(싱글플레이) 내장 봇

// ---- 정적 파일 서버 ----
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
};
const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const httpServer = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];           // 쿼리스트링 제거(캐시버스팅 ?v= 등 허용)
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // 이미지(카드·밈)는 캐시해 빠르게, 코드/HTML은 항상 최신
      'Cache-Control': IMG_EXT.has(ext) ? 'public, max-age=604800' : 'no-cache, no-store, must-revalidate',
    });
    res.end(data);
  });
});

// ---- 전역 상태 ----
const clients = new Set();      // 접속한 모든 소켓
const rooms = new Map();        // roomId -> room
let roomSeq = 0;

const sessions = new Map();     // sessionId -> { name, color, ws, graceTimer }
const GRACE_MS = 30000;
let sessionSeq = 0;

function nameTaken(name) {
  const n = name.toLowerCase();
  return [...sessions.values()].some((s) => s.name && s.name.toLowerCase() === n);
}

const PALETTE = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff9f1c', '#c77dff',
  '#52d1dc', '#f06595', '#94d82d', '#ffa94d', '#74c0fc', '#e599f7', '#63e6be', '#ffe066'];
function assignColor() {
  const used = new Set([...clients].filter((c) => c.joined && c.color).map((c) => c.color));
  const free = PALETTE.filter((c) => !used.has(c));
  const pool = free.length ? free : PALETTE;
  return pool[Math.floor(Math.random() * pool.length)];
}

// 방 안의 공통 구조(queue/host)에서 oldWs → newWs 교체. 게임 고유 참조는 모듈에 위임.
function reattach(room, oldWs, newWs) {
  if (!room) return;
  room.queue = room.queue.map((w) => (w === oldWs ? newWs : w));
  if (room.host === oldWs) room.host = newWs;
  const mod = GAMES[room.gameType];
  if (mod.reattach) mod.reattach(room, oldWs, newWs);
}

// ---- 방 생성/유틸 ----
function makeRoom(id, name, gameType, opts) {
  const room = { id, name, gameType, queue: [], host: null, phase: 'lobby', gs: {} };
  room.ctx = { notify: roomNotify, broadcastRoom, broadcastLobby };
  GAMES[gameType].init(room, opts || {});
  return room;
}

function roomNotify(room, text) {
  const msg = JSON.stringify({ type: 'notice', text });
  for (const ws of room.queue) if (ws.readyState === ws.OPEN) ws.send(msg);
}

// ---- 방 입퇴장 ----
function enterRoom(ws, room) {
  ws.roomId = room.id;
  room.queue.push(ws);
  if (!room.host) room.host = room.queue[0];     // 방장 없을 때만 지정(이양된 방장 유지)
  const mod = GAMES[room.gameType];
  if (mod.onEnter) mod.onEnter(room, ws);
  broadcastRoom(room);
  broadcastLobby();
}

function removeFromRoom(ws) {
  const room = rooms.get(ws.roomId);
  ws.roomId = null;
  if (!room) return;
  const mod = GAMES[room.gameType];
  if (mod.onLeave) mod.onLeave(room, ws);           // 게임 중단/다이 처리(큐에서 빼기 전)
  room.queue = room.queue.filter((s) => s !== ws);
  if (room.host === ws) room.host = room.queue[0] || null;
  // 봇전 방은 사람이 나가면(봇만 남으면) 방+봇 정리. 일반 방은 빌 때 정리.
  const noHumans = !room.queue.some((s) => !s.isBot);
  if (room.queue.length === 0 || (room.singleplayer && noHumans)) {
    clearBotTimers(room);
    if (mod.cleanup) mod.cleanup(room);
    rooms.delete(room.id);
  } else {
    broadcastRoom(room);
  }
  broadcastLobby();
}

// ---- 직렬화/브로드캐스트 ----
function whereIs(c) {
  if (!c.roomId) return { name: c.name, color: c.color, loc: '로비', status: 'lobby' };
  const room = rooms.get(c.roomId);
  if (!room) return { name: c.name, color: c.color, loc: '로비', status: 'lobby' };
  const status = room.phase === 'playing' ? 'playing' : 'seated';
  return { name: c.name, color: c.color, loc: room.name, roomId: room.id, gameType: room.gameType, status };
}

function lobbyStateFor(ws) {
  return JSON.stringify({
    type: 'lobby',
    yourName: ws.name || null,
    yourColor: ws.color || null,
    games: Object.values(GAMES).map((g) => ({ type: g.type, title: g.title, emoji: g.emoji })),
    rooms: [...rooms.values()].filter((r) => !r.singleplayer).map((r) => ({   // 봇전 방은 로비에 안 보임
      id: r.id, name: r.name, gameType: r.gameType,
      phase: r.phase, hostName: r.host?.name || null,
      ...GAMES[r.gameType].lobbyInfo(r),
    })),
    online: [...clients].filter((c) => c.joined).map(whereIs),
  });
}

function roomStateFor(room, ws) {
  const mod = GAMES[room.gameType];
  return JSON.stringify({
    type: 'roomState',
    roomId: room.id, roomName: room.name, gameType: room.gameType,
    title: mod.title, phase: room.phase,
    isHost: room.host === ws, hostName: room.host?.name || null,
    yourName: ws.name || null, yourColor: ws.color || null,
    ...mod.state(room, ws),
  });
}

function broadcastRoom(room) {
  for (const ws of room.queue) if (ws.readyState === ws.OPEN) ws.send(roomStateFor(room, ws));
  scheduleBots(room);                              // 봇전: 상태 바뀔 때마다 봇 차례 점검
}
function sendLobby(ws) { if (ws.readyState === ws.OPEN) ws.send(lobbyStateFor(ws)); }
function broadcastLobby() { for (const ws of clients) if (ws.joined && !ws.roomId) sendLobby(ws); }

// ---- 봇전(싱글플레이) ----
// 룸에 내장 봇을 채워 사람 1명 vs 봇으로 만든다.
function addBots(room) {
  const mod = GAMES[room.gameType];
  room.singleplayer = true;
  room.bots = SBOT.createBots(SBOT.botCount(room.gameType, mod.maxPlayers), PALETTE);
  for (const bot of room.bots) {
    room.queue.push(bot);
    if (mod.onEnter) mod.onEnter(room, bot);
  }
  broadcastRoom(room);
  broadcastLobby();
}
function clearBotTimers(room) {
  for (const bot of (room.bots || [])) if (bot._actTimer) { clearTimeout(bot._actTimer); bot._actTimer = null; }
}
// 각 봇이 둘 게 있으면 잠시 뒤 자동으로 둔다(broadcastRoom마다 호출 → 이벤트 구동).
function scheduleBots(room) {
  if (!room || !room.bots || !room.bots.length || !rooms.has(room.id)) return;
  const mod = GAMES[room.gameType];
  for (const bot of room.bots) {
    if (bot._actTimer) continue;                   // 이미 예약됨
    const st = mod.state(room, bot); st.phase = room.phase;
    if (!SBOT.decide(room.gameType, st)) continue; // 지금 둘 게 없음
    bot._actTimer = setTimeout(() => {
      bot._actTimer = null;
      if (!rooms.has(room.id)) return;
      const st2 = mod.state(room, bot); st2.phase = room.phase;
      const a2 = SBOT.decide(room.gameType, st2);
      if (a2 && mod.action(room, bot, a2)) { broadcastRoom(room); broadcastLobby(); }
    }, 700 + Math.random() * 1100);
  }
}

// ---- 채팅 ----
function handleChat(ws, text) {
  if (ws.roomId) {
    const room = rooms.get(ws.roomId);
    if (!room) return;
    const payload = JSON.stringify({ type: 'chat', scope: 'room', name: ws.name, color: ws.color, text });
    for (const c of room.queue) if (c.readyState === c.OPEN) c.send(payload);
  } else {
    const payload = JSON.stringify({ type: 'chat', scope: 'lobby', name: ws.name, color: ws.color, text });
    for (const c of clients) if (c.joined && !c.roomId && c.readyState === c.OPEN) c.send(payload);
  }
}

// ---- 연결 처리 ----
const wss = new WebSocketServer({ server: httpServer });
wss.on('connection', (ws) => {
  ws.joined = false;
  ws.roomId = null;
  ws.msgTimes = [];
  clients.add(ws);

  ws.on('message', (raw) => {
    if (raw.length > 4096) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

    const now = Date.now();
    ws.msgTimes = ws.msgTimes.filter((t) => now - t < 1000);
    if (ws.msgTimes.length >= 30) return;
    ws.msgTimes.push(now);

    if (msg.type === 'join') {
      if (ws.joined) return;
      const sessionId = String(msg.sessionId || '').slice(0, 64);
      const prev = sessionId && sessions.get(sessionId);
      if (prev) {                                   // 세션 복구(새로고침/재접속)
        const oldWs = prev.ws;
        if (prev.graceTimer) { clearTimeout(prev.graceTimer); prev.graceTimer = null; }
        ws.sessionId = sessionId;
        ws.name = prev.name; ws.color = prev.color; ws.joined = true;
        ws.roomId = (oldWs && oldWs.roomId) || null;
        prev.ws = ws;
        if (oldWs && oldWs !== ws && oldWs.readyState === oldWs.OPEN) { try { oldWs.close(); } catch (e) {} }
        const room = ws.roomId && rooms.get(ws.roomId);
        if (room) { reattach(room, oldWs, ws); ws.send(roomStateFor(room, ws)); broadcastRoom(room); }
        else { ws.roomId = null; sendLobby(ws); }
        broadcastLobby();
        return;
      }
      const name = String(msg.name || '').trim().slice(0, 16) || '익명';
      if (nameTaken(name)) {
        ws.send(JSON.stringify({ type: 'joinError', reason: '이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해 주세요.' }));
        return;
      }
      ws.sessionId = sessionId || ('s' + (++sessionSeq));
      ws.name = name; ws.color = assignColor(); ws.joined = true;
      sessions.set(ws.sessionId, { name: ws.name, color: ws.color, ws, graceTimer: null });
      broadcastLobby();

    } else if (msg.type === 'createRoom') {
      if (!ws.joined || ws.roomId) return;
      const gameType = String(msg.gameType || '');
      if (!GAMES[gameType]) return;
      const name = String(msg.name || '').trim().slice(0, 24) || `${ws.name}의 방`;
      const opts = (msg.opts && typeof msg.opts === 'object') ? msg.opts : {};
      const room = makeRoom('r' + (++roomSeq), name, gameType, opts);
      rooms.set(room.id, room);
      enterRoom(ws, room);
      if (msg.singleplayer) addBots(room);           // 봇전: 나머지 좌석 봇으로 채움

    } else if (msg.type === 'enterRoom') {
      if (!ws.joined || ws.roomId) return;
      const room = rooms.get(String(msg.roomId));
      if (!room || room.singleplayer) { sendLobby(ws); return; }   // 봇전 방은 입장 불가
      enterRoom(ws, room);

    } else if (msg.type === 'leaveRoom') {
      if (!ws.roomId) return;
      removeFromRoom(ws);   // 대국 중이어도 퇴장 허용 — onLeave가 게임 중단/상대 알림 처리
      sendLobby(ws);

    } else if (msg.type === 'start') {
      const room = rooms.get(ws.roomId);
      if (!room || room.host !== ws) return;
      const mod = GAMES[room.gameType];
      if (!mod.canStart(room)) return;
      mod.start(room);
      broadcastRoom(room);
      broadcastLobby();

    } else if (msg.type === 'chat') {
      if (!ws.joined) return;
      const nowC = Date.now();
      if (ws.lastChatAt && nowC - ws.lastChatAt < 1000) return;   // 채팅 1초 제한(도배 방지)
      const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (!text) return;
      ws.lastChatAt = nowC;
      handleChat(ws, text);

    } else if (msg.type === 'logout') {
      if (ws.roomId) removeFromRoom(ws);
      if (ws.sessionId) {
        const s = sessions.get(ws.sessionId);
        if (s && s.graceTimer) clearTimeout(s.graceTimer);
        sessions.delete(ws.sessionId);
      }
      ws.joined = false; ws.name = null; ws.roomId = null; ws.sessionId = null;
      broadcastLobby();

    } else {
      // 게임 고유 액션 → 모듈 위임
      const room = rooms.get(ws.roomId);
      if (!room) return;
      const mod = GAMES[room.gameType];
      if (mod.action(room, ws, msg)) { broadcastRoom(room); broadcastLobby(); }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    const sess = ws.sessionId && sessions.get(ws.sessionId);
    if (sess && sess.ws === ws) {
      sess.graceTimer = setTimeout(() => {
        sessions.delete(ws.sessionId);
        if (ws.roomId) removeFromRoom(ws);
        else broadcastLobby();
      }, GRACE_MS);
    } else if (ws.roomId) {
      removeFromRoom(ws);
    } else if (ws.joined) {
      broadcastLobby();
    }
  });
});

process.on('uncaughtException', (err) => console.error('uncaughtException:', err));

function lanAddresses() {
  const out = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🎮 playground 실행 중 (오셀로 · 섯다 · 세븐포커) — 포트 ${PORT}\n`);
  console.log(`  로컬:           http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`  같은 네트워크:  http://${ip}:${PORT}`);
  console.log('');
});
