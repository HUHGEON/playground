import { useState, useEffect, useRef } from 'react';

const LEVELS = [
  { v: 'easy', label: '🙂 쉬움' },
  { v: 'normal', label: '😎 보통' },
  { v: 'hard', label: '🔥 어려움' },
  { v: 'hell', label: '💀 헬' },
];

export default function Lobby({ ws }) {
  const { lobby, send, chat } = ws;
  const games = lobby?.games || [];
  const rooms = lobby?.rooms || [];
  const online = lobby?.online || [];
  const [game, setGame] = useState(games[0]?.type || null);
  const [mode, setMode] = useState('multi');
  const [level, setLevel] = useState('normal');
  const [roomName, setRoomName] = useState('');
  const [chatText, setChatText] = useState('');
  const chatEnd = useRef(null);

  useEffect(() => { if (!game && games.length) setGame(games[0].type); }, [games, game]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'end' }); }, [chat]);

  const isOthello = game === 'othello';
  const create = () => {
    if (!game) return;
    const msg = { type: 'createRoom', gameType: game, name: roomName.trim() };
    if (mode === 'single') { msg.singleplayer = true; msg.botLevel = isOthello ? level : 'hard'; }
    send(msg);
  };
  const sendChat = () => { const t = chatText.trim(); if (!t) return; send({ type: 'chat', text: t }); setChatText(''); };

  return (
    <div id="lobbyView">
      <div className="layout">
        <div className="col">
          <div className="panel" style={{ minWidth: 360 }}>
            <h3>방 목록</h3>
            <div id="roomList">
              {rooms.length === 0 && <p className="muted" style={{ fontSize: 13 }}>아직 방이 없어요. 게임을 고르고 아래에서 만들어보세요.</p>}
              {rooms.map((r) => {
                const g = games.find((x) => x.type === r.gameType);
                return (
                  <div key={r.id} className="roomrow">
                    <span className={`gicon g-${r.gameType}`}>
                      {g?.img ? <img className="gicon-img" src={'/' + g.img} alt="" /> : (g?.emoji || '🎲')}
                    </span>
                    <div className="rinfo">
                      <div className="rname">{r.name}</div>
                      <div className="meta">
                        {r.singleplayer ? `봇전 · 👁 관전 ${r.spectators || 0}명` : `${r.count}명 · ${r.max || ''}`}
                        {r.hostName ? ` · 방장 ${r.hostName}` : ''}
                      </div>
                    </div>
                    <button onClick={() => send({ type: 'enterRoom', roomId: r.id })}>{r.singleplayer ? '관전' : '입장'}</button>
                  </div>
                );
              })}
            </div>

            <h3 style={{ marginTop: 16 }}>새 방 만들기 — 게임 선택</h3>
            <div className="gamepick">
              {games.map((g) => (
                <button key={g.type} className={`opt${g.type === game ? ' on' : ''}`} onClick={() => setGame(g.type)}>
                  {g.img ? <img className="em-img" src={'/' + g.img} alt="" /> : <span className="em">{g.emoji}</span>}
                  {g.title}
                </button>
              ))}
            </div>

            <div className="modepick">
              <button type="button" className={`modebtn${mode === 'multi' ? ' on' : ''}`} onClick={() => setMode('multi')}>
                <span className="mem">👥</span>멀티<small>친구랑 같이</small>
              </button>
              <button type="button" className={`modebtn${mode === 'single' ? ' on' : ''}`} onClick={() => setMode('single')}>
                <span className="mem">🤖</span>봇전<small>나 vs 봇</small>
              </button>
            </div>

            {mode === 'single' && isOthello && (
              <div className="levelpick">
                <span className="lvlabel">봇 난이도</span>
                <div className="lvbtns">
                  {LEVELS.map((l) => (
                    <button key={l.v} type="button" className={`levelbtn${level === l.v ? ' on' : ''}`} onClick={() => setLevel(l.v)}>{l.label}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="createbar">
              <input maxLength={24} placeholder="방 이름 (예: 한판하실분)" autoComplete="off" value={roomName}
                onChange={(e) => setRoomName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
              <button onClick={create}>방 만들기</button>
            </div>
          </div>
        </div>

        <div className="col">
          <div className="panel" style={{ width: 300 }}>
            <h3>로비 채팅</h3>
            <div className="chatbox" id="lobbyChat">
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
          <div className="panel" style={{ width: 300 }}>
            <h3>접속자 <span id="onlineCount">{online.length}</span></h3>
            <div id="onlineList">
              {online.map((o, i) => (
                <div key={i} className="online-row">
                  <span className="dot" data-st={o.status} />
                  <span className="on-name">{o.name}</span>
                  <span className="on-loc">{o.loc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
