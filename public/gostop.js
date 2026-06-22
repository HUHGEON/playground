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
  function floorPos(id) {
    let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const ang = (h % 360) * Math.PI / 180;
    const rf = 1.0 + ((h >> 9) & 7) / 11;     // 1.0~1.64 바깥 링
    const EXX = 18, EXY = 33;                  // 더미 회피 타원 반지름(%) — 이 안엔 절대 안 들어옴
    let x = 50 + Math.cos(ang) * EXX * rf;
    let y = 50 + Math.sin(ang) * EXY * rf;
    x = Math.max(9, Math.min(91, x)); y = Math.max(13, Math.min(87, y));
    return { x, y, rot: ((h >> 3) % 26) - 13 };
  }
  let prevFloorIds = new Set();

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
      return `<div class="gs-opp side ${pos}${turn ? ' turn' : ''}">
        <div class="gs-vhead">
          <span class="gs-ava">${avatar(p.name)}${p.isBot ? '🤖' : ''}</span>
          <div class="gs-vname">${esc(p.name.replace(/🤖/g, ''))}</div>
          <div class="gs-vscore">${sc}점</div>
          ${turn ? '<div class="gs-vnow">차례</div>' : ''}
        </div>
        <div class="gs-caprot"><div class="gs-opp-cap">${capStrips((s.captured && s.captured[seat]) || [], det, true)}</div></div>
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
          '<div id="gsMid"><div id="gsFloor"></div>' +
            '<div id="gsCenter"><div id="gsDrawWrap"><div id="gsDraw"></div><div id="gsDrawN"></div></div></div>' +
          '</div>' +
          '<div id="gsRight" class="gs-side"></div>' +
        '</div>' +
        '<div id="gsMy"><div id="gsMyCap"></div>' +
          '<div id="gsMyRow"><div id="gsMyAva"></div><div id="gsHand"></div><div id="gsActions"></div></div>' +
        '</div>' +
        '<div id="gsToast"></div><div id="gsModal" style="display:none"></div>' +
      '</div></div>';
    info.innerHTML = '<div id="gsSide"></div>';

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

    // 바닥 — 더미(중앙) 주변 분산 + 새 패는 슬램(내려치기)
    const fids = [];
    $('gsFloor').innerHTML = (s.floor || []).map((c) => {
      const ch = s.pendingChoice && s.pendingChoice.options.some((o) => o.id === c.id);
      const p = floorPos(c.id); const slam = prevFloorIds.has(c.id) ? '' : ' slam'; fids.push(c.id);
      return `<img class="gscard floorc${ch ? ' choosable' : ''}${slam}" style="left:${p.x}%;top:${p.y}%;--rot:${p.rot}deg" src="${cardSrc(c)}" data-id="${c.id}" data-m="${c.m}" draggable="false" alt="">`;
    }).join('');
    prevFloorIds = new Set(fids);

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
    $('gsHand').innerHTML = (s.myHand || []).map((c) => cardHTML(c, myTurn ? '' : 'dim')).join('');

    // 액션 버튼
    let acts = '';
    if (s.canChongtong) acts += '<button class="gs-act ct" data-act="chongtong">💣 총통</button>';
    if (s.myFreeFlips > 0) acts += `<button class="gs-act flip" data-act="flip">🔄 뒤집기(${s.myFreeFlips})</button>`;
    (s.bombable || []).forEach((m) => { acts += `<button class="gs-act bomb" data-act="bomb" data-m="${m}">💥 폭탄·${MNAME[m]}</button>`; });
    (s.shakeable || []).forEach((m) => { acts += `<button class="gs-act shake" data-act="shake" data-m="${m}">🤝 흔들기·${MNAME[m]}</button>`; });
    $('gsActions').innerHTML = acts;

    showEvents(s);
    renderModal(s);
    $('gsSide').innerHTML = sideHTML(s);
  };

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
