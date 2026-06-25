// 맞고 엔진 인프로세스 시뮬레이터 — 전체 판을 수천 번 자동 진행하며 불변식 검사
// 목적: 나가리/총통/점수/카드보존 버그 색출
const G = require('./games/gostop');

const mkWs = (name, sid, isBot) => ({ name, color: '#fff', sessionId: sid, isBot: !!isBot, readyState: 1, OPEN: 1, send() {} });
function mkRoom() {
  const room = {
    phase: 'lobby', host: null, queue: [], gameType: 'gostop',
    ctx: null,   // ctx=null → pickFirst가 동기 진행(타임아웃/지연 없음)
  };
  G.init(room);
  return room;
}

// 전체 덱 id 집합(보존 검사 기준)
function fullDeckIds(room) {
  const deck = G._buildDeck(room.gs.cfg);
  return deck.map((c) => c.id);
}

// 현재 라운드의 모든 카드 id를 영역별로 모아 보존 검사
function conservationError(room) {
  const r = room.gs.round;
  if (!r) return null;
  const all = [];
  for (const h of r.hands) for (const c of h) all.push(c.id);
  for (const c of r.floor) all.push(c.id);
  for (const c of r.draw) all.push(c.id);
  for (const cap of r.captured) for (const c of cap) all.push(c.id);
  // pending에 묶인 카드 보정:
  //  - flip 단계: 뒤집은 패(card)가 floor 아닌 pending에 보관
  //  - play 단계: 낸 패(card)는 이미 floor에 있음, 뒤집은 패(pendD)는 pending에만 보관
  if (r.pending && r.pending.phase === 'flip' && r.pending.card) all.push(r.pending.card.id);
  if (r.pending && r.pending.phase === 'play' && r.pending.pendD) all.push(r.pending.pendD.id);
  const expected = fullDeckIds(room).slice().sort();
  const got = all.slice().sort();
  if (got.length !== expected.length) return `count ${got.length} != ${expected.length}`;
  const seen = {};
  for (const id of got) { if (seen[id]) return `dup ${id}`; seen[id] = 1; }
  for (const id of expected) if (!seen[id]) return `missing ${id}`;
  return null;
}

// 봇 한 수 적용. 반환: 진행했으면 true
function step(room) {
  for (const ws of room.queue) {
    if (!G.botWants(room, ws)) continue;
    const mv = G.bot(room, ws);
    if (!mv) continue;
    const ok = G.action(room, ws, mv);
    return { ws, mv, ok };
  }
  return null;
}

function runOneGame(seed, log) {
  const room = mkRoom();
  const p = mkWs('봇A', 'a', true), q = mkWs('봇B', 'b', true);
  room.queue = [p, q]; room.host = p;
  if (G.onEnter) { G.onEnter(room, p); G.onEnter(room, q); }
  G.start(room);   // pickFirst (ctx=null → 동기 선 확정 후 딜)

  let guard = 0;
  const errs = [];
  while ((room.phase === 'playing' || room.phase === 'pickFirst') && guard++ < 4000) {
    const ce = conservationError(room);
    if (ce) { errs.push(`[보존] ${ce} (guard ${guard}, phase ${room.phase})`); break; }
    const moved = step(room);
    if (!moved) { errs.push(`[교착] 아무도 둘 수 없음 (phase ${room.phase}, guard ${guard})`); break; }
    if (!moved.ok) { errs.push(`[거부] ${moved.ws.name} ${JSON.stringify(moved.mv)} 거부됨`); break; }
  }
  if (guard >= 4000) errs.push('[무한루프] 4000수 초과');

  // 종료 상태 검증
  const r = room.gs.round;
  if (room.phase === 'finished' && r && r.result) {
    if (r.result.nagari) {
      // 나가리: 두 좌석 모두 minScore 미만이어야 정당
      const s0 = G._scoreOf(r.captured[0]).total, s1 = G._scoreOf(r.captured[1]).total;
      const min = r.params.minScore;
      if (s0 >= min || s1 >= min) errs.push(`[나가리오판] 점수(${s0},${s1}) min ${min} — 이겼는데 나가리`);
    } else {
      const w = r.result.winner;
      const sc = G._scoreOf(r.captured[w]).total;
      const min = r.params.minScore;
      const forced = r.result.reason === '총통' || r.result.reason === '쓰리뻑';
      if (!forced && sc < min) errs.push(`[승리오판] 승자 점수 ${sc} < min ${min} (reason ${r.result.reason})`);
    }
  }
  return { room, errs };
}

// ── 대량 시뮬레이션 ──
let total = 0, bad = 0;
const sample = {};
const N = parseInt(process.argv[2] || '3000', 10);
for (let i = 0; i < N; i++) {
  total++;
  let res;
  try { res = runOneGame(i); }
  catch (e) { bad++; const k = '[예외] ' + (e.message || e); sample[k] = (sample[k] || 0) + 1; continue; }
  if (res.errs.length) {
    bad++;
    for (const e of res.errs) { const k = e.replace(/\d+/g, '#'); sample[k] = (sample[k] || 0) + 1; }
  }
}
console.log(`\n맞고 시뮬 ${N}판: 정상 ${total - bad} / 문제 ${bad}`);
const keys = Object.keys(sample).sort((a, b) => sample[b] - sample[a]);
for (const k of keys) console.log(`  ${sample[k]}x  ${k}`);

// ── 타깃 단위검사: 나가리/총통 ──
function unitTests() {
  const ok = (c, m) => console.log((c ? '✅' : '❌') + ' ' + m);
  // 총통: 선(0번)에게 1월 4장 손패 → 딜 직후 즉시 총통 승
  {
    const room = mkRoom();
    const p = mkWs('선', 'a'), q = mkWs('후', 'b');
    room.queue = [p, q]; room.host = p;
    const params = G._modeParams(2);
    // setupRound를 직접 호출해 총통 손패 강제
    const all = G._buildMonthCards();
    const jan = all.filter((c) => c.m === 1);              // 1월 4장 = 총통
    const rest = all.filter((c) => c.m !== 1);
    const hands = [jan.concat(rest.slice(0, 6)), rest.slice(6, 16)];
    const floor = rest.slice(16, 24), draw = rest.slice(24);
    const dealt = { hands, floor, draw, seonTook: [], chongtong: [0], bbeokMonths: [] };
    require('./games/gostop');  // 모듈 캐시
    // setupRound는 비공개 → start 경로 대신 직접 트리거 불가하니, 딜 강제 훅 사용
    room.gs.seonIdx = 0; room.gs.seonSet = true;
    G._setupRoundForTest ? G._setupRoundForTest(room, params, 0, dealt) : null;
    ok(room.phase === 'finished' && room.gs.round.result && room.gs.round.result.reason === '총통' && room.gs.round.result.winner === 0,
       `총통: 딜 직후 선 즉시 승 (phase ${room.phase}, winner ${room.gs.round.result && room.gs.round.result.winner})`);
  }
  // 둘 다 총통 → 선(0) 우선
  {
    const room = mkRoom();
    room.queue = [mkWs('선', 'a'), mkWs('후', 'b')]; room.host = room.queue[0];
    const params = G._modeParams(2);
    const all = G._buildMonthCards();
    const jan = all.filter((c) => c.m === 1), feb = all.filter((c) => c.m === 2);
    const rest = all.filter((c) => c.m !== 1 && c.m !== 2);
    const hands = [jan.concat(rest.slice(0, 6)), feb.concat(rest.slice(6, 12))];
    const dealt = { hands, floor: rest.slice(12, 20), draw: rest.slice(20), seonTook: [], chongtong: [0, 1], bbeokMonths: [] };
    room.gs.seonIdx = 0; room.gs.seonSet = true;
    G._setupRoundForTest && G._setupRoundForTest(room, params, 0, dealt);
    ok(room.gs.round.result && room.gs.round.result.winner === 0, `둘 다 총통 → 선(0) 승 (winner ${room.gs.round.result && room.gs.round.result.winner})`);
  }
}
unitTests();
process.exit(bad ? 1 : 0);
