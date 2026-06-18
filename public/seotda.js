// 섯다 렌더러 — 실제 화투패 모양 + 섞기/딜링 연출 + 베팅 UI
(function () {
  const R = {};
  const esc = (x) => window.esc(x);
  // 큰 금액을 억/만 단위로 읽기 쉽게 — 100억, 1억 5,000만, 1,000만, 2,500
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
  // 현금 다발 1개(띠지·세로액면) HTML — 더미/날아가는돈 공용
  function billHTML(type, posStyle) {
    const numer = type === 'oman' ? '50000' : '10000';
    return `<span class="wbill ${type}" style="${posStyle}"><span class="strap"><i>${numer}</i></span></span>`;
  }

  // 실제 화투 20장(이미지 기준). 'm-v' 키. v0=윗패(광/열끗/그림), v1=아랫패(띠/피)
  const PNAME = { 1: '송학', 2: '매조', 3: '벚꽃', 4: '흑싸리', 5: '난초', 6: '모란', 7: '홍싸리', 8: '공산', 9: '국화', 10: '단풍' };
  const CARD = {
    '1-0':  { c: '#b3402f', art: '🕊️', gwang: true },                 // 1광 학
    '1-1':  { c: '#1d6b41', art: '🌲', ribbon: '홍단', rc: '#c0392b' },
    '2-0':  { c: '#9c3b66', art: '🐦' },                              // 매조
    '2-1':  { c: '#9c3b66', art: '🌺', ribbon: '홍단', rc: '#c0392b' },
    '3-0':  { c: '#d05a8e', art: '🌸', gwang: true },                 // 3광
    '3-1':  { c: '#d05a8e', art: '🌸', ribbon: '홍단', rc: '#c0392b' },
    '4-0':  { c: '#2b2f36', art: '🐦', pic: true },                   // 그림4(두견)
    '4-1':  { c: '#2b2f36', art: '🍃', ribbon: '', rc: '#c0392b' },   // 띠4
    '5-0':  { c: '#5a3aa0', art: '🌷' },                              // 난초
    '5-1':  { c: '#5a3aa0', art: '🌿', ribbon: '', rc: '#c0392b' },
    '6-0':  { c: '#a01b3a', art: '🦋' },                              // 모란 나비
    '6-1':  { c: '#a01b3a', art: '🌹', ribbon: '청단', rc: '#2f6fd0' },
    '7-0':  { c: '#7a1f1f', art: '🐗' },                              // 홍싸리 멧돼지
    '7-1':  { c: '#7a1f1f', art: '🌾', ribbon: '', rc: '#c0392b' },
    '8-0':  { c: '#243b6b', art: '🌕', gwang: true },                 // 8광 보름달
    '8-1':  { c: '#243b6b', art: '🐦' },                              // 8피 기러기
    '9-0':  { c: '#9a7d0a', art: '🍶' },                              // 국준
    '9-1':  { c: '#9a7d0a', art: '🌼', ribbon: '청단', rc: '#2f6fd0' },
    '10-0': { c: '#a8431a', art: '🦌' },                              // 단풍 사슴
    '10-1': { c: '#a8431a', art: '🍁', ribbon: '청단', rc: '#2f6fd0' },
  };
  const ck = (c) => c.m + '-' + c.v;
  const isG = (c) => (c.m === 1 || c.m === 3 || c.m === 8) && c.v === 0;

  // 실제 화투 이미지(public/cards/m-v.png) 사용
  function cardEl(card, o) {
    o = o || {};
    const d = document.createElement('div');
    d.className = 'hwatu' + (o.sm ? ' sm' : '') + (o.med ? ' med' : '') + (o.win ? ' win' : '');
    if (!card) { d.classList.add('back'); return d; }
    d.classList.add('img');
    const img = document.createElement('img');
    img.src = 'cards/' + card.m + '-' + card.v + '.png';
    img.alt = (PNAME[card.m] || '') + ' ' + card.m + '월';
    img.draggable = false;
    d.appendChild(img);
    return d;
  }
  function applyDeal(el, intro, seatIdx, cardIdx, n) {
    if (!intro) return;
    el.classList.add('deal');                       // 라운드로빈: (1바퀴 전원)→(2바퀴 전원)
    el.style.animationDelay = (820 + (cardIdx * n + seatIdx) * 150) + 'ms';
  }

  // 내 패 족보(표시용) — 서버 판정과 동일 규칙(표 기준). 서버가 최종 심판.
  const kkut = (a, b) => (a + b) % 10;
  function evalLocal(cards) {
    const [a, b] = cards;
    const ms = [a.m, b.m].sort((x, y) => x - y).join(',');
    const gboth = isG(a) && isG(b);
    const has = (m, v) => ck(a) === `${m}-${v}` || ck(b) === `${m}-${v}`;
    const hasM = (m) => a.m === m || b.m === m;
    if (gboth && ms === '3,8') return '38광땡';
    if (gboth && ms === '1,8') return '18광땡';
    if (gboth && ms === '1,3') return '13광땡';
    if (a.m === b.m) return a.m === 10 ? '장땡' : a.m + '땡';
    if (has(4, 0) && has(7, 0)) return '암행어사';
    if (has(3, 0) && has(7, 0)) return '땡잡이';
    if (has(4, 0) && has(9, 0)) return '멍텅구리구사';
    if (hasM(4) && hasM(9)) return '구사';
    const named = { '1,2': '알리', '1,4': '독사', '1,9': '구삥', '1,10': '장삥', '4,10': '장사', '4,6': '세륙' };
    if (named[ms]) return named[ms];
    const k = kkut(a.m, b.m);
    return k === 9 ? '갑오(9끗)' : k === 0 ? '망통(0끗)' : k + '끗';
  }

  // 족보표(사이드바 상시 표시) — 카드 이미지 조합
  const JOKBO = [
    { cat: '광땡' },
    { n: '삼팔광땡', c: ['3-0', '8-0'], d: '무조건 이김 (최강)', hi: 1 },
    { n: '일팔광땡', c: ['1-0', '8-0'], d: '암행어사에게 짐' },
    { n: '일삼광땡', c: ['1-0', '3-0'], d: '암행어사에게 짐' },
    { cat: '땡' },
    { n: '장땡(10땡)', c: ['10-0', '10-1'], d: '땡잡이에게 <b>이김</b>' },
    { n: '9땡~1땡', c: ['9-0', '9-1'], d: '같은 월 2장 · 땡잡이에게 짐 · 9땡↓ 멍구사 재대결' },
    { cat: '중간 족보' },
    { n: '알리', c: ['1-0', '2-0'], d: '알리 이하는 구사와 재대결' },
    { n: '독사', c: ['1-0', '4-1'], d: '' },
    { n: '구삥', c: ['1-0', '9-1'], d: '' },
    { n: '장삥', c: ['1-0', '10-1'], d: '' },
    { n: '장사', c: ['4-1', '10-1'], d: '' },
    { n: '세륙', c: ['4-1', '6-1'], d: '' },
    { cat: '끗' },
    { n: '갑오(9끗)', c: ['4-1', '5-0'], d: '두 월 합의 일의 자리 (예 4+5=9끗)' },
    { n: '망통(0끗)', c: ['2-0', '8-1'], d: '합의 일의자리 0 — 가장 약함' },
    { cat: '특수 족보' },
    { n: '암행어사', c: ['4-0', '7-0'], d: '일삼·일팔광땡에게 <b>이김</b> · 그 외 1끗' },
    { n: '땡잡이', c: ['3-0', '7-0'], d: '1~9땡에게 <b>이김</b> (장땡 못 잡음)' },
    { n: '구사', c: ['4-1', '9-0'], d: '알리 이하 족보와 재대결' },
    { n: '멍구사', c: ['4-0', '9-0'], d: '9땡 이하 족보와 재대결' },
  ];
  function jokboTableHTML() {
    const legend = '<div class="jlegend">⬆ 위로 갈수록 강함</div>';
    const rows = JOKBO.map((r) => r.cat
      ? `<div class="jcat">${r.cat}</div>`
      : `<div class="jrow${r.hi ? ' hi' : ''}">` +
        `<div class="jcc">${r.c.map((k) => `<img src="cards/${k}.png" alt="">`).join('')}</div>` +
        `<div class="jt"><div class="jn">${r.n}</div>${r.d ? `<div class="jd">${r.d}</div>` : ''}</div></div>`
    ).join('');
    return legend + '<div class="jlist">' + rows + '</div>';
  }

  let timerInt = null, lastHandId = 0, wasMyTurn = false, prevActs = {}, seatByName = {}, lastCarrySeq = null;

  // 채팅 말풍선 — 보낸 사람 좌석에 고정(재렌더돼도 그 좌석 따라감)
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
    el.className = 'chat-bubble';
    el.textContent = text;
    document.body.appendChild(el);
    const b = { name, el };
    positionBubble(b);
    activeBubbles.push(b);
    setTimeout(() => el.classList.add('out'), 3400);
    setTimeout(() => { el.remove(); activeBubbles = activeBubbles.filter((x) => x !== b); }, 3800);
  }

  function showTurnToast() {
    const felt = document.getElementById('seotdaFelt');
    const t = document.createElement('div');
    t.className = 'turn-toast';
    t.textContent = '🟢 당신 차례!';
    if (felt) {                                    // 게임판(felt) 중앙 — 페이지 기준(스크롤 따라감)
      const r = felt.getBoundingClientRect();
      t.style.left = (r.left + r.width / 2 + window.scrollX) + 'px';
      t.style.top = (r.top + r.height / 2 + window.scrollY) + 'px';
    }
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('out'), 950);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 1300);
  }

  // 동점/재경기 이월 → 판 가운데 "묻고 더블로 가!" 밈 토스트
  function showCarryToast() {
    const felt = document.getElementById('seotdaFelt');
    const t = document.createElement('div');
    t.className = 'carry-toast';
    t.innerHTML = '<img src="carry.jpeg" alt="묻고 더블로 가!" draggable="false">';
    if (felt) {
      const r = felt.getBoundingClientRect();
      t.style.left = (r.left + r.width / 2 + window.scrollX) + 'px';
      t.style.top = (r.top + r.height / 2 + window.scrollY) + 'px';
    }
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('out'), 1700);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 2100);
  }

  // 좌석 칸 가운데에 "어떤 베팅을 했는지" 토스트 팝(색 구분)
  function showActToast(seatEl, act) {
    if (!seatEl) return;
    const r = seatEl.getBoundingClientRect();
    const t = document.createElement('div');
    t.className = 'act-toast ab-' + actCls(act);
    t.textContent = act;
    t.style.left = (r.left + r.width / 2 + window.scrollX) + 'px';
    t.style.top = (r.top + r.height / 2 + window.scrollY) + 'px';
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('out'), 650);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 950);
  }

  // 베팅 시 그 좌석 → 가운데로 지폐 던지는 연출
  function showMoneyThrow(seatEl) {
    const pot = document.getElementById('potCenter');
    if (!seatEl || !pot) return;
    const r1 = seatEl.getBoundingClientRect(), r2 = pot.getBoundingClientRect();
    for (let i = 0; i < 3; i++) {
      const bill = document.createElement('div');
      bill.className = 'money-fly wbill ' + (i === 1 ? 'oman' : 'man');
      bill.innerHTML = '<span class="strap"><i>' + (i === 1 ? '50000' : '10000') + '</i></span>';
      const sx = r1.left + r1.width / 2, sy = r1.top + r1.height / 2;
      bill.style.left = (sx + window.scrollX) + 'px'; bill.style.top = (sy + window.scrollY) + 'px';
      bill.style.setProperty('--dx', (r2.left + r2.width / 2 - sx) + 'px');   // 델타라 스크롤 무관
      bill.style.setProperty('--dy', (r2.top + r2.height / 2 - sy) + 'px');
      bill.style.animationDelay = (i * 70) + 'ms';
      document.body.appendChild(bill);
      setTimeout(() => { if (bill.parentNode) bill.remove(); }, 700 + i * 70);
    }
  }
  const MONEY_ACTS = ['콜', '삥', '따당', '하프', '풀', '올인'];

  R.init = function (main, info) {
    main.innerHTML = '<div id="seotdaStage"><div id="seotdaFelt"><div id="seotdaInner"></div></div></div>';
    if (!window._seotdaFitBound) { window.addEventListener('resize', fitStage); window._seotdaFitBound = true; }
    info.innerHTML = '<div id="seotdaWait"></div>' +
      '<button id="jokboToggle" class="sub" style="width:100%;margin-top:6px">📖 족보 보기</button>' +
      '<div id="jokboPanel" style="display:none;margin-top:8px">' + jokboTableHTML() + '</div>';
    const tg = document.getElementById('jokboToggle');
    const panel = document.getElementById('jokboPanel');
    if (tg && panel) tg.onclick = () => {
      const open = panel.style.display === 'none';
      panel.style.display = open ? 'block' : 'none';
      tg.textContent = open ? '📖 족보 숨기기' : '📖 족보 보기';
    };
    lastHandId = 0; wasMyTurn = false; seatByName = {}; lastCarrySeq = null;
    window.onRoomChat = showChatBubble;              // 방 채팅 → 좌석 말풍선
  };

  R.render = function (s) {
    const felt = document.getElementById('seotdaFelt');
    if (!felt) return;
    const inner = felt.querySelector('#seotdaInner') || felt;
    const _sx = window.scrollX, _sy = window.scrollY;   // 렌더(판 다시 그림)로 인한 스크롤 튐 방지
    const sub = document.getElementById('roomSub');     // 방정보 밑 점당/시작칩
    if (sub) sub.textContent = `점당 ${won(s.ante)} · 시작 ${won(s.startChips)}`;
    const intro = s.phase === 'playing' && s.handId && s.handId !== lastHandId;
    if (s.phase === 'playing') lastHandId = s.handId;

    const n = s.players.length || 1;
    const me = s.players.find((p) => p.isMe);

    inner.innerHTML =
      '<div class="inkmotif tl">梅</div><div class="inkmotif br">蘭</div>' +
      '<div id="seotdaResult"></div>' +
      '<div id="seotdaTable"><div id="potCenter"></div></div>' +
      '<div id="myStatus"></div>' +
      '<div id="seotdaActions"></div>' +
      '<div id="buyinBox"></div>';

    // 중앙 판돈 — 돈 쌓이는 느낌
    const potC = felt.querySelector('#potCenter');
    // 가운데 돈다발 더미 — 판돈 커질수록 다발이 늘어남. man=만원 / oman=오만원 (밀집·겹침)
    const BILLS = [
      [-20, -8, -10, 'man'], [4, -15, 16, 'oman'], [-7, -3, -3, 'man'], [16, -9, -20, 'man'],
      [-17, 1, 26, 'oman'], [1, 3, 7, 'man'], [19, 4, -13, 'oman'], [-5, 9, 19, 'man'],
      [11, 11, -7, 'man'], [-2, -3, 38, 'oman'], [22, -1, 5, 'man'], [-22, 8, -18, 'oman'],
    ];
    const pot = s.pot || 0;
    const piles = pot > 0 ? Math.min(BILLS.length, 1 + Math.floor(pot / Math.max(1, s.ante))) : 0;  // 판돈 0이면 다발 없음
    let stack = '';
    for (let i = 0; i < piles; i++) { const b = BILLS[i]; stack += billHTML(b[3], `left:calc(50% + ${b[0]}px);top:calc(50% + ${b[1]}px);transform:translate(-50%,-50%) rotate(${b[2]}deg)`); }
    potC.innerHTML =
      (piles ? `<div class="potpile">${stack}</div>` : '') +
      `<div class="potamt">₩ ${won(pot)}</div>` +
      `<div class="potlabel">판돈 POT</div>` +
      ((s.carryPot > 0 && s.phase === 'playing') ? `<div class="potsub">묻힌 ${won(s.carryPot)}</div>` : '') +
      (s.secondsLeft != null ? `<div class="pottimer" id="sTimer">⏱ ${s.secondsLeft}초</div>` : '') +
      `<div id="potCtrl"></div>`;

    // 좌석 — 나는 6시(하단 중앙) 고정, 나머지는 시계방향. 인원별 배치(5인은 양옆 끝에 2명씩)
    const LAYOUTS = {                                  // [left%, top%], 나 다음(시계방향). 윗줄은 카드가 판 위로 안 넘치게 18%+
      2: [[50, 17]],
      3: [[15, 18], [85, 18]],
      4: [[13, 50], [50, 17], [87, 50]],
      5: [[13, 60], [13, 17], [87, 17], [87, 60]],   // 좌(상·하)·우(상·하)
    };
    const table = felt.querySelector('#seotdaTable');
    const myIdx = me ? s.players.indexOf(me) : -1;
    const orderedSeated = myIdx >= 0 ? s.players.slice(myIdx).concat(s.players.slice(0, myIdx)) : s.players.slice();
    // 빈 자리에 대기 인원을 '대기중'으로 채움(최대 5칸)
    const slots = Math.max(0, 5 - orderedSeated.length);
    const waitList = (s.waiting || []).filter((w) => w.name !== s.yourName).slice(0, slots)
      .map((w) => ({ name: w.name, color: w.color, chips: w.chips, waiting: true, bankrupt: w.chips < s.ante }));
    const ordered = orderedSeated.concat(waitList);
    const N = ordered.length || 1;
    const dealN = s.players.length || 1;
    const lay = (myIdx >= 0 && LAYOUTS[N]) ? LAYOUTS[N] : null;
    seatByName = {};
    ordered.forEach((p, k) => {
      const el = seatEl(p, s.players.indexOf(p), intro, dealN);
      let L, T;
      if (k === 0 && myIdx >= 0) { L = 50; T = 83; }                 // 나 = 6시(하단)
      else if (lay) { L = lay[k - 1][0]; T = lay[k - 1][1]; }
      else { const a = (2 * Math.PI / N) * k; L = 50 - 39 * Math.sin(a); T = 50 + 37 * Math.cos(a); }
      el.style.left = L + '%'; el.style.top = T + '%';
      table.appendChild(el);
      seatByName[p.name] = el;
    });
    repositionBubbles();                             // 떠 있는 말풍선을 새 좌석 위치로 고정
    // 새 베팅 감지 → 그 사람 좌석에 토스트
    if (intro) { prevActs = {}; s.players.forEach((p) => { prevActs[p.name] = p.act || null; }); }
    else {
      s.players.forEach((p) => {
        if (p.act && prevActs[p.name] !== p.act) {
          showActToast(seatByName[p.name], p.act);
          if (MONEY_ACTS.includes(p.act)) showMoneyThrow(seatByName[p.name]);   // 돈 던지는 연출
        }
        prevActs[p.name] = p.act || null;
      });
    }

    // 결과 / 단계 배너
    const res = felt.querySelector('#seotdaResult');
    if (s.needRestart) {
      res.textContent = s.canRestartGame ? '💀 한 명 빼고 전원 파산 — 당신이 승리! 게임을 재시작하세요'
        : '💀 한 명 빼고 전원 파산 — 승리자의 재시작을 기다리는 중…';
    } else if (s.stage === 'redeal') {
      res.innerHTML = `🔁 <b>구사·멍구사</b> — ${(s.redealerNames || []).map(esc).join(', ')}님 재경기 결정 중…`;
    } else if (s.stage === 'rejoin') {
      res.innerHTML = `🔁 재경기! 다이했던 분은 절반 ${won(s.rejoinCost)} 내면 합류 — 묻힌 판돈 💵${won(s.carryPot || 0)}`;
    } else if (s.result && s.result.tie) {
      const names = s.result.winners.map((w) => esc(w.name)).join(', ');
      res.textContent = `🤝 동점 (${names}) — 판돈 ${won(s.result.pot)} 묻고 다음 판으로 이월!`;
    } else if (s.result) {
      const names = s.result.winners.map((w) => esc(w.name)).join(', ');
      res.textContent = `🏆 ${names} — 판돈 ${won(s.result.pot)} 획득` + (s.result.sole ? ' (단독, 비공개)' : '');
    }

    // 내 상태 (내가 자리에 없을 때만: 관전/재참가 안내. 앉아있으면 내 좌석에 패 표시)
    const mh = felt.querySelector('#myStatus');
    if (me) {
      mh.innerHTML = '';
    } else if (s.canRequestBuyin) {
      mh.innerHTML = '<div class="ms-line">💸 칩 부족 — 재참가 가능</div>';
      const b = document.createElement('button'); b.className = 'gold';
      b.textContent = `🙋 재참가 요청 (${won(s.buyinAmount)}칩으로)`;
      b.onclick = () => window.send({ type: 'requestBuyin' });
      mh.appendChild(b);
    } else if (s.buyinPending) {
      mh.innerHTML = '<div class="ms-line" style="color:var(--gold)">⏳ 재참가 요청됨 — 칩 최소 보유자 승인 대기…</div>';
    } else {
      mh.innerHTML = '<div class="ms-line" style="color:var(--muted)">👀 관전 중 — 다음 판을 기다려요</div>';
    }

    // 액션 버튼 (베팅 / 재경기 / 합류) — 2줄(액션명 + 금액)
    const act = felt.querySelector('#seotdaActions');
    const mkBtn = (cls, name, amount, send) => {
      const b = document.createElement('button');
      b.className = cls;
      b.innerHTML = `<span class="blabel">${esc(name)}</span>` + (amount ? `<span class="bamt">${esc(amount)}</span>` : '');
      b.onclick = () => { send(); act.innerHTML = ''; };
      act.appendChild(b);
    };
    if (s.canRedeal) {
      mkBtn('b-raise', '🔁 재경기 선언', null, () => window.send({ type: 'redeal' }));
      mkBtn('b-call', '그냥 끝내기', '정산', () => window.send({ type: 'passRedeal' }));
    } else if (s.canRejoin) {
      mkBtn('b-allin', '합류', '절반 ' + won(s.rejoinCost), () => window.send({ type: 'rejoin' }));
      mkBtn('b-die', '빠지기', null, () => window.send({ type: 'passRejoin' }));
    } else if (s.myTurn && s.actions) {
      s.actions.forEach((a) => {
        mkBtn('b-' + a.act, a.name || a.label, a.amount, () => window.send({ type: 'bet', act: a.act }));   // 종류별 색 구분
      });
    }

    // 시작 컨트롤 — 가운데(돈 더미 자리)에 표시
    const ctrl = felt.querySelector('#potCtrl');
    const auto = s.autoStartIn != null ? ` (${s.autoStartIn}초 후 자동)` : '';
    if (s.needRestart) {                              // 1명 빼고 다 파산 → 승리자가 재시작
      const b = document.createElement('button');
      if (s.canRestartGame) {
        b.className = 'gold'; b.textContent = '🔄 게임 재시작하기';
        b.onclick = () => window.send({ type: 'restartGame' });
      } else { b.disabled = true; b.textContent = '승리자의 게임 재시작 대기 중…'; }
      ctrl.appendChild(b);
    } else if (s.canStart) {
      const b = document.createElement('button');
      b.textContent = (s.phase === 'finished' ? '다음 판 시작' : '게임 시작') + auto;
      b.onclick = () => window.send({ type: 'start' });
      ctrl.appendChild(b);
    } else if (s.isHost && s.phase !== 'playing') {
      const b = document.createElement('button'); b.disabled = true; b.textContent = '2명 이상 필요 (칩 ≥ 앤티)';
      ctrl.appendChild(b);
    } else if (s.autoStartIn != null) {
      const b = document.createElement('button'); b.disabled = true; b.textContent = `다음 판 ${s.autoStartIn}초 후 시작…`;
      ctrl.appendChild(b);
    }
    document.getElementById('leaveBtn').disabled = false;
    window.leaveConfirm = (s.phase === 'playing' && me) ? '판 진행 중 나가면 다이(기권) 처리됩니다. 나가시겠어요?' : null;

    // 재참가 승인/거절 박스 (칩 최소 보유자에게만)
    const bbox = felt.querySelector('#buyinBox');
    if (bbox && s.iAmApprover && s.buyinRequests && s.buyinRequests.length) {
      bbox.innerHTML = '<div class="buyin-title">🙋 재참가 요청 — 승인하면 내 칩과 같은 ' + won(s.buyinAmount) + '칩으로 합류</div>';
      s.buyinRequests.forEach((nm) => {
        const row = document.createElement('div'); row.className = 'buyin-row';
        row.innerHTML = `<span>${esc(nm)}</span>`;
        const wrap = document.createElement('span');
        const ok = document.createElement('button'); ok.className = 'gold'; ok.textContent = '✅ 승인';
        ok.onclick = () => window.send({ type: 'approveBuyin', name: nm });
        const no = document.createElement('button'); no.className = 'danger'; no.style.marginLeft = '6px'; no.textContent = '❌ 거절';
        no.onclick = () => window.send({ type: 'rejectBuyin', name: nm });
        wrap.append(ok, no); row.appendChild(wrap); bbox.appendChild(row);
      });
    }

    // 내 차례 강조: 판 테두리 번쩍 + 중앙 토스트(직전엔 아니었다가 내 차례가 됨)
    felt.classList.toggle('myturn', !!s.myTurn);
    if (s.myTurn && !wasMyTurn) showTurnToast();
    wasMyTurn = !!s.myTurn;

    // 동점/재경기 이월 발생 → "묻고 더블로 가!" 토스트(첫 진입 땐 안 띄움)
    if (lastCarrySeq !== null && (s.carrySeq || 0) > lastCarrySeq) showCarryToast();
    lastCarrySeq = s.carrySeq || 0;

    // 대기/관전자
    const wait = document.getElementById('seotdaWait');
    if (wait) {
      const overflow = (s.waiting || []).slice(waitList.length);    // 테이블에 못 올라간 초과 대기열
      if (overflow.length) {
        wait.innerHTML = '<h3>대기열</h3>' + overflow.map((w) =>
          `<div class="qrow"><span class="qname" style="color:${w.color}">${esc(w.name)}</span>` +
          `<span class="tag">${w.willSit ? '다음 판 합류' : '대기열'}</span>` +
          `<span class="ch" style="color:var(--gold);font-size:12px">${won(w.chips)}</span></div>`).join('');
      } else wait.innerHTML = '';
    }

    // 타이머 카운트다운
    startTimer(s.secondsLeft);

    // 섞기 연출
    if (intro) playShuffle(felt);

    fitStage();                                      // 고정 판을 화면에 맞춰 스케일(말풍선 재고정 포함)

    // 스크롤 위치 복원(베팅 등으로 판 다시 그려도 화면 안 튀게)
    if (window.scrollX !== _sx || window.scrollY !== _sy) window.scrollTo(_sx, _sy);
  };

  // 고정 크기 felt를 가용 공간에 맞춰 통째로 scale (어떤 기기서든 동일 비율·겹침 없음)
  let _fitRAF = 0;
  function fitStage() {
    if (_fitRAF) return;
    _fitRAF = requestAnimationFrame(() => {
      _fitRAF = 0;
      const stage = document.getElementById('seotdaStage');
      const felt = document.getElementById('seotdaFelt');
      if (!stage || !felt || stage.offsetParent === null) return;   // 숨김 상태면 skip
      felt.style.transform = 'none';                                 // 자연 크기 측정
      const fw = felt.offsetWidth || 720;
      const fh = felt.offsetHeight;
      if (!fh) return;
      const availW = stage.clientWidth;
      const topY = stage.getBoundingClientRect().top;                // 뷰포트 기준 stage 상단
      const reserveBottom = 92;                                      // 하단 채팅바+여백 확보
      const availH = window.innerHeight - topY - reserveBottom;
      let s = Math.min(availW / fw, availH / fh, 1.12);              // 가로·세로 중 작은 쪽, 과확대 방지
      s = Math.max(s, 0.35);
      felt.style.transform = `scale(${s})`;
      stage.style.height = Math.ceil(fh * s) + 'px';                 // 스케일된 높이만큼 자리 차지 → 채팅 정상 흐름
      repositionBubbles();                                          // 스케일 반영된 좌석 위치로 말풍선 재고정
    });
  }

  // 베팅 종류별 색 구분용 클래스 suffix (한글 라벨 → 코드)
  function actCls(a) {
    return { '체크': 'check', '삥': 'ping', '콜': 'call', '따당': 'ddang', '쿼터': 'quarter', '하프': 'half', '풀': 'full', '올인': 'allin', '맥스': 'allin', '다이': 'die' }[a] || 'call';
  }
  function seatEl(p, dealIdx, intro, n) {
    const big = true;                                // 모든 좌석 동일 크기(큰 카드)
    const el = document.createElement('div');
    if (p.waiting) {                                 // 빈 자리: 대기중(칩 있음) 또는 파산(칩 부족)
      el.className = 'seat waiting' + (p.bankrupt ? ' bust' : '');
      el.innerHTML =
        `<div class="cards"><span class="emptycard">${p.bankrupt ? '💸' : '🪑'}</span></div>` +
        `<div class="namebar"><span class="nm" style="color:${p.color}">${esc(p.name)}</span></div>` +
        `<div class="ch">💵 ${won(p.chips)}</div>` +
        `<div class="hd"><span class="stag ${p.bankrupt ? 'bust' : 'wait'}">${p.bankrupt ? '파산' : '대기중'}</span></div>`;
      return el;
    }
    el.className = 'seat' + (p.isMe ? ' me' : '') + (p.isTurn ? ' turn' : '') + (p.folded ? ' folded' : '') + (p.win ? ' win' : '');
    const tags = (p.host ? '<span class="stag host">방장</span>' : '') +
      (p.allin ? '<span class="stag allin">올인</span>' : '') +
      (p.folded ? '<span class="stag die">다이</span>' : '');
    const actBadge = (p.act && !p.folded) ? `<span class="actbadge ab-${actCls(p.act)}">${p.act}</span>` : '';
    const hd = p.handName || (p.isMe && p.cards ? evalLocal(p.cards) : '');
    el.innerHTML =
      `<div class="cards"></div>` +
      (actBadge ? `<div class="betrow">${actBadge}${p.contrib ? '<span class="betc">+' + won(p.contrib) + '</span>' : ''}</div>` : (p.contrib ? `<div class="betrow"><span class="betc">+${won(p.contrib)}</span></div>` : '<div class="betrow"></div>')) +
      `<div class="namebar"><span class="nm" style="color:${p.color}">${esc(p.name)}</span>${tags}</div>` +
      `<div class="ch">💵 ${won(p.chips)}</div>` +
      `<div class="hd">${(p.win ? '🏆 ' : '') + hd}</div>`;
    const cw = el.querySelector('.cards');
    if (p.cards) {
      p.cards.forEach((c, j) => { const ce = cardEl(c, { win: p.win }); applyDeal(ce, intro, dealIdx, j, n); cw.appendChild(ce); });
    } else if (p.inHand) {
      for (let j = 0; j < 2; j++) { const ce = cardEl(null, {}); applyDeal(ce, intro, dealIdx, j, n); cw.appendChild(ce); }
    }
    return el;
  }

  function startTimer(secs) {
    if (timerInt) { clearInterval(timerInt); timerInt = null; }
    if (secs == null) return;
    let s = secs;
    timerInt = setInterval(() => {
      s = Math.max(0, s - 1);
      const el = document.getElementById('sTimer');
      if (!el) { clearInterval(timerInt); timerInt = null; return; }
      el.textContent = '⏱ ' + s + '초';
      if (s <= 0) { clearInterval(timerInt); timerInt = null; }
    }, 1000);
  }

  function playShuffle(felt) {
    const fx = document.createElement('div');
    fx.id = 'shuffleFx';
    fx.innerHTML = '<div class="deck"><div class="sc"></div><div class="sc"></div><div class="sc"></div><div class="sc"></div><div class="sc"></div></div><div class="lbl">섞는 중…</div>';
    felt.appendChild(fx);
    requestAnimationFrame(() => fx.classList.add('go'));
    setTimeout(() => { fx.classList.add('fade'); }, 820);
    setTimeout(() => { if (fx.parentNode) fx.remove(); }, 1080);
  }

  window.RENDERERS = window.RENDERERS || {};
  window.RENDERERS.seotda = R;
})();
