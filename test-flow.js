// 인프로세스 검증: 베팅 모델(삥/따당/콜) + 재경기→합류→재딜
const S = require('./games/seotda');
const mkWs = (name, sid) => ({ name, color: '#fff', sessionId: sid, readyState: 1, OPEN: 1, send() {} });
const mkRoom = () => {
  const room = { phase: 'lobby', host: null, queue: [], gameType: 'seotda',
    ctx: { notify: () => {}, broadcastRoom: () => {}, broadcastLobby: () => {} } };
  S.init(room); return room;
};
const ok = (cond, msg) => console.log((cond ? '✅' : '❌') + ' ' + msg);

// ── 1) 베팅 모델: 삥 → 따당 → 콜 ──
(() => {
  console.log('\n[베팅 모델]');
  const room = mkRoom();
  const p = mkWs('P', 'p'), q = mkWs('Q', 'q');
  room.queue = [p, q]; room.host = p;
  S.onEnter(room, p); S.onEnter(room, q);
  // 특수패(구사/멍구사 → 재경기) 안 나오게 덱 고정: P=5끗, Q=1끗
  room.gs._forceDeck = [{ m: 2, v: 0 }, { m: 5, v: 0 }, { m: 3, v: 0 }, { m: 6, v: 1 }];
  S.start(room);
  const h = room.gs.hand;
  const A = room.gs.ante;                       // 앤티(현재 500)
  ok(h.pot === 2 * A, `앤티 2명 → 판돈 ${2 * A} (got ${h.pot})`);
  ok(h.currentBet === A, `시작 currentBet=앤티 ${A} (got ${h.currentBet})`);
  const first = h.order[0];
  const second = h.order[1];
  S.action(room, first, { type: 'bet', act: 'ping' });
  ok(h.currentBet === 2 * A, `삥 후 currentBet ${2 * A} (got ${h.currentBet})`);
  S.action(room, second, { type: 'bet', act: 'ddang' });
  ok(h.currentBet === 3 * A, `따당(앞 베팅 2배) 후 currentBet ${3 * A} (got ${h.currentBet})`);
  S.action(room, first, { type: 'bet', act: 'call' });
  ok(room.phase === 'finished', `콜로 라운드 종료 → 정산 (phase ${room.phase})`);
  ok(room.gs.hand.result.pot === 6 * A, `최종 판돈 ${6 * A} (got ${room.gs.hand.result.pot})`);
  S.cleanup(room);
})();

// ── 2) 재경기 → 합류 → 재딜 (멍구사) ──
(() => {
  console.log('\n[멍구사 재경기 흐름]');
  const room = mkRoom();
  const A = mkWs('A', 'a'), B = mkWs('B', 'b'), C = mkWs('C', 'c');
  room.queue = [A, B, C]; room.host = A;
  S.onEnter(room, A); S.onEnter(room, B); S.onEnter(room, C);
  const V = (m, v) => ({ m, v });
  // 3인 라운드로빈 분배순: [s0c0,s1c0,s2c0,s0c1,s1c1,s2c1]
  // A=멍구사(그림4+9), B=8땡, C=알리(접음)
  room.gs._forceDeck = [V(4, 0), V(8, 0), V(1, 1), V(9, 0), V(8, 1), V(2, 1)];
  S.start(room);
  const h = room.gs.hand;
  ok(h.seats.length === 3, `3인 착석 (got ${h.seats.length})`);
  // 모두 체크하되 C는 다이 → 컨텐더 A,B
  const order = h.order.slice();
  for (const w of order) {
    if (w === C) S.action(room, w, { type: 'bet', act: 'die' });
    else S.action(room, w, { type: 'bet', act: 'check' });
  }
  ok(room.phase === 'redeal', `멍구사 → 재경기 단계 진입 (phase ${room.phase})`);
  ok(room.gs.hand.redealers.includes(A), `재경기 권리자 = A(멍구사)`);
  const potAtRedeal = room.gs.hand.pot;
  S.action(room, A, { type: 'redeal' });
  ok(room.phase === 'rejoin', `재경기 선언 → 합류 단계 (phase ${room.phase})`);
  ok(room.gs.carryPot === potAtRedeal, `판돈 묻힘(이월) ${room.gs.carryPot}`);
  ok(room.gs.rejoin.cands.includes(C), `다이한 C가 합류 후보`);
  const half = room.gs.rejoin.half;
  const cChipsBefore = room.gs.chips['c'];
  S.action(room, C, { type: 'rejoin' });
  ok(room.phase === 'playing', `합류 완료 → 재딜 시작 (phase ${room.phase})`);
  ok(room.gs.hand.seats.length === 3, `재딜에 A,B,C 모두 착석 (got ${room.gs.hand.seats.length})`);
  ok(room.gs.chips['c'] === cChipsBefore - half - room.gs.ante, `C 칩 = 직전 - 절반(${half}) - 앤티`);
  ok(room.gs.carryPot === potAtRedeal + half, `묻힌 판돈 += 합류 절반 (${room.gs.carryPot})`);
  S.cleanup(room);
})();

// ── 3) 동점 → 판돈 묻고 이월 ──
(() => {
  console.log('\n[동점 이월]');
  const room = mkRoom();
  const P = mkWs('P', 'tp'), Q = mkWs('Q', 'tq');
  room.queue = [P, Q]; room.host = P;
  S.onEnter(room, P); S.onEnter(room, Q);
  const V = (m, v) => ({ m, v });
  // 2인 분배순 [s0c0,s1c0,s0c1,s1c1]: P=2+3=5끗, Q=5+10=5끗 → 동점
  room.gs._forceDeck = [V(2, 0), V(5, 0), V(3, 1), V(10, 1)];
  S.start(room);
  const order = room.gs.hand.order.slice();
  for (const w of order) S.action(room, w, { type: 'bet', act: 'check' });
  ok(room.phase === 'finished', `동점 → 라운드 종료 (phase ${room.phase})`);
  ok(room.gs.hand.result.tie === true, `결과가 동점(tie)`);
  const keep = room.gs.startChips - room.gs.ante;
  ok(room.gs.chips['tp'] === keep && room.gs.chips['tq'] === keep, `동점 → 칩 변동 없음(둘 다 ${keep})`);
  ok(room.gs.carryPot === 2 * room.gs.ante, `판돈 ${2 * room.gs.ante} 묻힘(이월) (got ${room.gs.carryPot})`);
  // 다음 판 시작 → 이월분 유지(같은 멤버)
  const ante = room.gs.ante;
  S.start(room);
  ok(room.gs.carryPot === 2 * ante, `다음 판에도 묻힌 판돈 유지 (got ${room.gs.carryPot})`);
  ok(room.gs.hand.pot === 2 * ante, `새 판 앤티 ${2 * ante} (이월분 별도)`);
  S.cleanup(room);
})();

console.log('');
process.exit(0);
