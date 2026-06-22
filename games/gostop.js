// ───────────────────────────────────────────────────────────
//  화투(맞고/고스톱) — games/gostop-rules.md 명세 구현
//  [1단계] 카드 데이터 모델 + 덱/딜/셋업. (턴 엔진·점수·정산은 후속 단계)
// ───────────────────────────────────────────────────────────

// ── Config(하우스룰, §7) 기본값 ──
const DEFAULTS = {
  bonusCardCount: 3,        // 보너스피 장수 (2|3)
  bonusStealPi: true,       // 보너스 먹을 때 상대 피 1
  bidanIsChodan: false,     // 비단 초단 인정
  mungBak: null,            // 멍박(맞고 false/고스톱 true) — null이면 모드별 기본
  hyojaBbeok: true,         // 자뻑 시 피 2장
  firstBbeokPoint: 5,
  threeBbeokOnlyInPlay: true,
  chongtongHoldAllowed: true,
  chongtongPoint: 10,
  floorMatchChoice: 'player', // 바닥 동월 2장 시 선택권 (auto|player)
  seonAfterNagari: 'keep',
  noConsecutiveDeath: false,
};

// ── 월별 카드 구성 [category, flags] × idx 0~3 (gostop-rules.md §1 표 순서 = 에셋 {월}-{idx}.png) ──
const MONTHS = {
  1:  [['KWANG', []],          ['TTI', ['HONGDAN']],   ['PI', []],         ['PI', []]],
  2:  [['YEOL', ['GODORI']],   ['TTI', ['HONGDAN']],   ['PI', []],         ['PI', []]],
  3:  [['KWANG', []],          ['TTI', ['HONGDAN']],   ['PI', []],         ['PI', []]],
  4:  [['YEOL', ['GODORI']],   ['TTI', ['CHODAN']],    ['PI', []],         ['PI', []]],
  5:  [['YEOL', []],           ['TTI', ['CHODAN']],    ['PI', []],         ['PI', []]],
  6:  [['YEOL', []],           ['TTI', ['CHEONGDAN']], ['PI', []],         ['PI', []]],
  7:  [['YEOL', []],           ['TTI', ['CHODAN']],    ['PI', []],         ['PI', []]],
  8:  [['KWANG', []],          ['YEOL', ['GODORI']],   ['PI', []],         ['PI', []]],
  9:  [['YEOL', ['GUKJIN']],   ['TTI', ['CHEONGDAN']], ['PI', []],         ['PI', []]],   // 국진: 열끗⇆쌍피
  10: [['YEOL', []],           ['TTI', ['CHEONGDAN']], ['PI', []],         ['PI', []]],
  11: [['KWANG', []],          ['PI', ['SSANGPI']],    ['PI', []],         ['PI', []]],
  12: [['KWANG', ['BIGWANG']], ['YEOL', []],           ['TTI', ['BIDAN']], ['PI', ['SSANGPI']]],
};

// 보너스피 3종 (48 밖). 명세 기본: 쌍피2 + 쓰리피1 → 플러스피(2)·투피(2)·쓰리피(3)
const BONUS_CARDS = [
  { id: 'b-plus',  m: 0, idx: 0, cat: 'PI', flags: ['BONUS', 'SSANGPI'], pi: 2, img: 'gostop/plus.svg',  name: '플러스피' },
  { id: 'b-two',   m: 0, idx: 1, cat: 'PI', flags: ['BONUS', 'SSANGPI'], pi: 2, img: 'gostop/two.svg',   name: '투피' },
  { id: 'b-three', m: 0, idx: 2, cat: 'PI', flags: ['BONUS'],            pi: 3, img: 'gostop/three.svg', name: '쓰리피' },
];

function piValueOf(cat, flags) {
  if (cat !== 'PI') return flags.includes('GUKJIN') ? 2 : 0;   // 국진(열끗)도 쌍피로 쓰면 2
  return flags.includes('SSANGPI') ? 2 : 1;
}

// 화투 48장 카드 객체
function buildMonthCards() {
  const cards = [];
  for (let m = 1; m <= 12; m++) {
    MONTHS[m].forEach(([cat, flags], idx) => {
      cards.push({
        id: `${m}-${idx}`, m, idx, cat, flags: flags.slice(),
        pi: piValueOf(cat, flags),
        img: `gostop/${m}-${idx}.png`,
      });
    });
  }
  return cards;
}

// 전체 덱 = 48 + 보너스(config 장수)
function buildDeck(cfg) {
  const n = (cfg && cfg.bonusCardCount === 2) ? 2 : 3;
  return buildMonthCards().concat(BONUS_CARDS.slice(0, n).map((c) => ({ ...c, flags: c.flags.slice() })));
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── 모드 파라미터 (인원수 → 맞고/고스톱). 카드 수 제약상 더미 ≥ 손패총합 보장 ──
function modeParams(n) {
  if (n >= 3) return { mode: 'gostop', players: Math.min(n, 4), hand: 7, floor: 6, minScore: 3, piBak: 5, gobak: true, dokbak: true, mungBakDefault: true };  // 3·4인 동일 7/6(광팔기 없음)
  return { mode: 'matgo', players: 2, hand: 10, floor: 8, minScore: 7, piBak: 7, gobak: false, dokbak: false, mungBakDefault: false };
}

const sameMonth = (cards, m) => cards.filter((c) => c.m === m && m !== 0);

// 바닥에 깔린 카드들의 월별 개수
function floorMonthCounts(floor) {
  const cnt = {};
  for (const c of floor) if (c.m !== 0) cnt[c.m] = (cnt[c.m] || 0) + 1;
  return cnt;
}

// ── 딜링 + 셋업 예외 처리 (§2) ──
// 반환: { hands: [[],...], floor: [], draw: [], seonTook: [], chongtong: [seatIdx...], bbeokMonths: [month...] }
function deal(deck, params, seonIdx) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const d = shuffle(deck.slice());
    const hands = Array.from({ length: params.players }, () => []);
    const floor = [];
    // 분배: 손패(인원수×hand) + 바닥(floor)  — 전통 분배 순서는 단순화(셔플 후 순차)
    let p = 0;
    for (let i = 0; i < params.hand; i++) for (let s = 0; s < params.players; s++) hands[s].push(d[p++]);
    for (let i = 0; i < params.floor; i++) floor.push(d[p++]);
    const draw = d.slice(p);

    // 바닥 같은 월 4장 → 재섞기(기본)
    const fc = floorMonthCounts(floor);
    if (Object.values(fc).some((v) => v >= 4)) continue;   // 재딜

    const seonTook = [];
    // 바닥 보너스피 → 선이 가져감
    for (let i = floor.length - 1; i >= 0; i--) {
      if (floor[i].flags.includes('BONUS')) { seonTook.push(floor[i]); floor.splice(i, 1); }
    }
    // 바닥 같은 월 3장 → 뻑 예비(묶음) 표시
    const fc2 = floorMonthCounts(floor);
    const bbeokMonths = Object.keys(fc2).filter((m) => fc2[m] === 3).map(Number);
    // 손패 같은 월 4장 → 총통
    const chongtong = [];
    hands.forEach((h, s) => {
      const cm = floorMonthCounts(h);
      if (Object.values(cm).some((v) => v === 4)) chongtong.push(s);
    });

    return { hands, floor, draw, seonTook, chongtong, bbeokMonths };
  }
  throw new Error('deal failed (too many 4-of-month floors)');
}

// ── 턴 엔진 (§3 이벤트 + 피 뺏기) ──
const nextSeat = (r) => (r.turnIdx + 1) % r.params.players;
function removeFloor(r, ids) { const s = new Set(ids); r.floor = r.floor.filter((c) => !s.has(c.id)); }
function capture(r, seat, cards) { r.captured[seat].push(...cards); }

// 피 뺏기 — 각 상대에게서 n장씩(일반피 우선, 쌍피만 있으면 쌍피). 자기 패 소진(마지막 턴)이면 스킵.
function stealPi(room, seat, n, reason) {
  const r = room.gs.round;
  if (!n) return;
  if (r.hands[seat].length === 0) return;                 // 마지막 턴 제외(§3.2)
  let got = 0;
  for (let opp = 0; opp < r.params.players; opp++) {
    if (opp === seat) continue;
    for (let k = 0; k < n; k++) {
      const pis = r.captured[opp].filter((c) => c.cat === 'PI');
      if (!pis.length) break;                             // 피 0장 상대 제외
      pis.sort((a, b) => a.pi - b.pi);                    // 일반피(1) 우선, 없으면 쌍피(2)
      const pick = pis[0];
      r.captured[opp] = r.captured[opp].filter((c) => c !== pick);
      r.captured[seat].push(pick);
      got++;
    }
  }
  if (got) r.events.push({ ev: 'steal', by: seat, got, reason });
}

const floorCount = (r, m) => (m === 0 ? 0 : r.floor.filter((c) => c.m === m).length);
const floorOf = (r, m) => r.floor.filter((c) => c.m === m);
const myTurnNow = (r, seat) => seat >= 0 && seat === r.turnIdx && !r.pending && !r.decision && !r.over && r.freeFlips[seat] === 0;
function handMonths(r, seat, n) {   // 손패에 같은 월 n장 이상인 월 목록
  const cnt = {}; for (const c of r.hands[seat] || []) if (c.m !== 0) cnt[c.m] = (cnt[c.m] || 0) + 1;
  return Object.keys(cnt).filter((m) => cnt[m] >= n).map(Number);
}
function markBbeok(r, seat, m) {
  r.bbeokCount[seat] = (r.bbeokCount[seat] || 0) + 1;
  if (r.bbeokCount[seat] >= 3) r.threeBbeok = seat;   // 쓰리뻑 → 자동 승(endTurn에서 정산)
}

// 손패 1장 내기 — 손패를 바닥에 올린 뒤 뒤집기와 "합산 판정"(쪽/따닥/뻑)
function playCard(room, seat, cardId) {
  const r = room.gs.round, cfg = room.gs.cfg;
  if (!r || r.over || r.pending || r.decision || seat !== r.turnIdx) return false;
  if (r.freeFlips[seat] > 0) return false;        // 폭탄 빚: 뒤집기만(flip 액션) 해야 함
  const hand = r.hands[seat];
  const ci = hand.findIndex((c) => c.id === cardId);
  if (ci < 0) return false;
  const card = hand.splice(ci, 1)[0];
  r.events = [];
  if (card.flags.includes('BONUS')) {            // 손패 보너스: 즉시 획득+뺏기, 핸드월 없음
    capture(r, seat, [card]); r.events.push({ ev: 'bonus', card: card.id, src: 'hand' });
    if (cfg.bonusStealPi) stealPi(room, seat, 1, 'bonus');
    r.turn = { m: 0, cBefore: 0, hand: null };
    flipStep(room, seat); return true;
  }
  const cBefore = floorCount(r, card.m);          // 내기 전 바닥의 같은 월 수
  r.floor.push(card);                             // 손패를 바닥에 올림(먹기 미확정)
  r.turn = { m: card.m, cBefore, hand: card };
  flipStep(room, seat); return true;
}

// 더미에서 뒤집기(보너스면 연속), 뒤집은 패로 합산 판정
function flipStep(room, seat) {
  const r = room.gs.round, cfg = room.gs.cfg;
  while (true) {
    if (r.draw.length === 0) return resolveTurn(room, seat, null);   // 뒤집을 패 없음
    const d = r.draw.shift();
    if (d.flags.includes('BONUS')) {              // 더미 보너스: 획득+뺏기+연속
      capture(r, seat, [d]); r.events.push({ ev: 'bonus', card: d.id, src: 'flip' });
      if (cfg.bonusStealPi) stealPi(room, seat, 1, 'bonus');
      continue;
    }
    return resolveTurn(room, seat, d);
  }
}

// 손패(바닥에 올라가 있음) + 뒤집기 d 합산 판정
function resolveTurn(room, seat, d) {
  const r = room.gs.round;
  const M = r.turn.m, cB = r.turn.cBefore, h = r.turn.hand;
  let captured = false;

  if (d && M !== 0 && d.m === M) {
    // ── 손패와 뒤집기가 같은 월 ──
    if (cB === 0) {                               // 쪽: 미리 없던 월에 깐 패를 바로 먹음
      capture(r, seat, [h, d]); removeFloor(r, [h.id]);
      r.events.push({ ev: 'jjok', cards: [h.id, d.id] });
      stealPi(room, seat, 1, '쪽'); captured = true;
    } else if (cB === 1) {                        // 뻑: 1+손+뒤 = 3장 스택, 못 먹음
      r.floor.push(d); markBbeok(r, seat, M);
      r.events.push({ ev: 'bbeok', month: M, by: seat });
    } else {                                       // cB≥2: 따닥(4장)/그 이상 전부 먹기
      const fm = floorOf(r, M);                    // 바닥의 M(손패 포함)
      capture(r, seat, [...fm, d]); removeFloor(r, fm.map((c) => c.id));
      r.events.push({ ev: cB === 2 ? 'ttadak' : 'sweepM', cards: [...fm.map((c) => c.id), d.id] });
      stealPi(room, seat, 1, cB === 2 ? '따닥' : '뻑먹기'); captured = true;
    }
  } else {
    // ── 다른 월(또는 뒤집기 없음): 손패월 M, 뒤집기월 N 각각 처리 ──
    if (M !== 0) {
      if (cB === 1) {                              // 짝 먹기(손패 + 바닥1)
        const fm = floorOf(r, M);
        capture(r, seat, fm); removeFloor(r, fm.map((c) => c.id));
        r.events.push({ ev: 'take', cards: fm.map((c) => c.id), src: 'hand' }); captured = true;
      } else if (cB === 2) {                       // 뻑(바닥2 + 손패 = 3 스택)
        markBbeok(r, seat, M); r.events.push({ ev: 'bbeok', month: M, by: seat });
      } else if (cB >= 3) {                         // 스택 먹기
        const fm = floorOf(r, M);
        capture(r, seat, fm); removeFloor(r, fm.map((c) => c.id));
        r.events.push({ ev: 'bbeok-eat', cards: fm.map((c) => c.id) });
        stealPi(room, seat, 1, '뻑먹기'); captured = true;
      } // cB===0: 그냥 깔림(이미 바닥)
    }
    if (d) {
      const N = d.m, cN = floorCount(r, N);
      if (cN === 0) { r.floor.push(d); r.events.push({ ev: 'place', card: d.id, src: 'flip' }); }
      else if (cN === 1) {
        const fn = floorOf(r, N);
        capture(r, seat, [d, ...fn]); removeFloor(r, fn.map((c) => c.id));
        r.events.push({ ev: 'take', cards: [d.id, ...fn.map((c) => c.id)], src: 'flip' }); captured = true;
      } else if (cN === 2) {                       // 선택(§3.1) → 보류
        r.pending = { phase: 'flip', seat, month: N, options: floorOf(r, N).map((c) => c.id), card: d };
        return;
      } else {                                      // cN≥3 스택 먹기
        const fn = floorOf(r, N);
        capture(r, seat, [d, ...fn]); removeFloor(r, fn.map((c) => c.id));
        r.events.push({ ev: 'bbeok-eat', cards: [d.id, ...fn.map((c) => c.id)] });
        stealPi(room, seat, 1, '뻑먹기'); captured = true;
      }
    }
  }
  if (captured && r.floor.length === 0) { r.events.push({ ev: 'sweep' }); stealPi(room, seat, 1, '싹쓸이'); }  // 쓸(쪽/따닥과 중첩)
  endTurn(room);
}

// 바닥 동월 2장 선택 해소(뒤집기 케이스)
function chooseFloor(room, seat, floorCardId) {
  const r = room.gs.round;
  if (!r || !r.pending || seat !== r.pending.seat) return false;
  const p = r.pending;
  if (!p.options.includes(floorCardId)) return false;
  const chosen = r.floor.find((c) => c.id === floorCardId);
  capture(r, seat, [p.card, chosen]); removeFloor(r, [floorCardId]);
  r.events.push({ ev: 'take', cards: [p.card.id, floorCardId], src: 'flip', chosen: true });
  r.pending = null;
  if (r.floor.length === 0) { r.events.push({ ev: 'sweep' }); stealPi(room, seat, 1, '싹쓸이'); }
  endTurn(room);
  return true;
}

function endTurn(room) {
  const r = room.gs.round;
  r.pending = null;
  if (r.threeBbeok != null) return settle(room, r.threeBbeok, { forcedScore: r.params.minScore, reason: '쓰리뻑' });  // 쓰리뻑 자동승
  if (r.hands.every((h) => h.length === 0)) return nagari(room);     // 손·더미 소진까지 아무도 못 남 → 나가리
  const seat = r.turnIdx;
  const sc = scoreOf(r.captured[seat]).total;
  const baseline = r.goCount[seat] > 0 ? r.goScoreAt[seat] + 1 : r.params.minScore;   // 첫 나기 or 직전 고+1
  if (sc >= baseline) { r.decision = { seat, score: sc }; return; }   // 고/스톱 선택 대기(턴 멈춤)
  r.turnIdx = nextSeat(r);
}

// 나가리 — 무승부, 다음 판 점수 ×2 누적
function nagari(room) {
  const r = room.gs.round;
  r.over = true; room.phase = 'finished';
  r.result = { nagari: true };
  room.gs.carryMult = (room.gs.carryMult || 1) * 2;
}

// 고 — 계속 진행
function declareGo(room, seat) {
  const r = room.gs.round;
  if (!r.decision || r.decision.seat !== seat) return false;
  r.goCount[seat]++;
  r.goScoreAt[seat] = r.decision.score;
  r.events = [{ ev: 'go', by: seat, n: r.goCount[seat] }];
  r.decision = null;
  r.turnIdx = nextSeat(r);
  return true;
}

// 스톱 — 정산
function declareStop(room, seat) {
  const r = room.gs.round;
  if (!r.decision || r.decision.seat !== seat) return false;
  settle(room, seat);
  return true;
}

const canActNow = (r, seat) => r && !r.over && !r.pending && !r.decision && seat === r.turnIdx && r.freeFlips[seat] === 0;

// 흔들기 — 손에 같은 월 3장 공개(이기면 ×2). 선언 후 그 월 카드를 냄.
function declareShake(room, seat, month) {
  const r = room.gs.round;
  if (!canActNow(r, seat)) return false;
  if (r.hands[seat].filter((c) => c.m === month).length < 3) return false;
  r.shake[seat]++;
  r.events = [{ ev: 'shake', by: seat, month }];
  return true;   // 선언만 — 이어서 그 월 패를 play
}

// 폭탄 — 손 3장 + 바닥 1장(나머지) → 4장 전부 회수, 이기면 ×2, 손패 2장 부족 → 뒤집기 빚 2
function declareBomb(room, seat, month) {
  const r = room.gs.round;
  if (!canActNow(r, seat)) return false;
  const handM = r.hands[seat].filter((c) => c.m === month);
  if (handM.length < 3 || floorCount(r, month) < 1) return false;
  const floorM = floorOf(r, month);
  r.hands[seat] = r.hands[seat].filter((c) => c.m !== month);
  removeFloor(r, floorM.map((c) => c.id));
  r.events = [{ ev: 'bomb', by: seat, month, cards: [...handM, ...floorM].map((c) => c.id) }];
  capture(r, seat, [...handM, ...floorM]);
  r.shake[seat]++;
  r.freeFlips[seat] += 2;
  r.turn = { m: 0, cBefore: 0, hand: null };   // 합산판정 없음 — 일반 뒤집기
  flipStep(room, seat); return true;
}

// 뒤집기만(폭탄 빚 갚기) — 손패 안 내고 더미 한 장
function freeFlip(room, seat) {
  const r = room.gs.round;
  if (!r || r.over || r.pending || r.decision || seat !== r.turnIdx) return false;
  if (r.freeFlips[seat] <= 0) return false;
  r.freeFlips[seat]--;
  r.events = [];
  r.turn = { m: 0, cBefore: 0, hand: null };
  flipStep(room, seat); return true;
}

// 총통 — 손패 같은 월 4장 → 즉시 3점 승. (선언 안 하고 계속하면 chongtongHold로 ×4)
function declareChongtong(room, seat) {
  const r = room.gs.round;
  if (!r || r.over) return false;
  if (!r.chongtong.includes(seat)) return false;
  settle(room, seat, { forcedScore: r.params.minScore, reason: '총통' });
  return true;
}

// 정산(§5.2 곱셈 순서 엄수)
function settle(room, winnerSeat, opts) {
  const r = room.gs.round, gs = room.gs, cfg = gs.cfg;
  opts = opts || {};
  const sc = scoreOf(r.captured[winnerSeat]);

  // 1) base → 2) 고공식
  const goCount = r.goCount[winnerSeat];
  const base = opts.forcedScore != null ? opts.forcedScore : sc.total;
  let goScore = base + goCount;
  if (goCount >= 3) goScore *= Math.pow(2, goCount - 2);

  // 3) 전역 배수: 나가리누적 · 멍박 · 흔들기/폭탄 · 총통들고치기
  let globalMult = gs.carryMult || 1;
  const mungBakOn = cfg.mungBak == null ? r.params.mungBakDefault : cfg.mungBak;
  const mungBak = mungBakOn && sc.yeolCount >= 7;
  if (mungBak) globalMult *= 2;
  globalMult *= Math.pow(2, r.shake[winnerSeat] || 0);
  if (r.chongtongHold[winnerSeat]) globalMult *= 4;

  // 패자별 박(피박/광박) ×2 중첩
  const wonByPi = (sc.detail.pi || 0) > 0, wonByKwang = (sc.detail.kwang || 0) > 0;
  const losers = r.captured.map((_, i) => i).filter((i) => i !== winnerSeat);
  const bak = {}, baseAmt = {};
  for (const L of losers) {
    let m = globalMult; const tags = [];
    const lsc = scoreOf(r.captured[L]);
    if (wonByPi && lsc.piTotal > 0 && lsc.piTotal <= r.params.piBak) { m *= 2; tags.push('피박'); }
    if (wonByKwang && lsc.kwangCount === 0) { m *= 2; tags.push('광박'); }
    if (mungBak) tags.push('멍박');
    bak[L] = tags; baseAmt[L] = goScore * m;
  }

  // 고박(3인): 고 외치고 진 사람이 전원분 전액
  const goLosers = r.params.gobak ? losers.filter((L) => r.goCount[L] > 0) : [];
  const payScore = {};
  if (goLosers.length) {
    const total = losers.reduce((s, L) => s + baseAmt[L], 0);
    for (const L of losers) payScore[L] = goLosers.includes(L) ? Math.round(total / goLosers.length) : 0;
    goLosers.forEach((L) => bak[L].push('고박'));
  } else {
    for (const L of losers) payScore[L] = baseAmt[L];
  }

  // 칩 이동(보유칩 한도)
  const payments = {}; let pot = 0;
  for (const L of losers) {
    const ws = room.queue[L], amt = payScore[L] * gs.pointValue;
    const pay = Math.min(amt, gs.chips[ws.sessionId] || 0);
    gs.chips[ws.sessionId] -= pay; payments[L] = pay; pot += pay;
  }
  gs.chips[room.queue[winnerSeat].sessionId] += pot;

  r.over = true; room.phase = 'finished';
  r.result = {
    winner: winnerSeat, reason: opts.reason || 'stop',
    baseScore: base, detail: sc.detail, goCount, goScore,
    shake: r.shake[winnerSeat] || 0, mungBak, chongtong: !!r.chongtongHold[winnerSeat],
    bak, payScore, payments,
  };
  gs.carryMult = 1; gs.seonIdx = winnerSeat;            // 누적 리셋, 승자 선
}

// ── 점수 계산 (§4) ──
// gukjinAs: 9월 국진을 '열끗' | '피' 중 어느 쪽으로 셀지
function scoreCore(captured, gukjinAs) {
  const kwang = captured.filter((c) => c.cat === 'KWANG');
  let yeol = captured.filter((c) => c.cat === 'YEOL');
  let piTotal = captured.filter((c) => c.cat === 'PI').reduce((s, c) => s + c.pi, 0);
  if (gukjinAs === 'pi') { yeol = yeol.filter((c) => !c.flags.includes('GUKJIN')); piTotal += 2; }
  const tti = captured.filter((c) => c.cat === 'TTI');

  const detail = {};
  let score = 0;

  // 광: 3광3 / 비광낀3광2 / 4광4 / 5광15
  const nK = kwang.length, hasBi = kwang.some((c) => c.flags.includes('BIGWANG'));
  let kS = 0;
  if (nK >= 5) kS = 15; else if (nK === 4) kS = 4; else if (nK === 3) kS = hasBi ? 2 : 3;
  if (kS) { score += kS; detail.kwang = kS; }

  // 고도리(2·4·8 열끗 = 5)
  if (yeol.filter((c) => c.flags.includes('GODORI')).length >= 3) { score += 5; detail.godori = 5; }

  // 열끗 5장1점 +1/장
  if (yeol.length >= 5) { const y = yeol.length - 4; score += y; detail.yeol = y; }

  // 띠 5장1점 +1/장 + 홍/청/초단 각3
  if (tti.length >= 5) { const t = tti.length - 4; score += t; detail.tti = t; }
  if (tti.filter((c) => c.flags.includes('HONGDAN')).length >= 3) { score += 3; detail.hongdan = 3; }
  if (tti.filter((c) => c.flags.includes('CHEONGDAN')).length >= 3) { score += 3; detail.cheongdan = 3; }
  if (tti.filter((c) => c.flags.includes('CHODAN')).length >= 3) { score += 3; detail.chodan = 3; }

  // 피 10점1점 +1/점 (쌍피·보너스 piValue=2)
  if (piTotal >= 10) { const p = piTotal - 9; score += p; detail.pi = p; }

  return { total: score, detail, kwangCount: nK, yeolCount: yeol.length, piTotal, mungBak: yeol.length >= 7, gukjinAs };
}

// 국진은 보유자에게 유리한 쪽(열끗/피) 자동 선택
function scoreOf(captured) {
  const a = scoreCore(captured, 'yeol');
  if (!captured.some((c) => c.flags.includes('GUKJIN'))) return a;
  const b = scoreCore(captured, 'pi');
  return b.total > a.total ? b : a;
}

// ── 봇 (서버측, 히든정보 — 휴리스틱) ──
function cardWorth(c) {
  if (c.cat === 'KWANG') return 20;
  if (c.cat === 'YEOL') return c.flags.includes('GODORI') ? 14 : 10;
  if (c.cat === 'TTI') return c.flags.some((f) => ['HONGDAN', 'CHEONGDAN', 'CHODAN'].includes(f)) ? 7 : 5;
  return c.pi || 1;   // 피
}
function botPickPlay(r, seat) {
  const hand = r.hands[seat];
  let best = hand[0], bestV = -1e9;
  for (const c of hand) {
    const fc = floorCount(r, c.m);
    let v;
    if (fc === 1) v = 5 + cardWorth(floorOf(r, c.m)[0]) + cardWorth(c);   // 짝 먹기
    else if (fc >= 3) v = 40;                                             // 뻑 스택 회수
    else if (fc === 2) v = -10;                                           // 뻑 위험 회피
    else v = -cardWorth(c) * 0.3;                                         // 짝없음 → 가치 낮은 패 깔기
    if (v > bestV) { bestV = v; best = c; }
  }
  return best;
}

// ── 모듈 인터페이스 ──
module.exports = {
  type: 'gostop',
  title: '고스톱',
  emoji: '🃏',
  maxPlayers: 4,
  wip: false,                      // ⚠️ 구현 중 — 완성 전까지 로비 노출/생성 차단

  init(room, opts) {
    const cfg = { ...DEFAULTS };
    room.gs = {
      cfg,
      chips: {},                  // sessionId → 칩
      startChips: 100000,
      pointValue: 100,            // 점당 칩
      handNo: 0,
      seonIdx: 0,
      carryMult: 1,               // 나가리 누적배수
    };
  },

  onEnter(room, ws) {},

  canStart(room) {
    const humans = room.queue.filter((w) => !w.isBot);
    return room.queue.length >= 2 && room.phase !== 'playing';
  },

  // [1단계] start = 딜링/셋업까지만. 턴 엔진은 후속.
  start(room, msg) {
    const players = room.queue.length;
    const params = modeParams(players);
    const deck = buildDeck(room.gs.cfg);
    const seonIdx = room.gs.seonIdx % players;
    const dealt = deal(deck, params, seonIdx);
    room.phase = 'playing';
    room.gs.handNo++;
    room.gs.params = params;
    room.gs.round = {
      params,
      seonIdx,
      turnIdx: seonIdx,
      hands: dealt.hands,                 // 좌석별 손패
      floor: dealt.floor,                 // 바닥
      draw: dealt.draw,                   // 더미
      captured: room.queue.map(() => []), // 좌석별 획득
      seonTook: dealt.seonTook,
      chongtong: dealt.chongtong,
      bbeokMonths: dealt.bbeokMonths,
      pending: null,                      // 바닥 선택 대기
      over: false,
      events: [],                         // 직전 액션 이벤트(UI용: take/place/bbeok/steal…)
      bbeokCount: {},                     // 좌석별 뻑 횟수(첫뻑/연뻑·쓰리뻑 판정용)
      goCount: room.queue.map(() => 0),   // 좌석별 고 횟수
      goScoreAt: room.queue.map(() => 0), // 직전 고 선언 시 점수
      decision: null,                     // 고/스톱 대기 { seat, score }
      result: null,                       // 정산 결과
      shake: room.queue.map(() => 0),     // 흔들기/폭탄 횟수(이기면 ×2/회)
      freeFlips: room.queue.map(() => 0), // 폭탄으로 인한 "뒤집기만" 빚
      chongtongHold: room.queue.map(() => false),  // 총통 안 치고 계속(이기면 ×4)
      threeBbeok: null,                   // 쓰리뻑 발생 좌석
    };
    for (const w of room.queue) if (room.gs.chips[w.sessionId] == null) room.gs.chips[w.sessionId] = room.gs.startChips;
    // 선이 가져간 바닥 보너스 → 선 획득더미로
    if (dealt.seonTook.length) room.gs.round.captured[seonIdx].push(...dealt.seonTook);
  },

  onLeave(room, ws) {
    // 후속: 대국 중 퇴장 처리. 1단계는 라운드 폐기.
    if (room.phase === 'playing') room.phase = 'lobby';
    room.gs.round = null;
  },

  cleanup(room) {},

  reattach(room, oldWs, newWs) {},

  action(room, ws, msg) {
    if (room.phase !== 'playing') return false;
    const seat = room.queue.indexOf(ws);
    if (seat < 0) return false;
    if (msg.type === 'play') return playCard(room, seat, String(msg.cardId));     // 손패 1장 내기
    if (msg.type === 'choose') return chooseFloor(room, seat, String(msg.cardId)); // 바닥 동월 2장 선택
    if (msg.type === 'go') return declareGo(room, seat);                           // 고
    if (msg.type === 'stop') return declareStop(room, seat);                       // 스톱(정산)
    if (msg.type === 'shake') return declareShake(room, seat, Number(msg.month));  // 흔들기
    if (msg.type === 'bomb') return declareBomb(room, seat, Number(msg.month));    // 폭탄
    if (msg.type === 'flip') return freeFlip(room, seat);                          // 뒤집기만(폭탄 빚)
    if (msg.type === 'chongtong') return declareChongtong(room, seat);             // 총통
    return false;
  },

  botWants(room, ws) {
    const r = room.gs.round;
    if (!r || room.phase !== 'playing' || r.over) return false;
    const seat = room.queue.indexOf(ws);
    if (seat < 0) return false;
    if (r.pending) return r.pending.seat === seat;
    if (r.decision) return r.decision.seat === seat;
    return r.turnIdx === seat;     // 내 턴(플레이/뒤집기/총통)
  },

  bot(room, ws) {
    const r = room.gs.round;
    const seat = room.queue.indexOf(ws);
    if (!r || seat < 0) return null;
    if (r.pending && r.pending.seat === seat) {                 // 바닥 2장 선택 → 가치 높은 패
      const opts = r.pending.options.map((id) => r.floor.find((c) => c.id === id)).filter(Boolean);
      opts.sort((a, b) => cardWorth(b) - cardWorth(a));
      return { type: 'choose', cardId: (opts[0] || r.floor.find((c) => c.id === r.pending.options[0])).id };
    }
    if (r.decision && r.decision.seat === seat) {               // 고/스톱
      const sc = r.decision.score, left = r.draw.length;
      let go = sc < 4 ? Math.random() < 0.7 : sc < 7 ? Math.random() < 0.35 : Math.random() < 0.1;
      if (left < 4) go = false;
      return { type: go ? 'go' : 'stop' };
    }
    if (r.turnIdx === seat) {
      if (r.freeFlips[seat] > 0) return { type: 'flip' };
      if (r.chongtong.includes(seat)) return { type: 'chongtong' };          // 총통이면 즉시
      const bombM = handMonths(r, seat, 3).filter((m) => floorCount(r, m) >= 1);
      if (bombM.length && Math.random() < 0.7) return { type: 'bomb', month: bombM[0] };
      return { type: 'play', cardId: botPickPlay(r, seat).id };
    }
    return null;
  },

  state(room, ws) {
    const gs = room.gs, r = gs.round;
    const seatIdx = room.queue.indexOf(ws);
    const base = {
      phase: room.phase,
      mode: gs.params ? gs.params.mode : null,
      handNo: gs.handNo,
      seats: room.queue.map((w, i) => ({ name: w.name, color: w.color, isBot: !!w.isBot, seat: i, chips: room.gs.chips ? (room.gs.chips[w.sessionId] || 0) : 0 })),
      yourSeat: seatIdx,
      canStart: room.host === ws && module.exports.canStart(room),
      wip: false,
    };
    if (!r) return base;
    const pend = r.pending && r.pending.seat === seatIdx ? {
      month: r.pending.month,
      options: r.pending.options.map((id) => r.floor.find((c) => c.id === id)).filter(Boolean),
    } : null;
    return {
      ...base,
      seonIdx: r.seonIdx,
      turnIdx: r.turnIdx,
      myTurn: seatIdx === r.turnIdx && !r.pending,
      floor: r.floor,
      drawCount: r.draw.length,
      myHand: seatIdx >= 0 ? (r.hands[seatIdx] || []) : [],
      handCounts: r.hands.map((h) => h.length),
      captured: r.captured,
      scores: r.captured.map((cap) => scoreOf(cap).total),   // 좌석별 현재 점수
      scoreDetails: r.captured.map((cap) => scoreOf(cap).detail),   // 좌석별 점수 상세(획득더미 표시)
      myScore: seatIdx >= 0 ? scoreOf(r.captured[seatIdx]) : null,
      bbeokMonths: r.bbeokMonths,
      chongtong: r.chongtong,
      bbeokCount: r.bbeokCount,
      pendingChoice: pend,           // 내가 바닥 2장 골라야 하면 선택지
      decision: r.decision && r.decision.seat === seatIdx ? r.decision : null,   // 내 고/스톱 차례면 표시
      goCounts: r.goCount,
      shake: r.shake,
      myFreeFlips: seatIdx >= 0 ? r.freeFlips[seatIdx] : 0,   // >0이면 뒤집기만(flip)
      shakeable: myTurnNow(r, seatIdx) ? handMonths(r, seatIdx, 3).filter((m) => floorCount(r, m) < 1) : [],  // 흔들기 가능 월
      bombable: myTurnNow(r, seatIdx) ? handMonths(r, seatIdx, 3).filter((m) => floorCount(r, m) >= 1) : [],  // 폭탄 가능 월
      canChongtong: r.chongtong.includes(seatIdx),
      result: r.result,              // 정산 결과(over일 때)
      chips: room.gs.chips,
      events: r.events,
      over: r.over,
    };
  },

  lobbyInfo(room) {
    return { count: room.queue.length, max: `${room.queue.length}/5` };
  },

  // ── 테스트 훅 ──
  _buildDeck: buildDeck,
  _buildMonthCards: buildMonthCards,
  _modeParams: modeParams,
  _deal: deal,
  _scoreOf: scoreOf,
};
