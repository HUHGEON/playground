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

// 좌표 표기 — [r,c] → 'D3' (열 a~h, 행 1~8)
// 손해(돌 단위) → 등급 라벨/색
function rateMove(loss, rank) {
  if (rank === 1 || loss <= 0) return { label: '최선!', cls: 'best', emoji: '🌟' };
  if (loss <= 1) return { label: '아주 좋음', cls: 'great', emoji: '👍' };
  if (loss <= 3) return { label: '좋음', cls: 'good', emoji: '🙂' };
  if (loss <= 6) return { label: '조금 아쉬움', cls: 'inacc', emoji: '🤔' };
  if (loss <= 12) return { label: '실수', cls: 'mistake', emoji: '⚠️' };
  return { label: '큰 실수', cls: 'blunder', emoji: '💥' };
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

  // 봇전: 봇 차례면 워커가 수 계산 → botMove. + 코치 모드(내 차례에 모든 수 미리 분석 → hover로 평가 표시).
  const workerRef = useRef(null);
  const lastBotSeq = useRef(-1);
  const analyzedKey = useRef(-1);                // 이미 분석한 내-차례 키(=직전 수 seq)
  const coachMode = !!s.coach;                   // 코치는 별도 모드(인게임 토글 X)
  const [analysis, setAnalysis] = useState(null);   // null=분석 전/중, {best,total,moves[]}=완료
  const [hoverCell, setHoverCell] = useState(null); // hover 중인 칸 인덱스

  // 워커 보장 — 봇 수 / 전체분석 응답을 type으로 분기
  const ensureWorker = () => {
    if (workerRef.current) return workerRef.current;
    try {
      const w = new Worker('/othello-worker.js?v=eval11');   // ?v 바뀌면 워커가 edax.js/wasm까지 새로 받음(캐시 버스트)
      w.onmessage = (e) => {
        const d = e.data || {};
        if (d.type === 'analyzeAll') { setAnalysis({ ...(d.result || { moves: [], total: 0 }), key: d.reqId }); return; }
        if (d.type === 'move' && d.mv) send({ type: 'botMove', r: d.mv[0], c: d.mv[1] });
      };
      w.onerror = () => { workerRef.current = null; };
      workerRef.current = w;
    } catch { workerRef.current = null; }
    return workerRef.current;
  };
  useEffect(() => () => { if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; } }, []);

  // 봇 구동 — 봇 차례면 수 계산(코치 보류 없음: 두기 전에 이미 평가를 봤으므로)
  useEffect(() => {
    if (!s.singleplayer || s.phase !== 'playing' || !myColor || s.turn === myColor) return undefined;
    const seq = s.lastMove ? s.lastMove.seq : 0;
    if (seq === lastBotSeq.current) return undefined;
    lastBotSeq.current = seq;
    const level = s.botLevel || 'normal';
    const budget = (level === 'hard' || level === 'hell') ? 3000 : (level === 'normal' ? 1200 : 350);
    const w = ensureWorker(); if (!w) return undefined;
    const t = setTimeout(() => { if (workerRef.current) workerRef.current.postMessage({ type: 'move', board: s.board, me: s.turn, level, budgetMs: budget }); }, 550 + Math.random() * 650);
    return () => clearTimeout(t);
  }, [s, myColor, send]);

  // 코치: 내 차례가 되면 모든 합법수를 한 번에 분석(캐시) → hover는 이 캐시만 읽음
  useEffect(() => {
    if (!coachMode || !s.singleplayer || s.phase !== 'playing' || !myColor || s.turn !== myColor) { setHoverCell(null); return; }
    const key = s.lastMove ? s.lastMove.seq : 0;
    if (analyzedKey.current === key) return;     // 이 국면 이미 분석함
    analyzedKey.current = key;
    const w = ensureWorker(); if (!w) { setAnalysis({ moves: [], total: 0, key }); return; }
    w.postMessage({ type: 'analyzeAll', board: s.board, me: myColor, reqId: key });
  }, [s, coachMode, myColor]);

  const playMove = (r, c) => { if (myTurn) send({ type: 'move', r, c }); };

  // 하단 = 항상 내 좌석(관전이면 흑), 상단 = 상대
  const botSeat = myColor === 'W' ? 'W' : 'B';
  const topSeat = botSeat === 'B' ? 'W' : 'B';

  // 보드 셀
  const lm = s.lastMove;
  const placedIdx = lm ? lm.placed.r * 8 + lm.placed.c : -1;
  const legalSet = new Set((s.legal || []).map(([r, c]) => r * 8 + c));
  // 코치: 분석은 현재 국면(키) 것만 유효 — 턴 바뀌면 직전 분석 무시하고 '분석 중' 표시
  const curKey = s.lastMove ? s.lastMove.seq : 0;
  const validAnalysis = (analysis && analysis.key === curKey) ? analysis : null;
  const analyzing = coachMode && myTurn && validAnalysis === null;   // 분석 중(버퍼링)
  const cellEval = {};
  if (coachMode && validAnalysis && validAnalysis.moves) for (const mv of validAnalysis.moves) cellEval[mv.r * 8 + mv.c] = mv;
  const hoverMd = hoverCell != null ? cellEval[hoverCell] : null;
  const hoverRate = hoverMd ? rateMove(hoverMd.loss, hoverMd.rank) : null;

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
              const md = (coachMode && myTurn) ? cellEval[i] : null;   // 코치: 이 칸 평가(있으면) — 색 노출 X, hover로만
              if (md) cls += ' ocoached' + (i === hoverCell ? ' ohover' : '');
              const handlers = (coachMode && myTurn && legalSet.has(i))
                ? { onMouseEnter: () => setHoverCell(i), onMouseLeave: () => setHoverCell((x) => (x === i ? null : x)) }
                : {};
              return (
                <div key={i} className={cls} onClick={() => playMove(r, c)} {...handlers}>{inner}</div>
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
      {coachMode && myTurn && (
        <div id="oCoach" className={hoverRate ? hoverRate.cls : 'pending'}>
          {analyzing ? (
            <div className="ocoach-pending"><span className="ospin" /> 분석 중…</div>
          ) : hoverMd ? (
            <>
              <div className="ocoach-main">
                <span className="ocoach-badge">{hoverRate.emoji} {hoverRate.label}</span>
                {hoverMd.loss > 0 && <span className="ocoach-loss" title="최선보다 이만큼 손해">최선보다 −{hoverMd.loss}</span>}
                <span className="ocoach-rank">둘 곳 {validAnalysis.total}개 중 <b>{hoverMd.rank}위</b></span>
              </div>
              <div className="ocoach-line">{hoverMd.reason}</div>
            </>
          ) : (
            <div className="ocoach-pending">👆 둘 수 있는 곳에 마우스를 올리면 그 수의 평가가 떠요</div>
          )}
        </div>
      )}
      <Panel s={s} seat={botSeat} isMe={myColor === botSeat} />
      <div className="btnrow" id="oCtrl">{ctrl}</div>
      {infoEl && createPortal(sidebar, infoEl)}
    </>
  );
}
