import { useState, useEffect, useRef } from 'react';
import Gostop from './games/Gostop.jsx';

// 게임별 React 컴포넌트(점진 이전). 미이전 게임은 안내 표시.
const GAME_COMPONENTS = {
  gostop: Gostop,
};

export default function Room({ ws }) {
  const { room, send, chat } = ws;
  const GameComp = GAME_COMPONENTS[room.gameType];
  const [chatText, setChatText] = useState('');
  const chatEnd = useRef(null);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'end' }); }, [chat]);

  // 게임별 배경 클래스(body) — gostop.css 등의 body.game-XXX 배경 적용
  useEffect(() => {
    document.body.classList.add('game-' + room.gameType);
    return () => document.body.classList.remove('game-' + room.gameType);
  }, [room.gameType]);

  const sendChat = () => { const t = chatText.trim(); if (!t) return; send({ type: 'chat', text: t }); setChatText(''); };
  const sub = room.phase === 'playing' ? '게임 중'
    : room.phase === 'pickFirst' ? '선 정하는 중'
    : room.phase === 'finished' ? '판 종료' : '대기 중';

  return (
    <div id="roomView">
      <div id="roomTopbar">
        <button id="leaveBtn" className="sub" onClick={() => send({ type: 'leaveRoom' })}>← 나가기</button>
        <div id="roomTitle">{room.title} · {room.roomName}</div>
        <div id="roomSub">{sub}{room.hostName ? ` · 방장 ${room.hostName}` : ''}</div>
      </div>
      <div className="layout">
        <div className="col" id="roomMain">
          {GameComp
            ? <GameComp ws={ws} />
            : <div className="panel muted" style={{ padding: 40 }}>이 게임은 아직 React로 이전 안 됨: <b>{room.gameType}</b></div>}
        </div>
        <div className="col">
          <div className="panel" id="roomInfo" style={{ width: 280 }} />
          <div className="panel" style={{ width: 280 }}>
            <h3>채팅 기록</h3>
            <div className="chatbox" id="roomChat">
              {chat.length === 0 && <div className="muted" style={{ fontSize: 12 }}>아직 대화가 없어요.</div>}
              {chat.map((c, i) => (
                <div key={i} className="chatmsg"><b style={{ color: c.color || 'var(--gold)' }}>{c.name}</b> {c.text}</div>
              ))}
              <div ref={chatEnd} />
            </div>
            <div className="chatbar">
              <input maxLength={200} placeholder="메시지 입력…" autoComplete="off" value={chatText}
                onChange={(e) => setChatText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendChat()} />
              <button onClick={sendChat}>전송</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
