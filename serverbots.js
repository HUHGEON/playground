// ───────────────────────────────────────────────────────────
//  내장 봇 — 싱글플레이(봇전) 룸에 "가짜 플레이어"로 큐에 참여.
//  별도 프로세스/웹소켓 없이 서버가 직접 봇의 수를 둔다(scheduleBots in server.js).
//  결정 로직은 bots.js(외부 연습봇)와 동일.
// ───────────────────────────────────────────────────────────
let seq = 0;

// 봇전에서 채울 봇 수 = 좌석 다 채우기(나 빼고 나머지). maxPlayers-1.
function botCount(gameType, maxPlayers) {
  return Math.max(1, (maxPlayers || 2) - 1);
}

// ws처럼 보이는 봇 객체(서버의 broadcastRoom/notify가 ws.send를 호출해도 무해하게).
// 이름 = 난이도별(초급/중급/고급)봇 + 여러 명이면 번호(1,2,3…).
function createBots(count, palette, level) {
  const prefix = level === 'easy' ? '🤖초급봇' : level === 'hell' ? '👹헬봇' : level === 'hard' ? '🤖고급봇' : '🤖중급봇';
  const bots = [];
  for (let i = 0; i < count; i++) {
    seq++;
    bots.push({
      name: prefix + (count > 1 ? i + 1 : ''),       // 여러 명일 때만 번호
      color: palette[(seq * 3) % palette.length],
      sessionId: 'sbot-' + seq,
      isBot: true, joined: true, roomId: null,
      OPEN: 1, readyState: 1,
      send() {},
      _actTimer: null,
    });
  }
  return bots;
}

// 봇이 지금 둘 액션을 결정. 둘 게 없으면(내 차례 아님 등) null. st = 모듈 state(+phase).
function decide(gameType, st) {
  if (gameType === 'othello') {
    if (st.phase === 'playing' && st.yourRole === st.turn && st.legal && st.legal.length) {
      const mv = st.legal[Math.floor(Math.random() * st.legal.length)];
      return { type: 'move', r: mv[0], c: mv[1] };
    }
  } else if (gameType === 'seotda') {
    if (st.myTurn && st.actions && st.actions.length) {
      const acts = st.actions.map((a) => a.act);
      const pick = acts.includes('check') ? 'check'
        : (acts.includes('call') && Math.random() < 0.82 ? 'call' : 'die');
      return { type: 'bet', act: pick };
    }
  } else if (gameType === 'poker') {
    if (st.canDiscard) return { type: 'discard', idx: Math.floor(Math.random() * 3) };
    if (st.myTurn && st.actions && st.actions.length) {
      const acts = st.actions.map((a) => a.act);
      const r = Math.random();
      let pick;
      if (acts.includes('check')) pick = r < 0.7 ? 'check' : (acts.includes('raise') && r < 0.88 ? 'raise' : 'check');
      else pick = r < 0.68 ? 'call' : (r < 0.9 ? 'die' : (acts.includes('raise') ? 'raise' : 'call'));
      if (!acts.includes(pick)) pick = acts.includes('call') ? 'call' : (acts.includes('check') ? 'check' : 'die');
      return { type: 'bet', act: pick };
    }
  }
  return null;
}

module.exports = { createBots, decide, botCount };
