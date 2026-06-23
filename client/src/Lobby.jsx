import { useState, useEffect, useRef } from 'react';

const LEVELS = [
  { v: 'easy', label: '🙂 쉬움' },
  { v: 'normal', label: '😎 보통' },
  { v: 'hard', label: '🔥 어려움' },
  { v: 'hell', label: '💀 헬' },
];

export default function Lobby({ ws }) {
  const { lobby, myName, send, logout, chat } = ws;
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
    <div className="lobby">
      <header className="topbar">
        <h1 className="brand">play<span className="gr">ground</span></h1>
        <div className="me-chip"><span>{myName}</span><button className="ghost" onClick={logout}>로그아웃</button></div>
      </header>

      <div className="lobby-grid">
        <section className="panel">
          <h3>방 목록</h3>
          {rooms.length === 0 && <p className="muted">아직 방이 없어요. 게임을 고르고 아래에서 만들어보세요.</p>}
          <div className="roomlist">
            {rooms.map((r) => {
              const g = games.find((x) => x.type === r.gameType);
              return (
                <button key={r.id} className="roomrow" onClick={() => send({ type: 'enterRoom', roomId: r.id })}>
                  <span className={`gicon g-${r.gameType}`}>
                    {g?.img ? <img className="gicon-img" src={'/' + g.img} alt="" /> : (g?.emoji || '🎲')}
                  </span>
                  <span className="rinfo">
                    <span className="rname">{r.name}</span>
                    <span className="rmeta">
                      {r.singleplayer ? `봇전 · 👁 관전 ${r.spectators || 0}` : `${r.count}명 · ${r.max || ''}`}
                      {r.hostName ? ` · 방장 ${r.hostName}` : ''}
                    </span>
                  </span>
                  <span className="rgo">{r.singleplayer ? '관전' : '입장'} ▸</span>
                </button>
              );
            })}
          </div>

          <h4 className="newroom">새 방 만들기 — 게임 선택</h4>
          <div className="gamepick">
            {games.map((g) => (
              <button key={g.type} className={`opt${g.type === game ? ' on' : ''}`} onClick={() => setGame(g.type)}>
                {g.img ? <img className="em-img" src={'/' + g.img} alt="" /> : <span className="em">{g.emoji}</span>}
                {g.title}
              </button>
            ))}
          </div>
          <div className="modepick">
            <button className={`modebtn${mode === 'multi' ? ' on' : ''}`} onClick={() => setMode('multi')}>👥 멀티<small>친구랑 같이</small></button>
            <button className={`modebtn${mode === 'single' ? ' on' : ''}`} onClick={() => setMode('single')}>🤖 봇전<small>나 vs 봇</small></button>
          </div>
          {mode === 'single' && isOthello && (
            <div className="levelpick">
              <span className="lvlabel">봇 난이도</span>
              <div className="lvbtns">
                {LEVELS.map((l) => (
                  <button key={l.v} className={`levelbtn${level === l.v ? ' on' : ''}`} onClick={() => setLevel(l.v)}>{l.label}</button>
                ))}
              </div>
            </div>
          )}
          <div className="createrow">
            <input placeholder="방 이름 (예: 한판하실분)" value={roomName} maxLength={20}
              onChange={(e) => setRoomName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
            <button className="primary" onClick={create}>방 만들기</button>
          </div>
        </section>

        <aside className="lobby-side">
          <div className="panel">
            <h4>접속자 ({online.length})</h4>
            <div className="online-list">
              {online.map((o, i) => (
                <div key={i} className="online-row">
                  <span className="dot" data-st={o.status} />
                  <span className="on-name">{o.name}</span>
                  <span className="on-loc">{o.loc}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel chatpanel">
            <h4>로비 채팅</h4>
            <div className="chatlog">
              {chat.length === 0 && <p className="muted small">아직 대화가 없어요.</p>}
              {chat.map((c, i) => (
                <div key={i} className="chatline"><b style={{ color: c.color || 'var(--gold)' }}>{c.name}</b> {c.text}</div>
              ))}
              <div ref={chatEnd} />
            </div>
            <div className="createrow">
              <input placeholder="메시지... (Enter)" value={chatText}
                onChange={(e) => setChatText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendChat()} />
              <button className="primary" onClick={sendChat}>전송</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
