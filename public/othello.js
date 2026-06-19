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
      '<div id="oBoardWrap"><div id="oFrame"><div class="ocorner tl"></div><div class="ocorner tr"></div><div class="ocorner bl"></div><div class="ocorner br"></div><div id="board"></div></div><div id="oToast"></div><div id="oWinPanel"></div></div>' +
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
        '<div class="ostatus">' + status + (isTurn && s.secondsLeft != null ? ' <span class="osecs">' + s.secondsLeft + '초</span>' : '') + '</div></div>' +
      '<div class="oscore"><span class="disc-mini ' + discCls + '"></span><span class="oscorenum">' + sc + '</span></div>';
  }

  R.render = function (s) {
    const $ = (id) => document.getElementById(id);
    const myRole = s.yourRole;
    // 내 색은 닉네임 기준으로 판별 — yourRole은 판 종료 시 'seated'로 바뀌어 좌석이 뒤집히는 버그가 있어 사용 X
    const myName = s.yourName;
    const myColor = myName && myName === s.blackName ? 'B' : (myName && myName === s.whiteName ? 'W' : null);
    myTurn = s.phase === 'playing' && myColor != null && myColor === s.turn;

    // 하단 = 항상 내 좌석(내 색 고정, 관전이면 흑), 상단 = 상대
    const botSeat = myColor === 'W' ? 'W' : 'B';
    const topSeat = botSeat === 'B' ? 'W' : 'B';
    topName = topSeat === 'B' ? (s.blackName || '') : (s.whiteName || '');
    botName = botSeat === 'B' ? (s.blackName || '') : (s.whiteName || '');
    const oTop = $('oTop'), oBot = $('oBot');
    const danger = myTurn && s.secondsLeft != null && s.secondsLeft <= 5;   // 내 차례 5초 이하 → 빨강 번쩍
    oTop.className = 'opanel' + (s.phase === 'playing' && s.turn === topSeat ? ' turn' : '');
    oBot.className = 'opanel' + (s.phase === 'playing' && s.turn === botSeat ? ' turn' : '') + (danger ? ' danger' : '');
    oTop.innerHTML = panelHTML(s, topSeat, myColor === topSeat);
    oBot.innerHTML = panelHTML(s, botSeat, myColor === botSeat);

    // 결과 — 판 위에 승리/패배/관전 패널 (관점별)
    const resEl = $('oResult');
    const winPanel = $('oWinPanel');
    if (s.phase === 'finished') {
      // myColor(닉네임 기준, 위에서 계산) → 승자/패자/관전 구분
      const winnerName = s.winner === 'B' ? (s.blackName || '흑') : (s.whiteName || '백');
      const scoreLine = '● ' + s.score.B + ' : ' + s.score.W + ' ○';
      let cls, emoji, title;
      if (s.winner === 'draw') { cls = 'draw'; emoji = '🤝'; title = '무승부'; }
      else if (myColor && myColor === s.winner) { cls = 'win'; emoji = '🏆'; title = '승리!'; }
      else if (myColor) { cls = 'lose'; emoji = '😢'; title = '패배'; }
      else { cls = 'spec'; emoji = '🏆'; title = window.esc(winnerName) + ' 승리'; }
      if (winPanel) winPanel.innerHTML =
        '<div class="owin-card ' + cls + '"><div class="owin-emoji">' + emoji + '</div>' +
        '<div class="owin-title">' + title + '</div><div class="owin-sub">' + scoreLine + '</div></div>';
      resEl.innerHTML = '';
    } else { if (winPanel) winPanel.innerHTML = ''; resEl.innerHTML = ''; }

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

    // 턴 카운트다운 — 레벨바 연속 감소 + 남은 초 표시
    if (s.phase === 'playing' && s.secondsLeft != null) startOCountdown(s.secondsLeft);
    else stopOCountdown();

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
    document.getElementById('leaveBtn').disabled = false;   // 나가기 항상 허용(대국 중이면 기권 처리)
    window.leaveConfirm = (s.phase === 'playing' && (myRole === 'B' || myRole === 'W')) ? '대국 중 나가면 기권 처리됩니다. 나가시겠어요?' : null;

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

  // 채팅 → 활성 2인(상/하 패널) 채팅만 나무 말풍선. 대기/관전자 채팅은 채팅창에만(말풍선 X)
  function showOBubble(name, text) {
    let host = null;
    if (name && name === topName) host = document.getElementById('oTop');
    else if (name && name === botName) host = document.getElementById('oBot');
    if (!host) return;
    const b = document.createElement('div');
    b.className = 'obubble';
    b.textContent = text;
    host.appendChild(b);
    setTimeout(() => { b.classList.add('out'); }, 2800);
    setTimeout(() => { if (b.parentNode) b.remove(); }, 3200);
  }

  // 턴 카운트다운 — 현재 차례 패널의 레벨바를 매초 줄이고(.olevelfill는 CSS transition으로 부드럽게) 남은 초 갱신
  function startOCountdown(secs) {
    stopOCountdown();
    let s = secs;
    const tick = () => {
      const turnPanel = document.querySelector('.opanel.turn');
      const fill = turnPanel && turnPanel.querySelector('.olevelfill');
      const secsEl = turnPanel && turnPanel.querySelector('.osecs');
      if (fill) fill.style.width = Math.max(0, Math.min(100, s / 30 * 100)) + '%';
      if (secsEl) secsEl.textContent = s + '초';
      if (turnPanel) turnPanel.classList.toggle('danger', myTurn && s <= 5);   // 내 차례 5초 이하 → 빨강 번쩍
      if (s <= 0) { stopOCountdown(); return; }
      s -= 1;
    };
    tick();
    timerInt = setInterval(tick, 1000);
  }
  function stopOCountdown() {
    if (timerInt) { clearInterval(timerInt); timerInt = null; }
    document.querySelectorAll('.opanel.danger').forEach((p) => p.classList.remove('danger'));
  }

  R.meta = { chat: 'felt' };                        // 방 생성 옵션 없음, 채팅은 판 하단 바

  window.RENDERERS = window.RENDERERS || {};
  window.RENDERERS.othello = R;
})();
