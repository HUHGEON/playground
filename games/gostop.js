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

// ── 모드 파라미터 (인원수 → 맞고/고스톱) ──
function modeParams(n) {
  if (n >= 3) return { mode: 'gostop', players: n, hand: 7, floor: 6, minScore: 3, piBak: 5, gobak: true, dokbak: true, mungBakDefault: true };
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

// ── 모듈 인터페이스 ──
module.exports = {
  type: 'gostop',
  title: '고스톱',
  emoji: '🃏',
  maxPlayers: 5,
  wip: true,                      // ⚠️ 구현 중 — 완성 전까지 로비 노출/생성 차단

  init(room, opts) {
    const cfg = { ...DEFAULTS };
    room.gs = {
      cfg,
      handNo: 0,
      seonIdx: 0,
      hand: null,                 // 진행 중 라운드 상태(후속 단계)
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
    };
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
    return false;   // [후속 단계] 턴 액션(낼 패/고스톱/선택 등)
  },

  state(room, ws) {
    const gs = room.gs, r = gs.round;
    const seatIdx = room.queue.indexOf(ws);
    const base = {
      phase: room.phase,
      mode: gs.params ? gs.params.mode : null,
      handNo: gs.handNo,
      seats: room.queue.map((w, i) => ({ name: w.name, color: w.color, isBot: !!w.isBot, seat: i })),
      yourSeat: seatIdx,
      canStart: room.host === ws && module.exports.canStart(room),
      wip: true,
    };
    if (!r) return base;
    return {
      ...base,
      seonIdx: r.seonIdx,
      turnIdx: r.turnIdx,
      floor: r.floor,
      drawCount: r.draw.length,
      myHand: seatIdx >= 0 ? (r.hands[seatIdx] || []) : [],
      handCounts: r.hands.map((h) => h.length),
      captured: r.captured,
      bbeokMonths: r.bbeokMonths,
      chongtong: r.chongtong,
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
};
