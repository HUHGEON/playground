import { useWS } from './useWS.js';
import NameOverlay from './NameOverlay.jsx';
import Lobby from './Lobby.jsx';
import Room from './Room.jsx';

export default function App() {
  const ws = useWS();
  if (!ws.myName) return <NameOverlay onJoin={ws.join} connected={ws.connected} />;
  if (ws.room) return <Room ws={ws} />;
  if (ws.lobby) return <Lobby ws={ws} />;
  return <div className="loading">연결 중…</div>;
}
