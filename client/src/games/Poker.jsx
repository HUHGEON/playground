import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useFitStage } from './useFitStage.js';
import Secs from './Secs.jsx';
import '../poker.css';

// 세븐포커 — 바닐라 public/poker.js의 R.render(s)를 React로 이전.
// 애니메이션(딜 모션·토스트·돈 던지기·채팅 말풍선)은 생략, 상태 기반 정적 렌더만.

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

// ── 트럼프 카드 ──
const SUITSYM = ['♠', '♥', '♦', '♣'];
const SUITCODE = ['S', 'H', 'D', 'C'];
const RANKLBL = (r) => (r === 14 ? 'A' : r === 13 ? 'K' : r === 12 ? 'Q' : r === 11 ? 'J' : r === 10 ? '10' : String(r));
const RANKCODE = (r) => (r === 14 ? 'A' : r === 13 ? 'K' : r === 12 ? 'Q' : r === 11 ? 'J' : String(r));

// card={r,s} 또는 {hidden:true}. 바닐라 cardEl 포트(이미지 onerror→noimg 폴백 유지).
function TCard({ card, w, h, win, hole, selectable, onClick }) {
  const [noimg, setNoimg] = useState(false);
  const style = w ? { width: w + 'px', height: h + 'px' } : undefined;
  if (!card || card.hidden) {
    return <div className="tcard back" style={style} />;
  }
  const red = card.s === 1 || card.s === 2;
  const sym = SUITSYM[card.s], lbl = RANKLBL(card.r);
  const cls = 'tcard ' + (red ? 'red' : 'blk')
    + (win ? ' win' : '') + (hole ? ' hole' : '')
    + (selectable ? ' selectable' : '') + (noimg ? ' noimg' : '');
  return (
    <div className={cls} style={style} onClick={onClick}>
      <div className="cface"><div className="cr">{lbl}</div><div className="cs">{sym}</div><div className="cpip">{sym}</div></div>
      {!noimg && (
        <img src={'/cards-trump/' + RANKCODE(card.r) + SUITCODE[card.s] + '.svg'} alt={lbl + sym}
          draggable={false} onError={() => setNoimg(true)} />
      )}
    </div>
  );
}

// ── 족보표(사이드바) ──
const PRANK = [
  ['로열 스트레이트 플러시', [[14, 0], [13, 0], [12, 0], [11, 0], [10, 0]]],
  ['스트레이트 플러시', [[9, 1], [8, 1], [7, 1], [6, 1], [5, 1]]],
  ['포카드', [[14, 0], [14, 1], [14, 2], [14, 3], [13, 0]]],
  ['풀하우스', [[13, 0], [13, 1], [13, 2], [9, 0], [9, 1]]],
  ['플러시', [[14, 2], [11, 2], [9, 2], [5, 2], [2, 2]]],
  ['스트레이트', [[9, 3], [8, 1], [7, 2], [6, 0], [5, 3]]],
  ['트리플', [[12, 0], [12, 1], [12, 2], [9, 3], [4, 1]]],
  ['투페어', [[14, 0], [14, 1], [13, 2], [13, 3], [9, 0]]],
  ['원페어', [[10, 0], [10, 1], [13, 2], [8, 3], [3, 1]]],
  ['하이카드 (탑)', [[14, 0], [13, 1], [11, 2], [8, 3], [4, 0]]],
];

// 좌석 좌표(테이블 % 기준). 나는 항상 남쪽(50,87). 나머지는 시계방향.
const LAYOUTS = {
  2: [[50, 10]],
  3: [[16, 34], [84, 34]],
  4: [[12.7, 50], [50, 10], [87.3, 50]],
  5: [[12.7, 64], [12.7, 30], [87.3, 30], [87.3, 64]],
  6: [[12.7, 68.9], [12.7, 31.1], [50, 10], [87.3, 31.1], [87.3, 68.9]],
};

// 한 줄 카드 배치(>3장이면 겹침, 아니면 간격)
function CardRow({ cards, kind, cw, ch, p }) {
  const overlap = cards.length > 3 ? -Math.round(cw * 0.42) : 4;
  return (
    <div className={'pcardrow ' + kind}>
      {cards.map((c, j) => (
        <div key={j} style={j > 0 ? { marginLeft: overlap + 'px' } : undefined}>
          <TCard card={c} w={cw} h={ch} win={p.win}
            hole={kind === 'hidden' && p.isMe && c && !c.hidden} />
        </div>
      ))}
    </div>
  );
}

function Seat({ p, topHalf, style }) {
  const cw = p.isMe ? 44 : 40, ch = p.isMe ? 62 : 58;
  const cls = 'pseat' + (p.isMe ? ' me' : '') + (p.isTurn ? ' turn' : '')
    + (p.folded ? ' folded' : '') + (p.win ? ' win' : '') + (p.waiting ? ' waiting' : '');

  // 카드 영역
  let area;
  if (p.waiting) {
    area = <div className="pcards-area"><div className="emptyseat">{p.bankrupt ? '💸' : '🪑'}</div></div>;
  } else if (p.isMe) {
    const hidden = (p.cards || []).filter((c) => c && !c.up);
    area = <div className="pcards-area">{hidden.length ? <CardRow cards={hidden} kind="hidden" cw={cw} ch={ch} p={p} /> : null}</div>;
  } else {
    let cards = [];
    if (p.cards && p.cards.length) {
      const open = p.cards.filter((c) => c && c.up);
      const hidden = p.cards.filter((c) => !(c && c.up));
      cards = [...hidden, ...open];
    } else if (p.inHand) cards = [{ hidden: true }, { hidden: true }, { hidden: true }];
    area = <div className="pcards-area">{cards.length ? <CardRow cards={cards} kind="flat" cw={cw} ch={ch} p={p} /> : null}</div>;
  }

  // 명패
  const badges = [];
  if (p.waiting) {
    badges.push(<span key="w" className={'pbadge ' + (p.bankrupt ? 'bust' : 'die')}>{p.bankrupt ? '파산' : '대기'}</span>);
  } else {
    if (p.host) badges.push(<span key="h" className="pbadge host">D</span>);
    if (p.allin) badges.push(<span key="a" className="pbadge allin">올인</span>);
    else if (p.folded) badges.push(<span key="d" className="pbadge die">다이</span>);
  }
  let info = '';
  if (p.handName && !p.isMe) info = (p.win ? '🏆 ' : '') + p.handName;
  else if (p.act && !p.folded) info = p.act + (p.contrib ? ' +' + won(p.contrib) : '');

  const pill = (
    <div className="pname-pill">
      {badges}
      <div className="pn" style={{ color: p.color || '#f4dd9c' }}>{p.name}</div>
      <div className="pc">💵 {won(p.chips)}</div>
      <div className="pi">{info}</div>
    </div>
  );

  return (
    <div className={cls} style={style} data-player={p.name}>
      {topHalf ? <>{pill}{area}</> : <>{area}{pill}</>}
    </div>
  );
}

export default function Poker({ ws }) {
  const s = ws.room;
  const send = ws.send;
  const [infoEl, setInfoEl] = useState(null);
  const [rankOpen, setRankOpen] = useState(false);
  useFitStage('pokerStage', 'pokerFelt', { max: 2.2, reserveBottom: 100 });
  useEffect(() => { setInfoEl(document.getElementById('roomInfo')); }, []);

  // ── 사이드바(대기열 + 족보) — #roomInfo로 포털 ──
  const overflow = (() => {
    // waitList 계산(아래 본문과 동일) 후 그 이후를 대기열로
    const me = (s.players || []).find((p) => p.isMe);
    const myIdx = me ? s.players.indexOf(me) : -1;
    const orderedSeated = myIdx >= 0 ? s.players.slice(myIdx).concat(s.players.slice(0, myIdx)) : (s.players || []).slice();
    const slots = Math.max(0, 6 - orderedSeated.length);
    const waitListLen = (s.waiting || []).filter((w) => w.name !== s.yourName).slice(0, slots).length;
    return (s.waiting || []).slice(waitListLen);
  })();

  const sidebar = (
    <div>
      <div id="pokerWait">
        {overflow.length > 0 && (
          <>
            <h3>대기열</h3>
            {overflow.map((w, i) => (
              <div key={i} className="qrow">
                <span className="qname" style={{ color: w.color }}>{w.name}</span>
                <span className="tag">{w.willSit ? '다음 판 합류' : '대기열'}</span>
                <span style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 800 }}>{won(w.chips)}</span>
              </div>
            ))}
          </>
        )}
      </div>
      <button id="prankToggle" className="sub" style={{ width: '100%', marginTop: 6 }}
        onClick={() => setRankOpen((v) => !v)}>📖 족보 {rankOpen ? '숨기기' : '보기'}</button>
      <div id="pokerRank" style={{ display: rankOpen ? 'block' : 'none', marginTop: 8 }}>
        <div className="jlegend">⬆ 위로 갈수록 강함 · 7장 중 베스트 5장</div>
        {PRANK.map((r, i) => (
          <div key={i} className="prow">
            <div className="prankcards">
              {r[1].map((c, k) => <TCard key={k} card={{ r: c[0], s: c[1] }} w={38} h={54} />)}
            </div>
            <div className="prk"><span className="pex">{10 - i}</span> {r[0]}</div>
          </div>
        ))}
      </div>
    </div>
  );
  const withSidebar = (felt) => <>{felt}{infoEl && createPortal(sidebar, infoEl)}</>;

  // ── 본문 좌석/카드 계산 ──
  const players = s.players || [];
  const me = players.find((p) => p.isMe);
  const myIdx = me ? players.indexOf(me) : -1;
  const orderedSeated = myIdx >= 0 ? players.slice(myIdx).concat(players.slice(0, myIdx)) : players.slice();
  const freeSlots = Math.max(0, 6 - orderedSeated.length);
  const waitList = (s.waiting || []).filter((w) => w.name !== s.yourName).slice(0, freeSlots)
    .map((w) => ({ name: w.name, color: w.color, chips: w.chips, waiting: true, bankrupt: w.chips < s.ante }));
  const ordered = orderedSeated.concat(waitList);
  const N = ordered.length || 1;
  const lay = (myIdx >= 0 && LAYOUTS[N]) ? LAYOUTS[N] : null;

  const seatStyle = (k) => {
    let L, T;
    if (k === 0 && myIdx >= 0) { L = 50; T = 87; }
    else if (lay) { L = lay[k - 1][0]; T = lay[k - 1][1]; }
    else { const a = (2 * Math.PI / N) * k; L = 50 - 38 * Math.sin(a); T = 50 + 36 * Math.cos(a); }
    return { left: L + '%', top: T + '%', _topHalf: T < 50 };
  };

  const streetTxt = s.streetLabel || (s.phase === 'finished' ? '정산' : '대기 중');
  const streetShort = s.stage === 'discard' ? '버리기'
    : (s.street ? s.street + '구간' : (s.phase === 'finished' ? '정산' : '대기'));

  // 결과 배너
  let resultText = '';
  if (s.needRestart) {
    resultText = s.canRestartGame ? '💀 한 명 빼고 전원 파산 — 당신 승리! 재시작하세요'
      : '💀 한 명 빼고 전원 파산 — 승리자 재시작 대기 중…';
  } else if (s.result) {
    if (s.result.sole) {
      const w = s.result.winners[0];
      resultText = `🏆 ${w ? w.name : ''} 단독 승리 — ${won(s.result.pot)} (비공개)`;
    } else {
      resultText = '🏆 ' + s.result.winners.map((w) => `${w.name} ${won(w.amount)}`).join(' · ');
    }
  }

  // 시작/재시작 컨트롤
  const auto = s.autoStartIn != null ? ` (${s.autoStartIn}초)` : '';
  let potCtrl = null;
  if (s.needRestart) {
    potCtrl = s.canRestartGame
      ? <button onClick={() => send({ type: 'restartGame' })}>🔄 게임 재시작</button>
      : <button disabled>승리자 재시작 대기…</button>;
  } else if (s.canStart) {
    potCtrl = <button onClick={() => send({ type: 'start' })}>{(s.phase === 'finished' ? '다음 판' : '게임 시작') + auto}</button>;
  } else if (s.isHost && s.phase !== 'playing') {
    potCtrl = <button disabled>2명 이상 필요</button>;
  } else if (s.autoStartIn != null) {
    potCtrl = <button disabled>{`다음 판 ${s.autoStartIn}초…`}</button>;
  }

  // 내 오픈 카드 박스
  let myOpenBox = null;
  if (me && me.inHand) {
    const myOpen = (me.cards || []).filter((c) => c && c.up);
    myOpenBox = (
      <div id="pokerMyOpen">
        <div className="lbl">MY OPEN CARDS</div>
        <div className="slots">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="openslot">
              {myOpen[i] ? <TCard card={myOpen[i]} w={56} h={80} win={me.win} /> : null}
            </div>
          ))}
        </div>
        {me.handName && (
          <div className="myhand">{me.win ? '🏆 ' : ''}현재 패 · <b>{me.handName}</b></div>
        )}
      </div>
    );
  }

  // ── 하단 액션 바 ──
  let barLeft = null, actions = null;
  if (s.myTurn && s.actions) {
    const callA = s.actions.find((a) => a.act === 'call');
    barLeft = callA
      ? <div className="callwrap"><span className="calllbl">콜 금액</span><span className="callamt">{callA.amount || ''}</span></div>
      : <span className="barhint">베팅 / 체크</span>;
    actions = s.actions.map((a, i) => (
      <button key={i} className={'b-' + a.act} onClick={() => send({ type: 'bet', act: a.act })}>
        <span className="blabel">{a.name}</span>
        {a.amount ? <span className="bamt">{a.amount}</span> : null}
      </button>
    ));
  } else {
    let hint;
    if (s.stage === 'discard') hint = s.myDiscarded ? '다른 플레이어가 카드를 버리는 중…' : '🃏 버릴 카드 1장을 고르세요';
    else hint = s.phase === 'playing' ? '상대 차례를 기다리는 중…' : streetTxt;
    actions = <span className="barhint">{hint}</span>;
  }

  // ── 관전/재참가/버리기 안내(테이블 위 notice) ──
  let notice = null;
  if (s.stage === 'discard' && me) {
    if (s.canDiscard && me.cards && me.cards.length) {
      notice = (
        <div className="notice-card">
          <div className="nc-line">🃏 버릴 카드 1장 선택{s.secondsLeft != null ? <> · <Secs n={s.secondsLeft} />초</> : ''}</div>
          <div className="discardrow">
            {me.cards.map((c, i) => (
              <TCard key={i} card={c} w={64} h={90} selectable onClick={() => send({ type: 'discard', idx: i })} />
            ))}
          </div>
        </div>
      );
    } else if (s.myDiscarded) {
      notice = <div className="notice-card spectate">✅ 버림 완료 — 다른 플레이어 대기 중…</div>;
    }
  } else if (!me) {
    if (s.canRequestBuyin) {
      notice = (
        <div className="notice-card">
          <div className="nc-line">💸 칩 부족 — 재참가 가능 ({won(s.buyinAmount)})</div>
          <button className="gold" onClick={() => send({ type: 'requestBuyin' })}>🙋 재참가 요청하기</button>
        </div>
      );
    } else if (s.buyinPending) {
      notice = <div className="notice-card"><div className="nc-line" style={{ color: 'var(--gold)' }}>⏳ 재참가 요청됨 — 승인 대기 중…</div></div>;
    } else {
      notice = <div className="notice-card spectate">👀 관전 중 — 다음 판을 기다려요</div>;
    }
  } else if (s.iAmApprover && s.buyinRequests && s.buyinRequests.length) {
    notice = (
      <div className="notice-card">
        <div className="nc-line">🙋 재참가 요청 — 승인 시 {won(s.buyinAmount)}로 합류</div>
        {s.buyinRequests.map((nm, i) => (
          <div key={i} className="buyin-row">
            <span>{nm}</span>
            <span>
              <button className="gold" onClick={() => send({ type: 'approveBuyin', name: nm })}>✅ 승인</button>
              <button className="danger" style={{ marginLeft: 6 }} onClick={() => send({ type: 'rejectBuyin', name: nm })}>❌ 거절</button>
            </span>
          </div>
        ))}
      </div>
    );
  }

  return withSidebar(
    <div id="pokerStage">
      <div id="pokerFelt">
        <div id="pokerHead">
          <div className="phead-left">
            <button id="pLeave" className="sub pleavebtn"
              onClick={() => { if (window.leaveConfirm && !window.confirm(window.leaveConfirm)) return; send({ type: 'leaveRoom' }); }}>← 나가기</button>
            <div className="ptitle">세븐 포커</div>
          </div>
          <div className="pstats">
            <div className="pstat"><div className="lbl">ANTE</div><div className="val">{won(s.ante)}</div></div>
            <div className="pstat"><div className="lbl">STREET</div><div className="val">{streetShort}</div></div>
          </div>
        </div>

        <div id="pokerTable">
          <div className="feltlayer felt-rim" /><div className="feltlayer felt-green" />
          <div className="feltlayer felt-hi" /><div className="feltlayer felt-ring1" /><div className="feltlayer felt-ring2" />

          <div id="pokerResult">{resultText}</div>

          <div id="pokerPot">
            <div className="potpill"><span className="lbl">POT</span><span className="val">₩ {won(s.pot || 0)}</span></div>
            {s.streetLabel ? <div className="streetlabel">{s.streetLabel}</div> : null}
            {s.secondsLeft != null ? <div className="pottimer" id="pTimer">⏱ <Secs n={s.secondsLeft} />초</div> : null}
            <div id="pokerPotCtrl">{potCtrl}</div>
          </div>

          <div id="pokerNotice">{notice}</div>

          {/* 좌석 */}
          {ordered.map((p, k) => {
            const st = seatStyle(k);
            return <Seat key={p.name} p={p} topHalf={st._topHalf} style={{ left: st.left, top: st.top }} />;
          })}

          {/* 카드 뭉치(덱) */}
          <div id="pokerDeck">
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ position: 'absolute', left: (i * 3) + 'px', top: (-i * 3) + 'px' }}>
                <TCard card={{ hidden: true }} w={46} h={66} />
              </div>
            ))}
          </div>

          {myOpenBox}
        </div>
      </div>

      <div id="pokerBar">
        <div className="bar-left">{barLeft}</div>
        <div id="pokerActions">{actions}</div>
      </div>
    </div>
  );
}
