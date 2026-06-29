import { useState, useEffect, useRef } from 'react';

const LEVELS = [
  { v: 'easy', label: '🙂 쉬움' },
  { v: 'normal', label: '😎 보통' },
  { v: 'hard', label: '🔥 어려움' },
  { v: 'hell', label: '💀 헬' },
];

export default function Lobby({ ws }) {
  const { lobby, send, chat, myName } = ws;
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
  // 오셀로가 아니면 코치 모드 불가 → 멀티로 되돌림
  useEffect(() => { if (mode === 'coach' && !isOthello) setMode('multi'); }, [isOthello, mode]);
  const create = () => {
    if (!game) return;
    const msg = { type: 'createRoom', gameType: game, name: roomName.trim() };
    if (mode === 'single') { msg.singleplayer = true; msg.botLevel = isOthello ? level : 'hard'; }
    else if (mode === 'coach') { msg.singleplayer = true; msg.coach = true; msg.botLevel = 'hell'; }   // 코치: 헬봇(Edax 최강) 고정 + 실시간 평가
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
              {rooms.length === 0 && <div className="empty">아직 방이 없어요. 게임을 고르고 아래에서 만들어보세요.</div>}
              {rooms.map((r) => {
                const g = games.find((x) => x.type === r.gameType) || {};
                const meta = r.singleplayer
                  ? `${r.coach ? '코치' : '봇전'} · 👁 관전 ${r.spectators || 0}명 · 방장 ${r.hostName || '-'}`
                  : `${r.count}명 · ${r.max || ''} · 방장 ${r.hostName || '-'}`;
                return (
                  <div key={r.id} className="roomrow">
                    <span className={`gicon g-${r.gameType}`}>
                      {g.img ? <img className="gicon-img" src={'/' + g.img} alt="" /> : (g.emoji || '🎲')}
                    </span>
                    <span className="rinfo"><div className="rname">{r.name}</div><div className="meta">{meta}</div></span>
                    <span className={`gtag g-${r.gameType}`}>{g.title || r.gameType}</span>
                    <span className={'badge' + (r.phase === 'playing' ? ' play' : '')}>{r.phase === 'playing' ? '진행중' : '대기중'}</span>
                    {r.singleplayer && <span className="badge bot">{r.coach ? '🎓 코치' : '🤖 봇전'}</span>}
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
              {isOthello && (
                <button type="button" className={`modebtn${mode === 'coach' ? ' on' : ''}`} onClick={() => setMode('coach')}>
                  <span className="mem">🎓</span>코치<small>수 평가받기</small>
                </button>
              )}
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
            {mode === 'coach' && isOthello && (
              <div className="levelpick"><span className="lvlabel">상대</span><span className="coachnote">💀 헬봇(Edax 최강) — 매 수 빡센 평가</span></div>
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
              {chat.map((c, i) => (
                <div key={i}><span className="nick" style={{ color: c.color || '#9fb3c8' }}>{c.name}</span> : {c.text}</div>
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
            <h3>접속자 <span id="onlineCount">({online.length}명)</span></h3>
            <div id="onlineList">
              {online.map((u, i) => {
                const LABEL = { lobby: '접속중', playing: '게임중', seated: '대기중' };
                const where = u.status === 'lobby' ? '접속중' : `${LABEL[u.status] || ''} · ${u.loc}`;
                return (
                  <div key={i} className={'orow' + (u.name === myName ? ' me' : '')}>
                    <span className="oname" style={{ color: u.color || '#e8eaed' }}>{u.name}</span>
                    <span className={'ostat ' + u.status}>{where}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
