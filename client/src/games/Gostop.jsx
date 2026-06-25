import { useState, useEffect, useRef, useReducer, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import '../gostop.css';
import { avatar, nyang, cardSrc, MNAME, pileGroups } from './gostopUtil.js';

const CAT = [['KWANG', '광', 'c-kw'], ['YEOL', '멍', 'c-yeol'], ['TTI', '단', 'c-tti'], ['PI', '피', 'c-pi']];
const CATNAME = { KWANG: '광', YEOL: '멍', TTI: '단', PI: '피' };
const pname = (p) => (p ? p.name.replace(/🤖/g, '') : '');
const BACK_BG = 'linear-gradient(160deg,#a51f27,#771319)';

// ── 바닥 고정 슬롯(% 좌표) — 절대 안 움직인다. 카드가 슬롯을 차지/비울 뿐. (프로토타입 핵심) ──
// 중앙 더미(50%,50%)를 피해 위/아래 두 줄로 펼침. 위·아래를 번갈아 채워 8장이 4×2 그리드로 고르게 깔리게.
const SLOTS = (() => {
  const cols = [16, 32, 48, 64, 82];
  const rowsTop = 26, rowsBot = 74, rowsTop2 = 11, rowsBot2 = 89;
  const order = [];
  for (let i = 0; i < cols.length; i++) { order.push({ x: cols[i], y: rowsTop }); order.push({ x: cols[i], y: rowsBot }); }   // 0~9: 위/아래 번갈아
  for (let i = 0; i < cols.length; i++) { order.push({ x: cols[i], y: rowsTop2 }); order.push({ x: cols[i], y: rowsBot2 }); } // 10~19: 오버플로 줄
  return order.map((p, i) => ({ ...p, rot: ((i * 37) % 9) - 4 }));
})();
function slotPct(idx) {
  const base = SLOTS[idx % SLOTS.length];
  const wrap = Math.floor(idx / SLOTS.length);
  return { x: base.x + wrap * 2.2, y: base.y + wrap * 2.2, rot: base.rot };
}

// ── 한 턴 페이싱(ms) — 분석 문서의 권장 타임라인(~2.6s) 기반 ──
const T = {
  play: 60, playLand: 480, eatLift: 120, eatMove: 40, eatDrop: 460,
  flipSpawn: 520, flipRy: 80, flipFront: 220, flipLand: 520, flipDrop: 440,
  bonusReveal: 360, bonusHold: 900, bonusToPile: 300, bonusDrop: 440,
  callHold: 760, ppeokHold: 1100, steal: 220, stealMove: 120, stealDrop: 540,
  jokboHold: 1500,
};

function Card({ c, cls }) {
  return <img className={'gscard' + (cls ? ' ' + cls : '')} src={cardSrc(c)} data-id={c.id} data-m={c.m} draggable={false} alt="" />;
}

function CapStrips({ captured }) {
  const { g } = pileGroups(captured);
  return CAT.map(([k, lb, cls]) => (
    <div key={k} className={'gs-cgrp ' + cls}>
      <div className="gs-cgrp-hd"><span className="gs-cgrp-lb">{lb}</span><span className="gs-cgrp-n">{g[k].length}</span></div>
      <div className="gs-cgrp-cards">
        {g[k].map((c) => k === 'PI'
          ? <span key={c.id} className="gs-pic"><Card c={c} cls="mini" />{c.pi >= 2 && <b className="gs-piv">{c.pi}</b>}</span>
          : <Card key={c.id} c={c} cls="mini" />)}
      </div>
    </div>
  ));
}

// 족보 임박 경고 — 획득 카테고리별로 "한 장 남음" 판정(분석 #1)
function imminentWarn(captured) {
  const { g } = pileGroups(captured);
  const has = (arr, flag, n) => arr.filter((c) => (c.flags || []).includes(flag)).length === n;
  // 홍단/청단/초단 2장(=1장 남음)
  if (has(g.TTI, 'HONGDAN', 2)) return { grp: 'TTI', text: '홍단 1장!' };
  if (has(g.TTI, 'CHEONGDAN', 2)) return { grp: 'TTI', text: '청단 1장!' };
  if (has(g.TTI, 'CHODAN', 2)) return { grp: 'TTI', text: '초단 1장!' };
  if (g.KWANG.length === 2) return { grp: 'KWANG', text: '광 1장!' };
  if (g.YEOL.filter((c) => (c.flags || []).includes('GODORI')).length === 2) return { grp: 'YEOL', text: '고도리 1장!' };
  return null;
}

function OppTop({ s, seat, cap: capProp }) {
  const p = s.seats[seat]; if (!p) return null;
  const turn = s.turnIdx === seat && s.phase === 'playing';
  const sc = s.scores ? s.scores[seat] : 0;
  const tags = [];
  if (s.goCounts && s.goCounts[seat]) tags.push(`${s.goCounts[seat]}고`);
  if (s.shake && s.shake[seat]) tags.push(`흔들×${s.shake[seat]}`);
  const cap = capProp || (s.captured && s.captured[seat]) || [];
  const warn = imminentWarn(cap);
  return (
    <div className={'gs-opp' + (turn ? ' turn' : '')} data-player={p.name}>
      <div className="gs-opp-head">
        <span className="gs-ava">{avatar(p.name)}</span>
        <span className="gs-opp-info"><b>{p.name}</b><span className="gs-chips">{nyang(p.chips)}냥</span></span>
        <span className="gs-badge-col">
          {warn && <span className="gs-warnbadge">⚠ {warn.text}</span>}
          <span className="gs-sc">{sc}점</span>
          {tags.map((t, i) => <span key={i} className="gs-tag">{t}</span>)}
          {turn && <span className="gs-now">차례</span>}
        </span>
      </div>
      <div className="gs-opp-cap">{cap.length ? <CapStrips captured={cap} /> : <span className="gs-cap-empty">획득 없음</span>}</div>
    </div>
  );
}

export default function Gostop({ ws }) {
  const s = ws.room;
  const send = ws.send;
  const [rulesOpen, setRulesOpen] = useState(false);
  const [infoEl, setInfoEl] = useState(null);
  useEffect(() => { setInfoEl(document.getElementById('roomInfo')); }, []);

  const me = s.yourSeat;
  const opps = (s.seats || []).map((_, i) => i).filter((i) => i !== me);
  const oppSeat = opps[0];

  // ── 애니메이션 모델(가변 ref) + 강제 리렌더 ──
  const m = useRef(null);
  if (m.current == null) m.current = { flyers: [], hidden: new Set(), callout: null, jokbo: null, dim: false, scoreShow: { my: null, opp: null } };
  const [, sync] = useReducer((x) => (x + 1) | 0, 0);
  const seq = useRef({ timers: [], t: 0, tok: 0 });
  const slots = useRef({});      // cardId -> slotIndex (고정 배정)
  const used = useRef(new Set());
  const prev = useRef({ floor: [], hand: [], cap: [], scores: [], handNo: -1, phase: '' });
  const dealtRound = useRef(-1);   // 딜 인트로 1회/라운드

  // 슬롯 배정 동기화 — 매번 깨끗이 재구성(기존 배정 보존, 충돌·드리프트 방지)
  function syncSlots(floorCards) {
    const ids = floorCards.map((c) => c.id);
    const newMap = {}; const usedSet = new Set();
    for (const id of ids) {                                  // 1) 기존 슬롯 유지(중복 아닐 때만)
      const cur = slots.current[id];
      if (cur != null && !usedSet.has(cur)) { newMap[id] = cur; usedSet.add(cur); }
    }
    for (const id of ids) {                                  // 2) 미배정 패에 빈 슬롯
      if (newMap[id] == null) { let i = 0; while (usedSet.has(i)) i++; newMap[id] = i; usedSet.add(i); }
    }
    slots.current = newMap; used.current = usedSet;
  }
  const slotPctFor = (id) => slotPct(slots.current[id] != null ? slots.current[id] : 0);

  // ── 좌표 헬퍼(felt 기준 px) ──
  const feltRect = () => { const el = document.getElementById('gsFelt'); return el ? el.getBoundingClientRect() : null; };
  function elPx(sel) {
    const felt = feltRect(); if (!felt) return null;
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!el) return null;
    const r = el.getBoundingClientRect(); if (!r.width) return null;
    return { x: r.left + r.width / 2 - felt.left, y: r.top + r.height / 2 - felt.top };
  }
  function slotPx(id) {
    const felt = feltRect(); const fl = document.getElementById('gsFloor'); if (!felt || !fl) return { x: 0, y: 0 };
    const r = fl.getBoundingClientRect(); const p = slotPctFor(id);
    return { x: r.left - felt.left + (p.x / 100) * r.width, y: r.top - felt.top + (p.y / 100) * r.height };
  }
  function cardSize() {
    const el = document.querySelector('#gsFloor .gscard') || document.getElementById('gsDraw');
    if (el) { const r = el.getBoundingClientRect(); if (r.width) return { w: Math.round(r.width), h: Math.round(r.height) }; }
    return { w: 52, h: 80 };
  }

  // ── 딜 인트로(촤라랄라) — 손패+바닥패가 더미에서 제자리로 스태거로 날아 들어옴 ──
  function dealIn() {
    requestAnimationFrame(() => {
      const felt = feltRect(); if (!felt) return;
      const deck = elPx('#gsCenter'); if (!deck) return;
      const hand = [...document.querySelectorAll('#gsHand .gscard')];
      const floor = [...document.querySelectorAll('#gsFloor .gscard')];
      const all = [];
      const maxLen = Math.max(hand.length, floor.length);
      for (let i = 0; i < maxLen; i++) { if (hand[i]) all.push(hand[i]); if (floor[i]) all.push(floor[i]); }   // 손/바닥 번갈아 나눠주는 느낌
      all.forEach((el, i) => {
        const isFloor = el.classList.contains('floorc');
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2 - felt.left, cy = r.top + r.height / 2 - felt.top;
        const dx = deck.x - cx, dy = deck.y - cy;
        const rot = isFloor ? (slotPctFor(el.dataset.id).rot || 0) : 0;
        const base = isFloor ? 'translate(-50%,-50%) ' : '';
        const tail = isFloor ? ` rotate(${rot}deg)` : '';
        try {
          el.animate([
            { transform: `${base}translate(${dx}px,${dy}px) scale(.35) rotate(-14deg)${isFloor ? '' : ''}`, opacity: 0, offset: 0 },
            { transform: `${base}translate(${dx * 0.08}px,${dy * 0.08}px) scale(1.06)${tail}`, opacity: 1, offset: 0.82 },   // 거의 도착 + 살짝 큼
            { transform: `${base}translate(0,0) scale(1)${tail}`, opacity: 1, offset: 1 },                                   // 탁 안착
          ], { duration: 340, delay: i * 46, easing: 'cubic-bezier(.3,.8,.4,1)', fill: 'backwards' });
        } catch (e) { /* noop */ }
      });
    });
  }

  // ── flyer 조작 ──
  function fly(o) { m.current.flyers = [...m.current.flyers, { ...o }]; }
  function setFly(key, patch) { m.current.flyers = m.current.flyers.map((f) => f.key === key ? { ...f, ...patch } : f); }
  function dropFly(key) { m.current.flyers = m.current.flyers.filter((f) => f.key !== key); }
  const hide = (id) => m.current.hidden.add(id);
  const unhide = (id) => m.current.hidden.delete(id);

  // ── 시퀀서 ──
  function resetSeq() { seq.current.timers.forEach(clearTimeout); seq.current.timers = []; seq.current.t = 0; seq.current.tok++; }
  function step(dt, fn) {
    const tok = seq.current.tok; seq.current.t += dt;
    seq.current.timers.push(setTimeout(() => { if (seq.current.tok !== tok) return; fn(); sync(); }, seq.current.t));
  }
  // 시퀀스 끝나면 무조건 정상 상태로(안전망)
  function settle() { m.current.flyers = []; m.current.hidden = new Set(); m.current.callout = null; m.current.dim = false; sync(); }

  function showCallout(big, sub, srcs) { m.current.callout = { big, sub, cards: srcs || [] }; m.current.dim = true; }
  function hideCallout() { m.current.callout = null; m.current.dim = false; }
  function showJokbo(name, pt, srcs) { m.current.jokbo = { name, pt, cards: srcs || [] }; m.current.dim = true; }
  function hideJokbo() { m.current.jokbo = null; m.current.dim = false; }

  const EVNAME = { jjok: '쪽!', ttadak: '따닥!', bbeok: '뻑!', 'bbeok-eat': '뻑 회수!', sweep: '싹쓸이!', sweepM: '뻑 회수!' };

  // ── 메인 구동: 서버 상태 델타 → 연출 시퀀스 ──
  useLayoutEffect(() => {
    if (s.phase !== 'playing') {
      resetSeq(); m.current.flyers = []; m.current.hidden = new Set(); m.current.callout = null; m.current.jokbo = null; m.current.dim = false;
      slots.current = {}; used.current = new Set(); syncSlots(s.floor || []);
      prev.current = { floor: s.floor || [], hand: s.myHand || [], cap: (s.captured || []).map((a) => a.slice()), scores: (s.scores || []).slice(), handNo: s.handNo, phase: s.phase };
      sync();   // 슬롯 배정을 paint 전에 반영(안 하면 ref만 바뀌고 재렌더 안 됨 → 전부 슬롯0 겹침)
      return;
    }
    const P = prev.current;
    const nf = s.floor || [], nh = s.myHand || [], nc = s.captured || [];
    const newRound = P.handNo !== s.handNo || P.phase !== 'playing';

    // 새 라운드/첫 진입 → 스냅(딜 인트로 생략)
    if (newRound) {
      resetSeq(); m.current.flyers = []; m.current.hidden = new Set(); m.current.callout = null; m.current.jokbo = null; m.current.dim = false;
      slots.current = {}; used.current = new Set(); syncSlots(nf);
      prev.current = { floor: nf, hand: nh, cap: nc.map((a) => a.slice()), scores: (s.scores || []).slice(), handNo: s.handNo, phase: s.phase };
      sync();   // 딜 직후 슬롯 배정 반영(겹침 버그 방지)
      if (dealtRound.current !== s.handNo) { dealtRound.current = s.handNo; dealIn(); }   // 촤라랄라 딜 인트로(라운드당 1회)
      return;
    }

    // ── 델타 계산 ──
    const pfIds = new Set(P.floor.map((c) => c.id)), nfIds = new Set(nf.map((c) => c.id));
    const capturedFloor = P.floor.filter((c) => !nfIds.has(c.id));     // 바닥서 사라진 패(먹힘)
    const addedFloor = nf.filter((c) => !pfIds.has(c.id));             // 바닥에 새로 깔린 패(낸 패/뒤집힌 패 노매칭)
    const nhIds = new Set(nh.map((c) => c.id));
    const leftHand = P.hand.filter((c) => !nhIds.has(c.id));           // 손에서 나간 패
    let capSeat = -1;
    for (let i = 0; i < nc.length; i++) if ((nc[i] ? nc[i].length : 0) > ((P.cap[i] && P.cap[i].length) || 0)) { capSeat = i; break; }
    const flipped = s.flippedCard || null;
    const events = s.events || [];

    // 아무 변화 없음(점수/턴만 갱신 등) → 슬롯만 맞추고 스냅
    if (!capturedFloor.length && !addedFloor.length && !leftHand.length && capSeat < 0) {
      syncSlots(nf); sync();
      prev.current = { floor: nf, hand: nh, cap: nc.map((a) => a.slice()), scores: (s.scores || []).slice(), handNo: s.handNo, phase: s.phase };
      return;
    }

    // capSeat 분류
    let newCap = [], bonusCards = [], stolenCards = [], realCap = [];
    if (capSeat >= 0) {
      const pcIds = new Set((P.cap[capSeat] || []).map((c) => c.id));
      newCap = (nc[capSeat] || []).filter((c) => !pcIds.has(c.id));
      const prevOther = new Set();
      for (let i = 0; i < P.cap.length; i++) if (i !== capSeat) for (const c of (P.cap[i] || [])) prevOther.add(c.id);
      const capFloorIds = new Set(capturedFloor.map((c) => c.id));
      bonusCards = newCap.filter((c) => c.m === 0 || (c.flags || []).includes('BONUS'));
      stolenCards = newCap.filter((c) => !(c.m === 0 || (c.flags || []).includes('BONUS')) && prevOther.has(c.id));
      realCap = newCap.filter((c) => !bonusCards.includes(c) && !stolenCards.includes(c) && !capFloorIds.has(c.id)); // 손/덱서 와서 먹힌 패(낸·뒤집힌 매칭)
    }

    const sz = cardSize();
    const deck = elPx('#gsCenter') || { x: 0, y: 0 };
    const handPt = elPx('#gsHand') || { x: 0, y: 0 };
    const pilePx = (seat) => elPx(seat === me ? '#gsMyCap' : '#gsTop .gs-opp') || { x: 0, y: 0 };
    const capPile = pilePx(capSeat >= 0 ? capSeat : me);
    const FLY = (o) => fly({ w: sz.w, h: sz.h, scale: 1, ...o });

    // 슬롯: capturedFloor의 옛 슬롯은 lift 후 회수해야 하므로, 새 바닥 동기화 전에 좌표 확보
    const liftFrom = {}; for (const c of capturedFloor) liftFrom[c.id] = slotPx(c.id);
    // 낸/뒤집힌 노매칭 패의 새 슬롯 확정
    syncSlots(nf);

    resetSeq();
    // 이전(중단된) 시퀀스 잔여 정리 — 봇 턴이 빠르게 와도 flyer/숨김 누적 안 되게
    m.current.flyers = []; m.current.hidden = new Set(); m.current.callout = null; m.current.jokbo = null; m.current.dim = false;
    // 애니 동안 관련 카드 숨김(미리 생성/번쩍 방지)
    for (const c of addedFloor) hide(c.id);
    for (const c of newCap) m.current.hidden.add('cap:' + c.id);   // 더미 표시는 capFor에서 거름

    // 사용할 카드 src
    const srcOf = (c) => cardSrc(c);

    // ── ① 낸 패 ──
    const played = leftHand.find((c) => c.m !== 0) || leftHand[0];
    const playedToFloor = played && addedFloor.find((c) => c.id === played.id);
    const playedCaptured = played && realCap.find((c) => c.id === played.id);
    if (played) {
      const dst = playedToFloor ? slotPx(played.id) : capPile;
      const slotrot = playedToFloor ? slotPctFor(played.id).rot : 0;
      step(0, () => FLY({ key: 'p1', id: played.id, src: srcOf(played), x: handPt.x, y: handPt.y, rot: 0, z: 30 }));
      step(T.play, () => setFly('p1', { x: dst.x, y: dst.y, rot: slotrot, scale: playedToFloor ? 1 : 1, ring: playedCaptured ? 1 : 0 }));
      if (playedToFloor) step(T.playLand, () => { unhide(played.id); dropFly('p1'); });
      else step(T.playLand, () => {}); // 매칭이면 캡처 단계까지 flyer 유지
    }

    // ── ② 더미 뒤집기(rotateY 리빌) ──
    const flippedToFloor = flipped && addedFloor.find((c) => c.id === flipped.id);
    const flippedCaptured = flipped && realCap.find((c) => c.id === flipped.id);
    if (flipped) {
      step(flipped ? T.flipSpawn : 0, () => FLY({ key: 'd1', src: BACK_BG, face: 'back', x: deck.x, y: deck.y, rot: 0, z: 32 }));
      step(T.flipRy, () => setFly('d1', { ry: 90 }));
      step(T.flipFront, () => setFly('d1', { ry: 0, face: 'front', src: srcOf(flipped) }));
      const dst = flippedToFloor ? slotPx(flipped.id) : capPile;
      const slotrot = flippedToFloor ? slotPctFor(flipped.id).rot : 0;
      step(T.flipLand, () => setFly('d1', { x: dst.x, y: dst.y, rot: slotrot, ring: flippedCaptured ? 1 : 0 }));
      if (flippedToFloor) step(T.flipDrop, () => { unhide(flipped.id); dropFly('d1'); });
      else step(T.flipDrop, () => {});
    }

    // ── ②.5 보너스피(정지+B 콜아웃) ──
    bonusCards.forEach((bc, i) => {
      step(i === 0 && !flipped ? T.flipSpawn : T.bonusReveal, () => {
        FLY({ key: 'bn' + i, src: srcOf(bc), x: deck.x, y: 120, scale: 1.5, z: 40, big: 1 });
        showCallout('보너스!', '피 +' + (bc.pi || 2) + '장', [srcOf(bc)]);
      });
      step(T.bonusHold, () => {});
      step(T.bonusToPile, () => { hideCallout(); setFly('bn' + i, { x: pilePx(capSeat).x, y: pilePx(capSeat).y, scale: .7, big: 0 }); });
      step(T.bonusDrop, () => dropFly('bn' + i));
    });

    // ── ③ 캡처(바닥패 lift + 낸/뒤집힌 매칭패 → 더미) + B 콜아웃 ──
    const evMain = events.find((e) => EVNAME[e.ev]);
    const hasCapture = capturedFloor.length || realCap.length;
    if (hasCapture) {
      // 바닥패 lift
      step(0, () => { for (const c of capturedFloor) { const from = liftFrom[c.id] || capPile; FLY({ key: 'lf:' + c.id, id: c.id, src: srcOf(c), x: from.x, y: from.y, rot: 0, z: 28, ring: 1 }); } });
      // 이벤트 콜아웃(B)
      if (evMain) {
        const callCards = [...realCap, ...capturedFloor].slice(0, 3).map(srcOf);
        step(60, () => showCallout(EVNAME[evMain.ev], stealCount(events) ? ('상대 피 ' + stealCount(events) + '장 획득') : '', callCards));
      }
      // 더미로 이동
      step(evMain ? T.callHold : T.eatLift, () => {
        if (evMain) hideCallout();
        for (const c of capturedFloor) setFly('lf:' + c.id, { x: capPile.x, y: capPile.y, rot: 0, scale: .7, ring: 0 });
        if (played && realCap.find((c) => c.id === played.id)) setFly('p1', { x: capPile.x, y: capPile.y, rot: 0, scale: .7, ring: 0 });
        if (flipped && realCap.find((c) => c.id === flipped.id)) setFly('d1', { x: capPile.x, y: capPile.y, rot: 0, scale: .7, ring: 0 });
      });
      step(T.eatDrop, () => { for (const c of capturedFloor) dropFly('lf:' + c.id); dropFly('p1'); dropFly('d1'); });
    }

    // ── ③.5 뻑(못 먹음): 콜아웃 + 정지 ──
    const bbeokEv = events.find((e) => e.ev === 'bbeok');
    if (bbeokEv && !hasCapture) {
      const stackSrcs = nf.filter((c) => c.m === bbeokEv.month).slice(0, 3).map(srcOf);
      step(T.flipDrop, () => showCallout('뻑!', '이번 턴 못 먹음 · 다음 기회', stackSrcs));
      step(T.ppeokHold, () => hideCallout());
    }

    // ── ④ 피 뺏기(상대 더미 → 내 더미) ──
    if (stolenCards.length) {
      const otherSeat = capSeat === 0 ? 1 : 0;
      const baseAt = hasCapture ? T.steal : 0;
      step(baseAt, () => { stolenCards.forEach((c, i) => FLY({ key: 'st' + i, id: c.id, src: srcOf(c), x: pilePx(otherSeat).x, y: pilePx(otherSeat).y, rot: 0, scale: .7, z: 41 })); });
      step(T.stealMove, () => stolenCards.forEach((c, i) => setFly('st' + i, { x: capPile.x + 8, y: capPile.y })));
      step(T.stealDrop, () => stolenCards.forEach((c, i) => dropFly('st' + i)));
    }

    // ── ⑤ 족보 완성 토스트 + 점수 카운트업 ──
    const jk = newJokbo(P.scores, s.scores, P.cap[capSeat], nc[capSeat], capSeat);
    if (jk) {
      step(200, () => { showJokbo(jk.name, jk.pt, jk.cards); countScore(capSeat, P.scores[capSeat] || 0, (s.scores || [])[capSeat] || 0); });
      step(T.jokboHold, () => hideJokbo());
    }

    // ── 안전망: 전체 끝나면 정상 상태로 ──
    step(300, () => settle());

    prev.current = { floor: nf, hand: nh, cap: nc.map((a) => a.slice()), scores: (s.scores || []).slice(), handNo: s.handNo, phase: s.phase };
    return () => {};
  }, [s]);

  // 피 뺏긴 총 장수
  function stealCount(events) { return (events || []).filter((e) => e.ev === 'steal').reduce((n, e) => n + (e.got || 0), 0); }
  // 점수 카운트업
  function countScore(seat, from, to) {
    if (from === to) return;
    const key = seat === me ? 'my' : 'opp';
    const t0 = Date.now();
    const tick = () => { const p = Math.min(1, (Date.now() - t0) / 700); m.current.scoreShow[key] = Math.round(from + (to - from) * p); sync(); if (p < 1) seq.current.timers.push(setTimeout(tick, 40)); else m.current.scoreShow[key] = null; };
    tick();
  }
  // 족보 새로 완성됐는지(점수 상세 비교) — 간단 판정
  function newJokbo(prevScores, scores, prevCap, cap, seat) {
    if (seat < 0 || !scores || !prevScores) return null;
    if ((scores[seat] || 0) <= (prevScores[seat] || 0)) return null;
    const det = (s.scoreDetails || [])[seat] || {};
    // 대표 족보명 하나
    const names = []; if (det.kwang) names.push(['광', det.kwang]); if (det.godori) names.push(['고도리', det.godori]);
    if (det.hongdan) names.push(['홍단', det.hongdan]); if (det.cheongdan) names.push(['청단', det.cheongdan]); if (det.chodan) names.push(['초단', det.chodan]);
    if (!names.length) return null;
    const top = names[names.length - 1];
    const cards = (cap || []).slice(-3).map((c) => cardSrc(c));
    return { name: top[0], pt: '+' + top[1] + '점', cards };
  }

  // 선 토스트 — 선 정해질 때 "👑 X 선!"
  const lastSeonToast = useRef(null);
  useEffect(() => {
    if (s.pickSeon == null) { lastSeonToast.current = null; return undefined; }
    if (s.pickSeon === lastSeonToast.current) return undefined;
    lastSeonToast.current = s.pickSeon;
    const feltEl = document.getElementById('gsFelt'); if (!feltEl || !s.seats || !s.seats[s.pickSeon]) return undefined;
    const t = document.createElement('div'); t.className = 'gs-seontoast';
    const b = document.createElement('b'); b.textContent = pname(s.seats[s.pickSeon]);
    t.append('👑 ', b, ' 선!'); feltEl.appendChild(t);
    const t1 = setTimeout(() => t.classList.add('out'), 1500);
    const t2 = setTimeout(() => { if (t.parentNode) t.remove(); }, 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); if (t.parentNode) t.remove(); };
  }, [s]);

  const turnName = s.seats && s.turnIdx != null && s.seats[s.turnIdx] ? pname(s.seats[s.turnIdx]) : '';
  const sideNote = s.phase === 'finished' ? '판 종료' : (s.phase === 'playing' && turnName ? `${turnName} 님의 차례` : '게임 대기 중…');
  const myTurn = s.myTurn && s.phase === 'playing' && !m.current.flyers.length;
  const floorMonths = new Set((s.floor || []).map((c) => c.m).filter(Boolean));
  const capFor = (seat) => ((s.captured && s.captured[seat]) || []).filter((c) => !m.current.hidden.has('cap:' + c.id));

  // ── flyer 스타일 ──
  function flyStyle(f) {
    const w = f.w, h = f.h, sc = f.scale != null ? f.scale : 1, ry = f.ry || 0;
    const big = f.big ? ',0 0 30px rgba(227,200,120,.7)' : '';
    const ring = f.ring ? '0 6px 16px rgba(0,0,0,.5),0 0 0 2.5px #ffe680,0 0 18px rgba(227,200,120,.7)' + big : '0 8px 18px rgba(0,0,0,.5)' + big;
    const st = {
      width: w + 'px', height: h + 'px', zIndex: f.z || 25, boxShadow: ring,
      transform: `translate(${f.x - w / 2}px,${f.y - h / 2}px) rotate(${f.rot || 0}deg) rotateY(${ry}deg) scale(${sc})`,
    };
    if (f.face === 'back') st.background = BACK_BG; else st.backgroundImage = `url(${f.src})`;
    return st;
  }

  // ── 사이드바 ──
  const sidebar = (
    <div id="gsSide">
      <div className="gs-spanel">
        <div className="gs-spanel-t">점수 / 냥</div>
        <div className="gs-slist">
          {(s.seats || []).map((p) => (
            <div key={p.seat} className={'gs-sline' + (p.seat === me ? ' me' : '')}>
              <span className="gs-sl-ava">{avatar(p.name)}</span>
              <span className="gs-sl-name">{pname(p)}</span>
              <b className="gs-sl-sc">{s.scores ? s.scores[p.seat] : 0}</b>
              <span className="gs-sl-pt">점</span>
              <span className="gs-sn">{nyang(p.chips)}</span>
            </div>
          ))}
        </div>
        <button className="gs-ruletoggle" onClick={() => setRulesOpen((v) => !v)}>📖 룰 {rulesOpen ? '숨기기' : '보기'}</button>
        {rulesOpen && (
          <div className="gs-side-hint">
            광 3·4·15 / 고도리 5 / 홍·청·초단 각 3 / 열끗·띠 5장부터 1점+ / 피 10장부터 1점+<br />
            <span className="dim">· 나는 점수: 맞고 7 · 고스톱 3</span><br />
            <span className="dim">· 바닥 2장에 매칭 = 둘 중 1장 선택해 먹기</span><br />
            <span className="dim">· 뻑(자뻑) = 바닥 1장에 냈는데 뒤집기가 같은 월</span><br />
            <span className="dim">· 보너스피 = 더미서 1장 손에 보충 + 상대 피 1, 턴 안 씀</span>
          </div>
        )}
      </div>
      <div className="gs-spanel">
        <div className="gs-spanel-t">알림</div>
        <div className="gs-snote">{sideNote}</div>
      </div>
    </div>
  );
  const withSidebar = (felt) => <>{felt}{infoEl && createPortal(sidebar, infoEl)}</>;

  // ── 로비/대기 ──
  if (s.phase !== 'playing' && s.phase !== 'finished' && s.phase !== 'pickFirst') {
    return withSidebar(
      <div id="gsStage"><div id="gsFelt">
        <div id="gsTop">{(s.seats || []).map((p, i) => <OppTop key={i} s={s} seat={i} />)}</div>
        <div id="gsModal" style={{ display: 'flex' }}>
          <div className="gs-box">
            <h2>🃏 맞고</h2>
            <p>{(s.seats ? s.seats.length : 0)}명 · 맞고(10장)</p>
            {s.canStart
              ? <button id="gsStart" onClick={() => send({ type: 'start' })}>시작하기</button>
              : <p className="gs-wait">방장이 시작하길 기다리는 중…</p>}
          </div>
        </div>
      </div></div>
    );
  }

  // ── 선 정하기 ──
  if (s.phase === 'pickFirst') {
    const revBy = {}; (s.pickReveals || []).forEach((rv) => { revBy[rv.index] = rv; });
    const title = s.pickSeon != null ? `👑 ${pname(s.seats[s.pickSeon])} 선!`
      : (s.pickRound > 1 ? '🔁 재대결 — ' : '🎴 선 정하기 — ') + (s.canPick ? '패 한 장을 고르세요' : s.myPicked ? '상대 선택 대기…' : '진행 중…');
    return withSidebar(
      <div id="gsStage"><div id="gsFelt">
        <div id="gsPick">
          <div className="gs-pickseats">
            {(s.seats || []).map((p) => {
              const isSeon = s.pickSeon === p.seat;
              const picked = (s.pickReveals || []).some((rv) => rv.seat === p.seat && rv.round === s.pickRound);
              const eligible = (s.pickEligible || []).includes(p.seat);
              return (
                <div key={p.seat} className={'gs-pseat' + (isSeon ? ' seon' : '') + (p.seat === me ? ' me' : '') + (!eligible && s.pickSeon == null ? ' out' : '')}>
                  <span className="gs-ava">{avatar(p.name)}</span><b>{pname(p)}</b>
                  {isSeon ? <span className="gs-seontag">👑 선</span> : picked ? <span className="gs-pickok">✓ 선택</span> : eligible ? <span className="gs-pickwait">고르는 중…</span> : null}
                </div>
              );
            })}
          </div>
          <div className="gs-picktitle">{title}</div>
          <div className="gs-pickrow">
            {Array.from({ length: s.pickCount || 0 }).map((_, i) => {
              const rv = revBy[i];
              if (rv) return (
                <div key={i} className={'gs-pcard reveal' + (rv.seat === me ? ' mine' : '')}>
                  <div className="gs-pflip"><div className="gs-pback" /><div className="gs-pfront"><img src={cardSrc(rv.card)} alt="" /></div></div>
                  <span className="gs-pwho">{pname(s.seats[rv.seat])}</span>
                </div>
              );
              return (
                <div key={i} className={'gs-pcard back' + (s.canPick ? ' pickable' : '')}
                  onClick={() => s.canPick && send({ type: 'pickFirstCard', index: i })}>
                  <div className="gs-pflip"><div className="gs-pback" /></div>
                </div>
              );
            })}
          </div>
        </div>
      </div></div>
    );
  }

  // ── 플레이 보드 ──
  const myCap = capFor(me);
  const decision = s.decision;
  const result = s.phase === 'finished' && s.result ? s.result : null;
  const resultTags = [];
  if (result && !result.nagari) {
    if (result.goCount) resultTags.push(`${result.goCount}고`);
    if (result.shake) resultTags.push(`흔들×${result.shake}`);
    if (result.mungBak) resultTags.push('멍박');
    if (result.chongtong) resultTags.push('총통×4');
    [...new Set(Object.values(result.bak || {}).flat())].forEach((b) => resultTags.push(b));
  }
  const actions = [];
  if (s.canChongtong) actions.push(<button key="ct" className="gs-act ct" onClick={() => send({ type: 'chongtong' })}>💣 총통</button>);
  if (s.myFreeFlips > 0) actions.push(<button key="flip" className="gs-act flip" onClick={() => send({ type: 'flip' })}>🔄 뒤집기({s.myFreeFlips})</button>);
  (s.bombable || []).forEach((mo) => actions.push(<button key={'b' + mo} className="gs-act bomb" onClick={() => send({ type: 'bomb', m: mo })}>💥 폭탄·{MNAME[mo]}</button>));
  (s.shakeable || []).forEach((mo) => actions.push(<button key={'s' + mo} className="gs-act shake" onClick={() => send({ type: 'shake', m: mo })}>🤝 흔들기·{MNAME[mo]}</button>));

  const myScoreShow = m.current.scoreShow.my != null ? m.current.scoreShow.my : (s.scores ? s.scores[me] : 0);
  const callout = m.current.callout, jokbo = m.current.jokbo, dim = m.current.dim;

  return withSidebar(
    <div id="gsStage"><div id="gsFelt">
      <div id="gsTop">{oppSeat != null && <OppTop s={s} seat={oppSeat} cap={capFor(oppSeat)} />}</div>
      <div id="gsBody">
        <div id="gsLeft" className="gs-side" />
        <div id="gsMid">
          <div id="gsFloor">
            {(s.floor || []).filter((c) => c.m !== 0).map((c) => {
              const ch = s.pendingChoice && s.pendingChoice.options.some((o) => o.id === c.id);
              const hidden = m.current.hidden.has(c.id);
              const p = slotPctFor(c.id);
              return (
                <img key={c.id} className={'gscard floorc' + (ch ? ' choosable' : '')} src={cardSrc(c)} data-id={c.id} data-m={c.m} draggable={false} alt=""
                  style={{ left: p.x + '%', top: p.y + '%', '--rot': p.rot + 'deg', opacity: hidden ? 0 : undefined }}
                  onClick={() => ch && send({ type: 'choose', cardId: c.id })} />
              );
            })}
          </div>
          <div id="gsCenter"><div id="gsDrawWrap">
            <div id="gsDraw" className={s.drawCount > 0 ? 'has' : ''} />
            <div id="gsDrawN">{s.drawCount > 0 ? '남은 패 ' + s.drawCount : ''}</div>
          </div></div>
        </div>
        <div id="gsRight" className="gs-side" />
      </div>

      {/* flyer 레이어 + B 스포트라이트 오버레이 */}
      {dim && <div id="gsDim" />}
      <div id="gsFly">
        {m.current.flyers.map((f) => <div key={f.key} className="gsfly" style={flyStyle(f)} />)}
      </div>
      {callout && (
        <div className="gs-callout">
          {callout.cards && callout.cards.length > 0 && (
            <div className="cc-cards">{callout.cards.map((src, i) => <div key={i} className="cc-card" style={{ backgroundImage: `url(${src})` }} />)}</div>
          )}
          <div className="cc-big">{callout.big}</div>
          {callout.sub && <div className="cc-sub">{callout.sub}</div>}
        </div>
      )}
      {jokbo && (
        <div className="gs-jokbo">
          <div className="jk-box">
            <div className="jk-tag">족보 완성</div>
            {jokbo.cards && jokbo.cards.length > 0 && <div className="jk-cards">{jokbo.cards.map((src, i) => <div key={i} className="jk-card" style={{ backgroundImage: `url(${src})` }} />)}</div>}
            <div className="jk-name">{jokbo.name}</div>
            <div className="jk-pt">{jokbo.pt}</div>
          </div>
        </div>
      )}

      <div id="gsMy">
        <div id="gsMyCap">{myCap.length ? <CapStrips captured={myCap} /> : <span className="gs-cap-empty">획득한 패가 여기 쌓여요</span>}</div>
        <div id="gsMyRow">
          <div id="gsMyAva" data-player={s.seats[me] ? s.seats[me].name : undefined}>
            <span className="gs-ava big">{avatar(s.seats[me] ? s.seats[me].name : '나')}</span>
            <div className="gs-my-meta">
              <b>{s.seats[me] ? s.seats[me].name : '나'}</b>
              <span className="gs-sc">{myScoreShow}점</span>
              <span className="gs-chips">{nyang(s.seats[me] ? s.seats[me].chips : 0)}냥</span>
            </div>
          </div>
          <div id="gsHand" className={myTurn ? 'myturn' : ''}>
            {(s.myHand || []).map((c) => {
              const mat = myTurn && floorMonths.has(c.m);
              return <img key={c.id} className={'gscard' + (myTurn ? '' : ' dim') + (mat ? ' matchable' : '')} src={cardSrc(c)} data-id={c.id} data-m={c.m} draggable={false} alt=""
                onClick={() => myTurn && send({ type: 'play', cardId: c.id })} />;
            })}
          </div>
          <div id="gsActions">{actions}</div>
          <div id="gsHandHints" />
        </div>
      </div>

      {decision && !result && (
        <div id="gsModal" style={{ display: 'flex' }}>
          <div className="gs-box gs-decision">
            <h2>{decision.score}점!</h2><p>고? 스톱?</p>
            <div className="gs-gobtns">
              <button onClick={() => send({ type: 'go' })}>고 ▶</button>
              <button onClick={() => send({ type: 'stop' })}>스톱 ■</button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div id="gsModal" style={{ display: 'flex' }}>
          {result.nagari
            ? <div className="gs-box"><h2>나가리</h2><p>아무도 못 났어요.<br />다음 판 점수 2배!</p>{s.canStart ? <button onClick={() => send({ type: 'start' })}>다음 판</button> : <p className="gs-wait">다음 판 대기…</p>}</div>
            : <div className="gs-box gs-result">
                <h2>🏆 {s.seats[result.winner] ? s.seats[result.winner].name : ''} 승</h2>
                <p className="gs-rscore">{result.baseScore}점{result.reason && result.reason !== 'stop' ? ' · ' + result.reason : ''}</p>
                {resultTags.length > 0 && <div className="gs-tags">{resultTags.map((t, i) => <span key={i}>{t}</span>)}</div>}
                <div className="gs-pays">{Object.entries(result.payScore || {}).map(([L, v]) => `${s.seats[L] ? s.seats[L].name : ''} ${v}점`).join(' · ')}</div>
                {s.canStart ? <button onClick={() => send({ type: 'start' })}>다음 판</button> : <p className="gs-wait">다음 판 대기…</p>}
              </div>}
        </div>
      )}

      {s.pendingChoice && s.pendingChoice.options && s.pendingChoice.options.length > 0 && (
        <div id="gsChoice" style={{ display: 'flex' }}>
          <div className="gs-choice-box">
            <div className="gs-choice-title">🖐 어떤 패를 먹을까요?</div>
            <div className="gs-choice-cards">
              {s.pendingChoice.options.map((c) => (
                <button key={c.id} className="gs-choice-card" onClick={() => send({ type: 'choose', cardId: c.id })}>
                  <span className="gs-choice-img"><img src={cardSrc(c)} alt="" />{c.cat === 'PI' && c.pi >= 2 && <b className="gs-choice-pi">{c.pi}</b>}</span>
                  <span className="gs-choice-lbl">{CATNAME[c.cat] || '피'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div></div>
  );
}
