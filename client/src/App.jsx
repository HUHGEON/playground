import { useWS } from './useWS.js';
import NameOverlay from './NameOverlay.jsx';
import Lobby from './Lobby.jsx';
import Room from './Room.jsx';

export default function App() {
  const ws = useWS();
  return (
    <>
      {/* 방(게임) 안에선 헤더/유저바 숨김 — 게임이 화면 전체를 쓰게(바닥 위에 'playground' 안 뜨게) */}
      {!ws.room && <h1>play<span className="gr">ground</span></h1>}
      {ws.myName && !ws.room && (
        <div id="userbar">
          <span id="meLabel">{ws.myName}</span>
          <button className="sub" style={{ padding: '5px 10px', fontSize: 12 }} onClick={ws.logout}>로그아웃</button>
        </div>
      )}
      {!ws.myName
        ? <NameOverlay onJoin={ws.join} connected={ws.connected} />
        : ws.room
          ? <Room ws={ws} />
          : ws.lobby
            ? <Lobby ws={ws} />
            : <div className="loading">연결 중…</div>}
    </>
  );
}
