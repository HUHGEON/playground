// 세븐포커 렌더러 — Monte Carlo 디자인(중첩 타원 펠트 · 골드 명패 · 하단 액션바)
// 트럼프 카드는 SVG(cards-trump/AS.svg) 이미지, 뒷면은 Monte Carlo 해치 패턴.
// window.RENDERERS.poker 로 등록.
(function () {
  const R = {};
  const esc = (x) => window.esc(x);
  const EOK = 100000000;
  function won(n) {
    n = Math.round(Number(n) || 0);
    if (Math.abs(n) < 10000) return n.toLocaleString();
    const eok = Math.floor(n / EOK), man = Math.floor((n % EOK) / 10000);
    let s = '';
    if (eok) s += eok.toLocaleString() + '억';
    if (man) s += (s ? ' ' : '') + man.toLocaleString() + '만';
    return s || n.toLocaleString();
  }

  // ── 트럼프 카드 ──
  const SUITSYM = ['♠', '♥', '♦', '♣'];
  // 파일명(Vector-Playing-Cards): {랭크}{무늬}.svg — 무늬 대문자 S/H/D/C, 10은 "10". 예: AS.svg, 10C.svg
  const SUITCODE = ['S', 'H', 'D', 'C'];
  const RANKLBL = (r) => (r === 14 ? 'A' : r === 13 ? 'K' : r === 12 ? 'Q' : r === 11 ? 'J' : r === 10 ? '10' : String(r));
  const RANKCODE = (r) => (r === 14 ? 'A' : r === 13 ? 'K' : r === 12 ? 'Q' : r === 11 ? 'J' : String(r));
  // card={r,s} 또는 {hidden:true}. SVG 이미지 우선, 로드 실패 시 CSS 페이스.
  function cardEl(card, o) {
    o = o || {};
    const d = document.createElement('div');
    d.className = 'tcard' + (o.win ? ' win' : '') + (o.hole ? ' hole' : '');
    if (o.w) { d.style.width = o.w + 'px'; d.style.height = o.h + 'px'; }
    if (!card || card.hidden) { d.classList.add('back'); return d; }
    const red = card.s === 1 || card.s === 2;
    d.classList.add(red ? 'red' : 'blk');
    const sym = SUITSYM[card.s], lbl = RANKLBL(card.r);
    d.innerHTML = `<div class="cface"><div class="cr">${lbl}</div><div class="cs">${sym}</div><div class="cpip">${sym}</div></div>`;
    const img = document.createElement('img');
    img.src = 'cards-trump/' + RANKCODE(card.r) + SUITCODE[card.s] + '.svg';
    img.alt = lbl + sym; img.draggable = false;
    img.onload = () => img.classList.add('ok');
    img.onerror = () => { img.remove(); d.classList.add('noimg'); };   // 이미지 없을 때만 CSS 글자 표시
    d.appendChild(img);
    return d;
  }

  // ── 족보표(사이드바) — 실제 카드 예시로 ──
  const PRANK = [
    ['로열 스트레이트 플러시', [[14, 0], [13, 0], [12, 0], [11, 0], [10, 0]]],
    ['스트레이트 플러시', [[9, 1], [8, 1], [7, 1], [6, 1], [5, 1]]],
    ['포카드', [[14, 0], [14, 1], [14, 2], [14, 3], [13, 0]]],
    ['풀하우스', [[13, 0], [13, 1], [13, 2], [9, 0], [9, 1]]],
    ['플러시', [[14, 2], [11, 2], [9, 2], [5, 2], [2, 2]]],
    ['스트레이트', [[9, 3], [8, 1], [7, 2], [6, 0], [5, 3]]],
    ['트리플', [[12, 0], [12, 1], [12, 2], [9, 3], [4, 1]]],
    ['투페어', [[14, 0], [14, 1], [13, 2], [13, 3], [9, 0]]],
    ['원페어', [[10, 0], [10, 1], [13, 2], [8, 3], [3, 1]]],
    ['하이카드 (탑)', [[14, 0], [13, 1], [11, 2], [8, 3], [4, 0]]],
  ];
  function buildRankPanel() {
    const wrap = document.getElementById('pokerRank');
    if (!wrap) return;
    wrap.innerHTML = '<div class="jlegend">⬆ 위로 갈수록 강함 · 7장 중 베스트 5장</div>';
    PRANK.forEach((r, i) => {
      const row = document.createElement('div'); row.className = 'prow';
      const cards = document.createElement('div'); cards.className = 'prankcards';
      r[1].forEach((c) => cards.appendChild(cardEl({ r: c[0], s: c[1] }, { w: 38, h: 54 })));
      const txt = document.createElement('div'); txt.className = 'prk';
      txt.innerHTML = `<span class="pex">${10 - i}</span> ${esc(r[0])}`;
      row.appendChild(cards); row.appendChild(txt);
      wrap.appendChild(row);
    });
  }

  let timerInt = null, lastHandId = 0, lastStreet = 0, wasMyTurn = false, prevActs = {}, seatByName = {};
  let _scale = 1, _dealCards = [];   // 카드 배포 모션용(이번 렌더에 새로 배분된 카드들)

  // ── 채팅 말풍선 ──
  let activeBubbles = [];
  function positionBubble(b) {
    const seat = seatByName[b.name];
    if (!seat) { b.el.style.display = 'none'; return; }
    b.el.style.display = '';
    const r = seat.getBoundingClientRect();
    b.el.style.left = (r.left + r.width / 2 + window.scrollX) + 'px';
    b.el.style.top = (r.top - 4 + window.scrollY) + 'px';
  }
  function repositionBubbles() { activeBubbles.forEach(positionBubble); }
  function showChatBubble(name, text) {
    const el = document.createElement('div');
    el.className = 'chat-bubble'; el.textContent = text;
    document.body.appendChild(el);
    const b = { name, el };
    positionBubble(b); activeBubbles.push(b);
    setTimeout(() => el.classList.add('out'), 3400);
    setTimeout(() => { el.remove(); activeBubbles = activeBubbles.filter((x) => x !== b); }, 3800);
  }

  function showTurnToast() {
    const felt = document.getElementById('pokerFelt');
    const t = document.createElement('div');
    t.className = 'turn-toast'; t.textContent = '🟢 당신 차례!';
    if (felt) {
      const r = felt.getBoundingClientRect();
      t.style.left = (r.left + r.width / 2 + window.scrollX) + 'px';
      t.style.top = (r.top + r.height / 2 + window.scrollY) + 'px';
    }
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('out'), 950);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 1300);
  }
  function actCls(a) {
    return { '체크': 'check', '콜': 'call', '레이즈': 'raise', '올인': 'allin', '폴드': 'die' }[a] || 'call';
  }
  function showActToast(seatEl, act) {
    if (!seatEl) return;
    const r = seatEl.getBoundingClientRect();
    const t = document.createElement('div');
    t.className = 'act-toast ab-' + actCls(act); t.textContent = act;
    t.style.left = (r.left + r.width / 2 + window.scrollX) + 'px';
    t.style.top = (r.top + r.height / 2 + window.scrollY) + 'px';
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('out'), 650);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 950);
  }
  function showMoneyThrow(seatEl) {
    const pot = document.getElementById('pokerPot');
    if (!seatEl || !pot) return;
    const r1 = seatEl.getBoundingClientRect(), r2 = pot.getBoundingClientRect();
    for (let i = 0; i < 3; i++) {
      const bill = document.createElement('div');
      bill.className = 'money-fly wbill ' + (i === 1 ? 'oman' : 'man');
      bill.innerHTML = '<span class="strap"><i>' + (i === 1 ? '50000' : '10000') + '</i></span>';
      const sx = r1.left + r1.width / 2, sy = r1.top + r1.height / 2;
      bill.style.left = (sx + window.scrollX) + 'px'; bill.style.top = (sy + window.scrollY) + 'px';
      bill.style.setProperty('--dx', (r2.left + r2.width / 2 - sx) + 'px');
      bill.style.setProperty('--dy', (r2.top + r2.height / 2 - sy) + 'px');
      bill.style.animationDelay = (i * 70) + 'ms';
      document.body.appendChild(bill);
      setTimeout(() => { if (bill.parentNode) bill.remove(); }, 700 + i * 70);
    }
  }
  const MONEY_ACTS = ['콜', '레이즈', '올인'];

  R.init = function (main, info) {
    main.innerHTML = '<div id="pokerStage"><div id="pokerFelt"></div></div><div id="pokerBar"></div>';
    if (!window._pokerFitBound) { window.addEventListener('resize', fitStage); window._pokerFitBound = true; }
    info.innerHTML = '<div id="pokerWait"></div>' +
      '<button id="prankToggle" class="sub" style="width:100%;margin-top:6px">📖 족보 보기</button>' +
      '<div id="pokerRank" style="display:none;margin-top:8px"></div>';
    buildRankPanel();
    const tg = document.getElementById('prankToggle');
    const panel = document.getElementById('pokerRank');
    if (tg && panel) tg.onclick = () => {
      const open = panel.style.display === 'none';
      panel.style.display = open ? 'block' : 'none';
      tg.textContent = open ? '📖 족보 숨기기' : '📖 족보 보기';
    };
    lastHandId = 0; lastStreet = 0; wasMyTurn = false; seatByName = {};
    window.onRoomChat = showChatBubble;
  };

  // 좌석 좌표(테이블 % 기준). 나는 항상 남쪽(50,87). 나머지는 시계방향.
  // 4인은 정확히 서·북·동(나=남) = 동서남북.
  const LAYOUTS = {
    2: [[50, 10]],
    3: [[16, 34], [84, 34]],
    4: [[12.7, 50], [50, 10], [87.3, 50]],          // 서 · 북 · 동
    5: [[12.7, 64], [12.7, 30], [87.3, 30], [87.3, 64]],
    6: [[12.7, 68.9], [12.7, 31.1], [50, 10], [87.3, 31.1], [87.3, 68.9]],
  };

  R.render = function (s) {
    const felt = document.getElementById('pokerFelt');
    if (!felt) return;
    const _sx = window.scrollX, _sy = window.scrollY;
    const sub = document.getElementById('roomSub');
    if (sub) sub.textContent = `ante ${won(s.ante)} · 시작 금액 ${won(s.startChips)}`;
    const intro = s.phase === 'playing' && s.handId && s.handId !== lastHandId;
    // 카드 배포 애니메이션 신호: 새 판(intro) 또는 새 구간(새 카드 배분) 때 true
    const dealPulse = s.phase === 'playing' && (intro || s.street !== lastStreet);
    if (s.phase === 'playing') { lastHandId = s.handId; lastStreet = s.street; }
    _dealCards = [];                                  // 이번 렌더에 새로 배분된 카드 모음(덱→좌석 모션)

    const streetTxt = s.streetLabel || (s.phase === 'finished' ? '정산' : '대기 중');
    const streetShort = s.stage === 'discard' ? '버리기' : (s.street ? s.street + '구간' : (s.phase === 'finished' ? '정산' : '대기'));   // 헤더용 짧은 표기

    felt.innerHTML =
      '<div id="pokerHead">' +
        '<div class="phead-left"><button id="pLeave" class="sub pleavebtn">← 나가기</button><div class="ptitle">세븐 포커</div></div>' +
        '<div class="pstats">' +
          `<div class="pstat"><div class="lbl">ANTE</div><div class="val">${won(s.ante)}</div></div>` +
          `<div class="pstat"><div class="lbl">STREET</div><div class="val">${esc(streetShort)}</div></div>` +
        '</div></div>' +
      '<div id="pokerTable">' +
        '<div class="feltlayer felt-rim"></div><div class="feltlayer felt-green"></div>' +
        '<div class="feltlayer felt-hi"></div><div class="feltlayer felt-ring1"></div><div class="feltlayer felt-ring2"></div>' +
        '<div id="pokerResult"></div><div id="pokerPot"></div><div id="pokerNotice"></div>' +
      '</div>';

    const lv = felt.querySelector('#pLeave');
    if (lv) lv.onclick = () => { if (window.leaveConfirm && !confirm(window.leaveConfirm)) return; window.send({ type: 'leaveRoom' }); };
    // 액션 바는 펠트 밖(스케일 영향 X) — 화면 하단 고정
    const barEl = document.getElementById('pokerBar');
    barEl.innerHTML = '<div class="bar-left"></div><div id="pokerActions"></div>';

    const table = felt.querySelector('#pokerTable');

    // ── POT ──
    const potC = felt.querySelector('#pokerPot');
    potC.innerHTML =
      `<div class="potpill"><span class="lbl">POT</span><span class="val">₩ ${won(s.pot || 0)}</span></div>` +
      (s.streetLabel ? `<div class="streetlabel">${esc(s.streetLabel)}</div>` : '') +
      (s.secondsLeft != null ? `<div class="pottimer" id="pTimer">⏱ ${s.secondsLeft}초</div>` : '') +
      `<div id="pokerPotCtrl"></div>`;

    // 시작/재시작 컨트롤
    const ctrl = felt.querySelector('#pokerPotCtrl');
    const auto = s.autoStartIn != null ? ` (${s.autoStartIn}초)` : '';
    if (s.needRestart) {
      const b = document.createElement('button');
      if (s.canRestartGame) { b.textContent = '🔄 게임 재시작'; b.onclick = () => window.send({ type: 'restartGame' }); }
      else { b.disabled = true; b.textContent = '승리자 재시작 대기…'; }
      ctrl.appendChild(b);
    } else if (s.canStart) {
      const b = document.createElement('button');
      b.textContent = (s.phase === 'finished' ? '다음 판' : '게임 시작') + auto;
      b.onclick = () => window.send({ type: 'start' });
      ctrl.appendChild(b);
    } else if (s.isHost && s.phase !== 'playing') {
      const b = document.createElement('button'); b.disabled = true; b.textContent = '2명 이상 필요';
      ctrl.appendChild(b);
    } else if (s.autoStartIn != null) {
      const b = document.createElement('button'); b.disabled = true; b.textContent = `다음 판 ${s.autoStartIn}초…`;
      ctrl.appendChild(b);
    }

    // ── 좌석 ──
    const me = s.players.find((p) => p.isMe);
    const myIdx = me ? s.players.indexOf(me) : -1;
    const orderedSeated = myIdx >= 0 ? s.players.slice(myIdx).concat(s.players.slice(0, myIdx)) : s.players.slice();
    const slots = Math.max(0, 6 - orderedSeated.length);
    const waitList = (s.waiting || []).filter((w) => w.name !== s.yourName).slice(0, slots)
      .map((w) => ({ name: w.name, color: w.color, chips: w.chips, waiting: true, bankrupt: w.chips < s.ante }));
    const ordered = orderedSeated.concat(waitList);
    const N = ordered.length || 1;
    const lay = (myIdx >= 0 && LAYOUTS[N]) ? LAYOUTS[N] : null;
    seatByName = {};
    ordered.forEach((p, k) => {
      let L, T;
      if (k === 0 && myIdx >= 0) { L = 50; T = 87; }
      else if (lay) { L = lay[k - 1][0]; T = lay[k - 1][1]; }
      else { const a = (2 * Math.PI / N) * k; L = 50 - 38 * Math.sin(a); T = 50 + 36 * Math.cos(a); }
      const el = seatEl(p, intro, T < 50, dealPulse); // 위쪽 절반이면 명패 위·카드 아래(중앙 향함)
      el.style.left = L + '%'; el.style.top = T + '%';
      table.appendChild(el);
      seatByName[p.name] = el;
    });

    // 카드 뭉치(덱) — POT 아래
    const deck = document.createElement('div'); deck.id = 'pokerDeck';
    for (let i = 0; i < 3; i++) {
      const ce = cardEl({ hidden: true }, { w: 46, h: 66 });
      ce.style.position = 'absolute'; ce.style.left = (i * 3) + 'px'; ce.style.top = (-i * 3) + 'px';
      deck.appendChild(ce);
    }
    table.appendChild(deck);

    // 내 오픈 카드 — 처음부터 4칸, 오픈 카드가 하나씩 채워짐
    if (me && me.inHand) {
      const myOpen = (me.cards || []).filter((c) => c && c.up);
      const myNewest = (me.cards && me.cards.length) ? me.cards[me.cards.length - 1] : null;
      const box = document.createElement('div'); box.id = 'pokerMyOpen';
      box.innerHTML = '<div class="lbl">MY OPEN CARDS</div>';
      const slots = document.createElement('div'); slots.className = 'slots';
      for (let i = 0; i < 4; i++) {
        const slot = document.createElement('div'); slot.className = 'openslot';
        const c = myOpen[i];
        if (c) {
          const ce = cardEl(c, { w: 56, h: 80, win: me.win });
          if (intro || (dealPulse && c === myNewest)) { ce.classList.add('predeal'); _dealCards.push(ce); }
          slot.appendChild(ce);
        }
        slots.appendChild(slot);
      }
      box.appendChild(slots);
      if (me.handName) {                              // 현재 내 패 — 크게 표시
        const hd = document.createElement('div'); hd.className = 'myhand';
        hd.innerHTML = (me.win ? '🏆 ' : '') + '현재 패 · <b>' + esc(me.handName) + '</b>';
        box.appendChild(hd);
      }
      table.appendChild(box);
    }
    repositionBubbles();

    // 새 베팅 → 좌석 토스트 + 돈 던지기
    if (intro) { prevActs = {}; s.players.forEach((p) => { prevActs[p.name] = p.act || null; }); }
    else {
      s.players.forEach((p) => {
        if (p.act && prevActs[p.name] !== p.act) {
          showActToast(seatByName[p.name], p.act);
          if (MONEY_ACTS.includes(p.act)) showMoneyThrow(seatByName[p.name]);
        }
        prevActs[p.name] = p.act || null;
      });
    }

    // ── 결과 배너 ──
    const res = felt.querySelector('#pokerResult');
    if (s.needRestart) {
      res.textContent = s.canRestartGame ? '💀 한 명 빼고 전원 파산 — 당신 승리! 재시작하세요'
        : '💀 한 명 빼고 전원 파산 — 승리자 재시작 대기 중…';
    } else if (s.result) {
      if (s.result.sole) {
        const w = s.result.winners[0];
        res.textContent = `🏆 ${w ? esc(w.name) : ''} 단독 승리 — ${won(s.result.pot)} (비공개)`;
      } else {
        const names = s.result.winners.map((w) => `${esc(w.name)} ${won(w.amount)}`).join(' · ');
        res.textContent = `🏆 ${names}`;
      }
    }

    // ── 하단 액션 바 ──
    const barLeft = barEl.querySelector('.bar-left');
    const act = barEl.querySelector('#pokerActions');
    if (s.myTurn && s.actions) {
      const callA = s.actions.find((a) => a.act === 'call');
      barLeft.innerHTML = callA
        ? `<div class="callwrap"><span class="calllbl">콜 금액</span><span class="callamt">${esc(callA.amount || '')}</span></div>`
        : `<span class="barhint">베팅 / 체크</span>`;
      s.actions.forEach((a) => {
        const b = document.createElement('button');
        b.className = 'b-' + a.act;
        b.innerHTML = `<span class="blabel">${esc(a.name)}</span>` + (a.amount ? `<span class="bamt">${esc(a.amount)}</span>` : '');
        b.onclick = () => { window.send({ type: 'bet', act: a.act }); act.innerHTML = ''; barLeft.innerHTML = ''; };
        act.appendChild(b);
      });
    } else {                                          // 내 차례 아님 → 가운데에 안내 채움
      barLeft.innerHTML = '';
      let hint;
      if (s.stage === 'discard') hint = s.myDiscarded ? '다른 플레이어가 카드를 버리는 중…' : '🃏 버릴 카드 1장을 고르세요';
      else hint = s.phase === 'playing' ? '상대 차례를 기다리는 중…' : streetTxt;
      act.innerHTML = `<span class="barhint">${esc(hint)}</span>`;
    }

    // ── 관전/재참가 — 게임 화면(테이블) 위에 표시 ──
    const notice = felt.querySelector('#pokerNotice');
    notice.innerHTML = '';
    if (s.stage === 'discard' && me) {                // 버리기 단계 → 가운데에 내 3장 선택 패널
      if (s.canDiscard && me.cards && me.cards.length) {
        const card = document.createElement('div'); card.className = 'notice-card';
        card.innerHTML = `<div class="nc-line">🃏 버릴 카드 1장 선택${s.secondsLeft != null ? ' · ' + s.secondsLeft + '초' : ''}</div>`;
        const row = document.createElement('div'); row.className = 'discardrow';
        me.cards.forEach((c, i) => {
          const ce = cardEl(c, { w: 64, h: 90 });
          ce.classList.add('selectable');
          ce.onclick = () => { window.send({ type: 'discard', idx: i }); notice.innerHTML = ''; };
          row.appendChild(ce);
        });
        card.appendChild(row); notice.appendChild(card);
      } else if (s.myDiscarded) {
        notice.innerHTML = '<div class="notice-card spectate">✅ 버림 완료 — 다른 플레이어 대기 중…</div>';
      }
    } else if (!me) {                                 // 파산·관전 중 → 화면에 재참가 버튼
      if (s.canRequestBuyin) {
        const card = document.createElement('div'); card.className = 'notice-card';
        card.innerHTML = `<div class="nc-line">💸 칩 부족 — 재참가 가능 (${won(s.buyinAmount)})</div>`;
        const b = document.createElement('button'); b.className = 'gold'; b.textContent = '🙋 재참가 요청하기';
        b.onclick = () => window.send({ type: 'requestBuyin' });
        card.appendChild(b); notice.appendChild(card);
      } else if (s.buyinPending) {
        notice.innerHTML = '<div class="notice-card"><div class="nc-line" style="color:var(--gold)">⏳ 재참가 요청됨 — 승인 대기 중…</div></div>';
      } else {
        notice.innerHTML = '<div class="notice-card spectate">👀 관전 중 — 다음 판을 기다려요</div>';
      }
    } else if (s.iAmApprover && s.buyinRequests && s.buyinRequests.length) {  // 좌석 보유자 = 승인 가능
      const card = document.createElement('div'); card.className = 'notice-card';
      card.innerHTML = `<div class="nc-line">🙋 재참가 요청 — 승인 시 ${won(s.buyinAmount)}로 합류</div>`;
      s.buyinRequests.forEach((nm) => {
        const row = document.createElement('div'); row.className = 'buyin-row';
        row.innerHTML = `<span>${esc(nm)}</span>`;
        const wrap = document.createElement('span');
        const okb = document.createElement('button'); okb.className = 'gold'; okb.textContent = '✅ 승인';
        okb.onclick = () => window.send({ type: 'approveBuyin', name: nm });
        const no = document.createElement('button'); no.className = 'danger'; no.style.marginLeft = '6px'; no.textContent = '❌ 거절';
        no.onclick = () => window.send({ type: 'rejectBuyin', name: nm });
        wrap.append(okb, no); row.appendChild(wrap); card.appendChild(row);
      });
      notice.appendChild(card);
    }

    // 내 차례 토스트
    if (s.myTurn && !wasMyTurn) showTurnToast();
    wasMyTurn = !!s.myTurn;

    // 초과 대기열(사이드바)
    const wait = document.getElementById('pokerWait');
    if (wait) {
      const overflow = (s.waiting || []).slice(waitList.length);
      if (overflow.length) {
        wait.innerHTML = '<h3>대기열</h3>' + overflow.map((w) =>
          `<div class="qrow"><span class="qname" style="color:${w.color}">${esc(w.name)}</span>` +
          `<span class="tag">${w.willSit ? '다음 판 합류' : '대기열'}</span>` +
          `<span style="color:var(--gold);font-size:12px;font-weight:800">${won(w.chips)}</span></div>`).join('');
      } else wait.innerHTML = '';
    }

    startTimer(s.secondsLeft);
    fitStage();
    runDealAnimation();                               // 덱→좌석 순차 배포 모션
    if (window.scrollX !== _sx || window.scrollY !== _sy) window.scrollTo(_sx, _sy);
  };

  // 새로 배분된 카드들을 가운데 덱에서 한 장씩 날아오게(순차 딜레이)
  function runDealAnimation() {
    const cards = _dealCards; _dealCards = [];
    if (!cards.length) return;
    requestAnimationFrame(() => {                     // fitStage(scale 적용) 다음 프레임에 위치 계산
      const deck = document.getElementById('pokerDeck');
      if (!deck) { cards.forEach((c) => c.classList.remove('predeal')); return; }
      const dr = deck.getBoundingClientRect();
      const dcx = dr.left + dr.width / 2, dcy = dr.top + dr.height / 2;
      cards.forEach((ce, i) => {
        const r = ce.getBoundingClientRect();
        if (!r.width) { ce.classList.remove('predeal'); return; }
        const dx = (dcx - (r.left + r.width / 2)) / (_scale || 1);
        const dy = (dcy - (r.top + r.height / 2)) / (_scale || 1);
        ce.style.setProperty('--dx', dx + 'px');
        ce.style.setProperty('--dy', dy + 'px');
        ce.style.animationDelay = (i * 110) + 'ms';   // 한 장씩 순차
        ce.classList.remove('predeal');
        ce.classList.add('deal');
      });
    });
  }

  // 한 줄 카드 배치(>3장이면 겹침, 아니면 간격)
  function rowEl(cards, kind, cw, ch, p, intro, dealPulse) {
    const row = document.createElement('div');
    row.className = 'pcardrow ' + kind;
    const overlap = cards.length > 3 ? -Math.round(cw * 0.42) : 4;
    const newest = (p.cards && p.cards.length) ? p.cards[p.cards.length - 1] : null;   // 이번에 새로 받은 카드
    cards.forEach((c, j) => {
      const ce = cardEl(c, { w: cw, h: ch, win: p.win, hole: kind === 'hidden' && p.isMe && c && !c.hidden });
      if (j > 0) ce.style.marginLeft = overlap + 'px';
      if (intro || (dealPulse && c === newest)) { ce.classList.add('predeal'); _dealCards.push(ce); }  // 덱→좌석 모션 대상
      row.appendChild(ce);
    });
    return row;
  }

  function seatEl(p, intro, topHalf, dealPulse) {
    const el = document.createElement('div');
    el.className = 'pseat' + (p.isMe ? ' me' : '') + (p.isTurn ? ' turn' : '') + (p.folded ? ' folded' : '') + (p.win ? ' win' : '') + (p.waiting ? ' waiting' : '');
    const cw = p.isMe ? 44 : 40, ch = p.isMe ? 62 : 58;

    // 카드 영역
    const area = document.createElement('div');
    area.className = 'pcards-area';
    if (p.waiting) {
      area.innerHTML = `<div class="emptyseat">${p.bankrupt ? '💸' : '🪑'}</div>`;
    } else if (p.isMe) {
      // 나: 히든 카드만 좌석에(오픈은 가운데 박스로). 내 패라 앞면 + 골드 강조.
      const hidden = (p.cards || []).filter((c) => c && !c.up);
      if (hidden.length) area.appendChild(rowEl(hidden, 'hidden', cw, ch, p, intro, dealPulse));
    } else {
      // 상대: 모든 카드를 한 줄(일렬)로 — 히든 뒷면 + 오픈 앞면
      let cards = [];
      if (p.cards && p.cards.length) {
        const open = p.cards.filter((c) => c && c.up);
        const hidden = p.cards.filter((c) => !(c && c.up));
        cards = [...hidden, ...open];
      } else if (p.inHand) cards = [{ hidden: true }, { hidden: true }, { hidden: true }];
      if (cards.length) area.appendChild(rowEl(cards, 'flat', cw, ch, p, intro, dealPulse));
    }

    // 명패
    const pill = document.createElement('div');
    pill.className = 'pname-pill';
    let badges = '';
    if (p.waiting) badges = `<span class="pbadge ${p.bankrupt ? 'bust' : 'die'}">${p.bankrupt ? '파산' : '대기'}</span>`;
    else {
      if (p.host) badges += '<span class="pbadge host">D</span>';
      if (p.allin) badges += '<span class="pbadge allin">올인</span>';
      else if (p.folded) badges += '<span class="pbadge die">다이</span>';
    }
    let info = '';
    if (p.handName && !p.isMe) info = (p.win ? '🏆 ' : '') + p.handName;   // 내 패는 가운데 크게(myhand), 명패엔 남의 것만
    else if (p.act && !p.folded) info = p.act + (p.contrib ? ' +' + won(p.contrib) : '');
    pill.innerHTML = badges +
      `<div class="pn" style="color:${p.color || '#f4dd9c'}">${esc(p.name)}</div>` +
      `<div class="pc">💵 ${won(p.chips)}</div>` +
      `<div class="pi">${esc(info)}</div>`;

    // 배치: 위쪽 좌석 → 명패 위·카드 아래 / 아래쪽 좌석 → 카드 위·명패 아래
    if (topHalf) { el.appendChild(pill); el.appendChild(area); }
    else { el.appendChild(area); el.appendChild(pill); }
    return el;
  }

  function startTimer(secs) {
    if (timerInt) { clearInterval(timerInt); timerInt = null; }
    if (secs == null) return;
    let s = secs;
    timerInt = setInterval(() => {
      s = Math.max(0, s - 1);
      const el = document.getElementById('pTimer');
      if (!el) { clearInterval(timerInt); timerInt = null; return; }
      el.textContent = '⏱ ' + s + '초';
      if (s <= 0) { clearInterval(timerInt); timerInt = null; }
    }, 1000);
  }

  // 고정 felt(940px)를 가용 공간에 맞춰 통째로 scale
  let _fitRAF = 0;
  function fitStage() {
    if (_fitRAF) return;
    _fitRAF = requestAnimationFrame(() => {
      _fitRAF = 0;
      const stage = document.getElementById('pokerStage');
      const felt = document.getElementById('pokerFelt');
      if (!stage || !felt || stage.offsetParent === null) return;
      felt.style.transform = 'none';
      const fw = felt.offsetWidth || 940;
      const fh = felt.offsetHeight;
      if (!fh) return;
      const availW = stage.clientWidth;
      const topY = stage.getBoundingClientRect().top;
      const availH = window.innerHeight - topY - 100;   // 하단 고정 바(~96px) 자리 확보 → 한 화면에 맞춤(스크롤 없이)
      let sc = Math.min(availW / fw, availH / fh, 2.2);
      sc = Math.max(sc, 0.3);
      felt.style.transform = `scale(${sc})`;
      _scale = sc;
      stage.style.height = Math.ceil(fh * sc) + 'px';
      repositionBubbles();
    });
  }

  window.RENDERERS = window.RENDERERS || {};
  window.RENDERERS.poker = R;
})();
