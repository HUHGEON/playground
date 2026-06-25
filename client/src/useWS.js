import { useCallback, useEffect, useRef, useState } from 'react';

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// 서버 권위 WS 훅 — lobby/roomState 메시지를 상태로, send/join 노출. 세션은 localStorage.
export function useWS() {
  const [lobby, setLobby] = useState(null);
  const [room, setRoom] = useState(null); // 최신 roomState
  const [myName, setMyName] = useState(() => localStorage.getItem('hub.name') || null);
  const [connected, setConnected] = useState(false);
  const [chat, setChat] = useState([]); // {name,text,room?} 최근 채팅
  const [notices, setNotices] = useState([]); // 방 알림 로그(최신 먼저) — 바닐라 roomLog
  const [joinError, setJoinError] = useState(null); // 닉네임 거부 사유 — 바닐라 joinError
  const wsRef = useRef(null);
  const roomIdRef = useRef(null);
  const sidRef = useRef(localStorage.getItem('hub.sid'));
  if (!sidRef.current) { sidRef.current = genId(); localStorage.setItem('hub.sid', sidRef.current); }

  const send = useCallback((o) => {
    try { wsRef.current?.send(JSON.stringify(o)); } catch (e) { /* noop */ }
  }, []);

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = import.meta.env.DEV ? `ws://${location.hostname}:45678` : `${proto}://${location.host}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => {
      setConnected(true);
      const name = localStorage.getItem('hub.name');
      if (name) ws.send(JSON.stringify({ type: 'join', name, sessionId: sidRef.current }));
    };
    ws.onclose = () => setConnected(false);
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'lobby') {
        setLobby(m); setRoom(null);
        if (roomIdRef.current !== null) { roomIdRef.current = null; setChat([]); setNotices([]); }   // 방→로비 전환: 채팅/알림 초기화
        if (m.yourName) { setMyName(m.yourName); localStorage.setItem('hub.name', m.yourName); setJoinError(null); }
      } else if (m.type === 'roomState') {
        setRoom(m);
        if (m.roomId !== roomIdRef.current) { roomIdRef.current = m.roomId; setChat([]); setNotices([]); }   // 새 방 진입: 채팅/알림 초기화
        if (m.yourName) { setMyName(m.yourName); localStorage.setItem('hub.name', m.yourName); setJoinError(null); }
      } else if (m.type === 'chat') {
        setChat((prev) => [...prev.slice(-49), m]);
      } else if (m.type === 'notice') {
        setNotices((prev) => [m.text, ...prev].slice(0, 40));   // 최신 먼저, 최대 40(바닐라 addNotice)
      } else if (m.type === 'joinError') {
        localStorage.removeItem('hub.name'); setMyName(null); setJoinError(m.reason || '입장할 수 없어요.');   // 오버레이로 복귀 + 사유 표시
      } else if (m.type === 'kicked' || m.type === 'reset' || m.type === 'nameTaken') {
        if (m.type !== 'kicked') { localStorage.removeItem('hub.name'); setMyName(null); }
        setRoom(null);
      }
    };
    return () => { try { ws.close(); } catch {} };
  }, []);

  const join = useCallback((name) => {
    const n = String(name || '').trim().slice(0, 24);
    if (!n) return;
    localStorage.setItem('hub.name', n); setMyName(n);
    send({ type: 'join', name: n, sessionId: sidRef.current });
  }, [send]);

  const logout = useCallback(() => {
    localStorage.removeItem('hub.sid'); localStorage.removeItem('hub.name');
    send({ type: 'logout' });
    location.reload();
  }, [send]);

  return { lobby, room, myName, connected, chat, notices, joinError, send, join, logout, sessionId: sidRef.current };
}
