// 오셀로 렌더러 — 공통 셸(#roomMain, #roomInfo)에 보드/대기열을 그린다.
(function () {
  const R = {};
  let cells = [], myTurn = false, lastSeq = 0, firstState = true, timerInt = null;

  R.init = function (main, info) {
    main.innerHTML =
      '<div id="turnbar"></div>' +
      '<div id="timer"></div>' +
      '<div id="scores">' +
      '  <div class="chip" id="chip-B"><span class="disc-mini black"></span><span class="nm" id="name-B">흑</span><span id="score-B">2</span></div>' +
      '  <div class="chip" id="chip-W"><span class="disc-mini white"></span><span class="nm" id="name-W">백</span><span id="score-W">2</span></div>' +
      '</div>' +
      '<div id="board"></div>' +
      '<div id="status"></div>' +
      '<div class="btnrow">' +
      '  <button id="startBtn" style="display:none">게임 시작</button>' +
      '  <button id="resignBtn" class="danger" style="display:none">기권</button>' +
      '  <button id="deferBtn" class="sub" style="display:none">순위 미루기</button>' +
      '</div>' +
      '<div id="role" style="font-size:13px;color:var(--muted)"></div>';
    info.innerHTML = '<h3>대기열 (승자 잔류 · 패자 후순위)</h3><div id="queue"></div>';

    const boardEl = document.getElementById('board');
    cells = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const cell = document.createElement('div');
      cell.className = 'ocell';
      cell.addEventListener('click', () => { if (myTurn) window.send({ type: 'move', r, c }); });
      boardEl.appendChild(cell); cells.push(cell);
    }
    document.getElementById('startBtn').onclick = () => window.send({ type: 'start' });
    document.getElementById('resignBtn').onclick = () => { if (confirm('기권하시겠습니까?')) window.send({ type: 'resign' }); };
    document.getElementById('deferBtn').onclick = () => window.send({ type: 'defer' });
    lastSeq = 0; firstState = true;
  };

  R.render = function (s) {
    const $ = (id) => document.getElementById(id);
    const myRole = s.yourRole;
    myTurn = s.phase === 'playing' && myRole === s.turn;

    const lm = s.lastMove;
    const animate = lm && !firstState && lm.seq > lastSeq;
    const placedIdx = lm ? lm.placed.r * 8 + lm.placed.c : -1;
    const legalSet = new Set((s.legal || []).map(([r, c]) => r * 8 + c));
    for (let i = 0; i < 64; i++) {
      const v = s.board[Math.floor(i / 8)][i % 8];
      const cell = cells[i];
      cell.innerHTML = ''; cell.className = 'ocell';
      if (v) {
        const d = document.createElement('div');
        d.className = 'disc ' + (v === 'B' ? 'black' : 'white');
        if (animate && i === placedIdx) d.classList.add('place');
        cell.appendChild(d);
      } else if (s.phase === 'playing' && legalSet.has(i)) {
        cell.classList.add(myTurn ? 'playable' : 'hint');
      }
    }
    if (lm) lastSeq = lm.seq;
    firstState = false;

    setTimer(s.secondsLeft, myTurn, s.phase);
    $('score-B').textContent = s.score.B;
    $('score-W').textContent = s.score.W;
    $('name-B').textContent = s.blackName || '흑';
    $('name-W').textContent = s.whiteName || '백';
    $('chip-B').classList.toggle('active', s.phase === 'playing' && s.turn === 'B');
    $('chip-W').classList.toggle('active', s.phase === 'playing' && s.turn === 'W');

    const tb = $('turnbar'); tb.className = '';
    if (s.phase === 'lobby') {
      tb.classList.add('them');
      tb.textContent = (s.queue.length < 2) ? '상대 입장 대기 중…' : `방장(${s.hostName})의 시작 대기 중`;
    } else if (s.phase === 'finished') {
      tb.classList.add('over');
      tb.textContent = s.winner === 'draw' ? '무승부!' :
        (s.winner === 'B' ? `흑 ●(${s.blackName})` : `백 ○(${s.whiteName})`) + ' 승리!';
    } else if (myRole === 'S') {
      tb.classList.add('them');
      tb.textContent = `관전 중 — ${s.turn === 'B' ? `흑 ●(${s.blackName})` : `백 ○(${s.whiteName})`} 차례`;
    } else if (myTurn) {
      tb.classList.add('you'); tb.textContent = '🟢 당신 차례 — 둘 곳을 클릭';
    } else {
      tb.classList.add('them');
      tb.textContent = `${s.turn === 'B' ? `흑 ●(${s.blackName})` : `백 ○(${s.whiteName})`}가 두는 중…`;
    }

    if (s.canStart) { $('startBtn').style.display = ''; $('startBtn').disabled = false; $('startBtn').textContent = s.phase === 'finished' ? '다음 대국 시작' : '게임 시작'; }
    else if (s.isHost && (s.phase === 'lobby' || s.phase === 'finished')) { $('startBtn').style.display = ''; $('startBtn').disabled = true; $('startBtn').textContent = '상대 입장 대기 중'; }
    else $('startBtn').style.display = 'none';
    $('resignBtn').style.display = s.canResign ? '' : 'none';
    $('deferBtn').style.display = s.canDefer ? '' : 'none';
    document.getElementById('leaveBtn').disabled = s.canResign;

    let roleTxt;
    if (myRole === 'B') roleTxt = '당신: 흑 ●';
    else if (myRole === 'W') roleTxt = '당신: 백 ○';
    else if (s.waitPos >= 1) roleTxt = `당신: 관전 (대기열 ${s.waitPos}번째)`;
    else if (myRole === 'seated') roleTxt = '당신: 다음 대국 참가자';
    else roleTxt = '당신: 관전';
    $('role').textContent = roleTxt + (s.isHost ? ' · 방장' : '');
    $('status').textContent = s.phase === 'finished' ? `최종 ● ${s.score.B} : ${s.score.W} ○` : '';

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

  function setTimer(secs, mine, phase) {
    if (timerInt) { clearInterval(timerInt); timerInt = null; }
    const el = document.getElementById('timer');
    if (!el) return;
    if (phase !== 'playing' || secs == null) { el.textContent = ''; el.className = ''; return; }
    let s = secs;
    const paint = () => { el.textContent = `⏱ ${s}초` + (mine ? ' (내 차례)' : ''); el.className = s <= 5 ? 'low' : ''; };
    paint();
    timerInt = setInterval(() => { s = Math.max(0, s - 1); paint(); if (s <= 0) { clearInterval(timerInt); timerInt = null; } }, 1000);
  }

  window.RENDERERS = window.RENDERERS || {};
  window.RENDERERS.othello = R;
})();
