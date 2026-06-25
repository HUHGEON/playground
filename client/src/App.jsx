import { useWS } from './useWS.js';
import NameOverlay from './NameOverlay.jsx';
import Lobby from './Lobby.jsx';
import Room from './Room.jsx';

export default function App() {
  const ws = useWS();
  return (
    <>
      <h1>play<span className="gr">ground</span></h1>
      {ws.myName && (
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
