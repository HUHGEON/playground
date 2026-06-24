import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import '../gostop.css';
import { avatar, nyang, cardSrc, MNAME, pileGroups, floorLayout } from './gostopUtil.js';

const CAT = [['KWANG', '광', 'c-kw'], ['YEOL', '멍', 'c-yeol'], ['TTI', '단', 'c-tti'], ['PI', '피', 'c-pi']];
const CATNAME = { KWANG: '광', YEOL: '멍', TTI: '단', PI: '피' };

// 컨테이너 안 .gscard들의 중심좌표(felt 기준) 측정
function measureRects(containerId, felt) {
  const rects = {};
  const cont = document.getElementById(containerId);
  if (cont) {
    for (const el of cont.querySelectorAll('.gscard')) {
      if (el.dataset.id == null) continue;
      const r = el.getBoundingClientRect();
      rects[el.dataset.id] = { x: r.left + r.width / 2 - felt.left, y: r.top + r.height / 2 - felt.top };
    }
  }
  return rects;
}
// 손→바닥 던지기(WAAPI) — 바닥 카드를 이전 손 위치에서 날아오게
function animThrow(id, from, rot) {
  let node;
  try { node = document.querySelector(`#gsFloor .gscard[data-id="${(window.CSS && CSS.escape) ? CSS.escape(id) : id}"]`); } catch { node = null; }
  if (!node || !from) return;
  const r = node.getBoundingClientRect();
  const felt = document.getElementById('gsFelt').getBoundingClientRect();
  const to = { x: r.left + r.width / 2 - felt.left, y: r.top + r.height / 2 - felt.top };
  const dx = from.x - to.x, dy = from.y - to.y;
  try {
    node.animate([
      { transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) rotate(${rot * 0.3}deg) scale(1.15)`, offset: 0 },
      { transform: `translate(-50%,-50%) translate(${dx * 0.05}px,${dy * 0.05 - 7}px) rotate(${rot}deg) scale(1.06)`, offset: 0.72 },
      { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1)`, offset: 1 },
    ], { duration: 420, easing: 'cubic-bezier(.3,.85,.4,1)' });
  } catch (e) { /* noop */ }
}
// 엘리먼트 중심(felt 기준)
function feltPt(el, felt) { if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width) return null; return { x: r.left + r.width / 2 - felt.left, y: r.top + r.height / 2 - felt.top }; }
// 획득 모션 — 임시 ghost 카드가 from→to로 날아가 더미로 빨려듦
function flyGhost(motion, card, from, to, delay, dur) {
  dur = dur || 270;
  if (!from || !to) return;
  setTimeout(() => {
    try {
      const g = document.createElement('img'); g.className = 'gs-ghost'; g.src = cardSrc(card);
      g.style.left = from.x + 'px'; g.style.top = from.y + 'px'; motion.appendChild(g);
      g.animate([{ transform: 'translate(-50%,-50%)', opacity: 1 }, { transform: `translate(-50%,-50%) translate(${to.x - from.x}px,${to.y - from.y}px) scale(.5)`, opacity: .4 }], { duration: dur, easing: 'cubic-bezier(.4,.2,.5,1)', fill: 'forwards' });
      setTimeout(() => g.remove(), dur + 60);
    } catch (e) { /* noop */ }
  }, delay || 0);
}
// 딜 인트로 — 손패가 더미 위치에서 제자리로 날아 들어옴(스태거)
function animDealIn(id, fromPt, toPt, delay) {
  const node = document.querySelector(`#gsHand .gscard[data-id="${(window.CSS && CSS.escape) ? CSS.escape(id) : id}"]`);
  if (!node || !fromPt || !toPt) return;
  const dx = fromPt.x - toPt.x, dy = fromPt.y - toPt.y;
  try {
    node.animate([
      { transform: `translate(${dx}px,${dy}px) scale(.5) rotate(-8deg)`, opacity: 0, offset: 0 },
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1, offset: 1 },
    ], { duration: 360, delay: delay || 0, easing: 'cubic-bezier(.3,.8,.4,1)', fill: 'backwards' });
  } catch (e) { /* noop */ }
}
const pname = (p) => (p ? p.name.replace(/🤖/g, '') : '');

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

// 콜백 ref — 엘리먼트가 (단계 전환으로) 나중에 mount돼도 그때 측정/관찰
function useSize() {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const roRef = useRef(null);
  const ref = useCallback((el) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    roRef.current = new ResizeObserver(update);
    roRef.current.observe(el);
  }, []);
  return [ref, size];
}

function OppTop({ s, seat }) {
  const p = s.seats[seat]; if (!p) return null;
  const turn = s.turnIdx === seat && s.phase === 'playing';
  const sc = s.scores ? s.scores[seat] : 0;
  const tags = [];
  if (s.goCounts && s.goCounts[seat]) tags.push(`${s.goCounts[seat]}고`);
  if (s.shake && s.shake[seat]) tags.push(`흔들×${s.shake[seat]}`);
  const cap = (s.captured && s.captured[seat]) || [];
  return (
    <div className={'gs-opp' + (turn ? ' turn' : '')} data-player={p.name}>
      <div className="gs-opp-head">
        <span className="gs-ava">{avatar(p.name)}</span>
        <span className="gs-opp-info"><b>{p.name}</b><span className="gs-chips">{nyang(p.chips)}냥</span></span>
        <span className="gs-badge-col">
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
  const [floorRef, floorSize] = useSize();
  useEffect(() => { setInfoEl(document.getElementById('roomInfo')); }, []);

  const me = s.yourSeat;
  const opps = (s.seats || []).map((_, i) => i).filter((i) => i !== me);
  const oppSeat = opps[0];
  const myTurn = s.myTurn && s.phase === 'playing';
  const floorMonths = new Set((s.floor || []).map((c) => c.m).filter(Boolean));
  const lay = floorLayout(s.floor, floorSize.w, floorSize.h);

  // 카드 모션 — 매 렌더 위치를 ref에 저장해, 다음 렌더 때 '이전 위치'에서 날아오게(바닐라 throwToFloor 방식)
  const prevHandRects = useRef({});
  const prevHandIds = useRef(new Set());
  const prevFloorIds = useRef(new Set());
  const prevFloorRects = useRef({});
  const lastCapCounts = useRef(null);
  const layRef = useRef(lay);
  layRef.current = lay;
  useLayoutEffect(() => {
    const feltEl = document.getElementById('gsFelt');
    if (!feltEl || s.phase !== 'playing') {
      const f = feltEl && feltEl.getBoundingClientRect();
      prevHandRects.current = f ? measureRects('gsHand', f) : {};
      prevFloorRects.current = f ? measureRects('gsFloor', f) : {};
      prevHandIds.current = new Set(Object.keys(prevHandRects.current));
      prevFloorIds.current = new Set(Object.keys(prevFloorRects.current));
      lastCapCounts.current = s.captured ? s.captured.map((c) => c.length) : null;
      return;
    }
    const felt = feltEl.getBoundingClientRect();
    const newHandRects = measureRects('gsHand', felt);
    const newFloorRects = measureRects('gsFloor', felt);
    const newFloorIds = new Set(Object.keys(newFloorRects));
    const newHandIds = new Set(Object.keys(newHandRects));
    const leftHandId = [...prevHandIds.current].find((id) => !newHandIds.has(id));   // 손서 빠진 패

    // 딜 인트로: 직전 손패 없음 + 이번에 한 손 가득 = 새 판 분배 → 손패가 더미서 차례로 날아옴
    if (prevHandIds.current.size === 0 && newHandIds.size >= 7) {
      const deckPt = feltPt(document.getElementById('gsCenter'), felt);
      if (deckPt) {
        let i = 0;
        for (const [id, pos] of Object.entries(newHandRects)) { animDealIn(id, deckPt, pos, i * 55); i++; }
      }
    }

    // 던지기: 손서 빠졌고 바닥에 새로 생김(매칭 X) → 손 위치에서 날아오게
    if (leftHandId && newFloorIds.has(leftHandId) && !prevFloorIds.current.has(leftHandId) && prevHandRects.current[leftHandId]) {
      const rot = (layRef.current[leftHandId] && layRef.current[leftHandId].rot) || 0;
      animThrow(leftHandId, prevHandRects.current[leftHandId], rot);
    }

    // 먹기: events의 획득 패를 더미로 날림(던졌으면 던지기+뒤집기 뒤에)
    const capIds = [];
    for (const ev of (s.events || [])) { if (Array.isArray(ev.cards)) capIds.push(...ev.cards); if (ev.ev === 'bonus' && ev.card) capIds.push(ev.card); }
    if (capIds.length && s.captured) {
      let capturer = s.turnIdx;
      if (lastCapCounts.current) for (let i = 0; i < s.captured.length; i++) {
        if ((s.captured[i] ? s.captured[i].length : 0) > (lastCapCounts.current[i] || 0)) { capturer = i; break; }
      }
      const pileEl = capturer === me ? document.getElementById('gsMyCap') : document.querySelector('#gsTop .gs-opp');
      const tgt = feltPt(pileEl, felt);
      const motion = document.getElementById('gsMotion');
      if (tgt && motion) {
        const cardOf = (id) => s.captured[capturer] && s.captured[capturer].find((c) => c.id === id);
        const threw = leftHandId && prevHandRects.current[leftHandId];
        const base = threw ? 700 : 360;            // 던졌으면 던지기·뒤집기 끝난 뒤 가져오기
        let n = 0;
        capIds.forEach((id) => {
          const card = cardOf(id); if (!card) return;
          const from = prevFloorRects.current[id] || (id === leftHandId ? prevHandRects.current[id] : null);
          if (!from) return;
          flyGhost(motion, card, from, tgt, base + n * 60); n++;
        });
      }
    }

    prevHandRects.current = newHandRects;
    prevFloorRects.current = newFloorRects;
    prevHandIds.current = newHandIds;
    prevFloorIds.current = newFloorIds;
    lastCapCounts.current = s.captured ? s.captured.map((c) => c.length) : null;
  }, [s]);

  const turnName = s.seats && s.turnIdx != null && s.seats[s.turnIdx] ? pname(s.seats[s.turnIdx]) : '';
  const sideNote = s.phase === 'finished' ? '판 종료' : (s.phase === 'playing' && turnName ? `${turnName} 님의 차례` : '게임 대기 중…');

  // 손패 ▼ 힌트 — 낼 수 있는(.matchable) 손패 위에 화살표(바닐라 renderHandHints, 명령형 측정)
  useEffect(() => {
    const el = document.getElementById('gsHandHints'); if (!el) return;
    const row = document.getElementById('gsMyRow'), hand = document.getElementById('gsHand');
    if (!myTurn || !row || !hand) { el.innerHTML = ''; return; }
    const rr = row.getBoundingClientRect();
    let html = '';
    hand.querySelectorAll('.gscard.matchable').forEach((card) => {
      const r = card.getBoundingClientRect();
      const x = r.left + r.width / 2 - rr.left, y = r.top - rr.top;
      html += `<div class="gs-hand-hint" style="left:${x}px;top:${y}px">▼</div>`;
    });
    el.innerHTML = html;
  });

  // 이벤트 토스트 — 쪽/따닥/뻑/싹쓸이/보너스피/흔들기/폭탄/고/피뺏김(바닐라 showEvents)
  const lastEvtKey = useRef('');
  useEffect(() => {
    const evs = (s.events || []).filter((e) => ['jjok', 'ttadak', 'bbeok', 'bbeok-eat', 'sweep', 'steal', 'bonus', 'shake', 'bomb', 'go'].includes(e.ev));
    if (!evs.length) return undefined;
    const key = JSON.stringify(evs); if (key === lastEvtKey.current) return undefined; lastEvtKey.current = key;
    const NM = { jjok: '쪽!', ttadak: '따닥!', bbeok: '뻑!', 'bbeok-eat': '뻑 회수!', sweep: '싹쓸이!', bonus: '보너스피!', shake: '흔들기!', bomb: '폭탄!', go: '고!' };
    const txt = evs.map((e) => (e.ev === 'steal' ? `피 ${e.got}장!` : NM[e.ev])).filter(Boolean).join('  ');
    const t = document.getElementById('gsToast'); if (!txt || !t) return undefined;
    t.textContent = txt; t.className = 'show';
    const id = setTimeout(() => { t.className = ''; }, 1400);
    return () => clearTimeout(id);
  }, [s]);

  // 뒤집기 리빌 — 더미서 뒤집힌 패를 크게 보여줌(바닐라 flipReveal, 던지기 뒤 330ms)
  const lastFlipKey = useRef('');
  useEffect(() => {
    const fc = s.flippedCard;
    const key = fc ? s.handNo + ':' + fc.id : '';
    if (!fc || key === lastFlipKey.current) return undefined; lastFlipKey.current = key;
    const feltEl = document.getElementById('gsFelt'); if (!feltEl) return undefined;
    const deckPt = feltPt(document.getElementById('gsCenter'), feltEl.getBoundingClientRect());
    const motion = document.getElementById('gsMotion');
    if (!deckPt || !motion) return undefined;
    const t = setTimeout(() => {
      try {
        const el = document.createElement('img'); el.className = 'gs-flipreveal'; el.src = cardSrc(fc);
        el.style.left = deckPt.x + 'px'; el.style.top = (deckPt.y - 8) + 'px'; motion.appendChild(el);
        el.animate([
          { transform: 'translate(-50%,-50%) rotateY(90deg) scale(.8)', opacity: 0, offset: 0 },
          { transform: 'translate(-50%,-50%) rotateY(0deg) scale(1.5)', opacity: 1, offset: 0.18 },
          { transform: 'translate(-50%,-50%) rotateY(0deg) scale(1.5)', opacity: 1, offset: 0.72 },
          { transform: 'translate(-50%,-50%) rotateY(0deg) scale(1.15)', opacity: 0, offset: 1 },
        ], { duration: 1000, easing: 'cubic-bezier(.3,.7,.4,1)' });
        setTimeout(() => el.remove(), 1050);
      } catch (e) { /* noop */ }
    }, 330);
    return () => clearTimeout(t);
  }, [s]);

  // 보너스 보충 — 더미→손(내)/상대 패널로 카드뒷면 ghost(바닐라 drawFly)
  const lastDrawKey = useRef('');
  useEffect(() => {
    const evs = (s.events || []).filter((e) => e.ev === 'draw');
    const key = JSON.stringify(evs.map((e) => e.card + ':' + e.seat));
    if (key === lastDrawKey.current) return undefined; lastDrawKey.current = key;
    if (!evs.length) return undefined;
    const feltEl = document.getElementById('gsFelt'); if (!feltEl) return undefined;
    const felt = feltEl.getBoundingClientRect();
    const deckPt = feltPt(document.getElementById('gsCenter'), felt);
    const motion = document.getElementById('gsMotion');
    if (!deckPt || !motion) return undefined;
    const timers = [];
    evs.forEach((e, i) => {
      const toEl = e.seat === me ? document.getElementById('gsHand') : document.querySelector('#gsTop .gs-opp');
      const to = feltPt(toEl, felt); if (!to) return;
      timers.push(setTimeout(() => {
        try {
          const g = document.createElement('div'); g.className = 'gs-drawghost';
          g.style.left = deckPt.x + 'px'; g.style.top = deckPt.y + 'px'; motion.appendChild(g);
          g.animate([{ transform: 'translate(-50%,-50%)', opacity: 1 }, { transform: `translate(-50%,-50%) translate(${to.x - deckPt.x}px,${to.y - deckPt.y}px) scale(.7)`, opacity: .25 }], { duration: 330, easing: 'cubic-bezier(.4,.2,.5,1)', fill: 'forwards' });
          setTimeout(() => g.remove(), 390);
        } catch (e2) { /* noop */ }
      }, 120 + i * 130));
    });
    return () => timers.forEach(clearTimeout);
  }, [s]);

  // 선 토스트 — 선 정해질 때 "👑 X 선!" 팝(바닐라 showSeonToast)
  const lastSeonToast = useRef(null);
  useEffect(() => {
    if (s.pickSeon == null) { lastSeonToast.current = null; return undefined; }
    if (s.pickSeon === lastSeonToast.current) return undefined;
    lastSeonToast.current = s.pickSeon;
    const feltEl = document.getElementById('gsFelt'); if (!feltEl || !s.seats || !s.seats[s.pickSeon]) return undefined;
    const t = document.createElement('div'); t.className = 'gs-seontoast';
    const b = document.createElement('b'); b.textContent = pname(s.seats[s.pickSeon]);
    t.append('👑 ', b, ' 선!');
    feltEl.appendChild(t);
    const t1 = setTimeout(() => t.classList.add('out'), 1500);
    const t2 = setTimeout(() => { if (t.parentNode) t.remove(); }, 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); if (t.parentNode) t.remove(); };
  }, [s]);

  // 바닥 같은 월 2장+ 개수 뱃지
  const fbyM = {};
  (s.floor || []).forEach((c) => { if (c.m) (fbyM[c.m] = fbyM[c.m] || []).push(c); });
  const fbadges = Object.entries(fbyM).filter(([, g]) => g.length >= 2).map(([m, g]) => {
    const ps = g.map((c) => lay[c.id]).filter(Boolean); if (!ps.length) return null;
    const x = ps.reduce((a, p) => a + p.x, 0) / ps.length, y = Math.min(...ps.map((p) => p.y));
    return <div key={m} className="gs-floorn" style={{ left: x + '%', top: y + '%' }}>{g.length}</div>;
  });

  // ── 사이드바(점수/냥 + 룰) — #roomInfo로 포털 ──
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

  // ── 로비/대기 (playing·finished·pickFirst 외 모든 단계) ──
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
  const myCap = (s.captured && s.captured[me]) || [];
  const decision = s.decision;
  const result = s.phase === 'finished' && s.result ? s.result : null;
  // 결과 화면 태그(고/흔들/멍박/총통×4/박) — 바닐라 resultHTML
  const resultTags = [];
  if (result && !result.nagari) {
    if (result.goCount) resultTags.push(`${result.goCount}고`);
    if (result.shake) resultTags.push(`흔들×${result.shake}`);
    if (result.mungBak) resultTags.push('멍박');
    if (result.chongtong) resultTags.push('총통×4');
    [...new Set(Object.values(result.bak || {}).flat())].forEach((b) => resultTags.push(b));
  }

  // 액션 버튼
  const actions = [];
  if (s.canChongtong) actions.push(<button key="ct" className="gs-act ct" onClick={() => send({ type: 'chongtong' })}>💣 총통</button>);
  if (s.myFreeFlips > 0) actions.push(<button key="flip" className="gs-act flip" onClick={() => send({ type: 'flip' })}>🔄 뒤집기({s.myFreeFlips})</button>);
  (s.bombable || []).forEach((m) => actions.push(<button key={'b' + m} className="gs-act bomb" onClick={() => send({ type: 'bomb', m })}>💥 폭탄·{MNAME[m]}</button>));
  (s.shakeable || []).forEach((m) => actions.push(<button key={'s' + m} className="gs-act shake" onClick={() => send({ type: 'shake', m })}>🤝 흔들기·{MNAME[m]}</button>));

  return withSidebar(
    <div id="gsStage"><div id="gsFelt">
      <div id="gsTop">{oppSeat != null && <OppTop s={s} seat={oppSeat} />}</div>
      <div id="gsBody">
        <div id="gsLeft" className="gs-side" />
        <div id="gsMid">
          <div id="gsFloor" ref={floorRef}>
            {(s.floor || []).map((c) => {
              const ch = s.pendingChoice && s.pendingChoice.options.some((o) => o.id === c.id);
              const p = lay[c.id] || { x: 50, y: 50, rot: 0 };
              return (
                <img key={c.id} className={'gscard floorc' + (ch ? ' choosable' : '')} src={cardSrc(c)} data-id={c.id} data-m={c.m} draggable={false} alt=""
                  style={{ left: p.x + '%', top: p.y + '%', '--rot': p.rot + 'deg' }}
                  onClick={() => ch && send({ type: 'choose', cardId: c.id })} />
              );
            })}
          </div>
          <div id="gsFloorN">{fbadges}</div>
          <div id="gsCenter"><div id="gsDrawWrap">
            <div id="gsDraw" className={s.drawCount > 0 ? 'has' : ''} />
            <div id="gsDrawN">{s.drawCount > 0 ? '남은 패 ' + s.drawCount : ''}</div>
          </div></div>
        </div>
        <div id="gsRight" className="gs-side" />
      </div>
      <div id="gsMy">
        <div id="gsMyCap">{myCap.length ? <CapStrips captured={myCap} /> : <span className="gs-cap-empty">획득한 패가 여기 쌓여요</span>}</div>
        <div id="gsMyRow">
          <div id="gsMyAva" data-player={s.seats[me] ? s.seats[me].name : undefined}>
            <span className="gs-ava big">{avatar(s.seats[me] ? s.seats[me].name : '나')}</span>
            <div className="gs-my-meta">
              <b>{s.seats[me] ? s.seats[me].name : '나'}</b>
              <span className="gs-sc">{s.scores ? s.scores[me] : 0}점</span>
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
      <div id="gsMotion" />
      <div id="gsToast" />

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

      {/* 먹기 선택 모달 — 바닥 2장 매칭 시 광/멍/단/피 라벨로 선택 */}
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
