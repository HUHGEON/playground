import { useState, useEffect, useRef } from 'react';
import ChatBubbleLayer from './ChatBubbleLayer.jsx';
import Gostop from './games/Gostop.jsx';
import Othello from './games/Othello.jsx';
import Seotda from './games/Seotda.jsx';
import Poker from './games/Poker.jsx';

const GAME_COMPONENTS = {
  gostop: Gostop,
  othello: Othello,
  seotda: Seotda,
  poker: Poker,
};
// 채팅 위치 — 바닐라 R.meta.chat 그대로. 포커만 우측 사이드바, 나머지는 판 하단 바.
const CHAT_SIDEBAR = { poker: true };

// 금액 억/만 축약(roomSub용)
const EOK = 100000000;
function won(n) {
  n = Math.round(Number(n) || 0);
  if (Math.abs(n) < 10000) return n.toLocaleString();
  const eok = Math.floor(n / EOK), man = Math.floor((n % EOK) / 10000);
  let s = '';
  if (eok) s += eok.toLocaleString() + '억';
  if (man) s += (s ? ' ' : '') + man.toLocaleString() + '만';
  return s || n.toLocaleString();
}

export default function Room({ ws }) {
  const { room, send, chat, notices } = ws;
  const GameComp = GAME_COMPONENTS[room.gameType];
  const [chatText, setChatText] = useState('');
  const chatEnd = useRef(null);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'end' }); }, [chat]);

  const sidebarChat = !!CHAT_SIDEBAR[room.gameType];

  // 게임별 배경 클래스(body) + 채팅 사이드바 클래스 — 바닐라 app.js와 동일
  useEffect(() => {
    document.body.classList.add('game-' + room.gameType);
    document.body.classList.toggle('chat-sidebar', sidebarChat);
    return () => { document.body.classList.remove('game-' + room.gameType); document.body.classList.remove('chat-sidebar'); };
  }, [room.gameType, sidebarChat]);

  const sendChat = () => { const t = chatText.trim(); if (!t) return; send({ type: 'chat', text: t }); setChatText(''); };

  // roomSub — 바닐라는 게임 렌더러가 채움(섯다=점당/시작, 포커=ante/시작금액), 그 외 비움
  let roomSub = '';
  if (room.gameType === 'seotda' && room.ante != null) roomSub = `점당 ${won(room.ante)} · 시작 ${won(room.startChips)}`;
  else if (room.gameType === 'poker' && room.ante != null) roomSub = `ante ${won(room.ante)} · 시작 금액 ${won(room.startChips)}`;

  const ChatBar = (
    <div className="chatbar" id="roomChatBar">
      <input id="roomChatInput" maxLength={200} placeholder="메시지 입력…" autoComplete="off" value={chatText}
        onChange={(e) => setChatText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendChat()} />
      <button id="roomChatSend" onClick={sendChat}>전송</button>
    </div>
  );

  return (
    <div id="roomView">
      <ChatBubbleLayer chat={chat} bubbleClass={room.gameType === 'othello' ? 'obubble' : 'chat-bubble'} />
      <div id="roomTopbar">
        <button id="leaveBtn" className="sub" onClick={() => {
          const msg = window.leaveConfirm;          // 게임이 진행 중이면 기권 확인(게임별로 설정)
          if (msg && !window.confirm(msg)) return;
          window.leaveConfirm = null;
          send({ type: 'leaveRoom' });
        }}>← 나가기</button>
        <div id="roomTitle">{room.title} · {room.roomName}</div>
        <div id="roomSub">{roomSub}</div>
      </div>
      <div className="layout">
        <div className="col" id="roomMain">
          {GameComp
            ? <GameComp ws={ws} />
            : <div className="panel muted" style={{ padding: 40 }}>이 게임은 아직 React로 이전 안 됨: <b>{room.gameType}</b></div>}
          {/* 판 하단 채팅 입력바 — 사이드바 채팅이 아닌 게임(오셀로/고스톱/섯다) */}
          {!sidebarChat && (
            <div className="feltchat">
              <input id="feltChatInput" maxLength={200} placeholder="여기에 채팅 입력… (Enter)" autoComplete="off" value={chatText}
                onChange={(e) => setChatText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendChat()} />
              <button id="feltChatSend" onClick={sendChat}>전송</button>
            </div>
          )}
        </div>
        <div className="col">
          <div className="panel" id="roomInfo" style={{ width: 280 }} />
          <div className="panel" style={{ width: 280 }}>
            <h3>알림</h3>
            <div className="log" id="roomLog">{(notices || []).map((t, i) => <div key={i}>· {t}</div>)}</div>
          </div>
          <div className="panel" style={{ width: 280 }}>
            <h3>채팅 기록</h3>
            <div className="chatbox" id="roomChat">
              {chat.map((c, i) => (
                <div key={i}><span className="nick" style={{ color: c.color || '#9fb3c8' }}>{c.name}</span> : {c.text}</div>
              ))}
              <div ref={chatEnd} />
            </div>
            {sidebarChat && ChatBar}
          </div>
        </div>
      </div>
    </div>
  );
}
