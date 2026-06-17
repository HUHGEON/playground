// 공통 클라이언트 — 연결/세션/로비/채팅 + gameType별 렌더러 라우팅
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.esc = esc;

  const ENTER_OK = (e) => e.key === 'Enter' && !e.isComposing && e.keyCode !== 229;

  // 세션
  function genId() { return 's-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  let sessionId = localStorage.getItem('hub.sid');
  if (!sessionId) { sessionId = genId(); localStorage.setItem('hub.sid', sessionId); }
  const savedName = localStorage.getItem('hub.name');

  let myName = null;
  let currentRoomId = null, currentGame = null;
  let selectedGame = null;
  let games = [];

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  window.send = (o) => { try { ws.send(JSON.stringify(o)); } catch (e) {} };

  ws.onopen = () => {
    if (savedName) { $('overlay').style.display = 'none'; window.send({ type: 'join', name: savedName, sessionId }); }
  };
  // 새로고침/탭닫기(pagehide)는 세션 유지, '진짜 서버 끊김'일 땐 세션(닉네임) 폐기
  let unloading = false;
  window.addEventListener('pagehide', () => { unloading = true; });
  ws.onclose = () => {
    if (!unloading) {
      localStorage.removeItem('hub.sid');
      localStorage.removeItem('hub.name');
    }
    $('overlay').style.display = 'flex';
    $('userbar').style.display = 'none';
    $('overlay').querySelector('h2').textContent = '서버 연결 끊김 — 새로고침해 다시 입장';
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'joinError') {
      localStorage.removeItem('hub.name');
      $('overlay').style.display = 'flex'; $('userbar').style.display = 'none';
      $('joinBtn').disabled = false; $('joinError').textContent = m.reason; $('joinError').style.display = '';
      $('nick').focus(); $('nick').select();
      return;
    }
    if (m.type === 'lobby') { confirmJoin(m); return renderLobby(m); }
    if (m.type === 'roomState') { confirmJoin(m); return routeRoom(m); }
    if (m.type === 'chat') return addChat(m.scope, m.name, m.text, m.color);
    if (m.type === 'notice') return addNotice(m.text);
  };

  function confirmJoin(s) {
    if (s.yourName) { myName = s.yourName; localStorage.setItem('hub.name', myName); }
    if ($('overlay').style.display !== 'none') { $('overlay').style.display = 'none'; $('joinBtn').disabled = false; }
    $('userbar').style.display = 'flex';
    $('meLabel').textContent = myName || '';
    if (s.yourColor) $('meLabel').style.color = s.yourColor;
  }

  // ---- 닉네임 ----
  function doJoin() {
    const name = $('nick').value.trim();
    if (!name) return $('nick').focus();
    localStorage.setItem('hub.name', name);
    $('joinError').style.display = 'none'; $('joinBtn').disabled = true;
    window.send({ type: 'join', name, sessionId });
  }
  $('joinBtn').addEventListener('click', doJoin);
  $('nick').addEventListener('keydown', (e) => { if (ENTER_OK(e)) doJoin(); });
  $('nick').focus();

  $('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('hub.sid'); localStorage.removeItem('hub.name');
    window.send({ type: 'logout' });
    setTimeout(() => location.reload(), 150);
  });

  // ---- 방 생성/입장/나가기 ----
  function createRoom() {
    if (!selectedGame) return;
    const msg = { type: 'createRoom', gameType: selectedGame, name: $('roomName').value.trim() };
    if (selectedGame === 'seotda') {
      msg.opts = { startChips: parseInt($('optStart').value, 10) || 30000, ante: parseInt($('optAnte').value, 10) || 500 };
    }
    window.send(msg);
    $('roomName').value = '';
  }
  $('createBtn').addEventListener('click', createRoom);
  $('roomName').addEventListener('keydown', (e) => { if (ENTER_OK(e)) createRoom(); });
  $('leaveBtn').addEventListener('click', () => window.send({ type: 'leaveRoom' }));

  // ---- 채팅 ----
  function sendChatFrom(id) {
    const el = $(id), text = el.value.trim();
    if (!text) return;
    window.send({ type: 'chat', text }); el.value = '';
  }
  $('lobbyChatSend').addEventListener('click', () => sendChatFrom('lobbyChatInput'));
  $('lobbyChatInput').addEventListener('keydown', (e) => { if (ENTER_OK(e)) sendChatFrom('lobbyChatInput'); });

  function addChat(scope, name, text, color) {
    const box = scope === 'lobby' ? $('lobbyChat') : $('roomChat');
    const div = document.createElement('div');
    div.innerHTML = `<span class="nick" style="color:${color || '#9fb3c8'}">${esc(name)}</span> : ${esc(text)}`;
    box.appendChild(div); box.scrollTop = box.scrollHeight;
    // 방 채팅 → 게임별 말풍선(예: 섯다는 보낸 사람 좌석 위에)
    if (scope === 'room' && typeof window.onRoomChat === 'function') window.onRoomChat(name, text, color);
  }
  function addNotice(text) {
    const div = document.createElement('div'); div.textContent = '· ' + text;
    $('roomLog').prepend(div);
    while ($('roomLog').children.length > 40) $('roomLog').lastChild.remove();
  }

  // 판(게임 영역) 밑에 채팅 입력 바 추가 — 렌더로 안 지워지게 #roomMain에 append
  function addFeltChatBar(main) {
    const bar = document.createElement('div');
    bar.className = 'feltchat';
    bar.innerHTML = '<input id="feltChatInput" maxlength="200" placeholder="여기에 채팅 입력… (Enter)" autocomplete="off"/><button id="feltChatSend">전송</button>';
    main.appendChild(bar);
    const go = () => sendChatFrom('feltChatInput');
    $('feltChatSend').addEventListener('click', go);
    $('feltChatInput').addEventListener('keydown', (e) => { if (ENTER_OK(e)) go(); });
  }

  // ---- 뷰 전환 ----
  function showView(which) {
    const inRoom = which === 'room';
    $('lobbyView').style.display = which === 'lobby' ? 'block' : 'none';
    $('roomView').style.display = inRoom ? 'block' : 'none';
    // 게임 화면에선 상단 타이틀/유저바(로그아웃) 숨겨서 한 화면에 들어오게
    const h1 = document.querySelector('h1');
    if (h1) h1.style.display = inRoom ? 'none' : '';
    $('userbar').style.display = inRoom ? 'none' : (myName ? 'flex' : 'none');
    document.body.classList.toggle('inroom', inRoom);
  }

  // ---- 로비 렌더 ----
  function renderGamePick() {
    const wrap = $('gamePick'); wrap.innerHTML = '';
    if (!selectedGame && games.length) selectedGame = games[0].type;
    games.forEach((g) => {
      const o = document.createElement('div');
      o.className = 'opt' + (g.type === selectedGame ? ' on' : '');
      o.innerHTML = `<span class="em">${g.emoji}</span>${esc(g.title)}`;
      o.onclick = () => { selectedGame = g.type; renderGamePick(); };
      wrap.appendChild(o);
    });
    const opts = $('seotdaOpts');
    if (opts) opts.style.display = selectedGame === 'seotda' ? 'flex' : 'none';
  }

  function renderLobby(s) {
    if (currentRoomId !== null) { currentRoomId = null; currentGame = null; $('lobbyChat').innerHTML = ''; }
    showView('lobby');
    games = s.games || games;
    renderGamePick();

    const list = $('roomList'); list.innerHTML = '';
    if (!s.rooms.length) list.innerHTML = '<div class="empty">아직 방이 없어요. 게임을 고르고 아래에서 만들어보세요.</div>';
    s.rooms.forEach((r) => {
      const g = games.find((x) => x.type === r.gameType) || {};
      const row = document.createElement('div');
      row.className = 'roomrow';
      const badge = r.phase === 'playing' ? '<span class="badge play">진행중</span>' : '<span class="badge">대기중</span>';
      row.innerHTML =
        `<span class="gicon">${g.emoji || '🎲'}</span>` +
        `<span class="rname">${esc(r.name)}</span>` +
        `<span class="gtag">${esc(g.title || r.gameType)}</span>` +
        `<span class="meta">${r.count}명 · ${esc(r.max || '')} · 방장 ${esc(r.hostName || '-')}</span>${badge}`;
      const btn = document.createElement('button');
      btn.textContent = '입장';
      btn.onclick = () => window.send({ type: 'enterRoom', roomId: r.id });
      row.appendChild(btn); list.appendChild(row);
    });

    const LABEL = { lobby: '접속중', playing: '게임중', seated: '대기중' };
    const ol = $('onlineList'); ol.innerHTML = '';
    $('onlineCount').textContent = `(${(s.online || []).length}명)`;
    (s.online || []).forEach((u) => {
      const row = document.createElement('div');
      row.className = 'orow' + (u.name === s.yourName ? ' me' : '');
      const where = u.status === 'lobby' ? '접속중' : `${LABEL[u.status]} · ${esc(u.loc)}`;
      row.innerHTML = `<span class="oname" style="color:${u.color || '#e8eaed'}">${esc(u.name)}</span><span class="ostat ${u.status}">${where}</span>`;
      ol.appendChild(row);
    });
  }

  // ---- 방 라우팅 ----
  function routeRoom(s) {
    showView('room');
    const renderer = window.RENDERERS[s.gameType];
    if (!renderer) return;
    if (currentRoomId !== s.roomId || currentGame !== s.gameType) {
      currentRoomId = s.roomId; currentGame = s.gameType;
      $('roomChat').innerHTML = ''; $('roomLog').innerHTML = '';
      $('roomSub').textContent = '';
      window.onRoomChat = null;
      renderer.init($('roomMain'), $('roomInfo'));     // 게임별 스캐폴드 구축
      addFeltChatBar($('roomMain'));                   // 판 밑에 채팅 입력
    }
    $('roomTitle').textContent = `${s.title} · ${s.roomName}`;
    renderer.render(s);
  }
})();
