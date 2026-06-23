import { useState } from 'react';
import Gostop from './games/Gostop.jsx';

// 게임별 React 컴포넌트(점진 이전). 미이전 게임은 안내 표시.
const GAME_COMPONENTS = {
  gostop: Gostop,
};

export default function Room({ ws }) {
  const { room, send } = ws;
  const GameComp = GAME_COMPONENTS[room.gameType];
  const [chatText, setChatText] = useState('');

  const sendChat = () => {
    const t = chatText.trim(); if (!t) return;
    send({ type: 'chat', text: t }); setChatText('');
  };

  return (
    <div className="room">
      <header className="topbar">
        <button className="ghost" onClick={() => send({ type: 'leaveRoom' })}>← 나가기</button>
        <div className="room-title">{room.title} · {room.roomName}</div>
        <div style={{ width: 80 }} />
      </header>
      <div className="room-body">
        {GameComp
          ? <GameComp ws={ws} />
          : <div className="muted" style={{ padding: 40 }}>이 게임은 아직 React로 이전 안 됨: <b>{room.gameType}</b></div>}
      </div>
      <div className="chatbar">
        <input
          placeholder="여기에 채팅 입력... (Enter)" value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendChat()}
        />
        <button className="primary" onClick={sendChat}>전송</button>
      </div>
    </div>
  );
}
