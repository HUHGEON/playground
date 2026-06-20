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
  // 방 생성 옵션 — 게임 무관. 각 게임 렌더러의 meta.options(필드/단위/검증)로 폼을 동적 생성.
  function gameMeta(t) { return (window.RENDERERS && window.RENDERERS[t] && window.RENDERERS[t].meta) || {}; }
  function curOpts() { return gameMeta(selectedGame).options || null; }

  // selectedGame의 옵션 폼을 #seotdaOpts에 그림(게임 바뀔 때만 재생성 → 입력값 보존)
  function buildOptForm() {
    const box = $('seotdaOpts'); if (!box) return;
    const o = curOpts();
    if (!o) { box.style.display = 'none'; box.innerHTML = ''; box.dataset.game = ''; return; }
    box.style.display = 'flex';
    if (box.dataset.game !== selectedGame) {
      box.dataset.game = selectedGame;
      box.innerHTML = '<div class="optrow">' + o.fields.map((f) =>
        `<label class="optfield">${esc(f.label)} <span class="unitwrap">` +
        `<input id="opt_${f.key}" type="number" min="${f.min}" max="${f.max}" step="1" value="${f.def}" />` +
        `<span class="unit">${esc(f.unit)}</span></span></label>`).join('') +
        '</div><div id="optHint" class="opthint"></div>';
      o.fields.forEach((f) => { const el = $('opt_' + f.key); if (el) el.addEventListener('input', readOpts); });
    }
    readOpts();
  }

  // 현재 폼 값 검증 → { ok, vals(원화값) }. 힌트/에러 표시도 갱신.
  function readOpts() {
    const o = curOpts(); if (!o) return { ok: true, vals: null };
    const vals = {}; let err = null;
    for (const f of o.fields) {
      const u = parseInt(($('opt_' + f.key) || {}).value, 10);
      if (!Number.isFinite(u) || u < f.min || u > f.max) { err = `${f.label}은 ${f.min}~${f.max}${f.unit} 사이여야 해요`; break; }
      vals[f.key] = u * f.mul;
    }
    if (!err && o.validate) err = o.validate(vals);
    const hint = $('optHint'); if (hint) { hint.classList.toggle('err', !!err); hint.textContent = err || o.hint; }
    return { ok: !err, vals: err ? null : vals };
  }

  // 방 모드 — 'multi'(기본) | 'single'(봇전) + 봇 난이도
  var selectedMode = 'multi';
  var selectedLevel = 'normal';
  (function wireMode() {
    var pick = $('modePick'), lvl = $('levelPick'); if (!pick) return;
    pick.querySelectorAll('.modebtn').forEach(function (b) {
      b.addEventListener('click', function () {
        selectedMode = b.dataset.mode;
        pick.querySelectorAll('.modebtn').forEach(function (x) { x.classList.toggle('on', x === b); });
        if (lvl) lvl.style.display = selectedMode === 'single' ? 'flex' : 'none';   // 봇전일 때만 난이도
        updateLevelUI();
      });
    });
    if (lvl) lvl.querySelectorAll('.levelbtn').forEach(function (b) {
      b.addEventListener('click', function () {
        selectedLevel = b.dataset.level;
        lvl.querySelectorAll('.levelbtn').forEach(function (x) { x.classList.toggle('on', x === b); });
      });
    });
  })();
  // 헬(절대 못 이김)은 오셀로 전용 — 다른 게임이면 숨기고 선택 중이면 어려움으로
  function updateLevelUI() {
    var hellBtn = document.querySelector('.levelbtn[data-level=hell]');
    if (!hellBtn) return;
    var showHell = selectedGame === 'othello';
    hellBtn.style.display = showHell ? '' : 'none';
    if (!showHell && selectedLevel === 'hell') {
      selectedLevel = 'hard';
      document.querySelectorAll('.levelbtn').forEach(function (x) { x.classList.toggle('on', x.dataset.level === 'hard'); });
    }
  }

  function createRoom() {
    if (!selectedGame) return;
    const r = readOpts();
    if (!r.ok) return;                                // 범위 벗어나면 생성 막고 안내 표시
    const msg = { type: 'createRoom', gameType: selectedGame, name: $('roomName').value.trim() };
    if (r.vals) msg.opts = r.vals;
    if (selectedMode === 'single') { msg.singleplayer = true; msg.botLevel = selectedLevel; }   // 봇전 + 난이도
    window.send(msg);
    $('roomName').value = '';
  }
  $('createBtn').addEventListener('click', createRoom);
  $('roomName').addEventListener('keydown', (e) => { if (ENTER_OK(e)) createRoom(); });
  $('leaveBtn').addEventListener('click', () => {
    if (window.leaveConfirm && !confirm(window.leaveConfirm)) return;   // 대국/판 중 나가기 = 기권 확인
    window.send({ type: 'leaveRoom' });
  });

  // ---- 채팅 ----
  var lastChatSent = 0;
  function sendChatFrom(id) {
    const el = $(id), text = el.value.trim();
    if (!text) return;
    const now = Date.now();
    if (now - lastChatSent < 1000) return;            // 채팅 1초 제한(서버와 동일)
    lastChatSent = now;
    window.send({ type: 'chat', text }); el.value = '';
  }
  $('lobbyChatSend').addEventListener('click', () => sendChatFrom('lobbyChatInput'));
  $('lobbyChatInput').addEventListener('keydown', (e) => { if (ENTER_OK(e)) sendChatFrom('lobbyChatInput'); });
  // 방 채팅 입력(오른쪽 사이드바)
  if ($('roomChatSend')) $('roomChatSend').addEventListener('click', () => sendChatFrom('roomChatInput'));
  if ($('roomChatInput')) $('roomChatInput').addEventListener('keydown', (e) => { if (ENTER_OK(e)) sendChatFrom('roomChatInput'); });

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
    if (!inRoom) { clearGameClasses(); window.leaveConfirm = null; }
  }
  // body의 game-* / chat-sidebar 클래스 제거(게임 목록 하드코딩 없이 — 드롭인)
  function clearGameClasses() {
    [...document.body.classList].filter((c) => c.startsWith('game-')).forEach((c) => document.body.classList.remove(c));
    document.body.classList.remove('chat-sidebar');
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
    buildOptForm();                                  // 선택 게임의 meta.options로 옵션 폼 생성/갱신
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
      const spTag = r.singleplayer ? '<span class="badge bot">🤖 봇전</span>' : '';
      const meta = r.singleplayer
        ? `봇전 · 👁 관전 ${r.spectators || 0}명 · 방장 ${esc(r.hostName || '-')}`
        : `${r.count}명 · ${esc(r.max || '')} · 방장 ${esc(r.hostName || '-')}`;
      row.innerHTML =
        `<span class="gicon g-${r.gameType}">${g.emoji || '🎲'}</span>` +
        `<span class="rinfo"><div class="rname">${esc(r.name)}</div>` +
        `<div class="meta">${meta}</div></span>` +
        `<span class="gtag g-${r.gameType}">${esc(g.title || r.gameType)}</span>${badge}${spTag}`;
      const btn = document.createElement('button');
      btn.textContent = r.singleplayer ? '관전' : '입장';
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
    clearGameClasses();
    document.body.classList.add('game-' + s.gameType);   // 게임별 배경
    const sidebar = gameMeta(s.gameType).chat === 'sidebar';
    document.body.classList.toggle('chat-sidebar', sidebar);
    const renderer = window.RENDERERS[s.gameType];
    if (!renderer) return;
    if (currentRoomId !== s.roomId || currentGame !== s.gameType) {
      currentRoomId = s.roomId; currentGame = s.gameType;
      $('roomChat').innerHTML = ''; $('roomLog').innerHTML = '';
      $('roomSub').textContent = '';
      window.onRoomChat = null;
      renderer.init($('roomMain'), $('roomInfo'));     // 게임별 스캐폴드 구축
      if (!sidebar) addFeltChatBar($('roomMain'));     // sidebar 게임은 우측 채팅, 그 외 판 하단 입력바
    }
    $('roomTitle').textContent = `${s.title} · ${s.roomName}`;
    renderer.render(s);
  }
})();
