// 세븐포커 통합 시뮬 — WebSocket 없이 모듈을 직접 구동해 한 판 전체(3~7구간)를 진행.
// 멀티 스트리트 상태머신/정산/칩 보존을 검증. 실행: node test-poker-sim.js
const mod = require('./games/poker');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }

function fakeWs(name, i) { return { name, color: '#fff', sessionId: 's' + i, readyState: 1, OPEN: 1, send() {}, roomId: 'r1' }; }
function makeRoom(n, opts) {
  const room = { id: 'r1', name: 'sim', gameType: 'poker', queue: [], host: null, phase: 'lobby', gs: {} };
  room.ctx = { notify() {}, broadcastRoom() {}, broadcastLobby() {} };
  mod.init(room, opts || {});
  for (let i = 0; i < n; i++) { const w = fakeWs('P' + i, i); room.queue.push(w); if (!room.host) room.host = w; mod.onEnter(room, w); }
  return room;
}
const totalChips = (room) => room.queue.reduce((s, w) => s + (room.gs.chips[w.sessionId] || 0), 0);

// 현재 액터가 칩 전부 걸지 않는 선에서 체크/콜로만 진행시키는 드라이버
function driveCheckCall(room, maxSteps) {
  let steps = 0;
  while (room.phase === 'playing' && steps++ < maxSteps) {
    const h = room.gs.hand;
    const ws = h.order[h.turnIdx];
    if (!mod.action(room, ws, { type: 'bet', act: 'check' }))
      mod.action(room, ws, { type: 'bet', act: 'call' });
  }
  return steps;
}

// ── 1) 전원 체크/콜 → 쇼다운까지, 칩 보존 ──
(function () {
  const room = makeRoom(4, { ante: 10000000, startChips: 100000000 });
  const before = totalChips(room);
  mod.start(room);
  ok(room.phase === 'playing', '시작 후 playing');
  ok(room.gs.hand.street === 3, '3구간부터');
  driveCheckCall(room, 200);
  ok(room.phase === 'finished', '체크/콜만으로 finished 도달');
  ok(room.gs.hand.street === 7, '끝까지 진행해 7구간 도달');
  const after = totalChips(room);
  ok(before === after, `칩 보존 (전 ${before} / 후 ${after})`);
  // 각자 7장씩 받았는지
  ok(room.gs.hand.seats.every((s) => room.gs.hand.cards.get(s).length === 7), '전원 7장');
  // 누군가는 판돈을 가져갔다(승자 존재)
  ok(room.gs.hand.result && room.gs.hand.result.winners.length >= 1, '승자 존재');
})();

// ── 2) 첫 베팅 후 전원 다이 → 단독 승리(비공개) ──
(function () {
  const room = makeRoom(3, { ante: 10000000, startChips: 100000000 });
  const before = totalChips(room);
  mod.start(room);
  const h = room.gs.hand;
  // 선 플레이어 삥 → 나머지 다이
  const first = h.order[h.turnIdx];
  ok(mod.action(room, first, { type: 'bet', act: 'raise' }), '선 레이즈(오픈) 성공');
  let guard = 0;
  while (room.phase === 'playing' && guard++ < 20) {
    const cur = room.gs.hand.order[room.gs.hand.turnIdx];
    mod.action(room, cur, { type: 'bet', act: 'die' });
  }
  ok(room.phase === 'finished', '전원 다이 → finished');
  ok(room.gs.hand.result.sole === true, '단독 승리 sole=true');
  ok(totalChips(room) === before, '칩 보존(다이 시나리오)');
})();

// ── 3) 올인 + 콜 → 사이드팟 정산, 칩 보존 ──
(function () {
  const room = makeRoom(3, { ante: 10000000, startChips: 100000000 });
  const before = totalChips(room);
  mod.start(room);
  const h = room.gs.hand;
  const first = h.order[h.turnIdx];
  ok(mod.action(room, first, { type: 'bet', act: 'allin' }), '선 올인');
  let guard = 0;
  while (room.phase === 'playing' && guard++ < 60) {
    const cur = room.gs.hand.order[room.gs.hand.turnIdx];
    if (!mod.action(room, cur, { type: 'bet', act: 'call' }))
      if (!mod.action(room, cur, { type: 'bet', act: 'check' }))
        mod.action(room, cur, { type: 'bet', act: 'die' });
  }
  ok(room.phase === 'finished', '올인/콜 → finished');
  ok(totalChips(room) === before, `칩 보존(올인) 전 ${before} / 후 ${totalChips(room)}`);
})();

console.log(`\n  세븐포커 통합 시뮬: ${pass} 통과 / ${fail} 실패\n`);
process.exit(fail ? 1 : 0);
