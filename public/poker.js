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
    img.onerror = () => img.remove();
    d.appendChild(img);
    return d;
  }

  // ── 족보표(사이드바) ──
  const PRANK = [
    ['로열 스트레이트 플러시', 'A♠ K♠ Q♠ J♠ 10♠'],
    ['스트레이트 플러시', '9♥ 8♥ 7♥ 6♥ 5♥'],
    ['포카드', '같은 숫자 4장'],
    ['풀하우스', '트리플 + 페어'],
    ['플러시', '같은 무늬 5장'],
    ['스트레이트', '연속 숫자 5장'],
    ['트리플', '같은 숫자 3장'],
    ['투페어', '페어 2개'],
    ['원페어', '페어 1개'],
    ['하이카드 (탑)', '가장 높은 카드'],
  ];
  function rankPanelHTML() {
    const legend = '<div class="jlegend">⬆ 위로 갈수록 강함 · 7장 중 베스트 5장</div>';
    const rows = PRANK.map((r, i) => `<div class="prow"><span class="pex">${10 - i}</span><span class="prk">${esc(r[0])}</span><span style="font-size:11px;color:var(--muted)">${esc(r[1])}</span></div>`).join('');
    return legend + rows;
  }

  let timerInt = null, lastHandId = 0, wasMyTurn = false, prevActs = {}, seatByName = {};

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
    main.innerHTML = '<div id="pokerStage"><div id="pokerFelt"></div></div>';
    if (!window._pokerFitBound) { window.addEventListener('resize', fitStage); window._pokerFitBound = true; }
    info.innerHTML = '<div id="pokerWait"></div>' +
      '<button id="prankToggle" class="sub" style="width:100%;margin-top:6px">📖 족보 보기</button>' +
      '<div id="pokerRank" style="display:none;margin-top:8px">' + rankPanelHTML() + '</div>';
    const tg = document.getElementById('prankToggle');
    const panel = document.getElementById('pokerRank');
    if (tg && panel) tg.onclick = () => {
      const open = panel.style.display === 'none';
      panel.style.display = open ? 'block' : 'none';
      tg.textContent = open ? '📖 족보 숨기기' : '📖 족보 보기';
    };
    lastHandId = 0; wasMyTurn = false; seatByName = {};
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
    if (sub) sub.textContent = `앤티 ${won(s.ante)} · 시작 ${won(s.startChips)}`;
    const intro = s.phase === 'playing' && s.handId && s.handId !== lastHandId;
    if (s.phase === 'playing') lastHandId = s.handId;

    const streetTxt = s.streetLabel || (s.phase === 'finished' ? '정산' : '대기 중');

    felt.innerHTML =
      '<div id="pokerHead">' +
        '<div><div class="ptitle">세븐 포커</div>' +
        '<div class="psub">공통 카드 없이 각자 7장 — 오픈 4장 · 히든 3장, 베스트 5장으로 승부</div></div>' +
        '<div class="pstats">' +
          `<div class="pstat"><div class="lbl">ANTE</div><div class="val">${won(s.ante)}</div></div>` +
          `<div class="pstat"><div class="lbl">STREET</div><div class="val">${esc(streetTxt)}</div></div>` +
        '</div></div>' +
      '<div id="pokerTable">' +
        '<div class="feltlayer felt-rim"></div><div class="feltlayer felt-green"></div>' +
        '<div class="feltlayer felt-hi"></div><div class="feltlayer felt-ring1"></div><div class="feltlayer felt-ring2"></div>' +
        '<div id="pokerResult"></div><div id="pokerPot"></div>' +
      '</div>' +
      '<div id="pokerBar"><div class="bar-left"></div><div id="pokerActions"></div></div>' +
      '<div id="pokerStatus"></div><div id="buyinBox"></div>';

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
      const el = seatEl(p, intro, T < 50);          // 위쪽 절반이면 명패 위·카드 아래(중앙 향함)
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
      const box = document.createElement('div'); box.id = 'pokerMyOpen';
      box.innerHTML = '<div class="lbl">MY OPEN CARDS</div>';
      const slots = document.createElement('div'); slots.className = 'slots';
      for (let i = 0; i < 4; i++) {
        const slot = document.createElement('div'); slot.className = 'openslot';
        const c = myOpen[i];
        if (c) {
          const ce = cardEl(c, { w: 56, h: 80, win: me.win });
          if (intro) { ce.classList.add('deal'); ce.style.animationDelay = (300 + i * 90) + 'ms'; }
          slot.appendChild(ce);
        }
        slots.appendChild(slot);
      }
      box.appendChild(slots); table.appendChild(box);
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
    const barLeft = felt.querySelector('.bar-left');
    const act = felt.querySelector('#pokerActions');
    if (s.myTurn && s.actions) {
      const callA = s.actions.find((a) => a.act === 'call');
      barLeft.innerHTML = callA
        ? `<div class="callwrap"><span class="calllbl">콜 금액</span><span class="callamt">${esc(callA.amount || '')}</span></div>`
        : `<span class="barhint">베팅하거나 체크하세요</span>`;
      s.actions.forEach((a) => {
        const b = document.createElement('button');
        b.className = 'b-' + a.act;
        b.innerHTML = `<span class="blabel">${esc(a.name)}</span>` + (a.amount ? `<span class="bamt">${esc(a.amount)}</span>` : '');
        b.onclick = () => { window.send({ type: 'bet', act: a.act }); act.innerHTML = ''; barLeft.innerHTML = ''; };
        act.appendChild(b);
      });
    } else if (s.phase === 'playing') {
      barLeft.innerHTML = `<span class="barhint">상대 차례를 기다리는 중…</span>`;
    } else {
      barLeft.innerHTML = `<span class="barhint">${esc(streetTxt)}</span>`;
    }

    // ── 관전/재참가(펠트 아래) ──
    const mh = felt.querySelector('#pokerStatus');
    if (me) {
      mh.innerHTML = '';
    } else if (s.canRequestBuyin) {
      mh.innerHTML = '<div class="ms-line">💸 칩 부족 — 재참가 가능</div>';
      const b = document.createElement('button'); b.className = 'gold';
      b.textContent = `🙋 재참가 요청 (${won(s.buyinAmount)}칩으로)`;
      b.onclick = () => window.send({ type: 'requestBuyin' });
      mh.appendChild(b);
    } else if (s.buyinPending) {
      mh.innerHTML = '<div class="ms-line" style="color:var(--gold)">⏳ 재참가 요청됨 — 승인 대기…</div>';
    } else {
      mh.innerHTML = '<div class="ms-line" style="color:var(--muted)">👀 관전 중 — 다음 판 대기</div>';
    }

    const bbox = felt.querySelector('#buyinBox');
    if (bbox && s.iAmApprover && s.buyinRequests && s.buyinRequests.length) {
      bbox.innerHTML = '<div class="buyin-title">🙋 재참가 요청 — 승인 시 내 칩과 같은 ' + won(s.buyinAmount) + '칩으로 합류</div>';
      s.buyinRequests.forEach((nm) => {
        const row = document.createElement('div'); row.className = 'buyin-row';
        row.innerHTML = `<span>${esc(nm)}</span>`;
        const wrap = document.createElement('span');
        const okb = document.createElement('button'); okb.className = 'gold'; okb.textContent = '✅ 승인';
        okb.onclick = () => window.send({ type: 'approveBuyin', name: nm });
        const no = document.createElement('button'); no.className = 'danger'; no.style.marginLeft = '6px'; no.textContent = '❌ 거절';
        no.onclick = () => window.send({ type: 'rejectBuyin', name: nm });
        wrap.append(okb, no); row.appendChild(wrap); bbox.appendChild(row);
      });
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
    document.getElementById('leaveBtn').disabled = false;
    fitStage();
    if (window.scrollX !== _sx || window.scrollY !== _sy) window.scrollTo(_sx, _sy);
  };

  // 한 줄 카드 배치(>3장이면 겹침, 아니면 간격)
  function rowEl(cards, kind, cw, ch, p, intro) {
    const row = document.createElement('div');
    row.className = 'pcardrow ' + kind;
    const overlap = cards.length > 3 ? -Math.round(cw * 0.42) : 4;
    cards.forEach((c, j) => {
      const ce = cardEl(c, { w: cw, h: ch, win: p.win, hole: kind === 'hidden' && p.isMe && c && !c.hidden });
      if (j > 0) ce.style.marginLeft = overlap + 'px';
      if (intro) { ce.classList.add('deal'); ce.style.animationDelay = (300 + j * 90) + 'ms'; }
      row.appendChild(ce);
    });
    return row;
  }

  function seatEl(p, intro, topHalf) {
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
      if (hidden.length) area.appendChild(rowEl(hidden, 'hidden', cw, ch, p, intro));
    } else {
      // 상대: 모든 카드를 한 줄(일렬)로 — 히든 뒷면 + 오픈 앞면
      let cards = [];
      if (p.cards && p.cards.length) {
        const open = p.cards.filter((c) => c && c.up);
        const hidden = p.cards.filter((c) => !(c && c.up));
        cards = [...hidden, ...open];
      } else if (p.inHand) cards = [{ hidden: true }, { hidden: true }, { hidden: true }];
      if (cards.length) area.appendChild(rowEl(cards, 'flat', cw, ch, p, intro));
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
    if (p.handName) info = (p.win ? '🏆 ' : '') + p.handName;
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
      const reserveBottom = 80;
      const availH = window.innerHeight - topY - reserveBottom;
      let sc = Math.min(availW / fw, availH / fh, 1);
      sc = Math.max(sc, 0.3);
      felt.style.transform = `scale(${sc})`;
      stage.style.height = Math.ceil(fh * sc) + 'px';
      repositionBubbles();
    });
  }

  window.RENDERERS = window.RENDERERS || {};
  window.RENDERERS.poker = R;
})();
