// 화투(맞고/고스톱) 렌더러 — games/gostop.js state 기반
(function () {
  const $ = (id) => document.getElementById(id);
  const send = (o) => window.send(o);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const AVATARS = ['🦊', '🐯', '🐰', '🐼', '🐸', '🐵', '🦁', '🐶', '🐱', '🐲', '🦝', '🐷'];
  function avatar(name) { let h = 0; const s = name || '?'; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return AVATARS[h % AVATARS.length]; }
  const MNAME = { 1: '송학', 2: '매조', 3: '벚꽃', 4: '흑싸리', 5: '난초', 6: '모란', 7: '홍싸리', 8: '공산', 9: '국진', 10: '단풍', 11: '오동', 12: '비' };

  const cardSrc = (c) => c.img || ('gostop/' + c.m + '-' + c.idx + '.png');
  function cardHTML(c, cls) {
    return `<img class="gscard${cls ? ' ' + cls : ''}" src="${cardSrc(c)}" data-id="${c.id}" data-m="${c.m}" draggable="false" alt="">`;
  }

  // 획득 더미 분류
  function pile(captured) {
    const g = { KWANG: [], YEOL: [], TTI: [], PI: [] };
    let piVal = 0;
    for (const c of captured) { (g[c.cat] || g.PI).push(c); if (c.cat === 'PI') piVal += c.pi; }
    return { g, piVal };
  }
  function pileHTML(captured) {
    const { g, piVal } = pile(captured);
    const row = (label, arr, extra) => arr.length || extra
      ? `<div class="gspile-row"><span class="gspile-lb">${label}</span><span class="gspile-cards">${arr.map((c) => cardHTML(c, 'mini')).join('')}</span>${extra || ''}</div>`
      : '';
    return row('광', g.KWANG) + row('열', g.YEOL) + row('띠', g.TTI) +
      row('피', g.PI, `<span class="gspile-val">${piVal}점치</span>`);
  }

  // ── 한 플레이어 패널 ──
  function panelHTML(s, seat, mine) {
    const p = s.seats[seat]; if (!p) return '';
    const turn = s.turnIdx === seat && s.phase === 'playing';
    const sc = s.scores ? s.scores[seat] : 0;
    const go = s.goCounts && s.goCounts[seat] ? ` · ${s.goCounts[seat]}고` : '';
    const sh = s.shake && s.shake[seat] ? ` · 흔들×${s.shake[seat]}` : '';
    const chips = s.chips && p && window._gsSid ? '' : '';
    return `<div class="gs-panel${turn ? ' turn' : ''}${mine ? ' mine' : ''}">
      <div class="gs-ava">${avatar(p.name)}</div>
      <div class="gs-pinfo">
        <div class="gs-pname">${esc(p.name)}${p.isBot ? ' 🤖' : ''}${turn ? ' <span class="gs-turn">▶</span>' : ''}</div>
        <div class="gs-pmeta"><b class="gs-score">${sc}점</b>${go}${sh} · 손 ${s.handCounts ? s.handCounts[seat] : '?'}</div>
      </div>
      <div class="gs-pile">${pileHTML((s.captured && s.captured[seat]) || [])}</div>
    </div>`;
  }

  const R = {};

  R.init = function (main, info) {
    main.innerHTML =
      '<div id="gsStage"><div id="gsFelt">' +
        '<div id="gsOpps"></div>' +
        '<div id="gsMid"><div id="gsFloor"></div><div id="gsDrawWrap"><div id="gsDraw"></div><div id="gsDrawN"></div></div></div>' +
        '<div id="gsMineWrap"><div id="gsMinePanel"></div><div id="gsActions"></div></div>' +
        '<div id="gsHand"></div>' +
      '</div>' +
      '<div id="gsToast"></div>' +
      '<div id="gsModal" style="display:none"></div>' +
      '</div>';
    info.innerHTML = '<div id="gsSide"></div>';

    // 손패/바닥 클릭 위임
    $('gsHand').onclick = (e) => {
      const img = e.target.closest('.gscard'); if (!img || img.classList.contains('dim')) return;
      send({ type: 'play', cardId: img.dataset.id });
    };
    $('gsFloor').onclick = (e) => {
      const img = e.target.closest('.gscard.choosable'); if (!img) return;
      send({ type: 'choose', cardId: img.dataset.id });
    };
  };

  let lastEvtKey = '';

  R.render = function (s) {
    window._gsSid = true;
    const mySeat = s.yourSeat;

    // ── 로비(대기) ──
    if (s.phase !== 'playing' && s.phase !== 'finished') {
      $('gsOpps').innerHTML = (s.seats || []).map((p, i) => panelHTML(s, i, i === mySeat)).join('');
      $('gsMid').style.display = 'none'; $('gsHand').innerHTML = ''; $('gsMineWrap').style.display = 'none';
      $('gsModal').style.display = s.canStart ? 'flex' : 'none';
      if (s.canStart) $('gsModal').innerHTML = '<div class="gs-box"><h2>🃏 고스톱</h2><p>' + (s.seats ? s.seats.length : 0) + '명 · ' + (s.seats && s.seats.length >= 3 ? '고스톱(7장)' : '맞고(10장)') + '</p><button id="gsStart">시작하기</button></div>';
      const b = $('gsStart'); if (b) b.onclick = () => send({ type: 'start' });
      $('gsSide').innerHTML = sideHTML(s);
      return;
    }
    $('gsMid').style.display = ''; $('gsMineWrap').style.display = '';

    // ── 상대 패널(나 제외, 위쪽) ──
    const opps = (s.seats || []).map((_, i) => i).filter((i) => i !== mySeat);
    $('gsOpps').innerHTML = opps.map((i) => panelHTML(s, i, false)).join('');

    // ── 바닥 ──
    $('gsFloor').innerHTML = (s.floor || []).map((c) => {
      const choosable = s.pendingChoice && s.pendingChoice.options.some((o) => o.id === c.id);
      return cardHTML(c, choosable ? 'choosable' : '');
    }).join('') || '<div class="gs-empty">바닥</div>';

    // ── 더미 ──
    $('gsDraw').className = (s.drawCount > 0) ? 'has' : '';
    $('gsDrawN').textContent = s.drawCount > 0 ? s.drawCount : '';

    // ── 내 패널 + 손패 ──
    $('gsMinePanel').innerHTML = panelHTML(s, mySeat, true);
    const myTurn = s.myTurn && s.phase === 'playing';
    $('gsHand').innerHTML = (s.myHand || []).map((c) => cardHTML(c, myTurn ? '' : 'dim')).join('');

    // ── 액션 버튼(흔들기/폭탄/총통/뒤집기) ──
    let acts = '';
    if (s.canChongtong) acts += '<button class="gs-act" data-act="chongtong">💣 총통 (즉시 승)</button>';
    if (s.myFreeFlips > 0) acts += `<button class="gs-act flip" data-act="flip">🔄 뒤집기 (${s.myFreeFlips})</button>`;
    (s.bombable || []).forEach((m) => { acts += `<button class="gs-act bomb" data-act="bomb" data-m="${m}">💥 폭탄 ${MNAME[m]}</button>`; });
    (s.shakeable || []).forEach((m) => { acts += `<button class="gs-act shake" data-act="shake" data-m="${m}">🤝 흔들기 ${MNAME[m]}</button>`; });
    $('gsActions').innerHTML = acts;
    $('gsActions').onclick = (e) => {
      const b = e.target.closest('.gs-act'); if (!b) return;
      const a = b.dataset.act;
      if (a === 'chongtong') send({ type: 'chongtong' });
      else if (a === 'flip') send({ type: 'flip' });
      else if (a === 'bomb') send({ type: 'bomb', month: Number(b.dataset.m) });
      else if (a === 'shake') send({ type: 'shake', month: Number(b.dataset.m) });
    };

    // ── 이벤트 토스트 ──
    showEvents(s);

    // ── 모달: 바닥선택 안내 / 고스톱 / 정산 ──
    renderModal(s, mySeat);

    $('gsSide').innerHTML = sideHTML(s);
  };

  function renderModal(s, mySeat) {
    const m = $('gsModal');
    if (s.phase === 'finished' && s.result) {
      m.style.display = 'flex'; m.innerHTML = resultHTML(s);
      const nx = $('gsNext'); if (nx) nx.onclick = () => send({ type: 'start' });
      return;
    }
    if (s.decision) {     // 내 고/스톱
      m.style.display = 'flex';
      m.innerHTML = `<div class="gs-box gs-decision"><h2>${s.decision.score}점!</h2><p>고? 스톱?</p>
        <div class="gs-gobtns"><button id="gsGo">고 ▶</button><button id="gsStop">스톱 ■</button></div></div>`;
      $('gsGo').onclick = () => send({ type: 'go' });
      $('gsStop').onclick = () => send({ type: 'stop' });
      return;
    }
    if (s.pendingChoice) {  // 바닥 2장 선택 안내(바닥 카드 직접 클릭)
      m.style.display = 'none';
      flashHint('같은 월 2장 중 가져올 패를 고르세요');
      return;
    }
    m.style.display = 'none';
  }

  function showEvents(s) {
    const evs = (s.events || []).filter((e) => ['jjok', 'ttadak', 'bbeok', 'bbeok-eat', 'sweep', 'steal', 'bonus', 'shake', 'bomb', 'go'].includes(e.ev));
    if (!evs.length) return;
    const key = JSON.stringify(evs);
    if (key === lastEvtKey) return; lastEvtKey = key;
    const NM = { jjok: '쪽!', ttadak: '따닥!', bbeok: '뻑!', 'bbeok-eat': '뻑 회수!', sweep: '싹쓸이!', bonus: '보너스피!', shake: '흔들기!', bomb: '폭탄!', go: '고!' };
    const txt = evs.map((e) => e.ev === 'steal' ? `피 ${e.got}장 가져옴` : NM[e.ev]).filter(Boolean).join('  ');
    if (!txt) return;
    const t = $('gsToast'); t.textContent = txt; t.classList.add('show');
    clearTimeout(window._gsToastT); window._gsToastT = setTimeout(() => t.classList.remove('show'), 1400);
  }

  function flashHint(txt) {
    const t = $('gsToast'); t.textContent = txt; t.classList.add('show', 'hint');
    clearTimeout(window._gsHintT); window._gsHintT = setTimeout(() => { t.classList.remove('show', 'hint'); }, 1600);
  }

  function resultHTML(s) {
    const r = s.result;
    if (r.nagari) return '<div class="gs-box"><h2>나가리</h2><p>아무도 못 났어요. 다음 판 점수 2배!</p>' + nextBtn(s) + '</div>';
    const w = s.seats[r.winner];
    const baks = Object.values(r.bak || {}).flat();
    const tags = [];
    if (r.goCount) tags.push(`${r.goCount}고`);
    if (r.shake) tags.push(`흔들×${r.shake}`);
    if (r.mungBak) tags.push('멍박');
    if (r.chongtong) tags.push('총통×4');
    if (baks.length) tags.push(...new Set(baks));
    return `<div class="gs-box gs-result"><h2>🏆 ${esc(w ? w.name : '')} 승</h2>
      <p class="gs-rscore">${r.baseScore}점${r.reason && r.reason !== 'stop' ? ' (' + r.reason + ')' : ''}</p>
      ${tags.length ? '<div class="gs-tags">' + tags.map((t) => `<span>${t}</span>`).join('') + '</div>' : ''}
      <div class="gs-pays">${Object.entries(r.payScore || {}).map(([L, v]) => `${esc(s.seats[L] ? s.seats[L].name : '')}: ${v}점`).join(' · ')}</div>
      ${nextBtn(s)}</div>`;
  }
  const nextBtn = (s) => s.canStart ? '<button id="gsNext">다음 판</button>' : '<p class="gs-wait">다음 판 대기…</p>';

  function sideHTML(s) {
    const chips = s.chips || {};
    return '<h3 style="margin-top:0">점수 / 칩</h3>' +
      (s.seats || []).map((p) => `<div class="gs-sline"><span>${avatar(p.name)} ${esc(p.name)}</span><b>${s.scores ? s.scores[p.seat] : 0}점</b></div>`).join('') +
      '<div class="gs-hint" style="margin-top:8px;font-size:12px;opacity:.7">광3/4/5·15 · 고도리5 · 홍청초단 각3 · 열끗5장1점+ · 띠5장1점+ · 피10점1점+</div>';
  }

  R.meta = { chat: 'felt', options: { fields: [], hint: '' } };
  window.RENDERERS = window.RENDERERS || {};
  window.RENDERERS.gostop = R;
})();
