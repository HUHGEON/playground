// 연습용 봇 — 실행 중인 방(섯다/오셀로/세븐포커)에 자동 입장해서 같이 플레이한다.
//   사용법:  node bots.js                  (봇 2명, 아무 방)
//            BOTS=3 node bots.js            (봇 3명)
//            GAME=othello node bots.js      (오셀로 방만 입장)
//            GAME=seotda BOTS=4 node bots.js
//            GAME=poker BOTS=5 node bots.js (세븐포커 봇 5명)
const { WebSocket } = require('ws');
const URL = process.env.URL || 'ws://localhost:45678';
const N = Number(process.env.BOTS) || 2;
const GAME = process.env.GAME || null;             // 특정 게임만 입장(없으면 아무 방)
const NAMES = ['봇팔이', '봇식이', '봇철이', '봇영이', '봇순이', '봇막이'];

function bot(baseName, sid) {
  let name = baseName;
  const ws = new WebSocket(URL);
  const send = (o) => { try { ws.send(JSON.stringify(o)); } catch (e) {} };
  ws.on('open', () => send({ type: 'join', name, sessionId: sid }));
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.type === 'joinError') { name = baseName + Math.floor(Math.random() * 900); send({ type: 'join', name, sessionId: sid }); return; }
    if (m.type === 'lobby') {                       // 방 밖 → 조건 맞는 방 있으면 입장
      const r = (m.rooms || []).find((x) => !GAME || x.gameType === GAME);
      if (r) send({ type: 'enterRoom', roomId: r.id });
      return;
    }
    if (m.type !== 'roomState') return;
    // 포커 봇이 방장이면 첫 판 자동 시작(봇끼리도 진행되게) — 포커 전용
    if (m.gameType === 'poker' && m.canStart) setTimeout(() => send({ type: 'start' }), 1500 + Math.random() * 1000);
    if (m.gameType === 'seotda') {
      if (m.myTurn && m.actions) {                  // 내 차례 → 간단 전략
        const acts = m.actions.map((a) => a.act);
        const pick = acts.includes('check') ? 'check' : (Math.random() < 0.82 ? 'call' : 'die');
        setTimeout(() => send({ type: 'bet', act: pick }), 1200 + Math.random() * 1600);
      }
    } else if (m.gameType === 'poker') {
      if (m.canDiscard) {                           // 버리기 단계 → 무작위 1장 버림
        setTimeout(() => send({ type: 'discard', idx: Math.floor(Math.random() * 3) }), 900 + Math.random() * 1500);
        return;
      }
      if (m.myTurn && m.actions) {                  // 내 차례 → 캐주얼 전략(체크/콜/레이즈/폴드)
        const acts = m.actions.map((a) => a.act);
        const r = Math.random();
        let pick;
        if (acts.includes('check')) pick = r < 0.7 ? 'check' : (acts.includes('raise') && r < 0.88 ? 'raise' : 'check');
        else pick = r < 0.68 ? 'call' : (r < 0.9 ? 'die' : (acts.includes('raise') ? 'raise' : 'call'));
        setTimeout(() => send({ type: 'bet', act: pick }), 1400 + Math.random() * 1800);
      }
    } else if (m.gameType === 'othello') {
      // 내 차례면 합법수 중 무작위 착수
      if (m.phase === 'playing' && m.yourRole === m.turn && m.legal && m.legal.length) {
        const mv = m.legal[Math.floor(Math.random() * m.legal.length)];
        setTimeout(() => send({ type: 'move', r: mv[0], c: mv[1] }), 800 + Math.random() * 900);
      }
    }
  });
  ws.on('close', () => setTimeout(() => bot(baseName, sid), 2500));   // 끊기면 재접속
}

for (let i = 0; i < N; i++) bot(NAMES[i % NAMES.length], 'bot-' + i + '-' + Math.random().toString(36).slice(2, 7));
console.log(`${N} bots → ${URL}${GAME ? ' (' + GAME + ' 방만)' : ''}`);
