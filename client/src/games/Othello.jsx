import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCountdown } from './Secs.jsx';
import '../othello.css';

const AVATARS = ['🐼', '🦊', '🐯', '🐸', '🐵', '🦁', '🐺', '🐻', '🦝', '🐰', '🦉', '🐢'];
function avatar(name) {
  let h = 0; const s = name || '?';
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

function Panel({ s, seat, isMe }) {
  const name = seat === 'B' ? (s.blackName || '흑') : (s.whiteName || '백');
  const color = seat === 'B' ? s.blackColor : s.whiteColor;
  const sc = seat === 'B' ? s.score.B : s.score.W;
  const isTurn = s.phase === 'playing' && s.turn === seat;
  const discCls = seat === 'B' ? 'black' : 'white';
  const sym = seat === 'B' ? '흑 ●' : '백 ○';
  let status;
  if (s.phase === 'finished') status = '대국 종료';
  else if (s.phase !== 'playing') status = '대기 중';
  else if (isTurn) status = isMe ? '🟢 내 차례 — 둘 곳 클릭' : '🟢 두는 중…';
  else status = '⏳ 대기 중';
  // 매초 틱하는 값 — 바(olevelfill)·숫자·≤5초 빨강 번쩍 전부 이 값에서 파생(서버 푸시 사이에도 줄어듦)
  const secs = useCountdown(isTurn && s.secondsLeft != null ? s.secondsLeft : null);
  const prog = (isTurn && secs != null) ? Math.max(6, Math.min(100, Math.round(secs / 30 * 100))) : 0;
  const danger = isMe && isTurn && secs != null && secs <= 5;
  const cls = 'opanel' + (isTurn ? ' turn' : '') + (danger ? ' danger' : '');
  return (
    <div className={cls} data-player={name}>
      <div className="olevel"><div className="olevelfill" style={{ width: prog + '%' }} /></div>
      <div className="oavatar" style={{ borderColor: color || '#ecc659' }}>{avatar(name)}</div>
      <div className="oinfo">
        <div className="oname">{name} <span className={'osym ' + discCls}>{sym}{isMe ? ' (나)' : ''}</span></div>
        <div className="ostatus">
          {status}
          {isTurn && secs != null && <> <span className="osecs">{secs}초</span></>}
        </div>
      </div>
      <div className="oscore"><span className={'disc-mini ' + discCls} /><span className="oscorenum">{sc}</span></div>
    </div>
  );
}

export default function Othello({ ws }) {
  const s = ws.room;
  const send = ws.send;
  const [infoEl, setInfoEl] = useState(null);
  const [passToast, setPassToast] = useState('');
  const lastPassSeq = useRef(0);
  useEffect(() => { setInfoEl(document.getElementById('roomInfo')); }, []);
  // 패스 토스트 — 둘 곳 없어 패스 시 "X님이 둘 곳이 없습니다" 2.2초(바닐라 showOToast)
  useEffect(() => {
    if (s.passSeq && s.passSeq !== lastPassSeq.current) {
      lastPassSeq.current = s.passSeq;
      if (s.passName) {
        setPassToast(s.passName + '님이 둘 곳이 없습니다');
        const t = setTimeout(() => setPassToast(''), 2200);
        return () => clearTimeout(t);
      }
    } else if (!s.passSeq) { lastPassSeq.current = 0; }
    return undefined;
  }, [s.passSeq, s.passName]);
  // 대국 중 나가면 기권 — 나가기 버튼이 확인창 띄우도록 메시지 설정(바닐라와 동일)
  useEffect(() => {
    window.leaveConfirm = (s.phase === 'playing' && (myColor === 'B' || myColor === 'W')) ? '대국 중 나가면 기권 처리됩니다. 나가시겠어요?' : null;
    return () => { window.leaveConfirm = null; };
  });

  // 내 색은 닉네임 기준으로 판별 (yourRole은 종료 시 뒤집히는 버그가 있어 사용 X)
  const myName = s.yourName;
  const myColor = myName && myName === s.blackName ? 'B' : (myName && myName === s.whiteName ? 'W' : null);
  const myTurn = s.phase === 'playing' && myColor != null && myColor === s.turn;

  // 봇전: 봇 차례면 브라우저 워커가 수 계산 → botMove 전송(서버는 합법성만 검증). 바닐라 maybeDriveBot 이전.
  const workerRef = useRef(null);
  const lastBotSeq = useRef(-1);
  useEffect(() => () => { if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; } }, []);
  useEffect(() => {
    if (!s.singleplayer || s.phase !== 'playing' || !myColor || s.turn === myColor) return undefined;
    const seq = s.lastMove ? s.lastMove.seq : 0;
    if (seq === lastBotSeq.current) return undefined;       // 이 상태엔 이미 요청함
    lastBotSeq.current = seq;
    const level = s.botLevel || 'normal';
    const budget = (level === 'hard' || level === 'hell') ? 3000 : (level === 'normal' ? 1200 : 350);
    if (!workerRef.current) {
      try {
        workerRef.current = new Worker('/othello-worker.js');
        workerRef.current.onmessage = (e) => { const mv = e.data; if (mv) send({ type: 'botMove', r: mv[0], c: mv[1] }); };
        workerRef.current.onerror = () => { workerRef.current = null; };
      } catch { workerRef.current = null; }
    }
    const w = workerRef.current;
    const t = setTimeout(() => { if (w) w.postMessage({ board: s.board, me: s.turn, level, budgetMs: budget }); }, 550 + Math.random() * 650);
    return () => clearTimeout(t);
  }, [s, myColor, send]);

  // 하단 = 항상 내 좌석(관전이면 흑), 상단 = 상대
  const botSeat = myColor === 'W' ? 'W' : 'B';
  const topSeat = botSeat === 'B' ? 'W' : 'B';

  // 보드 셀
  const lm = s.lastMove;
  const placedIdx = lm ? lm.placed.r * 8 + lm.placed.c : -1;
  const legalSet = new Set((s.legal || []).map(([r, c]) => r * 8 + c));

  // 뒤집힌 돌을 놓은 위치에서 거리순으로 촤르르륵 — 이전 보드와 비교해 바뀐 칸에 딜레이 부여
  const prevBoard = useRef(null);
  const flipDelay = {};
  if (prevBoard.current && lm) {
    const pr = lm.placed.r, pc = lm.placed.c;
    for (let i = 0; i < 64; i++) {
      const r = Math.floor(i / 8), c = i % 8;
      const old = prevBoard.current[r] && prevBoard.current[r][c], cur = s.board[r][c];
      if (old && cur && old !== cur) flipDelay[i] = (Math.max(Math.abs(r - pr), Math.abs(c - pc)) - 1) * 105;   // 거리 1=먼저, 105ms 간격(순차감)
    }
  }
  useEffect(() => { prevBoard.current = s.board; });   // 렌더 후 현재 보드 저장(다음 렌더의 '이전')

  // 결과 패널
  let win = null;
  if (s.phase === 'finished') {
    const winnerName = s.winner === 'B' ? (s.blackName || '흑') : (s.whiteName || '백');
    const scoreLine = '● ' + s.score.B + ' : ' + s.score.W + ' ○';
    let cls, emoji, title;
    if (s.winner === 'draw') { cls = 'draw'; emoji = '🤝'; title = '무승부'; }
    else if (myColor && myColor === s.winner) { cls = 'win'; emoji = '🏆'; title = '승리!'; }
    else if (myColor) { cls = 'lose'; emoji = '😢'; title = '패배'; }
    else { cls = 'spec'; emoji = '🏆'; title = winnerName + ' 승리'; }
    win = { cls, emoji, title, scoreLine };
  }

  // 컨트롤 버튼
  const ctrl = [];
  if (s.canStart && s.singleplayer) {
    ctrl.push(<button key="cb" className="ostart oblack" onClick={() => send({ type: 'start', color: 'B' })}>⚫ 흑 (선)</button>);
    ctrl.push(<button key="cw" className="ostart owhite" onClick={() => send({ type: 'start', color: 'W' })}>⚪ 백 (후)</button>);
  } else if (s.canStart) {
    ctrl.push(<button key="cs" className="ostart" onClick={() => send({ type: 'start' })}>{s.phase === 'finished' ? '다음 대국 시작' : '게임 시작'}</button>);
  } else if (s.isHost && (s.phase === 'lobby' || s.phase === 'finished')) {
    ctrl.push(<button key="cw0" className="ostart" disabled>상대 입장 대기 중</button>);
  }
  if (s.canResign) ctrl.push(<button key="cr" className="danger" onClick={() => { if (confirm('기권하시겠습니까?')) send({ type: 'resign' }); }}>기권</button>);
  if (s.canDefer) ctrl.push(<button key="cd" className="sub" onClick={() => send({ type: 'defer' })}>순위 미루기</button>);

  // 대기열(사이드바) — #roomInfo 포털
  const sidebar = (
    <>
      <h3>대기열 (승자 잔류 · 패자 후순위)</h3>
      <div id="queue">
        {(s.queue || []).map((p, i) => {
          const rowCls = 'qrow' + (i === s.yourQueueIndex ? ' me' : '') + (i < 2 ? ' play' : '');
          const num = i < 2 ? '▶' : (i - 1);
          let tag;
          if (p.seat === 'B') tag = <span className="tag b">흑 ●</span>;
          else if (p.seat === 'W') tag = <span className="tag w">백 ○</span>;
          else if (p.seat === 'next') tag = <span className="tag">다음 대국</span>;
          else tag = <span className="tag">대기 {i - 1}</span>;
          return (
            <div key={i} className={rowCls}>
              <span className="qnum">{num}</span>
              <span className="qname" style={{ color: p.color || '#e8eaed' }}>{p.name}</span>
              {tag}
              {p.host && <span className="tag host">방장</span>}
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <>
      <Panel s={s} seat={topSeat} isMe={myColor === topSeat} />
      <div id="oResult" />
      <div id="oBoardWrap">
        <div id="oFrame">
          <div className="ocorner tl" /><div className="ocorner tr" />
          <div className="ocorner bl" /><div className="ocorner br" />
          <div id="board">
            {Array.from({ length: 64 }).map((_, i) => {
              const r = Math.floor(i / 8), c = i % 8;
              const v = s.board[r][c];
              let cls = 'ocell';
              if (lm && i === placedIdx && v) cls += ' last';
              let inner = null;
              if (v) {
                const fd = flipDelay[i];
                const isPlaced = lm && i === placedIdx;
                const newColor = v === 'B' ? 'black' : 'white';
                if (fd != null) {
                  const oldColor = newColor === 'black' ? 'white' : 'black';   // 뒤집기 전 = 반대색(양면 돌의 뒷면)
                  inner = (
                    <div className="disc oflip3d" style={{ animationDelay: fd + 'ms' }}>
                      <span className={'oface ' + newColor} />
                      <span className={'oface oback ' + oldColor} />
                    </div>
                  );
                } else {
                  inner = <div className={'disc ' + newColor + (isPlaced ? ' place' : '')} />;
                }
              } else if (s.phase === 'playing' && legalSet.has(i)) {
                cls += myTurn ? ' playable' : ' hint';
              }
              return (
                <div key={i} className={cls} onClick={() => { if (myTurn) send({ type: 'move', r, c }); }}>{inner}</div>
              );
            })}
          </div>
        </div>
        <div id="oToast" className={passToast ? 'show' : ''}>{passToast}</div>
        <div id="oWinPanel">
          {win && (
            <div className={'owin-card ' + win.cls}>
              <div className="owin-emoji">{win.emoji}</div>
              <div className="owin-title">{win.title}</div>
              <div className="owin-sub">{win.scoreLine}</div>
            </div>
          )}
        </div>
      </div>
      <Panel s={s} seat={botSeat} isMe={myColor === botSeat} />
      <div className="btnrow" id="oCtrl">{ctrl}</div>
      {infoEl && createPortal(sidebar, infoEl)}
    </>
  );
}
