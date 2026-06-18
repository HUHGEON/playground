// ───────────────────────────────────────────────────────────
//  섯다 게임 모듈  (공통 서버가 호출하는 인터페이스 구현)
//  - 화투 20장(1~10월 각 2장). 광패: 1·3·8월에 각 1장.
//  - 풀 베팅: 앤티 → (체크/삥/하프/콜/따당/올인/다이) 라운드 → 오픈
//  - 최대 4인 동시. 칩은 sessionId로 보관(새로고침/재접속 유지).
// ───────────────────────────────────────────────────────────
const EOK = 100000000, CHEONMAN = 10000000;          // 억 / 천만 단위
const START_CHIPS = Number(process.env.SEOTDA_START) || EOK;        // 기본 시작 칩 1억
const ANTE        = Number(process.env.SEOTDA_ANTE)  || CHEONMAN;   // 기본 점당 천만
const ACTION_MS   = Number(process.env.SEOTDA_TURN_MS) || 7000;    // 액션 제한(기본 7초) → 초과 시 자동 콜
const AUTOSTART_MS = Number(process.env.SEOTDA_AUTOSTART_MS) || 5000;  // 판 종료 후 자동 시작(5초)
const MAX_SEATS   = 5;
// 방 생성 제약 (서버 권위 검증 — 클라 값은 참고용). 억/천만 스케일.
const ANTE_MIN  = CHEONMAN,   ANTE_MAX  = 10 * EOK;  // 점당 천만 ~ 10억
const CHIPS_MIN = EOK,        CHIPS_MAX = 100 * EOK; // 시작 칩 1억 ~ 100억
const CHIPS_ANTE_MULT = 4;                            // 시작 칩은 점당의 4배 이상이어야 (여러 판 가능)
const LIMITS = { anteMin: ANTE_MIN, anteMax: ANTE_MAX, chipsMin: CHIPS_MIN, chipsMax: CHIPS_MAX, chipsAnteMult: CHIPS_ANTE_MULT, eok: EOK, cheonman: CHEONMAN };

// 큰 금액을 억/만 단위로 읽기 쉽게 — 100억, 1억 5,000만, 1,000만, 2,500
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
// card = { m: 1~10, v: 0|1 }
//  · v=0 = "윗패"(광/열끗/그림), v=1 = "아랫패"(띠/피)  — 실제 화투 20장 구성
//  · 광패 = 1·3·8월의 v0.  특수패는 카드 변종까지 정확히 일치해야 성립(표 기준).
function buildDeck() {
  const d = [];
  for (let m = 1; m <= 10; m++) d.push({ m, v: 0 }, { m, v: 1 });
  return d;
}
const isGwang = (c) => (c.m === 1 || c.m === 3 || c.m === 8) && c.v === 0;
const cardKey = (c) => c.m + '-' + c.v;
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- 족보 평가 ----
const kkut = (m1, m2) => (m1 + m2) % 10;
function kkutName(k) { return k === 9 ? '갑오(9끗)' : k === 0 ? '망통(0끗)' : `${k}끗`; }
function ttaengName(m) { return m === 10 ? '장땡' : `${m}땡`; }

// 두 장을 평가 → { name, score, special }
//  우선순위:  38광땡 1000 > 광땡 18(902)·13(901) > 땡 801~810 > 중간족보 701~706 > 끗 0~9
//  특수패는 전부 "그림(윗)패" 조합이라야 성립(띠/피로는 안 됨):
//   · 암행어사     = 그림4월(4-0) + 그림7월(7-0,돼지)   → 광땡(18·13) 잡음, 그 외 1끗
//   · 땡잡이       = 3광(3-0)    + 그림7월(7-0,돼지)   → 1~9땡 잡음(장땡은 못 잡음)
//   · 멍텅구리구사 = 그림4월(4-0) + 그림9월(9-0,국준)   → 9땡 이하와 재대결
//   · 구사         = 그 외 4월+9월 조합               → 알리 이하와 재대결
function evalHand(cards) {
  const [a, b] = cards;
  const ms = [a.m, b.m].sort((x, y) => x - y);
  const key = ms.join(',');
  const gboth = isGwang(a) && isGwang(b);
  const has = (m, v) => cardKey(a) === `${m}-${v}` || cardKey(b) === `${m}-${v}`;
  const hasMonth = (m) => a.m === m || b.m === m;

  if (gboth && key === '3,8') return { name: '38광땡', score: 1000 };
  if (gboth && key === '1,8') return { name: '18광땡', score: 902 };
  if (gboth && key === '1,3') return { name: '13광땡', score: 901 };

  if (a.m === b.m) return { name: ttaengName(a.m), score: 800 + a.m };   // 땡

  // 특수패 — 윗패(그림/광) 조합이라야 성립
  if (has(4, 0) && has(7, 0)) return { name: '암행어사',     score: kkut(4, 7), special: 'amhaeng' };
  if (has(3, 0) && has(7, 0)) return { name: '땡잡이',       score: kkut(3, 7), special: 'ttaengjabi' };
  if (has(4, 0) && has(9, 0)) return { name: '멍텅구리구사', score: kkut(4, 9), special: 'meonggusa' };
  if (hasMonth(4) && hasMonth(9)) return { name: '구사',     score: kkut(4, 9), special: 'gusa' };

  // 중간 족보(월 기준)
  if (key === '1,2')  return { name: '알리', score: 706 };
  if (key === '1,4')  return { name: '독사', score: 705 };
  if (key === '1,9')  return { name: '구삥', score: 704 };
  if (key === '1,10') return { name: '장삥', score: 703 };
  if (key === '4,10') return { name: '장사', score: 702 };
  if (key === '4,6')  return { name: '세륙', score: 701 };

  const k = kkut(a.m, b.m);
  return { name: kkutName(k), score: k };
}

// 후보(다이 안 한 사람)들 중 승자 배열 반환(동점 → 분배). entries: [{ws, hand}]
function maxBy(entries) {
  const top = Math.max(...entries.map((e) => e.hand.score));
  return entries.filter((e) => e.hand.score === top);
}
function determineWinner(entries) {
  // 38광땡: 무조건 이김
  const g38 = entries.filter((e) => e.hand.score === 1000);
  if (g38.length) return g38;

  // 광땡(18/13) — 암행어사가 잡음. 잡히면 광땡을 빼고 나머지로 재판정.
  const gwang = entries.filter((e) => e.hand.score === 901 || e.hand.score === 902);
  if (gwang.length) {
    const amh = entries.filter((e) => e.hand.special === 'amhaeng');
    if (amh.length) {
      const rest = entries.filter((e) => !(e.hand.score === 901 || e.hand.score === 902));
      return rest.length ? determineWinner(rest) : amh;   // 광땡 무효 → 암행(1끗)과 나머지 비교
    }
    return maxBy(gwang);
  }

  // 땡 — 장땡(810)은 땡잡이도 못 잡음 / 1~9땡은 땡잡이가 잡음
  const ttaeng = entries.filter((e) => e.hand.score >= 801 && e.hand.score <= 810);
  if (ttaeng.length) {
    const jang = ttaeng.filter((e) => e.hand.score === 810);
    if (jang.length) return jang;                         // 장땡 최고
    const jabi = entries.filter((e) => e.hand.special === 'ttaengjabi');
    if (jabi.length) return jabi;                         // 1~9땡만 있으면 땡잡이 승
    return maxBy(ttaeng);
  }

  // 그 외(중간족보/끗) — 점수 비교, 동점 분배
  return maxBy(entries);
}

// ───────────────────────────────────────────────────────────
//  베팅 상태 머신
// ───────────────────────────────────────────────────────────
function eligible(room) {
  const gs = room.gs;
  return room.queue.filter((s) => (gs.chips[s.sessionId] ?? 0) >= gs.ante);
}
function seatsOf(room) { return eligible(room).slice(0, MAX_SEATS); }

// 대기인원(칩 충분하지만 자리에 못 앉은 사람) 수
function waitingToPlay(room) { return Math.max(0, eligible(room).length - MAX_SEATS); }

// 다음 판 좌석: 묻힌 판돈(재경기/동점 이월) 중이면 그 판 멤버 유지(새 대기인원 투입 X),
//             아니면 새로 대기인원까지 포함해서 앞 4명
function nextHandSeats(room) {
  const gs = room.gs;
  if ((gs.carryPot || 0) > 0 && gs.carrySeats && gs.carrySeats.length) {
    // 동점 이월 — 칩 필터 없이 그대로(올인=칩0 유저도 묻힌 판돈 두고 이월 판 참여, 파산처리 X)
    const seats = gs.carrySeats.filter((s) => room.queue.includes(s));
    if (seats.length) return seats;     // 1명만 남으면 dealHand의 <2 가드가 묻힌 판돈 지급
    gs.carryPot = 0; gs.carrySeats = null;   // 동점자 전원 퇴장 → 이월 소멸
  }
  return seatsOf(room);
}

// 판 사이(시작 전)에만 재참가 요청/승인 가능
const betweenHands = (room) => room.phase === 'lobby' || room.phase === 'finished';
// 활성(칩 ≥ 앤티) 플레이어 중 최소 칩
function minActiveChips(room) {
  const gs = room.gs;
  const vals = room.queue.map((s) => gs.chips[s.sessionId] ?? 0).filter((v) => v >= gs.ante);
  return vals.length ? Math.min(...vals) : gs.startChips;
}
// 재참가 투표권자 = 활성(칩 ≥ 앤티) 플레이어
function buyinVoters(room) {
  const gs = room.gs;
  return room.queue.filter((s) => (gs.chips[s.sessionId] ?? 0) >= gs.ante);
}
// 요청자 제외 투표권자 과반수
function buyinMajority(room, requester) {
  const n = buyinVoters(room).filter((s) => s !== requester).length;
  return Math.floor(n / 2) + 1;
}

function ensureChips(room, ws) {
  if (room.gs.chips[ws.sessionId] == null) room.gs.chips[ws.sessionId] = room.gs.startChips;
}

function clearActionTimer(h) { if (h && h.timer) { clearTimeout(h.timer); h.timer = null; } h && (h.deadline = null); }

function startActionTimer(room) {
  const h = room.gs.hand;
  clearActionTimer(h);
  h.deadline = Date.now() + ACTION_MS;
  h.timer = setTimeout(() => {
    const ws = h.order[h.turnIdx];
    const owe = h.currentBet - (h.contrib.get(ws) || 0);
    applyAction(room, ws, owe > 0 ? 'call' : 'check');   // 시간초과 → 자동 콜(낼 게 없으면 체크)
    room.ctx.broadcastRoom(room); room.ctx.broadcastLobby();
  }, ACTION_MS);
}

function nextActor(h) {
  for (let k = 1; k <= h.order.length; k++) {
    const idx = (h.turnIdx + k) % h.order.length;
    if (h.needAct.has(h.order[idx])) { h.turnIdx = idx; return true; }
  }
  return false;
}

// 칩 → 판돈으로 amount만큼(부족하면 올인). 실제 넣은 액수 반환.
function put(room, ws, amount) {
  const gs = room.gs, h = gs.hand;
  const have = gs.chips[ws.sessionId];
  const a = Math.max(0, Math.min(amount, have));
  gs.chips[ws.sessionId] = have - a;
  h.contrib.set(ws, (h.contrib.get(ws) || 0) + a);
  h.pot += a;
  if (gs.chips[ws.sessionId] === 0) h.allin.add(ws);
  return a;
}

// 레이즈(목표 contrib까지). 실제로 베팅이 올라갔을 때만 라운드 재오픈(캡된 언더레이즈는 콜 취급)
function raiseTo(room, ws, target) {
  const h = room.gs.hand;
  const prevBet = h.currentBet;
  put(room, ws, target - (h.contrib.get(ws) || 0));    // put이 칩 한도로 캡(부족하면 올인)
  const my = h.contrib.get(ws) || 0;
  if (my > prevBet) {                                  // 진짜 레이즈 → 살아있는 모두 다시 응답
    h.currentBet = my;
    h.needAct = new Set(h.seats.filter((s) => !h.folded.has(s) && !h.allin.has(s) && s !== ws));
    h.raiseCount = (h.raiseCount || 0) + 1;            // 베팅 횟수(첫 베팅 제한용)
  }
  h.needAct.delete(ws);                                // 본인은 응답 완료
}

const oweOf = (h, ws) => h.currentBet - (h.contrib.get(ws) || 0);

// 한 번의 액션 적용. 유효하지 않으면 false(상태 변화 없음).
function applyAction(room, ws, act) {
  const gs = room.gs, h = gs.hand;
  if (!h || h.order[h.turnIdx] !== ws) return false;
  if (h.folded.has(ws) || h.allin.has(ws)) return false;
  const owe = oweOf(h, ws);
  const chips = gs.chips[ws.sessionId];

  const isSeon = ws === h.order[0];                    // 선(첫 베팅자)
  const called = h.calledSet && h.calledSet.has(ws);   // 이미 콜/체크함 → 리레이즈 불가(콜/다이만)
  const rc = h.raiseCount || 0;                        // 지금까지 베팅(레이즈) 횟수
  if (act === 'die') {
    h.folded.add(ws); h.needAct.delete(ws);
    room.ctx.notify(room, `${ws.name}님 다이`);
  } else if (act === 'check') {
    if (owe !== 0 || !isSeon || rc !== 0) return false;          // 체크 = 선의 첫 베팅(아직 아무도 안 올림)만
    h.calledSet.add(ws); h.needAct.delete(ws);
    room.ctx.notify(room, `${ws.name}님 체크`);
  } else if (act === 'call') {
    if (owe <= 0) return false;
    const paid = put(room, ws, owe);
    h.calledSet.add(ws); h.needAct.delete(ws);
    room.ctx.notify(room, `${ws.name}님 콜 (+${won(paid)})`);
  } else if (called) {
    return false;                                                // 콜/체크한 사람은 콜/다이만
  } else if (act === 'ping') {
    if (owe !== 0 || !isSeon || rc !== 0) return false;          // 삥 = 선의 첫 베팅만
    raiseTo(room, ws, h.currentBet + gs.ante);
    room.ctx.notify(room, `${ws.name}님 삥`);
  } else if (act === 'half') {
    raiseTo(room, ws, h.currentBet + Math.max(1, Math.floor(h.pot / 2)));   // 하프 = 판돈 1/2 (모든 단계 가능)
    room.ctx.notify(room, `${ws.name}님 하프`);
  } else if (act === 'ddang') {
    if (owe <= 0 || rc < 2) return false;                        // 따당 = 받을 게 있고 2번째 베팅부터
    raiseTo(room, ws, 2 * h.currentBet - gs.ante);
    room.ctx.notify(room, `${ws.name}님 따당`);
  } else if (act === 'quarter') {
    if (rc < 2) return false;                                    // 쿼터 = 2번째 베팅부터
    raiseTo(room, ws, h.currentBet + Math.max(1, Math.floor(h.pot / 4)));
    room.ctx.notify(room, `${ws.name}님 쿼터`);
  } else {
    return false;
  }

  // 마지막 베팅 기록(좌석 토스트용). 베팅이 올인이 됐으면 '올인'으로 표시
  const ACTLABEL = { die: '다이', check: '체크', call: '콜', ping: '삥', ddang: '따당', quarter: '쿼터', half: '하프' };
  const moneyAct = act === 'call' || act === 'ping' || act === 'half' || act === 'ddang' || act === 'quarter';
  let label = ACTLABEL[act];
  if (moneyAct && (gs.chips[ws.sessionId] ?? 0) === 0) { label = '올인'; room.ctx.notify(room, `${ws.name}님 올인!`); }
  if (h.lastAct && label) h.lastAct.set(ws, label);

  // 종료 판정
  const alive = h.seats.filter((s) => !h.folded.has(s));
  if (alive.length <= 1) { showdown(room); return true; }
  if (h.needAct.size === 0) { showdown(room); return true; }
  if (!nextActor(h)) { showdown(room); return true; }
  startActionTimer(room);
  return true;
}

// 스테이지(재경기/합류) 타이머
function clearStage(gs) { if (gs.stageTimer) { clearTimeout(gs.stageTimer); gs.stageTimer = null; } gs.stageDeadline = null; }
function startStageTimer(room, kind, ms) {
  const gs = room.gs;
  clearStage(gs);
  gs.stageDeadline = Date.now() + ms;
  gs.stageTimer = setTimeout(() => {
    if (kind === 'redeal') {                       // 시간초과 → 전원 재경기 포기 → 정상 정산
      finalizeShowdown(room, gs.hand.seats.filter((s) => !gs.hand.folded.has(s)));
    } else if (kind === 'rejoin') {                // 시간초과 → 미정자 자동 빠짐 → 재딜
      finishRejoin(room);
    }
    room.ctx.broadcastRoom(room); room.ctx.broadcastLobby();
  }, ms);
}

// 판 종료 후 자동 시작 타이머
function clearAutoStart(gs) { if (gs.autoStartTimer) { clearTimeout(gs.autoStartTimer); gs.autoStartTimer = null; } gs.autoStartDeadline = null; }
function scheduleAutoStart(room) {
  const gs = room.gs;
  clearAutoStart(gs);
  gs.autoStartDeadline = Date.now() + AUTOSTART_MS;
  gs.autoStartTimer = setTimeout(() => {
    gs.autoStartTimer = null; gs.autoStartDeadline = null;
    const pending = gs.buyinReq && Object.keys(gs.buyinReq).length > 0;
    if (betweenHands(room) && module.exports.canStart(room) && !pending) {
      dealHand(room, nextHandSeats(room));
      room.ctx.broadcastRoom(room); room.ctx.broadcastLobby();
    }
  }, AUTOSTART_MS);
}

// 1명 빼고 다 파산 → 게임 진행 불가(승리자가 '게임 재시작하기' 눌러야 초기화)
function needRestart(room) {
  return betweenHands(room) && room.queue.length >= 2 && eligible(room).length <= 1;
}
// 최다 칩 보유자(승리자)
function richest(room) {
  const gs = room.gs;
  let best = null, bestC = -1;
  for (const s of room.queue) { const c = gs.chips[s.sessionId] ?? 0; if (c > bestC) { bestC = c; best = s; } }
  return best;
}
function resetAllChips(room) {
  const gs = room.gs;
  for (const s of room.queue) gs.chips[s.sessionId] = gs.startChips;
  gs.carryPot = 0; gs.carrySeats = null; gs.buyinReq = {};
  room.ctx.notify(room, `🔄 게임 재시작 — 모두 ${won(gs.startChips)} 칩으로 초기화!`);
}

// 방장이 파산(칩 < 앤티)하면 칩 가장 많은 사람에게 방장 이양
function maybeTransferHost(room) {
  const gs = room.gs;
  if (!room.host) return;
  if ((gs.chips[room.host.sessionId] ?? 0) >= gs.ante) return;
  let best = null, bestC = -1;
  for (const s of room.queue) { const c = gs.chips[s.sessionId] ?? 0; if (c > bestC) { bestC = c; best = s; } }
  if (best && best !== room.host && bestC >= gs.ante) {
    const old = room.host.name;
    room.host = best;
    room.ctx.notify(room, `방장(${old}) 파산 → 칩이 가장 많은 ${best.name}님에게 방장 권한 이양!`);
  }
}

function showdown(room) {
  const gs = room.gs, h = gs.hand;
  clearActionTimer(h);
  const contenders = h.seats.filter((s) => !h.folded.has(s));
  if (contenders.length <= 1) { h.reveals = null; h.entries = null; return finalizeShowdown(room, contenders); }

  const entries = contenders.map((ws) => ({ ws, hand: evalHand(h.cards.get(ws)) }));
  h.entries = entries;
  h.reveals = entries.map((e) => ({ name: e.ws.name, color: e.ws.color, cards: h.cards.get(e.ws), hand: e.hand.name }));
  const best = Math.max(...entries.map((e) => e.hand.score));

  // 재경기 자격: 구사 = 판 최고 알리(706) 이하 / 멍구사 = 9땡(809) 이하
  const redealers = entries.filter((e) =>
    (e.hand.special === 'gusa' && best <= 706) || (e.hand.special === 'meonggusa' && best <= 809)
  ).map((e) => e.ws);

  if (redealers.length) {
    h.redealers = redealers; h.redealPassed = new Set();
    room.phase = 'redeal';
    room.ctx.notify(room, `${redealers.map((w) => w.name).join(', ')}님 구사/멍구사 — 재경기 선언 가능! (안 하면 정상 정산)`);
    startStageTimer(room, 'redeal', 20000);
    return;
  }
  finalizeShowdown(room, contenders);
}

// 정상 정산(판돈 = 이번 판 + 묻힌 판돈)
function finalizeShowdown(room, contenders) {
  const gs = room.gs, h = gs.hand;
  clearStage(gs); clearActionTimer(h);
  const totalPot = h.pot + (gs.carryPot || 0);
  let winners, reveals = null;
  if (contenders.length <= 1) {
    winners = contenders;
  } else {
    const wEntries = determineWinner(h.entries);
    const winSet = new Set(wEntries.map((e) => e.ws));
    winners = wEntries.map((e) => e.ws);
    reveals = h.reveals.map((r, i) => ({ ...r, win: winSet.has(h.entries[i].ws) }));
  }

  // 동점(승자 2명 이상) → 분배 X, 판돈 묻고(이월) 재경기. 동점자는 무조건 참여, 하위/다이자는 절반 내고 합류
  if (contenders.length > 1 && winners.length > 1) {
    gs.carryPot = totalPot; gs.rejoin = null;
    gs.carrySeq = (gs.carrySeq || 0) + 1;                                         // "묻고 더블로 가!" 토스트 트리거
    h.result = { tie: true, winners: winners.map((w) => ({ name: w.name, color: w.color })), pot: totalPot, reveals, sole: false };
    room.ctx.notify(room, `🤝 동점(${winners.map((w) => w.name).join(', ')}) — 판돈 ${won(totalPot)} 묻고 재경기!`);
    const half = Math.floor(totalPot / 2);
    const cands = h.seats.filter((s) => !winners.includes(s) && room.queue.includes(s) && (gs.chips[s.sessionId] ?? 0) >= half);
    if (cands.length) {                                                           // 하위자가 합류할 여력 있으면 합류 단계
      gs.rejoin = { base: winners.slice(), cands, joined: new Set(), decided: new Set(), half };
      room.phase = 'rejoin';
      room.ctx.notify(room, `하위 ${cands.map((c) => c.name).join(', ')}님 — 절반 ${won(half)} 내면 재경기 합류 가능.`);
      startStageTimer(room, 'rejoin', 10000);
    } else {                                                                      // 합류 가능자 없으면 동점자끼리 바로 재대결
      gs.carrySeats = winners.slice();
      room.phase = 'finished';
      maybeTransferHost(room); scheduleAutoStart(room);
    }
    return;
  }

  winners.forEach((w) => { gs.chips[w.sessionId] += totalPot; });   // 단독 승자 전액 획득
  gs.carryPot = 0; gs.carrySeats = null; gs.rejoin = null;          // 결정승 → 이월 종료, 다음 판 대기인원 투입

  h.result = { winners: winners.map((w) => ({ name: w.name, color: w.color })), pot: totalPot, reveals, sole: contenders.length <= 1 };
  room.phase = 'finished';
  const names = winners.map((w) => w.name).join(', ');
  room.ctx.notify(room, `🏆 ${names} 승리 — 판돈 ${won(totalPot)} 획득${reveals ? '' : ' (단독)'}`);
  const busted = h.seats.filter((s) => (gs.chips[s.sessionId] ?? 0) < gs.ante);
  if (busted.length) room.ctx.notify(room, `${busted.map((b) => b.name).join(', ')}님 칩 부족 — 다음 판 관전`);
  maybeTransferHost(room); scheduleAutoStart(room);
}

// 재경기 실행 — 판돈 묻고(이월), 다이자 합류 단계로
function executeRedeal(room) {
  const gs = room.gs, h = gs.hand;
  clearActionTimer(h); clearStage(gs);
  gs.carryPot = (gs.carryPot || 0) + h.pot;
  gs.carrySeq = (gs.carrySeq || 0) + 1;                  // "묻고 더블로 가!" 토스트 트리거(재경기)
  const nonFolded = h.seats.filter((s) => !h.folded.has(s));
  const half = Math.floor(gs.carryPot / 2);
  const cands = h.seats.filter((s) => h.folded.has(s) && (gs.chips[s.sessionId] ?? 0) >= half);
  room.ctx.notify(room, `🔁 재경기! 판돈 ${won(gs.carryPot)} 묻고 다음 판으로.`);
  if (cands.length) {
    gs.rejoin = { base: nonFolded, cands, joined: new Set(), decided: new Set(), half };
    room.phase = 'rejoin';
    room.ctx.notify(room, `다이했던 ${cands.map((c) => c.name).join(', ')}님 — 절반 ${won(half)} 내면 합류 가능.`);
    startStageTimer(room, 'rejoin', 10000);
  } else {
    dealHand(room, nonFolded);
  }
}

function finishRejoin(room) {
  const gs = room.gs;
  const r = gs.rejoin;
  clearStage(gs);
  const seats = [...r.base, ...r.cands.filter((c) => r.joined.has(c))];
  // 좌석 순서는 큐 순서 유지
  seats.sort((a, b) => room.queue.indexOf(a) - room.queue.indexOf(b));
  gs.rejoin = null;
  dealHand(room, seats);
}

// 한 판 분배(신규 시작/재경기 공용). seats = 이번 판에 앉을 소켓들(큐 순서).
function dealHand(room, seats) {
  const gs = room.gs;
  clearAutoStart(gs);
  if (!seats || seats.length < 2) {                     // 2명 미만이면 분배 불가(엣지: 재경기 합류 후 인원 부족)
    room.phase = 'finished';
    if (seats && seats.length === 1) { gs.chips[seats[0].sessionId] += gs.carryPot || 0; }
    gs.carryPot = 0; gs.carrySeats = null;
    return;
  }
  const deck = gs._forceDeck || shuffle(buildDeck());   // 테스트용 덱 주입(일회성)
  gs._forceDeck = null;
  const h = {
    seats, cards: new Map(), folded: new Set(), allin: new Set(),
    contrib: new Map(), pot: 0, currentBet: gs.ante,
    order: [], needAct: new Set(), turnIdx: 0, deadline: null, timer: null,
    result: null, reveals: null, entries: null, lastAct: new Map(),
    calledSet: new Set(),   // 콜/체크한 사람 → 그 라운드 리레이즈 불가(콜/다이만)
    raiseCount: 0,          // 베팅(레이즈) 횟수 — 첫 베팅 제한용
  };
  h.id = ++gs.handNo;
  gs.hand = h;                                      // put()이 참조하므로 분배 전에 연결
  let di = 0;
  for (const s of seats) h.cards.set(s, []);
  for (let round = 0; round < 2; round++) for (const s of seats) h.cards.get(s).push(deck[di++]);  // 한 장씩 두 바퀴
  for (const s of seats) put(room, s, gs.ante);     // 앤티
  const startIdx = gs.buttonRot % seats.length;
  h.order = seats.slice(startIdx).concat(seats.slice(0, startIdx));
  h.needAct = new Set(seats.filter((s) => !h.allin.has(s)));
  h.turnIdx = 0;
  gs.buttonRot++;
  room.phase = 'playing';
  const carry = gs.carryPot ? ` (묻힌 판돈 ${won(gs.carryPot)})` : '';
  room.ctx.notify(room, `섯다 시작! ${seats.map((s) => s.name).join(', ')} (앤티 ${won(gs.ante)})${carry} — 선: ${h.order[0].name}`);
  if (h.needAct.size === 0) { showdown(room); return; }  // 전원 앤티로 올인 → 베팅 없이 바로 오픈
  if (!h.needAct.has(h.order[0])) nextActor(h);     // 선이 올인이면 다음
  startActionTimer(room);
}

// ───────────────────────────────────────────────────────────
module.exports = {
  type: 'seotda',
  title: '섯다',
  emoji: '🎴',
  minPlayers: 2,
  maxPlayers: MAX_SEATS,

  init(room, opts) {
    opts = opts || {};
    // 범위 밖이면 기본값 대신 가까운 한계로 '클램프' (직관적). 시작 칩은 점당의 4배 이상 보장.
    const clamp = (v, lo, hi, dflt) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : dflt; };
    const ante = clamp(opts.ante, ANTE_MIN, ANTE_MAX, ANTE);                         // 점당(앤티)
    const minChips = Math.max(CHIPS_MIN, ante * CHIPS_ANTE_MULT);                    // 점당의 4배 이상
    const startChips = clamp(opts.startChips, minChips, CHIPS_MAX, Math.max(START_CHIPS, minChips));  // 시작 칩
    room.gs = { chips: {}, ante, startChips, hand: null, buttonRot: 0, handNo: 0, carryPot: 0, carrySeats: null, rejoin: null, buyinReq: {} };
  },
  LIMITS,   // 클라이언트 검증용으로 노출

  onEnter(room, ws) {
    ensureChips(room, ws);
    // 새 사람이 들어오면(빈 자리 채울 수 있음) 대기 중인 재참가 요청은 취소 — 그 사람이 자리 차지
    const gs = room.gs;
    if (gs.buyinReq && Object.keys(gs.buyinReq).length) {
      const names = Object.values(gs.buyinReq).map((r) => r.name).join(', ');
      gs.buyinReq = {};
      room.ctx.notify(room, `${ws.name}님 입장 — 빈 자리는 새 참가자에게. ${names}님 재참가 요청은 취소됩니다.`);
      if (betweenHands(room) && module.exports.canStart(room)) scheduleAutoStart(room);
    }
  },

  canStart(room) {
    const pending = room.gs.buyinReq && Object.keys(room.gs.buyinReq).length > 0;   // 재참가 요청 처리 전엔 시작 보류
    return (room.phase === 'lobby' || room.phase === 'finished') && eligible(room).length >= 2 && !pending;
  },

  start(room) {
    // carryPot은 0으로 리셋하지 않음 — 동점/재경기로 묻힌 판돈은 다음 판으로 이월됨
    dealHand(room, nextHandSeats(room));
  },

  isLocked() { return false; },   // 섯다는 언제든 나갈 수 있음(자동 다이)

  onLeave(room, ws) {
    const gs = room.gs, h = gs.hand;
    if (room.phase === 'playing' && h && h.seats.includes(ws) && !h.folded.has(ws)) {
      h.folded.add(ws); h.needAct.delete(ws);
      room.ctx.notify(room, `${ws.name}님이 나가 다이 처리됩니다.`);
      const alive = h.seats.filter((s) => !h.folded.has(s));
      if (alive.length <= 1) { showdown(room); return; }
      if (h.order[h.turnIdx] === ws) { if (!nextActor(h)) showdown(room); }
      if (h.needAct.size === 0) showdown(room);
    } else if (room.phase === 'redeal' && h && h.redealers.includes(ws)) {
      h.redealPassed.add(ws);                       // 나간 사람은 재경기 포기로 간주
      if (h.redealers.every((r) => h.redealPassed.has(r))) finalizeShowdown(room, h.seats.filter((s) => !h.folded.has(s)));
    } else if (room.phase === 'rejoin' && gs.rejoin) {
      gs.rejoin.base = gs.rejoin.base.filter((s) => s !== ws);
      gs.rejoin.decided.add(ws); gs.rejoin.joined.delete(ws);
      if (gs.rejoin.cands.every((c) => gs.rejoin.decided.has(c))) finishRejoin(room);
    }
    if (gs.buyinReq && gs.buyinReq[ws.sessionId]) delete gs.buyinReq[ws.sessionId];  // 요청자 떠나면 정리
  },

  cleanup(room) { clearActionTimer(room.gs.hand); clearStage(room.gs); clearAutoStart(room.gs); },

  reattach(room, oldWs, newWs) {
    const gs = room.gs, h = gs.hand;
    const swapArr = (a) => a && a.map((s) => (s === oldWs ? newWs : s));
    const swapSet = (set) => { if (set && set.has(oldWs)) { set.delete(oldWs); set.add(newWs); } };
    if (gs.carrySeats) gs.carrySeats = swapArr(gs.carrySeats);   // 이월 멤버
    if (gs.rejoin) {                                             // 재경기 합류 단계
      gs.rejoin.base = swapArr(gs.rejoin.base);
      gs.rejoin.cands = swapArr(gs.rejoin.cands);
      swapSet(gs.rejoin.joined); swapSet(gs.rejoin.decided);
    }
    if (!h) return;
    h.seats = swapArr(h.seats);
    h.order = swapArr(h.order);
    if (h.redealers) h.redealers = swapArr(h.redealers);
    if (h.entries) h.entries.forEach((e) => { if (e.ws === oldWs) e.ws = newWs; });
    for (const set of [h.folded, h.allin, h.needAct, h.redealPassed, h.calledSet]) swapSet(set);
    for (const map of [h.cards, h.contrib, h.lastAct]) {
      if (map && map.has(oldWs)) { map.set(newWs, map.get(oldWs)); map.delete(oldWs); }
    }
  },

  action(room, ws, msg) {
    const gs = room.gs;
    // 재경기 선언/포기 (구사·멍구사 보유자만)
    if (msg.type === 'redeal') {
      if (room.phase !== 'redeal' || !gs.hand.redealers.includes(ws)) return false;
      executeRedeal(room);
      return true;
    }
    if (msg.type === 'passRedeal') {
      if (room.phase !== 'redeal' || !gs.hand.redealers.includes(ws)) return false;
      gs.hand.redealPassed.add(ws);
      if (gs.hand.redealers.every((r) => gs.hand.redealPassed.has(r)))
        finalizeShowdown(room, gs.hand.seats.filter((s) => !gs.hand.folded.has(s)));
      return true;
    }
    // 다이자 재경기 합류(절반 지불)/빠지기
    if (msg.type === 'rejoin' || msg.type === 'passRejoin') {
      const r = gs.rejoin;
      if (room.phase !== 'rejoin' || !r || !r.cands.includes(ws) || r.decided.has(ws)) return false;
      if (msg.type === 'rejoin') {
        if ((gs.chips[ws.sessionId] ?? 0) < r.half) return false;
        gs.chips[ws.sessionId] -= r.half;
        gs.carryPot += r.half;
        r.joined.add(ws);
        room.ctx.notify(room, `${ws.name}님 절반 ${won(r.half)} 내고 재경기 합류!`);
      } else {
        room.ctx.notify(room, `${ws.name}님 재경기 합류 안 함.`);
      }
      r.decided.add(ws);
      if (r.cands.every((c) => r.decided.has(c))) finishRejoin(room);
      return true;
    }

    // 파산자 재참가 요청 (판 사이에만) — 판에 있는 비파산 전원에게 감(과반수 승인)
    if (msg.type === 'requestBuyin') {
      if (!betweenHands(room) || !room.queue.includes(ws)) return false;
      if ((gs.chips[ws.sessionId] ?? 0) >= gs.ante) return false;     // 칩 충분하면 불필요
      if (waitingToPlay(room) > 0 || (gs.carryPot || 0) > 0) return false;  // 대기인원 있거나 묻힌 판돈 중엔 불가
      gs.buyinReq = gs.buyinReq || {};
      if (gs.buyinReq[ws.sessionId]) return false;
      gs.buyinReq[ws.sessionId] = { name: ws.name, approvers: new Set(), rejecters: new Set() };
      clearAutoStart(gs);                                            // 요청 중엔 자동시작 보류
      const need = buyinMajority(room, ws);
      room.ctx.notify(room, `${ws.name}님이 재참가를 요청했습니다 — 판에 있는 분 ${need}명 이상 승인하면 합류.`);
      return true;
    }
    // 재참가 승인/거절 — 비파산(칩 ≥ 앤티) 누구나 투표, 과반수 승인 시 합류
    if (msg.type === 'approveBuyin' || msg.type === 'rejectBuyin') {
      if (!betweenHands(room)) return false;
      const myc = gs.chips[ws.sessionId] ?? 0;
      if (myc < gs.ante) return false;                               // 비파산만 투표
      const target = room.queue.find((s) => s.name === String(msg.name || ''));
      const req = target && gs.buyinReq && gs.buyinReq[target.sessionId];
      if (!req || target === ws) return false;
      const majority = buyinMajority(room, target);
      if (msg.type === 'approveBuyin') {
        req.rejecters.delete(ws.sessionId); req.approvers.add(ws.sessionId);
        if (req.approvers.size >= majority) {                        // 과반 승인 → 합류
          const amt = minActiveChips(room);
          gs.chips[target.sessionId] = amt;
          room.ctx.notify(room, `과반수 승인! ${target.name}님 재참가 — ${won(amt)} 칩으로 합류!`);
          delete gs.buyinReq[target.sessionId];
        } else {
          room.ctx.notify(room, `${ws.name}님이 ${target.name}님 재참가 승인 (${req.approvers.size}/${majority})`);
        }
      } else {
        req.approvers.delete(ws.sessionId); req.rejecters.add(ws.sessionId);
        const voters = buyinVoters(room).filter((s) => s !== target).length;
        if (req.rejecters.size > voters - majority) {                // 승인 불가능 → 거절 종료
          room.ctx.notify(room, `${target.name}님 재참가 거절됨 (과반 미달).`);
          delete gs.buyinReq[target.sessionId];
        } else {
          room.ctx.notify(room, `${ws.name}님이 ${target.name}님 재참가 거절 (반대 ${req.rejecters.size})`);
        }
      }
      if (!Object.keys(gs.buyinReq).length && betweenHands(room) && module.exports.canStart(room)) scheduleAutoStart(room);
      return true;
    }
    // 1명 빼고 다 파산 → 승리자(최다 칩)가 게임 재시작
    if (msg.type === 'restartGame') {
      if (!needRestart(room) || richest(room) !== ws) return false;
      resetAllChips(room);
      scheduleAutoStart(room);
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
    // 진행/직후/스테이지 중엔 '그 판에 앉은 사람'을, 대기(로비)일 땐 '다음 판 예상 좌석'
    const seats = h && room.phase !== 'lobby' ? h.seats : seatsOf(room);
    const nextSeats = seatsOf(room);                 // 다음 판에 앉을 사람들(2명만 돼도 시작 가능)
    const inHand = (s) => h && h.seats.includes(s) && room.phase === 'playing';
    // 오픈 정보: 정산 후엔 result.reveals(승자표시), 재경기/합류 단계엔 h.reveals(승자 미정)
    const revealList = h ? (h.result ? h.result.reveals : h.reveals) : null;
    const revealOf = (s) => revealList && revealList.find((r) => r.name === s.name);

    const players = seats.map((s) => {
      const isMe = s === ws;
      const rev = revealOf(s);
      // 카드: 본인 것은 항상 / 남의 것은 오픈(쇼다운) 때만
      let cards = null;
      if (h) {
        if (isMe && h.cards.has(s)) cards = h.cards.get(s);
        else if (rev) cards = rev.cards;
      }
      return {
        name: s.name, color: s.color, host: s === room.host,
        chips: gs.chips[s.sessionId] ?? 0,
        inHand: inHand(s),
        folded: h ? h.folded.has(s) : false,
        allin: h ? h.allin.has(s) : false,
        contrib: h ? (h.contrib.get(s) || 0) : 0,
        isTurn: room.phase === 'playing' && h && h.order[h.turnIdx] === s,
        isMe, cards,
        act: h && h.lastAct ? (h.lastAct.get(s) || null) : null,    // 마지막 베팅(체크/콜/따당/올인/다이…)
        handName: rev ? rev.hand : null,
        win: rev ? rev.win : false,
      };
    });

    const myTurn = room.phase === 'playing' && h && h.order[h.turnIdx] === ws && !h.folded.has(ws) && !h.allin.has(ws);
    let actions = null;
    if (myTurn) {
      const owe = oweOf(h, ws);
      const chips = gs.chips[ws.sessionId];
      const contrib = h.contrib.get(ws) || 0;
      const pay = (target) => Math.min(Math.max(0, target - contrib), chips);   // 실제 지불액(올인 캡)
      const amt = (n) => '₩' + won(n);
      const A = {
        check:   { act: 'check', name: '체크' },
        ping:    { act: 'ping',  name: '삥',  amount: amt(pay(h.currentBet + gs.ante)) },
        call:    { act: 'call',  name: '콜',  amount: amt(Math.min(owe, chips)) },
        ddang:   { act: 'ddang', name: '따당', amount: amt(pay(2 * h.currentBet - gs.ante)) },
        quarter: { act: 'quarter', name: '쿼터', amount: amt(pay(h.currentBet + Math.max(1, Math.floor(h.pot / 4)))) },
        half:    { act: 'half',  name: '하프', amount: amt(pay(h.currentBet + Math.max(1, Math.floor(h.pot / 2)))) },
        die:     { act: 'die',   name: '다이' },
      };
      const isSeon = ws === h.order[0];
      const called = h.calledSet && h.calledSet.has(ws);   // 콜/체크함 → 콜/다이만
      const rc = h.raiseCount || 0;
      if (called) {
        actions = owe > 0 ? [A.call, A.die] : [A.die];
      } else if (rc === 0) {                               // 첫 베팅(아직 아무도 안 올림)
        actions = isSeon ? [A.check, A.ping, A.half, A.die]   // 선: 체크/삥/하프/다이
                         : [A.half, A.die];                   // 비선(선이 체크함): 하프/다이
      } else if (rc === 1) {                               // 오프닝 받는 첫 라운드: 하프/콜/다이
        actions = [A.call, A.half, A.die];
      } else {                                             // 2번째 베팅부터 자유(풀·올인 없음)
        actions = [A.call, A.ddang, A.quarter, A.half, A.die];
      }
    }

    // 단계별 안내/버튼
    const stageDeadline = (room.phase === 'redeal' || room.phase === 'rejoin') ? gs.stageDeadline : (h && h.deadline);
    const potShown = room.phase === 'rejoin' ? (gs.carryPot || 0)
      : (room.phase === 'finished' && h && h.result) ? h.result.pot
      : ((h ? h.pot : 0) + (gs.carryPot || 0));
    const canRedeal = room.phase === 'redeal' && h.redealers.includes(ws) && !h.redealPassed.has(ws);
    const canRejoin = room.phase === 'rejoin' && gs.rejoin && gs.rejoin.cands.includes(ws) && !gs.rejoin.decided.has(ws);
    // 재경기에 자동 참여(동점자/base) 또는 이미 합류 결정한 사람 → "합류 대기 중"
    const rejoinWaiting = room.phase === 'rejoin' && gs.rejoin && !canRejoin &&
      (gs.rejoin.base.includes(ws) || (gs.rejoin.cands.includes(ws) && gs.rejoin.joined.has(ws)));

    return {
      game: 'seotda',
      handId: h ? h.id : 0,
      ante: gs.ante, startChips: gs.startChips,
      pot: potShown, carryPot: gs.carryPot || 0, carrySeq: gs.carrySeq || 0,
      currentBet: h ? h.currentBet : 0,
      players,
      mySeat: seats.indexOf(ws),
      myChips: gs.chips[ws.sessionId] ?? 0,
      myTurn, actions,
      secondsLeft: stageDeadline ? Math.max(0, Math.ceil((stageDeadline - Date.now()) / 1000)) : null,
      stage: room.phase === 'redeal' ? 'redeal' : room.phase === 'rejoin' ? 'rejoin' : null,
      redealerNames: room.phase === 'redeal' ? h.redealers.map((w) => w.name) : null,
      canRedeal, canRejoin, rejoinWaiting,
      rejoinCost: gs.rejoin ? gs.rejoin.half : 0,
      result: h ? h.result : null,
      canStart: room.host === ws && module.exports.canStart(room),
      autoStartIn: gs.autoStartDeadline ? Math.max(0, Math.ceil((gs.autoStartDeadline - Date.now()) / 1000)) : null,
      needRestart: needRestart(room),                    // 1명 빼고 다 파산
      canRestartGame: needRestart(room) && richest(room) === ws,   // 승리자만 재시작 버튼
      isHost: room.host === ws,
      // 파산자 재참가 (판 사이에만): 요청은 파산자가, 승인은 판에 있는 비파산 전원 과반수
      canRequestBuyin: betweenHands(room) && room.queue.includes(ws) && (gs.chips[ws.sessionId] ?? 0) < gs.ante && !(gs.buyinReq && gs.buyinReq[ws.sessionId]) && waitingToPlay(room) === 0 && (gs.carryPot || 0) === 0,
      buyinPending: !!(gs.buyinReq && gs.buyinReq[ws.sessionId]),
      buyinAmount: minActiveChips(room),
      iAmApprover: betweenHands(room) && (gs.chips[ws.sessionId] ?? 0) >= gs.ante,
      buyinRequests: (betweenHands(room) && (gs.chips[ws.sessionId] ?? 0) >= gs.ante)
        ? Object.keys(gs.buyinReq || {}).filter((sid) => sid !== ws.sessionId).map((sid) => {
            const req = gs.buyinReq[sid];
            const target = room.queue.find((q) => q.sessionId === sid);
            return { name: req.name, approvals: req.approvers.size, needed: target ? buyinMajority(room, target) : 1, voted: req.approvers.has(ws.sessionId) || req.rejecters.has(ws.sessionId) };
          })
        : [],
      // 게임 중/대기 중에 들어온 사람: 빈 자리 있으면 다음 판 합류, 아니면 대기열에서 관전
      waiting: room.queue.filter((s) => !seats.includes(s)).map((s) => ({
        name: s.name, color: s.color, chips: gs.chips[s.sessionId] ?? 0,
        willSit: nextSeats.includes(s),
      })),
    };
  },

  lobbyInfo(room) {
    return { count: room.queue.length, max: `최대 ${MAX_SEATS}인` };
  },

  // 테스트/검증용 내부 노출
  _eval: evalHand,
  _winner: determineWinner,
};
