// 오셀로 렌더러 — 클래식 우드보드 + 틸 패널 (디자인 핸드오프)
(function () {
  const R = {};
  let cells = [], myTurn = false, lastSeq = 0, firstState = true, timerInt = null, lastPassSeq = 0;
  let topName = '', botName = '';
  const AVATARS = ['🐼', '🦊', '🐯', '🐸', '🐵', '🦁', '🐺', '🐻', '🦝', '🐰', '🦉', '🐢'];
  function avatar(name) { let h = 0; const s = name || '?'; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return AVATARS[h % AVATARS.length]; }

  R.init = function (main, info) {
    main.innerHTML =
      '<div id="oTop" class="opanel"></div>' +
      '<div id="oResult"></div>' +
      '<div id="oBoardWrap"><div id="oFrame"><div class="ocorner tl"></div><div class="ocorner tr"></div><div class="ocorner bl"></div><div class="ocorner br"></div><div id="board"></div></div><div id="oToast"></div></div>' +
      '<div id="oBot" class="opanel"></div>' +
      '<div class="btnrow" id="oCtrl"></div>';
    info.innerHTML = '<h3>대기열 (승자 잔류 · 패자 후순위)</h3><div id="queue"></div>';
    const boardEl = document.getElementById('board');
    cells = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const cell = document.createElement('div');
      cell.className = 'ocell';
      cell.addEventListener('click', () => { if (myTurn) window.send({ type: 'move', r, c }); });
      boardEl.appendChild(cell); cells.push(cell);
    }
    lastSeq = 0; firstState = true; lastPassSeq = 0;
    window.onRoomChat = showOBubble;                 // 채팅 → 나무 말풍선
  };

  function panelHTML(s, seat, isMe) {
    const name = seat === 'B' ? (s.blackName || '흑') : (s.whiteName || '백');
    const color = seat === 'B' ? s.blackColor : s.whiteColor;
    const sc = seat === 'B' ? s.score.B : s.score.W;
    const isTurn = s.phase === 'playing' && s.turn === seat;
    const discCls = seat === 'B' ? 'black' : 'white';
    const sym = seat === 'B' ? '흑 ●' : '백 ○';
    let status;
    if (s.phase === 'finished') status = '대국 종료';
    else if (s.phase !== 'playing') status = '대기 중';
    else if (isTurn) status = isMe ? '🟢 내 차례 — 둘 곳 클릭' : '🟢 두는 중…';
    else status = '⏳ 대기 중';
    const prog = (isTurn && s.secondsLeft != null) ? Math.max(6, Math.min(100, Math.round(s.secondsLeft / 30 * 100))) : 0;
    return '<div class="olevel"><div class="olevelfill" style="width:' + prog + '%"></div></div>' +
      '<div class="oavatar" style="border-color:' + (color || '#ecc659') + '">' + avatar(name) + '</div>' +
      '<div class="oinfo"><div class="oname">' + window.esc(name) +
        ' <span class="osym ' + discCls + '">' + sym + (isMe ? ' (나)' : '') + '</span></div>' +
        '<div class="ostatus">' + status + '</div></div>' +
      '<div class="oscore"><span class="disc-mini ' + discCls + '"></span><span class="oscorenum">' + sc + '</span></div>';
  }

  R.render = function (s) {
    const $ = (id) => document.getElementById(id);
    const myRole = s.yourRole;
    myTurn = s.phase === 'playing' && myRole === s.turn;

    // 하단 = 내 좌석(관전이면 흑), 상단 = 상대
    const botSeat = myRole === 'W' ? 'W' : 'B';
    const topSeat = botSeat === 'B' ? 'W' : 'B';
    topName = topSeat === 'B' ? (s.blackName || '') : (s.whiteName || '');
    botName = botSeat === 'B' ? (s.blackName || '') : (s.whiteName || '');
    const oTop = $('oTop'), oBot = $('oBot');
    oTop.className = 'opanel' + (s.phase === 'playing' && s.turn === topSeat ? ' turn' : '');
    oBot.className = 'opanel' + (s.phase === 'playing' && s.turn === botSeat ? ' turn' : '');
    oTop.innerHTML = panelHTML(s, topSeat, myRole === topSeat);
    oBot.innerHTML = panelHTML(s, botSeat, myRole === botSeat);

    // 결과 배너
    const resEl = $('oResult');
    if (s.phase === 'finished') {
      const txt = s.winner === 'draw' ? '무승부' : ((s.winner === 'B' ? `흑(${s.blackName || '흑'})` : `백(${s.whiteName || '백'})`) + ' 승');
      resEl.innerHTML = '<span class="opill">🏆 ' + window.esc(txt) + ' · ' + s.score.B + ':' + s.score.W + '</span>';
    } else resEl.innerHTML = '';

    // 보드
    const lm = s.lastMove;
    const animate = lm && !firstState && lm.seq > lastSeq;
    const placedIdx = lm ? lm.placed.r * 8 + lm.placed.c : -1;
    const legalSet = new Set((s.legal || []).map(([r, c]) => r * 8 + c));
    for (let i = 0; i < 64; i++) {
      const v = s.board[Math.floor(i / 8)][i % 8];
      const cell = cells[i];
      cell.innerHTML = ''; cell.className = 'ocell';
      if (lm && i === placedIdx && v) cell.classList.add('last');   // 마지막 착수 금테
      if (v) {
        const d = document.createElement('div');
        d.className = 'disc ' + (v === 'B' ? 'black' : 'white');
        if (animate && i === placedIdx) d.classList.add('place');
        cell.appendChild(d);
      } else if (s.phase === 'playing' && legalSet.has(i)) {
        cell.classList.add(myTurn ? 'playable' : 'hint');           // 내턴=흰링 / 상대턴=상대 둘곳 점
      }
    }
    if (lm) lastSeq = lm.seq;
    firstState = false;

    setTimer(s.secondsLeft, myTurn, s.phase);

    // 둘 곳 없음(패스) → 판 가운데 나무판 토스트
    if (s.passSeq && s.passSeq !== lastPassSeq) {
      lastPassSeq = s.passSeq;
      if (s.passName) showOToast(s.passName + '님이 둘 곳이 없습니다');
    } else if (!s.passSeq) { lastPassSeq = 0; }

    // 컨트롤
    const ctrl = $('oCtrl'); ctrl.innerHTML = '';
    if (s.canStart) ctrl.appendChild(mkO('ostart', s.phase === 'finished' ? '다음 대국 시작' : '게임 시작', () => window.send({ type: 'start' })));
    else if (s.isHost && (s.phase === 'lobby' || s.phase === 'finished')) { const b = mkO('ostart', '상대 입장 대기 중', null); b.disabled = true; ctrl.appendChild(b); }
    if (s.canResign) ctrl.appendChild(mkO('danger', '기권', () => { if (confirm('기권하시겠습니까?')) window.send({ type: 'resign' }); }));
    if (s.canDefer) ctrl.appendChild(mkO('sub', '순위 미루기', () => window.send({ type: 'defer' })));
    document.getElementById('leaveBtn').disabled = s.canResign;

    // 대기열(사이드바)
    const q = $('queue'); q.innerHTML = '';
    s.queue.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'qrow' + (i === s.yourQueueIndex ? ' me' : '') + (i < 2 ? ' play' : '');
      const num = i < 2 ? '▶' : (i - 1);
      const tag = p.seat === 'B' ? '<span class="tag b">흑 ●</span>' : p.seat === 'W' ? '<span class="tag w">백 ○</span>'
        : p.seat === 'next' ? '<span class="tag">다음 대국</span>' : `<span class="tag">대기 ${i - 1}</span>`;
      const hostTag = p.host ? '<span class="tag host">방장</span>' : '';
      row.innerHTML = `<span class="qnum">${num}</span><span class="qname" style="color:${p.color || '#e8eaed'}">${window.esc(p.name)}</span>${tag}${hostTag}`;
      q.appendChild(row);
    });
  };

  function mkO(cls, label, onClick) {
    const b = document.createElement('button');
    if (cls) b.className = cls;
    b.textContent = label;
    if (onClick) b.onclick = onClick;
    return b;
  }

  function showOToast(text) {
    const host = document.getElementById('oToast');
    if (!host) return;
    host.textContent = text;
    host.className = 'show';
    clearTimeout(host._t);
    host._t = setTimeout(() => { host.className = ''; }, 2200);
  }

  // 채팅 → 보낸 사람 패널 위 나무 말풍선 (없으면 하단)
  function showOBubble(name, text) {
    const host = document.getElementById(name && name === topName ? 'oTop' : 'oBot');
    if (!host) return;
    const b = document.createElement('div');
    b.className = 'obubble';
    b.textContent = text;
    host.appendChild(b);
    setTimeout(() => { b.classList.add('out'); }, 2800);
    setTimeout(() => { if (b.parentNode) b.remove(); }, 3200);
  }

  function setTimer(secs, mine, phase) {
    if (timerInt) { clearInterval(timerInt); timerInt = null; }
    if (phase !== 'playing' || secs == null) return;
    // 타이머는 패널 레벨바로 표현되므로 별도 텍스트 없음 (레벨바는 render마다 갱신)
  }

  window.RENDERERS = window.RENDERERS || {};
  window.RENDERERS.othello = R;
})();
