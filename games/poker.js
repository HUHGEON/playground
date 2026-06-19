// ───────────────────────────────────────────────────────────
//  세븐포커(정통 세븐스터드) 게임 모듈
//  - 트럼프 52장. 각자 7장(히든2+오픈1 → 오픈3 → 히든1).
//  - 베팅 5라운드(3·4·5·6·7구간). 7장 중 베스트 5장으로 승부.
//  - 베팅: 앤티 → 체크/삥/하프/풀/따당/콜/올인/다이 (섯다와 동일 어휘, 팟리밋식)
//  - 올인 시 사이드팟 정산. 최대 6인. 칩은 sessionId 보관(재접속 유지).
// ───────────────────────────────────────────────────────────
const EOK = 100000000, CHEONMAN = 10000000, BAEKMAN = 1000000;   // 억 / 천만 / 백만
const START_CHIPS = Number(process.env.POKER_START) || EOK;        // 시작 금액 1억
const ANTE        = Number(process.env.POKER_ANTE)  || 5 * BAEKMAN; // 기본 ante 500만(5백만원)
const ACTION_MS   = Number(process.env.POKER_TURN_MS) || 30000;    // 액션 제한(30초) → 초과 시 자동 콜/체크
const DISCARD_MS  = Number(process.env.POKER_DISCARD_MS) || 60000; // 버리기 단계 제한(1분)
const AUTOSTART_MS = Number(process.env.POKER_AUTOSTART_MS) || 6000;  // 판 종료 후 자동 시작(6초)
const MAX_SEATS   = 6;
const ANTE_MIN  = BAEKMAN,    ANTE_MAX  = 10 * EOK;     // ante는 백만원 단위(최소 1백만)
const CHIPS_MIN = EOK,        CHIPS_MAX = 100 * EOK;
const CHIPS_ANTE_MULT = 4;
const LIMITS = { anteMin: ANTE_MIN, anteMax: ANTE_MAX, chipsMin: CHIPS_MIN, chipsMax: CHIPS_MAX, chipsAnteMult: CHIPS_ANTE_MULT, eok: EOK, cheonman: CHEONMAN };

// 큰 금액을 억/만 단위로 — 1억 5,000만 등
function won(n) {
  n = Math.round(Number(n) || 0);
  if (Math.abs(n) < 10000) return n.toLocaleString();
  const eok = Math.floor(n / EOK), man = Math.floor((n % EOK) / 10000);
  let s = '';
  if (eok) s += eok.toLocaleString() + '억';
  if (man) s += (s ? ' ' : '') + man.toLocaleString() + '만';
  return s || n.toLocaleString();
}

// ---- 덱 / 카드 ----
// card = { r: 2..14(=A), s: 0..3 }  s: 0=♠ 1=♥ 2=♦ 3=♣
function buildDeck() {
  const d = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s });
  return d;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const RANKNAME = (r) => (r === 14 ? 'A' : r === 13 ? 'K' : r === 12 ? 'Q' : r === 11 ? 'J' : r === 10 ? '10' : String(r));

// ───────────────────────────────────────────────────────────
//  족보 평가 — 7장(또는 그 이하)에서 베스트 5장
//  반환 { cat, tb:[...], name }.  cat 큰 게 강함, 같으면 tb 사전식 비교.
//  cat: 8 스트레이트플러시 / 7 포카드 / 6 풀하우스 / 5 플러시 / 4 스트레이트 /
//       3 트리플 / 2 투페어 / 1 원페어 / 0 하이카드(탑)
// ───────────────────────────────────────────────────────────
function straightHigh(rankSet) {
  const p = new Set(rankSet);
  if (p.has(14)) p.add(1);                              // A를 1로도 사용(휠 A-2-3-4-5)
  for (let hi = 14; hi >= 5; hi--) {
    let ok = true;
    for (let k = 0; k < 5; k++) if (!p.has(hi - k)) { ok = false; break; }
    if (ok) return hi;                                  // 연속 5장 최고값(5=휠)
  }
  return 0;
}
function evalBest(cards) {
  const ranks = cards.map((c) => c.r);
  const byRank = {};
  for (const r of ranks) byRank[r] = (byRank[r] || 0) + 1;
  const bySuit = [[], [], [], []];
  for (const c of cards) bySuit[c.s].push(c.r);

  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (bySuit[s].length >= 5) flushSuit = s;

  // 스트레이트 플러시
  if (flushSuit >= 0) {
    const sfHi = straightHigh(new Set(bySuit[flushSuit]));
    if (sfHi) return { cat: 8, tb: [sfHi], name: sfHi === 14 ? '로열 스트레이트 플러시' : '스트레이트 플러시' };
  }
  // 랭크 그룹(개수↓, 값↓)
  const groups = Object.keys(byRank).map((r) => ({ r: +r, c: byRank[r] }))
    .sort((a, b) => b.c - a.c || b.r - a.r);
  const kickers = (exclude, take) => ranks.filter((r) => !exclude.includes(r)).sort((a, b) => b - a).slice(0, take);

  const quad = groups.find((g) => g.c === 4);
  if (quad) return { cat: 7, tb: [quad.r, kickers([quad.r], 1)[0]], name: '포카드' };

  const trips = groups.filter((g) => g.c === 3);
  const pairs = groups.filter((g) => g.c === 2);
  if (trips.length && (trips.length >= 2 || pairs.length)) {
    const t = trips[0].r;
    const p = trips.length >= 2 ? trips[1].r : pairs[0].r;
    return { cat: 6, tb: [t, p], name: '풀하우스' };
  }
  if (flushSuit >= 0) {
    const fr = bySuit[flushSuit].slice().sort((a, b) => b - a).slice(0, 5);
    return { cat: 5, tb: fr, name: '플러시' };
  }
  const sh = straightHigh(new Set(ranks));
  if (sh) return { cat: 4, tb: [sh], name: '스트레이트' };

  if (trips.length) { const t = trips[0].r; return { cat: 3, tb: [t, ...kickers([t], 2)], name: '트리플' }; }
  if (pairs.length >= 2) { const [p1, p2] = [pairs[0].r, pairs[1].r]; return { cat: 2, tb: [p1, p2, kickers([p1, p2], 1)[0]], name: '투페어' }; }
  if (pairs.length === 1) { const p = pairs[0].r; return { cat: 1, tb: [p, ...kickers([p], 3)], name: '원페어' }; }
  const hs = ranks.slice().sort((a, b) => b - a).slice(0, 5);
  return { cat: 0, tb: hs, name: RANKNAME(hs[0]) + ' 탑' };
}
function cmpHand(a, b) {
  if (a.cat !== b.cat) return a.cat - b.cat;
  const n = Math.max(a.tb.length, b.tb.length);
  for (let i = 0; i < n; i++) { const d = (a.tb[i] || 0) - (b.tb[i] || 0); if (d) return d; }
  return 0;
}
// 오픈된 패만으로 선후(첫 액션) 비교용 키 — 개수↓ 값↓ 평탄화
function showKey(cards) {
  const byRank = {};
  for (const c of cards) byRank[c.r] = (byRank[c.r] || 0) + 1;
  const g = Object.keys(byRank).map((r) => ({ r: +r, c: byRank[r] })).sort((a, b) => b.c - a.c || b.r - a.r);
  const out = [];
  for (const x of g) { out.push(x.c, x.r); }
  return out;
}
function cmpKey(a, b) { const n = Math.max(a.length, b.length); for (let i = 0; i < n; i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; }

// ───────────────────────────────────────────────────────────
//  사이드팟 정산 — contrib(전원, 다이 포함) 기준 레이어링
//  반환 [{ amount, eligible:[ws...] }]  (eligible = 그 팟을 받을 자격, 다이 제외)
// ───────────────────────────────────────────────────────────
function buildSidePots(contribMap, contenders) {
  const remain = new Map();
  for (const [ws, v] of contribMap) if (v > 0) remain.set(ws, v);
  const pots = [];
  while (remain.size) {
    let min = Infinity;
    for (const v of remain.values()) if (v < min) min = v;
    let amount = 0; const eligible = [];
    for (const [ws, v] of [...remain]) {
      amount += min;
      const nv = v - min;
      if (nv > 0) remain.set(ws, nv); else remain.delete(ws);
      if (contenders.includes(ws)) eligible.push(ws);
    }
    // eligible가 같은 인접 팟은 합쳐 표시
    const last = pots[pots.length - 1];
    if (last && last.eligible.length === eligible.length && last.eligible.every((w) => eligible.includes(w))) last.amount += amount;
    else pots.push({ amount, eligible });
  }
  return pots;
}

// ───────────────────────────────────────────────────────────
//  좌석/칩 유틸
// ───────────────────────────────────────────────────────────
function eligible(room) {
  const gs = room.gs;
  return room.queue.filter((s) => (gs.chips[s.sessionId] ?? 0) >= gs.ante);
}
function seatsOf(room) { return eligible(room).slice(0, MAX_SEATS); }
function waitingToPlay(room) { return Math.max(0, eligible(room).length - MAX_SEATS); }
const betweenHands = (room) => room.phase === 'lobby' || room.phase === 'finished';
function minActiveChips(room) {
  const gs = room.gs;
  const vals = room.queue.map((s) => gs.chips[s.sessionId] ?? 0).filter((v) => v >= gs.ante);
  return vals.length ? Math.min(...vals) : gs.startChips;
}
function buyinReqNames(room) {
  const gs = room.gs;
  if (!gs.buyinReq) return [];
  return Object.keys(gs.buyinReq).map((sid) => gs.buyinReq[sid]).filter((nm) => room.queue.some((s) => s.name === nm));
}
function ensureChips(room, ws) {
  if (room.gs.chips[ws.sessionId] == null) room.gs.chips[ws.sessionId] = room.gs.startChips;
}

// ---- 타이머 ----
function clearActionTimer(h) { if (h && h.timer) { clearTimeout(h.timer); h.timer = null; } if (h) h.deadline = null; }
function startActionTimer(room) {
  const h = room.gs.hand;
  clearActionTimer(h);
  h.deadline = Date.now() + ACTION_MS;
  h.timer = setTimeout(() => {
    const ws = h.order[h.turnIdx];
    const owe = oweOf(h, ws);
    applyAction(room, ws, owe > 0 ? 'call' : 'check');   // 초과 → 자동 콜(낼 게 없으면 체크)
    room.ctx.broadcastRoom(room); room.ctx.broadcastLobby();
  }, ACTION_MS);
}
function clearAutoStart(gs) { if (gs.autoStartTimer) { clearTimeout(gs.autoStartTimer); gs.autoStartTimer = null; } gs.autoStartDeadline = null; }
function scheduleAutoStart(room) {
  const gs = room.gs;
  clearAutoStart(gs);
  gs.autoStartDeadline = Date.now() + AUTOSTART_MS;
  gs.autoStartTimer = setTimeout(() => {
    gs.autoStartTimer = null; gs.autoStartDeadline = null;
    const pending = gs.buyinReq && Object.keys(gs.buyinReq).length > 0;
    if (betweenHands(room) && module.exports.canStart(room) && !pending) {
      dealHand(room, seatsOf(room));
      room.ctx.broadcastRoom(room); room.ctx.broadcastLobby();
    }
  }, AUTOSTART_MS);
}

// ---- 베팅 머신 ----
const oweOf = (h, ws) => h.currentBet - (h.round.get(ws) || 0);

function put(room, ws, amount) {                         // 칩 → 팟. 총합(contrib)+스트리트(round) 동시 기록
  const gs = room.gs, h = gs.hand;
  const have = gs.chips[ws.sessionId];
  const a = Math.max(0, Math.min(amount, have));
  gs.chips[ws.sessionId] = have - a;
  h.contrib.set(ws, (h.contrib.get(ws) || 0) + a);
  h.round.set(ws, (h.round.get(ws) || 0) + a);
  h.pot += a;
  if (gs.chips[ws.sessionId] === 0) h.allin.add(ws);
  return a;
}
function raiseTo(room, ws, target) {                     // 이번 스트리트 round를 target까지
  const h = room.gs.hand;
  const prevBet = h.currentBet;
  put(room, ws, target - (h.round.get(ws) || 0));
  const my = h.round.get(ws) || 0;
  if (my > prevBet) {                                    // 진짜 레이즈 → 살아있는 모두 다시 응답
    h.currentBet = my;
    h.needAct = new Set(h.seats.filter((s) => !h.folded.has(s) && !h.allin.has(s) && s !== ws));
  }
  h.needAct.delete(ws);
}
function nextActor(h) {
  for (let k = 1; k <= h.order.length; k++) {
    const idx = (h.turnIdx + k) % h.order.length;
    if (h.needAct.has(h.order[idx])) { h.turnIdx = idx; return true; }
  }
  return false;
}

const ACTLABEL = { die: '폴드', check: '체크', call: '콜', raise: '레이즈', allin: '올인' };
function applyAction(room, ws, act) {
  const gs = room.gs, h = gs.hand;
  if (!h || room.phase !== 'playing' || h.order[h.turnIdx] !== ws) return false;
  if (h.folded.has(ws) || h.allin.has(ws)) return false;
  const owe = oweOf(h, ws);
  const chips = gs.chips[ws.sessionId];

  if (act === 'die') {
    h.folded.add(ws); h.needAct.delete(ws);
    room.ctx.notify(room, `${ws.name}님 폴드`);
  } else if (act === 'check') {
    if (owe !== 0) return false;
    h.needAct.delete(ws);
    room.ctx.notify(room, `${ws.name}님 체크`);
  } else if (act === 'call') {
    if (owe <= 0) return false;
    const paid = put(room, ws, owe);
    h.needAct.delete(ws);
    room.ctx.notify(room, `${ws.name}님 콜 (+${won(paid)})`);
  } else if (act === 'raise') {                           // 레이즈: 베팅 없으면 앤티 오픈, 있으면 2배
    const target = h.currentBet === 0 ? gs.ante : 2 * h.currentBet;
    if (target <= h.currentBet) return false;
    if (chips <= owe) return false;                       // 콜 이상 낼 칩이 있어야 레이즈 가능
    raiseTo(room, ws, target);
    room.ctx.notify(room, `${ws.name}님 레이즈 (${won(target)})`);
  } else if (act === 'allin') {
    const before = h.round.get(ws) || 0;
    put(room, ws, chips);
    const my = h.round.get(ws) || 0;
    if (my > h.currentBet) { h.currentBet = my; h.needAct = new Set(h.seats.filter((s) => !h.folded.has(s) && !h.allin.has(s) && s !== ws)); }
    h.needAct.delete(ws);
    room.ctx.notify(room, `${ws.name}님 올인! (${won(my - before)})`);
  } else {
    return false;
  }

  if (h.lastAct) h.lastAct.set(ws, ACTLABEL[act] || act);

  const alive = h.seats.filter((s) => !h.folded.has(s));
  if (alive.length <= 1) { showdown(room); return true; }
  if (h.needAct.size === 0) { closeBettingRound(room); return true; }
  if (!nextActor(h)) { closeBettingRound(room); return true; }
  startActionTimer(room);
  return true;
}

// 한 스트리트 베팅 종료 → 다음 스트리트 분배 또는 오픈
function closeBettingRound(room) {
  const gs = room.gs, h = gs.hand;
  clearActionTimer(h);
  const alive = h.seats.filter((s) => !h.folded.has(s));
  if (alive.length <= 1) return showdown(room);
  if (h.street >= 7) return showdown(room);
  dealStreet(room, h.street + 1);
}

// ───────────────────────────────────────────────────────────
//  딜링 / 스트리트 진행
// ───────────────────────────────────────────────────────────
// 각 플레이어 카드: [{ c, up }]  (up=공개)
function giveCard(h, ws, up) { h.cards.get(ws).push({ c: h.deck[h.di++], up }); }

function dealStreet(room, street) {
  const gs = room.gs, h = gs.hand;
  h.street = street;
  const inHand = h.seats.filter((s) => !h.folded.has(s));
  if (street <= 6) {
    for (const s of inHand) giveCard(h, s, true);                  // 오픈 1장
    room.ctx.notify(room, `${street}구간 — 오픈 카드 배분`);
  } else {
    for (const s of inHand) giveCard(h, s, false);                 // 7구간 히든 1장
    room.ctx.notify(room, `7구간 — 마지막 히든 카드`);
  }
  startStreetBetting(room);
}

// 현재 스트리트 베팅 시작 (첫 액터 = 오픈 패 가장 강한 사람)
function startStreetBetting(room) {
  const gs = room.gs, h = gs.hand;
  const inHand = h.seats.filter((s) => !h.folded.has(s));
  h.round = new Map();
  h.currentBet = 0;
  const actors = inHand.filter((s) => !h.allin.has(s));
  if (actors.length < 2) {                               // 베팅할 사람 1명 이하 → 베팅 없이 다음 스트리트로
    if (h.street >= 7) return showdown(room);
    return dealStreet(room, h.street + 1);
  }
  const upCardsOf = (s) => h.cards.get(s).filter((x) => x.up).map((x) => x.c);
  let firstWs = actors[0], firstKey = showKey(upCardsOf(actors[0]));
  for (const s of actors.slice(1)) {
    const k = showKey(upCardsOf(s));
    if (cmpKey(k, firstKey) > 0) { firstWs = s; firstKey = k; }
  }
  const fi = h.seats.indexOf(firstWs);
  h.order = h.seats.slice(fi).concat(h.seats.slice(0, fi));
  h.needAct = new Set(actors);
  h.turnIdx = 0;
  if (!h.needAct.has(h.order[0])) nextActor(h);
  startActionTimer(room);
}

// ── 버리기 단계 (시작 시 3장 받고 1장 버리기, 1분) ──
function clearDiscardTimer(h) { if (h && h.discardTimer) { clearTimeout(h.discardTimer); h.discardTimer = null; } if (h) h.discardDeadline = null; }
function startDiscardTimer(room) {
  const h = room.gs.hand;
  clearDiscardTimer(h);
  h.discardDeadline = Date.now() + DISCARD_MS;
  h.discardTimer = setTimeout(() => {
    const inHand = h.seats.filter((s) => !h.folded.has(s));
    for (const s of inHand) if (!h.discarded.has(s)) autoDiscard(room, s);   // 미선택자 자동 버리기
    proceedAfterDiscard(room);
    room.ctx.broadcastRoom(room); room.ctx.broadcastLobby();
  }, DISCARD_MS);
}
function autoDiscard(room, ws) {
  const h = room.gs.hand, arr = h.cards.get(ws);
  if (!arr || !arr.length) { h.discarded.add(ws); return; }
  let li = 0;
  for (let i = 1; i < arr.length; i++) if (arr[i].c.r < arr[li].c.r) li = i;   // 가장 낮은 카드 버림
  arr.splice(li, 1);
  h.discarded.add(ws);
}
// 모두 버린 뒤 → 오픈 도어 카드 배분 + 3구간 베팅
function proceedAfterDiscard(room) {
  const gs = room.gs, h = gs.hand;
  if (!h || h.stage !== 'discard') return;
  clearDiscardTimer(h);
  h.stage = null;
  const inHand = h.seats.filter((s) => !h.folded.has(s));
  for (const s of inHand) giveCard(h, s, true);          // 오픈 도어 카드
  h.street = 3;
  room.ctx.notify(room, `3구간 — 오픈 카드 배분`);
  startStreetBetting(room);
}

function dealHand(room, seats) {
  const gs = room.gs;
  clearAutoStart(gs);
  if (!seats || seats.length < 2) { room.phase = 'finished'; return; }
  const deck = gs._forceDeck || shuffle(buildDeck());
  gs._forceDeck = null;
  const h = {
    seats: seats.slice(), cards: new Map(), folded: new Set(), allin: new Set(),
    contrib: new Map(), round: new Map(), pot: 0, currentBet: 0, street: 0,
    order: [], needAct: new Set(), turnIdx: 0, deadline: null, timer: null,
    deck, di: 0, lastAct: new Map(), result: null, revealSet: null,
    stage: null, discarded: new Set(), discardTimer: null, discardDeadline: null,
  };
  h.id = ++gs.handNo;
  gs.hand = h;
  for (const s of seats) h.cards.set(s, []);
  for (const s of seats) put(room, s, gs.ante);          // 앤티
  for (let r = 0; r < 3; r++) for (const s of seats) giveCard(h, s, false);   // 3장 히든 배분
  h.stage = 'discard';
  room.phase = 'playing';
  room.ctx.notify(room, `세븐포커 시작! 받은 3장 중 1장 버리기 (앤티 ${won(gs.ante)})`);
  startDiscardTimer(room);
}

// ───────────────────────────────────────────────────────────
//  정산
// ───────────────────────────────────────────────────────────
function showdown(room) {
  const gs = room.gs, h = gs.hand;
  clearActionTimer(h);
  const contenders = h.seats.filter((s) => !h.folded.has(s));

  if (contenders.length <= 1) {                          // 전원 다이, 단독 생존 → 비공개 획득
    const w = contenders[0];
    if (w) gs.chips[w.sessionId] += h.pot;
    h.revealSet = new Set();
    h.result = { sole: true, winners: w ? [{ name: w.name, color: w.color, amount: h.pot }] : [], pot: h.pot, reveals: null };
    if (w && room.bots && room.bots.length && Math.random() < 0.5) room.ctx.botSay(room, w.isBot ? '쉽노ㅋ' : 'ㅈ같노 ㅋ');
    finishHand(room);
    return;
  }

  const evals = new Map();
  for (const s of contenders) evals.set(s, evalBest(h.cards.get(s).map((x) => x.c)));
  const pots = buildSidePots(h.contrib, contenders);

  const winAmt = new Map();                               // ws -> 획득 칩
  for (const pot of pots) {
    let best = null;
    for (const s of pot.eligible) if (!best || cmpHand(evals.get(s), evals.get(best)) > 0) best = s;
    const winners = pot.eligible.filter((s) => cmpHand(evals.get(s), evals.get(best)) === 0);
    const share = Math.floor(pot.amount / winners.length);
    let rem = pot.amount - share * winners.length;
    for (const w of winners) { let g = share; if (rem > 0) { g++; rem--; } winAmt.set(w, (winAmt.get(w) || 0) + g); }
  }
  for (const [s, amt] of winAmt) gs.chips[s.sessionId] += amt;

  // 봇전 도발: 최다 획득자가 봇이면 "쉽노ㅋ", 사람이면 "ㅈ같노 ㅋ" (가끔)
  if (room.bots && room.bots.length && winAmt.size && Math.random() < 0.5) {
    let topWs = null, topAmt = -1;
    for (const [s, amt] of winAmt) if (amt > topAmt) { topAmt = amt; topWs = s; }
    if (topWs) room.ctx.botSay(room, topWs.isBot ? '쉽노ㅋ' : 'ㅈ같노 ㅋ');
  }

  h.revealSet = new Set(contenders);
  const reveals = contenders.map((s) => ({
    name: s.name, color: s.color,
    cards: h.cards.get(s).map((x) => ({ r: x.c.r, s: x.c.s })),
    hand: evals.get(s).name, win: (winAmt.get(s) || 0) > 0, amount: winAmt.get(s) || 0,
  }));
  // 승자 요약(가장 많이 받은 순)
  const winners = [...winAmt.entries()].filter(([, a]) => a > 0)
    .sort((a, b) => b[1] - a[1]).map(([s, a]) => ({ name: s.name, color: s.color, amount: a }));
  h.result = { sole: false, winners, pot: h.pot, reveals };
  finishHand(room);
}

function finishHand(room) {
  const gs = room.gs, h = gs.hand;
  room.phase = 'finished';
  const names = h.result.winners.map((w) => `${w.name}${w.amount ? ' ' + won(w.amount) : ''}`).join(', ');
  if (h.result.sole) room.ctx.notify(room, `🏆 ${h.result.winners[0] ? h.result.winners[0].name : ''} 단독 승리 — ${won(h.result.pot)} 획득 (비공개)`);
  else room.ctx.notify(room, `🏆 ${names} 획득 — 총 판돈 ${won(h.result.pot)}`);
  const busted = h.seats.filter((s) => (gs.chips[s.sessionId] ?? 0) < gs.ante);
  if (busted.length) room.ctx.notify(room, `${busted.map((b) => b.name).join(', ')}님 칩 부족 — 다음 판 관전`);
  maybeTransferHost(room);
  scheduleAutoStart(room);
}

// 1명 빼고 다 파산 → 승리자가 재시작
function needRestart(room) { return betweenHands(room) && room.queue.length >= 2 && eligible(room).length <= 1; }
function richest(room) {
  const gs = room.gs; let best = null, bestC = -1;
  for (const s of room.queue) { const c = gs.chips[s.sessionId] ?? 0; if (c > bestC) { bestC = c; best = s; } }
  return best;
}
function resetAllChips(room) {
  const gs = room.gs;
  for (const s of room.queue) gs.chips[s.sessionId] = gs.startChips;
  gs.buyinReq = {};
  room.ctx.notify(room, `🔄 게임 재시작 — 모두 ${won(gs.startChips)} 칩으로 초기화!`);
}
function maybeTransferHost(room) {
  const gs = room.gs;
  if (!room.host) return;
  if ((gs.chips[room.host.sessionId] ?? 0) >= gs.ante) return;
  let best = null, bestC = -1;
  for (const s of room.queue) { const c = gs.chips[s.sessionId] ?? 0; if (c > bestC) { bestC = c; best = s; } }
  if (best && best !== room.host && bestC >= gs.ante) {
    const old = room.host.name; room.host = best;
    room.ctx.notify(room, `방장(${old}) 파산 → 칩이 가장 많은 ${best.name}님에게 방장 이양!`);
  }
}

const STREET_LABEL = { 3: '3구간 (오픈)', 4: '4구간', 5: '5구간', 6: '6구간', 7: '7구간 (히든)' };

// ───────── 봇 AI: 현재 핸드 평가 + 몬테카를로 승률 ─────────
function cmpEval(a, b) {                            // a가 더 세면 +, 약하면 -
  if (a.cat !== b.cat) return a.cat - b.cat;
  const n = Math.max(a.tb.length, b.tb.length);
  for (let i = 0; i < n; i++) { const x = a.tb[i] || 0, y = b.tb[i] || 0; if (x !== y) return x - y; }
  return 0;
}
// 내 카드는 전부, 상대는 오픈카드만 알고 나머지를 무작위로 채워 7장 만들어 승률 추정.
function winProb(h, me, iters) {
  const meCards = h.cards.get(me).map((x) => x.c);
  const opps = h.seats.filter((s) => s !== me && !h.folded.has(s));
  if (!opps.length) return 1;
  const known = meCards.slice();
  const oppUp = opps.map((s) => {
    const up = h.cards.get(s).filter((x) => x.up).map((x) => x.c);
    known.push(...up); return up;
  });
  const meNeed = Math.max(0, 7 - meCards.length);
  const seen = new Set(known.map((c) => c.r * 4 + c.s));
  const deck = buildDeck().filter((c) => !seen.has(c.r * 4 + c.s));
  let wins = 0;
  for (let it = 0; it < iters; it++) {
    shuffle(deck); let di = 0;
    const myBest = evalBest(meCards.concat(deck.slice(di, di + meNeed))); di += meNeed;
    let win = true;
    for (const up of oppUp) {
      const need = Math.max(0, 7 - up.length);
      const ob = evalBest(up.concat(deck.slice(di, di + need))); di += need;
      if (cmpEval(ob, myBest) > 0) { win = false; break; }
    }
    if (win) wins++;
  }
  return wins / iters;
}

// ───────────────────────────────────────────────────────────
module.exports = {
  type: 'poker',
  title: '세븐포커',
  emoji: '🃏',
  minPlayers: 2,
  maxPlayers: MAX_SEATS,

  init(room, opts) {
    opts = opts || {};
    const clamp = (v, lo, hi, dflt) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : dflt; };
    const ante = clamp(opts.ante, ANTE_MIN, ANTE_MAX, ANTE);
    const minChips = Math.max(CHIPS_MIN, ante * CHIPS_ANTE_MULT);
    const startChips = clamp(opts.startChips, minChips, CHIPS_MAX, Math.max(START_CHIPS, minChips));
    room.gs = { chips: {}, ante, startChips, hand: null, handNo: 0, buyinReq: {} };
  },
  LIMITS,

  onEnter(room, ws) { ensureChips(room, ws); },

  canStart(room) {
    return (room.phase === 'lobby' || room.phase === 'finished') && eligible(room).length >= 2;
  },

  start(room) { dealHand(room, seatsOf(room)); },

  isLocked() { return false; },                          // 언제든 나갈 수 있음(자동 다이)

  onLeave(room, ws) {
    const gs = room.gs, h = gs.hand;
    if (room.phase === 'playing' && h && h.stage === 'discard' && h.seats.includes(ws) && !h.folded.has(ws)) {
      h.folded.add(ws); h.discarded.add(ws);            // 버리기 단계에 나감 → 다이
      room.ctx.notify(room, `${ws.name}님이 나가 다이 처리됩니다.`);
      const alive = h.seats.filter((s) => !h.folded.has(s));
      if (alive.length <= 1) { proceedAfterDiscard(room); showdown(room); }
      else if (alive.every((s) => h.discarded.has(s))) proceedAfterDiscard(room);
    } else if (room.phase === 'playing' && h && h.seats.includes(ws) && !h.folded.has(ws)) {
      h.folded.add(ws); h.needAct.delete(ws);
      room.ctx.notify(room, `${ws.name}님이 나가 다이 처리됩니다.`);
      const alive = h.seats.filter((s) => !h.folded.has(s));
      if (alive.length <= 1) { showdown(room); }
      else if (h.order[h.turnIdx] === ws) { if (!nextActor(h)) closeBettingRound(room); }
      else if (h.needAct.size === 0) closeBettingRound(room);
    }
    if (gs.buyinReq && gs.buyinReq[ws.sessionId]) delete gs.buyinReq[ws.sessionId];
  },

  cleanup(room) { clearActionTimer(room.gs.hand); clearDiscardTimer(room.gs.hand); clearAutoStart(room.gs); },

  reattach(room, oldWs, newWs) {
    const gs = room.gs, h = gs.hand;
    const swapArr = (a) => a && a.map((s) => (s === oldWs ? newWs : s));
    const swapSet = (set) => { if (set && set.has(oldWs)) { set.delete(oldWs); set.add(newWs); } };
    if (!h) return;
    h.seats = swapArr(h.seats);
    h.order = swapArr(h.order);
    for (const set of [h.folded, h.allin, h.needAct, h.revealSet, h.discarded]) swapSet(set);
    for (const map of [h.cards, h.contrib, h.round, h.lastAct]) {
      if (map && map.has(oldWs)) { map.set(newWs, map.get(oldWs)); map.delete(oldWs); }
    }
  },

  action(room, ws, msg) {
    const gs = room.gs;
    // 파산자 재참가 요청 (판 사이) — 최소 칩 보유자에게
    if (msg.type === 'requestBuyin') {
      if (!betweenHands(room) || !room.queue.includes(ws)) return false;
      if ((gs.chips[ws.sessionId] ?? 0) >= gs.ante) return false;
      if (waitingToPlay(room) > 0) return false;
      gs.buyinReq = gs.buyinReq || {};
      if (gs.buyinReq[ws.sessionId]) return false;
      gs.buyinReq[ws.sessionId] = ws.name;
      clearAutoStart(gs);
      room.ctx.notify(room, `${ws.name}님이 재참가를 요청했습니다 — 칩이 가장 적은 분이 승인/거절할 수 있어요.`);
      return true;
    }
    if (msg.type === 'approveBuyin' || msg.type === 'rejectBuyin') {
      if (!betweenHands(room)) return false;
      const myc = gs.chips[ws.sessionId] ?? 0;
      if (!(myc >= gs.ante && myc === minActiveChips(room))) return false;
      const target = room.queue.find((s) => s.name === String(msg.name || ''));
      if (!target || !gs.buyinReq || !gs.buyinReq[target.sessionId]) return false;
      if (msg.type === 'approveBuyin') {
        gs.chips[target.sessionId] = myc;
        room.ctx.notify(room, `${ws.name}님이 ${target.name}님 재참가 승인 — ${won(myc)} 칩으로 합류!`);
      } else {
        room.ctx.notify(room, `${ws.name}님이 ${target.name}님 재참가 요청을 거절했습니다.`);
      }
      delete gs.buyinReq[target.sessionId];
      if (!Object.keys(gs.buyinReq).length && betweenHands(room) && module.exports.canStart(room)) scheduleAutoStart(room);
      return true;
    }
    if (msg.type === 'restartGame') {
      if (!needRestart(room) || richest(room) !== ws) return false;
      resetAllChips(room);
      scheduleAutoStart(room);
      return true;
    }

    // 버리기 단계: 받은 3장 중 1장 버리기
    if (msg.type === 'discard') {
      const h = gs.hand;
      if (room.phase !== 'playing' || !h || h.stage !== 'discard') return false;
      if (!h.seats.includes(ws) || h.folded.has(ws) || h.discarded.has(ws)) return false;
      const arr = h.cards.get(ws);
      const idx = Number(msg.idx);
      if (!arr || !Number.isInteger(idx) || idx < 0 || idx >= arr.length) return false;
      arr.splice(idx, 1);
      h.discarded.add(ws);
      room.ctx.notify(room, `${ws.name}님 1장 버림`);
      const inHand = h.seats.filter((s) => !h.folded.has(s));
      if (inHand.every((s) => h.discarded.has(s))) proceedAfterDiscard(room);
      return true;
    }

    if (msg.type !== 'bet') return false;
    if (room.phase !== 'playing' || !gs.hand) return false;
    if (gs.hand.order[gs.hand.turnIdx] !== ws) return false;
    return applyAction(room, ws, String(msg.act || ''));
  },

  state(room, ws) {
    const gs = room.gs, h = gs.hand;
    ensureChips(room, ws);
    const seats = h && room.phase !== 'lobby' ? h.seats : seatsOf(room);
    const nextSeats = seatsOf(room);
    const inHand = (s) => h && h.seats.includes(s) && room.phase === 'playing';
    const revealed = (s) => h && h.revealSet && h.revealSet.has(s);

    const cardsFor = (s) => {
      if (!h || !h.cards.has(s)) return null;
      return h.cards.get(s).map(({ c, up }) => {
        if (s === ws) return { r: c.r, s: c.s, up };          // 내 패: 전부 보임
        if (up) return { r: c.r, s: c.s, up: true };          // 오픈 카드
        if (revealed(s)) return { r: c.r, s: c.s, up: false }; // 쇼다운 공개
        return { hidden: true, up: false };                   // 남의 히든
      });
    };

    const players = seats.map((s) => {
      const isMe = s === ws;
      const myEval = (isMe && h && h.cards.has(s) && h.cards.get(s).length >= 5 && !h.folded.has(s)) ? evalBest(h.cards.get(s).map((x) => x.c)).name : null;
      const rev = h && h.result && h.result.reveals && h.result.reveals.find((r) => r.name === s.name);
      return {
        name: s.name, color: s.color, host: s === room.host,
        chips: gs.chips[s.sessionId] ?? 0,
        inHand: inHand(s),
        folded: h ? h.folded.has(s) : false,
        allin: h ? h.allin.has(s) : false,
        contrib: h ? (h.contrib.get(s) || 0) : 0,
        roundBet: h ? (h.round.get(s) || 0) : 0,
        isTurn: room.phase === 'playing' && h && h.order[h.turnIdx] === s,
        isMe, cards: inHand(s) || revealed(s) ? cardsFor(s) : null,
        act: h && h.lastAct ? (h.lastAct.get(s) || null) : null,
        handName: rev ? rev.hand : myEval,
        win: rev ? rev.win : false,
        wonAmt: rev ? rev.amount : 0,
      };
    });

    const myTurn = room.phase === 'playing' && h && h.order[h.turnIdx] === ws && !h.folded.has(ws) && !h.allin.has(ws);
    let actions = null;
    if (myTurn) {
      const owe = oweOf(h, ws);
      const chips = gs.chips[ws.sessionId];
      const myRound = h.round.get(ws) || 0;
      const target = h.currentBet === 0 ? gs.ante : 2 * h.currentBet;        // 레이즈 목표(오픈=앤티, 이후 2배)
      const raiseCost = Math.min(Math.max(0, target - myRound), chips);
      const canRaise = target > h.currentBet && (target - myRound) < chips;  // 레이즈가 올인보다 작아야 진짜 레이즈
      const amt = (n) => '₩' + won(n);
      const raiseBtn = canRaise ? [{ act: 'raise', name: '레이즈', amount: amt(raiseCost) }] : [];
      const allinBtn = { act: 'allin', name: '올인', amount: amt(chips) };
      if (chips <= owe) {
        actions = [allinBtn, { act: 'die', name: '폴드' }];                  // 콜할 칩도 부족 → 올인콜/폴드
      } else if (owe === 0) {
        actions = [{ act: 'check', name: '체크' }, ...raiseBtn, allinBtn, { act: 'die', name: '폴드' }];   // 폴드 항상 노출
      } else {
        actions = [{ act: 'call', name: '콜', amount: amt(Math.min(owe, chips)) }, ...raiseBtn, allinBtn, { act: 'die', name: '폴드' }];
      }
    }

    return {
      game: 'poker',
      handId: h ? h.id : 0,
      ante: gs.ante, startChips: gs.startChips,
      pot: h ? h.pot : 0,
      currentBet: h ? h.currentBet : 0,
      street: h ? h.street : 0,
      streetLabel: h && room.phase === 'playing' ? (h.stage === 'discard' ? '카드 버리기' : (STREET_LABEL[h.street] || '')) : '',
      stage: h ? h.stage : null,
      canDiscard: !!(h && h.stage === 'discard' && h.seats.includes(ws) && !h.folded.has(ws) && !h.discarded.has(ws)),
      myDiscarded: !!(h && h.discarded && h.discarded.has(ws)),
      players,
      mySeat: seats.indexOf(ws),
      myChips: gs.chips[ws.sessionId] ?? 0,
      myTurn, actions,
      secondsLeft: (h && h.stage === 'discard' && h.discardDeadline) ? Math.max(0, Math.ceil((h.discardDeadline - Date.now()) / 1000))
        : (h && h.deadline) ? Math.max(0, Math.ceil((h.deadline - Date.now()) / 1000)) : null,
      result: h ? h.result : null,
      canStart: room.host === ws && module.exports.canStart(room),
      autoStartIn: gs.autoStartDeadline ? Math.max(0, Math.ceil((gs.autoStartDeadline - Date.now()) / 1000)) : null,
      needRestart: needRestart(room),
      canRestartGame: needRestart(room) && richest(room) === ws,
      isHost: room.host === ws,
      canRequestBuyin: betweenHands(room) && room.queue.includes(ws) && (gs.chips[ws.sessionId] ?? 0) < gs.ante && !(gs.buyinReq && gs.buyinReq[ws.sessionId]) && waitingToPlay(room) === 0,
      buyinPending: !!(gs.buyinReq && gs.buyinReq[ws.sessionId]),
      buyinAmount: minActiveChips(room),
      iAmApprover: betweenHands(room) && (gs.chips[ws.sessionId] ?? 0) >= gs.ante && (gs.chips[ws.sessionId] ?? 0) === minActiveChips(room),
      buyinRequests: (betweenHands(room) && (gs.chips[ws.sessionId] ?? 0) >= gs.ante && (gs.chips[ws.sessionId] ?? 0) === minActiveChips(room)) ? buyinReqNames(room) : [],
      waiting: room.queue.filter((s) => !seats.includes(s)).map((s) => ({
        name: s.name, color: s.color, chips: gs.chips[s.sessionId] ?? 0,
        willSit: nextSeats.includes(s),
      })),
    };
  },

  lobbyInfo(room) {
    return { count: room.queue.length, max: `최대 ${MAX_SEATS}인` };
  },

  // ---- 봇전: 버리기는 최저카드, 베팅은 몬테카를로 승률 기반 ----
  botWants(room, ws) {
    const h = room.gs.hand;
    if (room.phase !== 'playing' || !h) return false;
    if (h.stage === 'discard') return h.seats.includes(ws) && !h.folded.has(ws) && !h.discarded.has(ws);
    return h.order[h.turnIdx] === ws && !h.folded.has(ws) && !h.allin.has(ws) && h.needAct.has(ws);
  },
  bot(room, ws) {
    const gs = room.gs, h = gs.hand;
    if (!h) return null;
    const level = room.botLevel || 'normal';
    if (h.stage === 'discard') {                   // 버리기 단계
      if (!h.seats.includes(ws) || h.folded.has(ws) || h.discarded.has(ws)) return null;
      const arr = h.cards.get(ws);
      if (!arr || !arr.length) return { type: 'discard', idx: 0 };
      if (level === 'easy') return { type: 'discard', idx: Math.floor(Math.random() * arr.length) };
      let li = 0; for (let i = 1; i < arr.length; i++) if (arr[i].c.r < arr[li].c.r) li = i;   // 최저 카드 버림
      return { type: 'discard', idx: li };
    }
    if (h.order[h.turnIdx] !== ws) return null;
    const acts = (module.exports.state(room, ws).actions || []).map((a) => a.act);
    if (!acts.length) return null;
    const has = (a) => acts.includes(a);
    const A = (a) => ({ type: 'bet', act: a });
    const r = Math.random();
    if (level === 'easy') {                         // 쉬움: 승률 계산 안 함
      if (has('check')) return r < 0.72 ? A('check') : (has('raise') ? A('raise') : A('check'));
      return r < 0.6 ? A('call') : (r < 0.85 ? A('die') : (has('raise') ? A('raise') : A('call')));
    }
    const eq = winProb(h, ws, level === 'hard' ? 240 : 70);
    const callT = level === 'hard' ? 0.40 : 0.34;
    const raiseT = level === 'hard' ? 0.62 : 0.56;
    if (has('check')) {
      if (eq > raiseT && has('raise') && r < (level === 'hard' ? 0.7 : 0.5)) return A('raise');
      if (eq > 0.45 && has('raise') && r < 0.2) return A('raise');
      return A('check');
    }
    if (eq > raiseT + 0.12 && has('raise') && r < 0.5) return A('raise');
    if (has('call') && eq > callT) return A('call');
    if (has('call') && eq > callT - 0.08 && r < 0.4) return A('call');     // 마진 콜
    if (has('allin') && !has('call') && eq > 0.5) return A('allin');       // 콜 칩 부족인데 승률 좋음 → 올인
    if (eq < 0.22 && has('raise') && r < (level === 'hard' ? 0.04 : 0.06)) return A('raise');  // 가끔 블러프
    return A('die');
  },

  // 테스트/검증용 노출
  _eval: evalBest,
  _cmp: cmpHand,
  _sidePots: buildSidePots,
};
