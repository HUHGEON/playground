// 화투(맞고/고스톱) 렌더러 — 한게임 스타일 (상대 위 / 내 아래 / 바닥 중앙)
(function () {
  const $ = (id) => document.getElementById(id);
  const send = (o) => window.send(o);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const AVATARS = ['🦊', '🐯', '🐰', '🐼', '🐸', '🐵', '🦁', '🐶', '🐱', '🐲', '🦝', '🐷'];
  function avatar(name) { let h = 0; const s = name || '?'; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return AVATARS[h % AVATARS.length]; }
  const MNAME = { 1: '송학', 2: '매조', 3: '벚꽃', 4: '흑싸리', 5: '난초', 6: '모란', 7: '홍싸리', 8: '공산', 9: '국진', 10: '단풍', 11: '오동', 12: '비' };
  function nyang(n) { // 냥 단위 축약
    n = n || 0;
    if (n >= 1e8) return Math.floor(n / 1e8) + '억' + (n % 1e8 >= 1e4 ? ' ' + Math.floor((n % 1e8) / 1e4) + '만' : '');
    if (n >= 1e4) return Math.floor(n / 1e4) + '만';
    return String(n);
  }
  const cardSrc = (c) => c.img || ('gostop/' + c.m + '-' + c.idx + '.png');
  const cardHTML = (c, cls) => `<img class="gscard${cls ? ' ' + cls : ''}" src="${cardSrc(c)}" data-id="${c.id}" data-m="${c.m}" draggable="false" alt="">`;
  // 바닥 카드 위치 — 카드 id 해시로 안정. 중앙 더미를 회피하는 타원 '밖'에만 배치(절대 안 겹침).
  function hashId(id) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h; }
  // 바닥 레이아웃: 같은 월끼리만 한 셀에 약간 겹쳐 쌓고, 다른 월은 분리된 셀에 배치(절대 안 겹침).
  // w,h = #gsFloor 픽셀 크기. 반환 id→{x,y(%), rot}
  function floorLayout(floor, w, h) {
    const pos = {};
    if (!floor.length || !w || !h) return pos;
    const byMonth = {};
    for (const c of floor) (byMonth[c.m] = byMonth[c.m] || []).push(c);
    const months = Object.keys(byMonth).sort((a, b) => byMonth[b].length - byMonth[a].length || a - b);
    const CW = 52, CH = 78, GO = 12;                 // 카드 크기 + 같은 월 겹침 오프셋(px)
    const cellW = CW + GO * 2 + 24, cellH = CH + 24;  // 셀 = 카드 + 같은월 펼침 + 넉넉한 여백(다른 월 분리 보장)
    const cols = Math.max(2, Math.floor((w - 2) / cellW));
    const rows = Math.max(2, Math.floor((h - 2) / cellH));
    const gw = cols * cellW, gh = rows * cellH, ox = (w - gw) / 2, oy = (h - gh) / 2;
    const fx = w / 2, fy = h / 2;
    const cells = [];
    for (let r = 0; r < rows; r++) for (let cc = 0; cc < cols; cc++) {
      const x = ox + cc * cellW + cellW / 2, y = oy + r * cellH + cellH / 2;
      if (Math.hypot(x - fx, y - fy) < 64) continue; // 중앙 더미 영역 회피
      cells.push({ x, y, d: Math.hypot(x - fx, y - fy) });
    }
    cells.sort((a, b) => a.d - b.d);                  // 안쪽 셀부터 채움(적을 때 모이게)
    months.forEach((m, i) => {
      const cell = cells[i % cells.length] || { x: fx, y: fy };
      const g = byMonth[m];
      const x0 = cell.x - (g.length - 1) * GO / 2;     // 같은 월 그룹 가로 중앙정렬
      g.forEach((c, k) => {
        pos[c.id] = { x: (x0 + k * GO) / w * 100, y: cell.y / h * 100, rot: (hashId(c.id) % 10) - 5 };
      });
    });
    return pos;
  }
  let prevFloorIds = new Set();

  // ── [Phase0] 카드 레이어 노드 보존(keyed diff) + FLIP ──
  // data-id 기준 reconcile: 유지 노드는 재사용(파괴 금지), 신규만 생성·사라진 것만 제거. class/style만 갱신.
  // items: [{ id, m, src, cls, style? }]
  function reconcileCards(container, items) {
    const cur = new Map();
    for (const el of Array.from(container.children)) if (el.dataset && el.dataset.id != null) cur.set(el.dataset.id, el);
    let created = 0, reused = 0, removed = 0;
    const desired = [];
    for (const it of items) {
      let el = cur.get(it.id);
      if (el) { reused++; cur.delete(it.id); }                 // 재사용(노드 보존)
      else {                                                   // 신규
        el = document.createElement('img');
        el.draggable = false; el.alt = '';
        el.setAttribute('data-id', it.id);
        el.src = it.src;                                       // src는 생성 시 1회(같은 카드 = 같은 이미지)
        created++;
      }
      if (it.m != null && el.dataset.m !== String(it.m)) el.dataset.m = it.m;
      if (el.className !== it.cls) el.className = it.cls;        // 위치·상태는 class/style만 갱신
      if (it.style != null) { if (el.getAttribute('style') !== it.style) el.setAttribute('style', it.style); }
      else if (el.hasAttribute('style')) el.removeAttribute('style');
      desired.push(el);
    }
    for (const el of cur.values()) { el.remove(); removed++; }  // 사라진 노드만 제거
    desired.forEach((el, i) => { if (container.children[i] !== el) container.insertBefore(el, container.children[i] || null); });
    if (window.GS_DEBUG) console.log(`[gs reconcile] #${container.id}: 생성 ${created} / 재사용 ${reused} / 제거 ${removed}`);
  }

  // FLIP(WAAPI): mutate 전 위치(First) → mutate → 후 위치(Last) → 차이를 transform invert→0 애니.
  // 이번 단계 duration 0 (시각변화 없이 구조만). base transform과 합성해 위치 유지.
  function flipLayer(container, mutate, duration) {
    const first = new Map();
    for (const el of container.querySelectorAll('.gscard')) if (el.dataset.id != null) first.set(el.dataset.id, el.getBoundingClientRect());
    mutate();
    const dur = duration || 0;
    for (const el of container.querySelectorAll('.gscard')) {
      const f = first.get(el.dataset.id); if (!f) continue;     // 신규 노드는 FLIP 제외
      const l = el.getBoundingClientRect();
      const dx = f.left - l.left, dy = f.top - l.top;
      if (!dx && !dy) continue;
      if (typeof el.animate !== 'function') continue;
      const base = getComputedStyle(el).transform;
      const baseT = base && base !== 'none' ? ' ' + base : '';
      el.animate([{ transform: `translate(${dx}px,${dy}px)${baseT}` }, { transform: base === 'none' ? 'none' : base }], { duration: dur, easing: 'ease' });
    }
  }

  // 획득더미: 광/열끗/띠/피 4분류 스트립 + 카테고리 점수
  function catPoints(detail) {
    const d = detail || {};
    return {
      KWANG: d.kwang || 0,
      YEOL: (d.yeol || 0) + (d.godori || 0),
      TTI: (d.tti || 0) + (d.hongdan || 0) + (d.cheongdan || 0) + (d.chodan || 0),
      PI: d.pi || 0,
    };
  }
  function pileGroups(captured) {
    const g = { KWANG: [], YEOL: [], TTI: [], PI: [] }; let piVal = 0;
    for (const c of captured) { (g[c.cat] || g.PI).push(c); if (c.cat === 'PI') piVal += c.pi; }
    return { g, piVal };
  }
  // 획득더미: 광·멍(열끗)·단(띠)·피 를 가로로 나란히, 각 그룹 안에서도 카드 가로 겹침
  // 피는 장수가 아니라 '값'(일반1·쌍피2·쓰리피3·보너스) 합산 → 10값에 1점
  function capStrips(captured, detail, small) {
    const { g } = pileGroups(captured);
    const mini = small ? 'mini xs' : 'mini';
    // 광·멍·단·피 고정 슬롯(빈 칸도 자리 유지), 거기에만 카드 적립. 숫자 라벨 없음.
    const grp = (label, html, cls) => `<div class="gs-cgrp ${cls}"><div class="gs-cgrp-cards">${html}</div><div class="gs-cgrp-lb">${label}</div></div>`;
    const plain = (cards) => cards.map((c) => cardHTML(c, mini)).join('');
    const piHtml = g.PI.map((c) => `<span class="gs-pic">${cardHTML(c, mini)}${c.pi >= 2 ? `<b class="gs-piv">${c.pi}</b>` : ''}</span>`).join('');  // 쌍피/쓰리피 값 뱃지만 유지
    return grp('광', plain(g.KWANG), 'c-kw') + grp('멍', plain(g.YEOL), 'c-yeol') + grp('단', plain(g.TTI), 'c-tti') + grp('피', piHtml, 'c-pi');
  }

  // 상대 패널 — pos: 'top'|'left'|'right'. 사이드는 카드만 90° 회전(사이드뷰), 닉/이모지/점수는 세로 정자.
  function oppHTML(s, seat, pos) {
    const p = s.seats[seat]; if (!p) return '';
    const turn = s.turnIdx === seat && s.phase === 'playing';
    const det = s.scoreDetails ? s.scoreDetails[seat] : {};
    const sc = s.scores ? s.scores[seat] : 0;
    const tags = [];
    if (s.goCounts && s.goCounts[seat]) tags.push(`${s.goCounts[seat]}고`);
    if (s.shake && s.shake[seat]) tags.push(`흔들×${s.shake[seat]}`);
    if (pos === 'left' || pos === 'right') {
      const { g } = pileGroups((s.captured && s.captured[seat]) || []);
      const row = (lb, cards, extra) => `<div class="gs-srow${extra || ''}"><span class="gs-slb">${lb}</span><span class="gs-scards">${cards}</span></div>`;
      const cardsH = (arr) => arr.map((c) => cardHTML(c, 'mini xs')).join('');
      const piH = g.PI.map((c) => `<span class="gs-pic">${cardHTML(c, 'mini xs')}${c.pi >= 2 ? `<b class="gs-piv">${c.pi}</b>` : ''}</span>`).join('');
      return `<div class="gs-opp side ${pos}${turn ? ' turn' : ''}">
        <div class="gs-stop2"><span class="gs-ava">${avatar(p.name)}</span><span class="gs-sname2">${esc(p.name)}</span></div>
        <div class="gs-scap">
          ${row('광', cardsH(g.KWANG))}${row('멍', cardsH(g.YEOL))}${row('단', cardsH(g.TTI))}${row('피', piH, ' pi')}
        </div>
        <div class="gs-sbottom">${sc}점${turn ? ' <span class="gs-now">차례</span>' : ''}</div>
      </div>`;
    }
    return `<div class="gs-opp${turn ? ' turn' : ''}">
      <div class="gs-opp-head">
        <span class="gs-ava">${avatar(p.name)}</span>
        <span class="gs-opp-info"><b>${esc(p.name)}${p.isBot ? '🤖' : ''}</b>
          <span class="gs-chips">${nyang(p.chips)}냥</span></span>
        <span class="gs-badge-col"><span class="gs-sc">${sc}점</span>${tags.map((t) => `<span class="gs-tag">${t}</span>`).join('')}${turn ? '<span class="gs-now">차례</span>' : ''}</span>
      </div>
      <div class="gs-opp-cap">${capStrips((s.captured && s.captured[seat]) || [], det, true) || '<span class="gs-cap-empty">획득 없음</span>'}</div>
    </div>`;
  }

  const R = {};

  R.init = function (main, info) {
    main.innerHTML =
      '<div id="gsStage"><div id="gsFelt">' +
        '<div id="gsTop"></div>' +
        '<div id="gsBody"><div id="gsLeft" class="gs-side"></div>' +
          '<div id="gsMid"><div id="gsFloor"></div><div id="gsHints"></div>' +
            '<div id="gsCenter"><div id="gsDrawWrap"><div id="gsDraw"></div><div id="gsDrawN"></div></div></div>' +
          '</div>' +
          '<div id="gsRight" class="gs-side"></div>' +
        '</div>' +
        '<div id="gsMy"><div id="gsMyCap"></div>' +
          '<div id="gsMyRow"><div id="gsMyAva"></div><div id="gsHand"></div><div id="gsActions"></div></div>' +
        '</div>' +
        '<div id="gsPick" style="display:none"></div>' +
        '<div id="gsIntro" style="display:none"></div>' +
        '<div id="gsChoice" style="display:none"></div>' +
        '<div id="gsToast"></div><div id="gsModal" style="display:none"></div>' +
      '</div></div>';
    info.innerHTML = '<div id="gsSide"></div>';

    $('gsPick').onclick = (e) => { const el = e.target.closest('.gs-pcard.pickable'); if (!el) return; send({ type: 'pickFirstCard', index: Number(el.dataset.i) }); };
    $('gsChoice').onclick = (e) => { const el = e.target.closest('.gs-choice-card'); if (!el) return; send({ type: 'choose', cardId: el.dataset.id }); };
    $('gsHand').onclick = (e) => { const im = e.target.closest('.gscard'); if (!im || im.classList.contains('dim')) return; send({ type: 'play', cardId: im.dataset.id }); };
    $('gsFloor').onclick = (e) => { const im = e.target.closest('.gscard.choosable'); if (!im) return; send({ type: 'choose', cardId: im.dataset.id }); };
    $('gsActions').onclick = (e) => {
      const b = e.target.closest('.gs-act'); if (!b) return; const a = b.dataset.act;
      if (a === 'chongtong') send({ type: 'chongtong' });
      else if (a === 'flip') send({ type: 'flip' });
      else if (a === 'bomb') send({ type: 'bomb', month: Number(b.dataset.m) });
      else if (a === 'shake') send({ type: 'shake', month: Number(b.dataset.m) });
    };
  };

  let lastEvtKey = '';

  R.render = function (s) {
    // 선 정하기(pickFirst) — 전용 오버레이
    $('gsPick').style.display = s.phase === 'pickFirst' ? '' : 'none';
    if (s.phase === 'pickFirst') { renderPickFirst(s); return; }
    pickFlipped.clear(); lastSeonToast = null;          // pickFirst 벗어나면 리셋

    // 본 딜 인트로(셔플→컷→나눠주기) 1회 — 시퀀스 동안 정상 render 보류, 끝나면 인계
    if (s.phase === 'playing' && s.handNo !== introHandNo && !introPlaying && isFreshDeal(s)) {
      introHandNo = s.handNo; introPlaying = true; introPending = s;
      runIntro(s).then(() => {
        introPlaying = false; const st = introPending || s; introPending = null;
        $('gsIntro').style.display = 'none'; $('gsIntro').innerHTML = '';
        renderBoard(st);
      });
      return;
    }
    if (introPlaying) { introPending = s; return; }      // 인트로 중: 최신 상태만 보관, 그리지 않음
    if (s.phase === 'playing') introHandNo = s.handNo;    // 인트로 스킵 시에도 가드 갱신(reattach 등)
    renderBoard(s);
  };

  function renderBoard(s) {
    const me = s.yourSeat;
    // 대기(로비)
    if (s.phase !== 'playing' && s.phase !== 'finished') {
      $('gsTop').innerHTML = (s.seats || []).map((p, i) => oppHTML(s, i)).join('');
      $('gsLeft').innerHTML = ''; $('gsRight').innerHTML = '';
      $('gsBody').style.display = 'none'; $('gsMy').style.display = 'none';
      modalLobby(s); $('gsSide').innerHTML = sideHTML(s); return;
    }
    $('gsBody').style.display = ''; $('gsMy').style.display = '';

    // 상대 배치: 첫 상대 상단, 둘째 왼쪽(90°), 셋째 오른쪽(90°)
    const opps = (s.seats || []).map((_, i) => i).filter((i) => i !== me);
    $('gsTop').innerHTML = opps[0] != null ? oppHTML(s, opps[0], 'top') : '';
    $('gsLeft').innerHTML = opps[1] != null ? oppHTML(s, opps[1], 'left') : '';
    $('gsRight').innerHTML = opps[2] != null ? oppHTML(s, opps[2], 'right') : '';

    // 바닥 — 같은 월만 한 셀에 겹침, 다른 월은 분리 셀(안 겹침). keyed diff + FLIP.
    const fids = [];
    const fr = $('gsFloor').getBoundingClientRect();
    const lay = floorLayout(s.floor || [], fr.width, fr.height);
    flipLayer($('gsFloor'), () => {
      const items = (s.floor || []).map((c) => {
        const ch = s.pendingChoice && s.pendingChoice.options.some((o) => o.id === c.id);
        const p = lay[c.id] || { x: 50, y: 50, rot: 0 }; const slam = prevFloorIds.has(c.id) ? '' : ' slam'; fids.push(c.id);
        return { id: c.id, m: c.m, src: cardSrc(c), cls: `gscard floorc${ch ? ' choosable' : ''}${slam}`, style: `left:${p.x}%;top:${p.y}%;--rot:${p.rot}deg` };
      });
      reconcileCards($('gsFloor'), items);
    }, 0);
    prevFloorIds = new Set(fids);
    renderHints(s.floor || [], s.myHand || [], s.myTurn && s.phase === 'playing', lay);

    // 더미(가운데) — 큰판/점수 표시 없음(점수는 각 사람 패널에만)
    $('gsDraw').className = s.drawCount > 0 ? 'has' : '';
    $('gsDrawN').textContent = s.drawCount > 0 ? s.drawCount : '';

    // 내 영역
    const myTurn = s.myTurn && s.phase === 'playing';
    $('gsMyAva').innerHTML = `<span class="gs-ava big">${avatar(s.seats[me] ? s.seats[me].name : '나')}</span>
      <div class="gs-my-meta"><b>${esc(s.seats[me] ? s.seats[me].name : '나')}</b><span class="gs-sc">${s.scores ? s.scores[me] : 0}점</span>
      <span class="gs-chips">${nyang(s.seats[me] ? s.seats[me].chips : 0)}냥</span></div>`;
    $('gsMyCap').innerHTML = capStrips((s.captured && s.captured[me]) || [], s.scoreDetails ? s.scoreDetails[me] : {}, false) || '<span class="gs-cap-empty">획득한 패가 여기 쌓여요</span>';
    $('gsHand').className = myTurn ? 'myturn' : '';
    flipLayer($('gsHand'), () => {
      const items = (s.myHand || []).map((c) => ({ id: c.id, m: c.m, src: cardSrc(c), cls: 'gscard' + (myTurn ? '' : ' dim') }));
      reconcileCards($('gsHand'), items);
    }, 0);

    // 액션 버튼
    let acts = '';
    if (s.canChongtong) acts += '<button class="gs-act ct" data-act="chongtong">💣 총통</button>';
    if (s.myFreeFlips > 0) acts += `<button class="gs-act flip" data-act="flip">🔄 뒤집기(${s.myFreeFlips})</button>`;
    (s.bombable || []).forEach((m) => { acts += `<button class="gs-act bomb" data-act="bomb" data-m="${m}">💥 폭탄·${MNAME[m]}</button>`; });
    (s.shakeable || []).forEach((m) => { acts += `<button class="gs-act shake" data-act="shake" data-m="${m}">🤝 흔들기·${MNAME[m]}</button>`; });
    $('gsActions').innerHTML = acts;

    showEvents(s);
    renderModal(s);
    renderChoice(s);
    $('gsSide').innerHTML = sideHTML(s);
  };

  // 바닥 매칭 힌트 — 내 손패와 같은 월인 바닥패 위에 화살표(내 턴에만, 월 그룹당 1개)
  function renderHints(floor, myHand, show, lay) {
    const el = $('gsHints'); if (!el) return;
    if (!show) { el.innerHTML = ''; return; }
    const handM = new Set(); for (const c of myHand) if (c.m) handM.add(c.m);
    const byMonth = {};
    for (const c of floor) if (handM.has(c.m) && lay[c.id]) (byMonth[c.m] = byMonth[c.m] || []).push(lay[c.id]);
    let html = '';
    for (const m of Object.keys(byMonth)) {
      const ps = byMonth[m];
      const x = ps.reduce((a, p) => a + p.x, 0) / ps.length;
      const y = Math.min.apply(null, ps.map((p) => p.y));
      html += `<div class="gs-hint" style="left:${x}%;top:${y}%">▼</div>`;
    }
    el.innerHTML = html;
  }

  // 먹을 패 선택 모달 — 같은 월 2장(다른 타입: 광/멍/단/피)일 때 어느 걸 먹을지
  const CATNAME = { KWANG: '광', YEOL: '멍', TTI: '단', PI: '피' };
  function renderChoice(s) {
    const ch = $('gsChoice');
    const opts = s.pendingChoice && s.pendingChoice.options;
    if (!opts || !opts.length) { ch.style.display = 'none'; ch.innerHTML = ''; return; }
    const cards = opts.map((c) => {
      const lbl = CATNAME[c.cat] || '피';
      const piv = c.cat === 'PI' && c.pi >= 2 ? `<b class="gs-choice-pi">${c.pi}</b>` : '';
      return `<button class="gs-choice-card" data-id="${c.id}"><span class="gs-choice-img"><img src="${cardSrc(c)}" alt="">${piv}</span><span class="gs-choice-lbl">${lbl}</span></button>`;
    }).join('');
    ch.innerHTML = `<div class="gs-choice-box"><div class="gs-choice-title">🖐 어떤 패를 먹을까요?</div><div class="gs-choice-cards">${cards}</div></div>`;
    ch.style.display = 'flex';
  }

  // ── 본 딜 인트로(셔플→컷→나눠주기) ──
  let introHandNo = -1, introPlaying = false, introPending = null;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function isFreshDeal(s) {                       // 갓 딜된 라운드인가(손패 full + 바닥 full) — reattach 중엔 false
    if (!s.handCounts || !s.handCounts.length) return false;
    const hand = s.mode === 'matgo' ? 10 : 7, floor = s.mode === 'matgo' ? 8 : 6;
    return s.handCounts.every((c) => c === hand) && (s.floor ? s.floor.length >= floor - 1 : false);
  }
  function feltPt(el, felt) { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2 - felt.left, y: r.top + r.height / 2 - felt.top }; }
  function introScaffold(s) {                     // 좌석·빈 바닥/손패만 그려 타겟 위치 확보
    const me = s.yourSeat;
    $('gsModal').style.display = 'none'; $('gsPick').style.display = 'none';
    $('gsBody').style.display = ''; $('gsMy').style.display = '';
    const opps = (s.seats || []).map((_, i) => i).filter((i) => i !== me);
    $('gsTop').innerHTML = opps[0] != null ? oppHTML(s, opps[0], 'top') : '';
    $('gsLeft').innerHTML = opps[1] != null ? oppHTML(s, opps[1], 'left') : '';
    $('gsRight').innerHTML = opps[2] != null ? oppHTML(s, opps[2], 'right') : '';
    $('gsFloor').innerHTML = ''; $('gsHand').innerHTML = ''; $('gsActions').innerHTML = '';
    prevFloorIds = new Set();
    $('gsMyAva').innerHTML = `<span class="gs-ava big">${avatar(s.seats[me] ? s.seats[me].name : '나')}</span>
      <div class="gs-my-meta"><b>${esc(s.seats[me] ? s.seats[me].name : '나')}</b><span class="gs-sc">0점</span></div>`;
    $('gsMyCap').innerHTML = '<span class="gs-cap-empty">획득한 패가 여기 쌓여요</span>';
    $('gsDraw').className = ''; $('gsDrawN').textContent = '';
  }
  async function runIntro(s) {
    introScaffold(s);
    const intro = $('gsIntro'); intro.style.display = '';
    const felt = $('gsFelt').getBoundingClientRect();
    const c = $('gsCenter').getBoundingClientRect();
    const cx = c.left + c.width / 2 - felt.left, cy = c.top + c.height / 2 - felt.top;
    // 1) 셔플: 두 묶음 리플 3회
    intro.innerHTML = `<div class="gs-ideck" style="left:${cx}px;top:${cy}px"><div class="gs-half l"></div><div class="gs-half r"></div></div>`;
    await wait(700);                               // 3×220 + 여유
    // 2) 기리(컷): 위 절반 들어 아래로
    intro.innerHTML = `<div class="gs-ideck" style="left:${cx}px;top:${cy}px"><div class="gs-deckbase"></div><div class="gs-cuttop"></div></div>`;
    await wait(330);
    // 3) 나눠주기: 중앙에서 각 자리로 한 장씩(WAAPI)
    intro.innerHTML = `<div class="gs-ideck" style="left:${cx}px;top:${cy}px"><div class="gs-deckbase"></div></div>`;
    await dealPhase(s, intro, cx, cy, felt);
  }
  async function dealPhase(s, intro, cx, cy, felt) {
    const me = s.yourSeat;
    const tgt = {};
    tgt[me] = feltPt($('gsHand'), felt) || { x: cx, y: cy + 210 };
    const opps = (s.seats || []).map((_, i) => i).filter((i) => i !== me);
    const oppEls = [$('gsTop').querySelector('.gs-opp'), $('gsLeft').querySelector('.gs-opp'), $('gsRight').querySelector('.gs-opp')];
    opps.forEach((seat, k) => { tgt[seat] = feltPt(oppEls[k], felt) || { x: cx, y: cy - 200 }; });
    const floorPt = feltPt($('gsFloor'), felt) || { x: cx, y: cy };
    const hand = s.mode === 'matgo' ? 10 : 7;
    const order = [];                              // 서버 분배 순서(손패 라운드로빈 → 바닥)
    const seatOrder = (s.seats || []).map((_, i) => i);
    for (let k = 0; k < hand; k++) for (const seat of seatOrder) order.push(tgt[seat]);
    const fcount = s.floor ? s.floor.length : (s.mode === 'matgo' ? 8 : 6);
    for (let k = 0; k < fcount; k++) order.push({ x: floorPt.x + (((k * 37) % 70) - 35), y: floorPt.y + (((k * 53) % 44) - 22) });
    const STEP = 80, DUR = 180;
    order.forEach((t, i) => {                        // 장당 stagger(80ms), 비행 180ms
      setTimeout(() => {
        const card = document.createElement('div'); card.className = 'gs-flycard';
        card.style.left = cx + 'px'; card.style.top = cy + 'px';
        intro.appendChild(card);
        const dx = t.x - cx, dy = t.y - cy, rot = ((i * 31) % 30) - 15;
        card.animate(
          [{ transform: 'translate(-50%,-50%)' }, { transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) rotate(${rot}deg)` }],
          { duration: DUR, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' });
      }, i * STEP);
    });
    await wait((order.length - 1) * STEP + DUR + 120);   // 시퀀서는 계산된 시간으로(WAAPI throttle 무관)
  }

  // ── 선 정하기(pickFirst) 렌더 ──
  let pickFlipped = new Set();   // 이미 flip 공개된 카드 index(1회만 애니)
  let lastSeonToast = null;      // 선 토스트 중복 방지
  function pname(p) { return esc((p && p.name ? p.name : '').replace(/🤖/g, '')); }
  function renderPickFirst(s) {
    const me = s.yourSeat;
    $('gsTop').innerHTML = ''; $('gsBody').style.display = 'none'; $('gsMy').style.display = 'none'; $('gsModal').style.display = 'none';
    // 좌석 배지(선 glow)
    const seats = (s.seats || []).map((p) => {
      const isSeon = s.pickSeon === p.seat;
      const picked = (s.pickReveals || []).some((rv) => rv.seat === p.seat && rv.round === s.pickRound);
      const eligible = (s.pickEligible || []).includes(p.seat);
      const status = isSeon ? '<span class="gs-seontag">👑 선</span>'
        : picked ? '<span class="gs-pickok">✓ 선택</span>'
        : eligible ? '<span class="gs-pickwait">고르는 중…</span>' : '';
      return `<div class="gs-pseat${isSeon ? ' seon' : ''}${p.seat === me ? ' me' : ''}${!eligible && s.pickSeon == null ? ' out' : ''}">
        <span class="gs-ava">${avatar(p.name)}</span><b>${pname(p)}</b>${status}</div>`;
    }).join('');
    // 카드들(뒷면/공개)
    const revBy = {}; (s.pickReveals || []).forEach((rv) => { revBy[rv.index] = rv; });
    let cards = '';
    for (let i = 0; i < (s.pickCount || 0); i++) {
      const rv = revBy[i];
      if (rv) {
        const just = pickFlipped.has(i) ? '' : ' just'; pickFlipped.add(i);
        cards += `<div class="gs-pcard reveal${just}${rv.seat === me ? ' mine' : ''}" data-i="${i}">
          <div class="gs-pflip"><div class="gs-pback"></div><div class="gs-pfront"><img src="${cardSrc(rv.card)}" alt=""></div></div>
          <span class="gs-pwho">${pname(s.seats[rv.seat])}</span></div>`;
      } else {
        cards += `<div class="gs-pcard back${s.canPick ? ' pickable' : ''}" data-i="${i}"><div class="gs-pflip"><div class="gs-pback"></div></div></div>`;
      }
    }
    const title = s.pickSeon != null
      ? `👑 ${pname(s.seats[s.pickSeon])} 선!`
      : (s.pickRound > 1 ? '🔁 재대결 — ' : '🎴 선 정하기 — ') + (s.canPick ? '패 한 장을 고르세요' : s.myPicked ? '상대 선택 대기…' : '진행 중…');
    $('gsPick').innerHTML = `<div class="gs-pickseats">${seats}</div><div class="gs-picktitle">${title}</div><div class="gs-pickrow">${cards}</div>`;
    if (s.pickSeon != null && lastSeonToast !== s.pickSeon) { lastSeonToast = s.pickSeon; showSeonToast(pname(s.seats[s.pickSeon])); }
    if (s.pickSeon == null) lastSeonToast = null;
    $('gsSide').innerHTML = sideHTML(s);
  }
  function showSeonToast(name) {
    const t = document.createElement('div'); t.className = 'gs-seontoast';
    t.innerHTML = `👑 <b>${name}</b> 선!`;
    $('gsFelt').appendChild(t);
    setTimeout(() => t.classList.add('out'), 1500);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 2000);
  }

  function modalLobby(s) {
    const m = $('gsModal');
    if (s.canStart) {
      m.style.display = 'flex';
      m.innerHTML = '<div class="gs-box"><h2>🃏 고스톱</h2><p>' + (s.seats ? s.seats.length : 0) + '명 · ' + (s.seats && s.seats.length >= 3 ? '고스톱(7장)' : '맞고(10장)') + '</p><button id="gsStart">시작하기</button></div>';
      $('gsStart').onclick = () => send({ type: 'start' });
    } else { m.style.display = 'flex'; m.innerHTML = '<div class="gs-box"><h2>🃏 고스톱</h2><p class="gs-wait">상대를 기다리는 중…</p></div>'; }
  }

  function renderModal(s) {
    const m = $('gsModal');
    if (s.phase === 'finished' && s.result) { m.style.display = 'flex'; m.innerHTML = resultHTML(s); const n = $('gsNext'); if (n) n.onclick = () => send({ type: 'start' }); return; }
    if (s.decision) {
      m.style.display = 'flex';
      m.innerHTML = `<div class="gs-box gs-decision"><h2>${s.decision.score}점!</h2><p>고? 스톱?</p><div class="gs-gobtns"><button id="gsGo">고 ▶</button><button id="gsStop">스톱 ■</button></div></div>`;
      $('gsGo').onclick = () => send({ type: 'go' }); $('gsStop').onclick = () => send({ type: 'stop' }); return;
    }
    if (s.pendingChoice) { m.style.display = 'none'; flashHint('같은 월 2장 중 가져올 패를 고르세요'); return; }
    m.style.display = 'none';
  }

  function showEvents(s) {
    const evs = (s.events || []).filter((e) => ['jjok', 'ttadak', 'bbeok', 'bbeok-eat', 'sweep', 'steal', 'bonus', 'shake', 'bomb', 'go'].includes(e.ev));
    if (!evs.length) return;
    const key = JSON.stringify(evs); if (key === lastEvtKey) return; lastEvtKey = key;
    const NM = { jjok: '쪽!', ttadak: '따닥!', bbeok: '뻑!', 'bbeok-eat': '뻑 회수!', sweep: '싹쓸이!', bonus: '보너스피!', shake: '흔들기!', bomb: '폭탄!', go: '고!' };
    const txt = evs.map((e) => e.ev === 'steal' ? `피 ${e.got}장!` : NM[e.ev]).filter(Boolean).join('  ');
    if (!txt) return;
    const t = $('gsToast'); t.textContent = txt; t.className = 'show';
    clearTimeout(window._gsTT); window._gsTT = setTimeout(() => (t.className = ''), 1400);
  }
  function flashHint(txt) { const t = $('gsToast'); t.textContent = txt; t.className = 'show hint'; clearTimeout(window._gsHT); window._gsHT = setTimeout(() => (t.className = ''), 1600); }

  function resultHTML(s) {
    const r = s.result;
    if (r.nagari) return '<div class="gs-box"><h2>나가리</h2><p>아무도 못 났어요.<br>다음 판 점수 2배!</p>' + nextBtn(s) + '</div>';
    const w = s.seats[r.winner], baks = Object.values(r.bak || {}).flat(), tags = [];
    if (r.goCount) tags.push(`${r.goCount}고`); if (r.shake) tags.push(`흔들×${r.shake}`);
    if (r.mungBak) tags.push('멍박'); if (r.chongtong) tags.push('총통×4'); if (baks.length) tags.push(...new Set(baks));
    return `<div class="gs-box gs-result"><h2>🏆 ${esc(w ? w.name : '')} 승</h2>
      <p class="gs-rscore">${r.baseScore}점${r.reason && r.reason !== 'stop' ? ' · ' + r.reason : ''}</p>
      ${tags.length ? '<div class="gs-tags">' + tags.map((t) => `<span>${t}</span>`).join('') + '</div>' : ''}
      <div class="gs-pays">${Object.entries(r.payScore || {}).map(([L, v]) => `${esc(s.seats[L] ? s.seats[L].name : '')} ${v}점`).join(' · ')}</div>
      ${nextBtn(s)}</div>`;
  }
  const nextBtn = (s) => s.canStart ? '<button id="gsNext">다음 판</button>' : '<p class="gs-wait">다음 판 대기…</p>';

  function sideHTML(s) {
    return '<h3 style="margin-top:0">점수 / 냥</h3>' +
      (s.seats || []).map((p) => `<div class="gs-sline"><span>${avatar(p.name)} ${esc(p.name)}</span><b>${s.scores ? s.scores[p.seat] : 0}점</b><span class="gs-sn">${nyang(p.chips)}</span></div>`).join('') +
      '<div class="gs-side-hint">광3·4·15 / 고도리5 / 홍청초단 각3 / 열끗·띠 5장1점+ / 피10점1점+<br>· 나는점수 맞고7·고스톱3</div>';
  }

  R.meta = { chat: 'felt', options: { fields: [], hint: '' } };
  window.RENDERERS = window.RENDERERS || {};
  window.RENDERERS.gostop = R;
})();
