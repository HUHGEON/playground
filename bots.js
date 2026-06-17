// 섯다 연습용 봇 — 실행 중인 섯다 방에 자동 입장해서 같이 플레이한다.
//   사용법:  node bots.js            (봇 2명)
//            BOTS=3 node bots.js      (봇 3명)
//            URL=ws://localhost:45678 node bots.js
const { WebSocket } = require('ws');
const URL = process.env.URL || 'ws://localhost:45678';
const N = Number(process.env.BOTS) || 2;
const NAMES = ['봇팔이', '봇식이', '봇철이', '봇영이'];

function bot(baseName, sid) {
  let name = baseName;
  const ws = new WebSocket(URL);
  const send = (o) => { try { ws.send(JSON.stringify(o)); } catch (e) {} };
  ws.on('open', () => send({ type: 'join', name, sessionId: sid }));
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.type === 'joinError') { name = baseName + Math.floor(Math.random() * 900); send({ type: 'join', name, sessionId: sid }); return; }
    if (m.type === 'lobby') {                       // 방 밖 → 섯다 방 있으면 입장
      const r = (m.rooms || []).find((x) => x.gameType === 'seotda');
      if (r) send({ type: 'enterRoom', roomId: r.id });
      return;
    }
    if (m.type === 'roomState' && m.gameType === 'seotda') {
      if (m.myTurn && m.actions) {                  // 내 차례 → 간단 전략
        const acts = m.actions.map((a) => a.act);
        const pick = acts.includes('check') ? 'check' : (Math.random() < 0.82 ? 'call' : 'die');
        setTimeout(() => send({ type: 'bet', act: pick }), 1200 + Math.random() * 1600);
      }
    }
  });
  ws.on('close', () => setTimeout(() => bot(baseName, sid), 2500));   // 끊기면 재접속
}

for (let i = 0; i < N; i++) bot(NAMES[i % NAMES.length], 'bot-' + i + '-' + Math.random().toString(36).slice(2, 7));
console.log(`${N} bots → ${URL} (섯다 방 자동 입장)`);
