import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import '../seotda.css';

// 큰 금액을 억/만 단위로 읽기 쉽게 — 100억, 1억 5,000만, 1,000만, 2,500
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

// 화투 월 이름 + 광 판정 (로컬 족보 표시용)
const PNAME = { 1: '송학', 2: '매조', 3: '벚꽃', 4: '흑싸리', 5: '난초', 6: '모란', 7: '홍싸리', 8: '공산', 9: '국화', 10: '단풍' };
const ck = (c) => c.m + '-' + c.v;
const isG = (c) => (c.m === 1 || c.m === 3 || c.m === 8) && c.v === 0;
const kkut = (a, b) => (a + b) % 10;

// 내 패 족보(표시용) — 서버 판정과 동일 규칙. 서버가 최종 심판.
function evalLocal(cards) {
  const [a, b] = cards;
  const ms = [a.m, b.m].sort((x, y) => x - y).join(',');
  const gboth = isG(a) && isG(b);
  const has = (m, v) => ck(a) === `${m}-${v}` || ck(b) === `${m}-${v}`;
  const hasM = (m) => a.m === m || b.m === m;
  if (gboth && ms === '3,8') return '38광땡';
  if (gboth && ms === '1,8') return '18광땡';
  if (gboth && ms === '1,3') return '13광땡';
  if (a.m === b.m) return a.m === 10 ? '장땡' : a.m + '땡';
  if (has(4, 0) && has(7, 0)) return '암행어사';
  if (has(3, 0) && has(7, 0)) return '땡잡이';
  if (has(4, 0) && has(9, 0)) return '멍텅구리구사';
  if (hasM(4) && hasM(9)) return '구사';
  const named = { '1,2': '알리', '1,4': '독사', '1,9': '구삥', '1,10': '장삥', '4,10': '장사', '4,6': '세륙' };
  if (named[ms]) return named[ms];
  const k = kkut(a.m, b.m);
  return k === 9 ? '갑오(9끗)' : k === 0 ? '망통(0끗)' : k + '끗';
}

// 베팅 종류별 색 구분용 클래스 suffix (한글 라벨 → 코드)
function actCls(a) {
  return { '체크': 'check', '삥': 'ping', '콜': 'call', '따당': 'ddang', '쿼터': 'quarter', '하프': 'half', '풀': 'full', '올인': 'allin', '맥스': 'allin', '다이': 'die' }[a] || 'call';
}

// 족보표(사이드바 토글) — 카드 이미지 조합
const JOKBO = [
  { cat: '광땡' },
  { n: '삼팔광땡', c: ['3-0', '8-0'], d: '무조건 이김 (최강)', hi: 1 },
  { n: '일팔광땡', c: ['1-0', '8-0'], d: '암행어사에게 짐' },
  { n: '일삼광땡', c: ['1-0', '3-0'], d: '암행어사에게 짐' },
  { cat: '땡' },
  { n: '장땡(10땡)', c: ['10-0', '10-1'], d: '땡잡이에게 <b>이김</b>' },
  { n: '9땡~1땡', c: ['9-0', '9-1'], d: '같은 월 2장 · 땡잡이에게 짐 · 9땡↓ 멍구사 재대결' },
  { cat: '중간 족보' },
  { n: '알리', c: ['1-0', '2-0'], d: '알리 이하는 구사와 재대결' },
  { n: '독사', c: ['1-0', '4-1'], d: '' },
  { n: '구삥', c: ['1-0', '9-1'], d: '' },
  { n: '장삥', c: ['1-0', '10-1'], d: '' },
  { n: '장사', c: ['4-1', '10-1'], d: '' },
  { n: '세륙', c: ['4-1', '6-1'], d: '' },
  { cat: '끗' },
  { n: '갑오(9끗)', c: ['4-1', '5-0'], d: '두 월 합의 일의 자리 (예 4+5=9끗)' },
  { n: '망통(0끗)', c: ['2-0', '8-1'], d: '합의 일의자리 0 — 가장 약함' },
  { cat: '특수 족보' },
  { n: '암행어사', c: ['4-0', '7-0'], d: '일삼·일팔광땡에게 <b>이김</b> · 그 외 1끗' },
  { n: '땡잡이', c: ['3-0', '7-0'], d: '1~9땡에게 <b>이김</b> (장땡 못 잡음)' },
  { n: '구사', c: ['4-1', '9-0'], d: '알리 이하 족보와 재대결' },
  { n: '멍구사', c: ['4-0', '9-0'], d: '9땡 이하 족보와 재대결' },
];

function JokboTable() {
  return (
    <>
      <div className="jlegend">⬆ 위로 갈수록 강함</div>
      <div className="jlist">
        {JOKBO.map((r, i) => r.cat
          ? <div key={i} className="jcat">{r.cat}</div>
          : (
            <div key={i} className={'jrow' + (r.hi ? ' hi' : '')}>
              <div className="jcc">{r.c.map((k) => <img key={k} src={'/cards/' + k + '.png'} alt="" />)}</div>
              <div className="jt">
                <div className="jn">{r.n}</div>
                {r.d ? <div className="jd" dangerouslySetInnerHTML={{ __html: r.d }} /> : null}
              </div>
            </div>
          ))}
      </div>
    </>
  );
}

// 화투패 한 장 — 이미지(public/cards/m-v.png) 또는 뒷면
function HwatuCard({ card, win }) {
  if (!card) return <div className="hwatu back" />;
  return (
    <div className={'hwatu img' + (win ? ' win' : '')}>
      <img src={'/cards/' + card.m + '-' + card.v + '.png'}
        alt={(PNAME[card.m] || '') + ' ' + card.m + '월'} draggable={false} />
    </div>
  );
}

// 좌석 한 칸 (대기/파산 슬롯 또는 플레이어)
function Seat({ p, style }) {
  if (p.waiting) {
    return (
      <div className={'seat waiting' + (p.bankrupt ? ' bust' : '') + (p.isMe ? ' me' : '')} style={style}>
        <div className="cards"><span className="emptycard">{p.bankrupt ? '💸' : '🪑'}</span></div>
        <div className="namebar"><span className="nm" style={{ color: p.color }}>{p.name}</span></div>
        <div className="ch">💵 {won(p.chips)}</div>
        <div className="hd"><span className={'stag ' + (p.bankrupt ? 'bust' : 'wait')}>{p.bankrupt ? '파산' : '대기중'}</span></div>
      </div>
    );
  }
  const ac = (p.act && !p.folded) ? actCls(p.act) : null;
  const hd = p.handName || (p.isMe && p.cards ? evalLocal(p.cards) : '');
  const cards = [];
  if (p.cards) {
    p.cards.forEach((c, j) => cards.push(<HwatuCard key={j} card={c} win={p.win} />));
  } else if (p.inHand) {
    for (let j = 0; j < 2; j++) cards.push(<HwatuCard key={j} card={null} />);
  }
  return (
    <div className={'seat' + (p.isMe ? ' me' : '') + (p.isTurn ? ' turn' : '') + (p.folded ? ' folded' : '') + (p.win ? ' win' : '')} style={style}>
      <div className="cards">{cards}</div>
      <div className="betrow">
        {ac && <span className={'actbadge ab-' + ac}>{p.act}</span>}
        {p.contrib ? <span className="betc">+{won(p.contrib)}</span> : null}
      </div>
      <div className="namebar">
        <span className="nm" style={{ color: p.color }}>{p.name}</span>
        {p.host && <span className="stag host">방장</span>}
        {p.allin && <span className="stag allin">올인</span>}
        {p.folded && <span className="stag die">다이</span>}
      </div>
      <div className="ch">💵 {won(p.chips)}</div>
      <div className="hd">{(p.win ? '🏆 ' : '') + hd}</div>
    </div>
  );
}

// 중앙 판돈 돈다발 더미 좌표
const BILLS = [
  [-20, -8, -10, 'man'], [4, -15, 16, 'oman'], [-7, -3, -3, 'man'], [16, -9, -20, 'man'],
  [-17, 1, 26, 'oman'], [1, 3, 7, 'man'], [19, 4, -13, 'oman'], [-5, 9, 19, 'man'],
  [11, 11, -7, 'man'], [-2, -3, 38, 'oman'], [22, -1, 5, 'man'], [-22, 8, -18, 'oman'],
];

// 좌석 배치 — 나는 6시 고정, 나머지는 시계방향
const LAYOUTS = {
  2: [[50, 17]],
  3: [[15, 18], [85, 18]],
  4: [[13, 50], [50, 17], [87, 50]],
  5: [[13, 60], [13, 17], [87, 17], [87, 60]],
};

export default function Seotda({ ws }) {
  const s = ws.room;
  const send = ws.send;
  const [jokboOpen, setJokboOpen] = useState(false);
  const [infoEl, setInfoEl] = useState(null);
  useEffect(() => { setInfoEl(document.getElementById('roomInfo')); }, []);

  // ── 좌석 정렬 (나=6시, 나머지 시계방향, 빈 자리는 대기/파산) ──
  const players = s.players || [];
  const me = players.find((p) => p.isMe);
  const myName = s.yourName;
  let meEntry = null;
  if (me) meEntry = me;
  else if (myName) meEntry = { name: myName, color: s.yourColor || '#fff', chips: s.myChips ?? 0, isMe: true, waiting: true, bankrupt: (s.myChips ?? 0) < s.ante };
  let others;
  if (me) { const i = players.indexOf(me); others = players.slice(i + 1).concat(players.slice(0, i)); }
  else others = players.slice();
  const freeSlots = Math.max(0, 5 - (meEntry ? 1 : 0) - others.length);
  const waitOthers = (s.waiting || []).filter((w) => w.name !== myName).slice(0, freeSlots)
    .map((w) => ({ name: w.name, color: w.color, chips: w.chips, waiting: true, bankrupt: w.chips < s.ante }));
  const ordered = (meEntry ? [meEntry] : []).concat(others, waitOthers);
  const N = ordered.length || 1;
  const lay = (meEntry && LAYOUTS[N]) ? LAYOUTS[N] : null;
  const seatStyle = (k) => {
    let L, T;
    if (k === 0 && meEntry) { L = 50; T = 83; }
    else if (lay) { L = lay[k - 1][0]; T = lay[k - 1][1]; }
    else { const a = (2 * Math.PI / N) * k; L = 50 - 39 * Math.sin(a); T = 50 + 37 * Math.cos(a); }
    return { left: L + '%', top: T + '%' };
  };

  // ── 중앙 판돈 ──
  const pot = s.pot || 0;
  const piles = pot > 0 ? Math.min(BILLS.length, 1 + Math.floor(pot / Math.max(1, s.ante))) : 0;

  // ── 결과 / 단계 배너 ──
  let resultBanner = null;
  if (s.needRestart) {
    resultBanner = <div id="seotdaResult">{s.canRestartGame ? '💀 한 명 빼고 전원 파산 — 당신이 승리! 게임을 재시작하세요' : '💀 한 명 빼고 전원 파산 — 승리자의 재시작을 기다리는 중…'}</div>;
  } else if (s.result && s.result.redeal) {
    const secs = s.secondsLeft != null ? ` (${s.secondsLeft}초)` : '';
    if (s.result.tie) {
      const names = (s.result.winners || []).map((w) => w.name).join(', ');
      resultBanner = <div id="seotdaResult">🤝 <b>동점</b> ({names}) — 패 공개 중… 묻고 재경기{secs}</div>;
    } else {
      const names = (s.result.redealers || []).join(', ');
      resultBanner = <div id="seotdaResult">🔁 <b>구사·멍구사</b> — {names}님! 패 공개 중… 묻고 재경기{secs}</div>;
    }
  } else if (s.stage === 'redeal') {
    resultBanner = <div id="seotdaResult">🔁 <b>구사·멍구사</b> — {(s.redealerNames || []).join(', ')}님 재경기 결정 중…</div>;
  } else if (s.stage === 'rejoin') {
    resultBanner = <div id="seotdaResult">🔁 재경기! 다이했던 분은 절반 {won(s.rejoinCost)} 내면 합류 — 묻힌 판돈 💵{won(s.carryPot || 0)}</div>;
  } else if (s.result && s.result.tie) {
    const names = s.result.winners.map((w) => w.name).join(', ');
    resultBanner = <div id="seotdaResult">{`🤝 동점 (${names}) — 판돈 ${won(s.result.pot)} 묻고 다음 판으로 이월!`}</div>;
  } else if (s.result) {
    const names = s.result.winners.map((w) => w.name).join(', ');
    resultBanner = <div id="seotdaResult">{`🏆 ${names} — 판돈 ${won(s.result.pot)} 획득` + (s.result.sole ? ' (단독, 비공개)' : '')}</div>;
  } else {
    resultBanner = <div id="seotdaResult" />;
  }

  // ── 내 상태 (자리에 없을 때만) ──
  let myStatus;
  if (me) {
    myStatus = <div id="myStatus" />;
  } else if (s.canRequestBuyin) {
    myStatus = (
      <div id="myStatus">
        <div className="ms-line">💸 칩 부족 — 재참가 가능</div>
        <button className="gold" onClick={() => send({ type: 'requestBuyin' })}>🙋 재참가 요청 ({won(s.buyinAmount)}칩으로)</button>
      </div>
    );
  } else if (s.buyinPending) {
    myStatus = <div id="myStatus"><div className="ms-line" style={{ color: 'var(--gold)' }}>⏳ 재참가 요청됨 — 칩 최소 보유자 승인 대기…</div></div>;
  } else {
    myStatus = <div id="myStatus"><div className="ms-line" style={{ color: 'var(--muted)' }}>👀 관전 중 — 다음 판을 기다려요</div></div>;
  }

  // ── 액션 버튼 (베팅 / 재경기) ──
  const actBtns = [];
  if (s.canRedeal) {
    actBtns.push(<button key="redeal" className="b-raise" onClick={() => send({ type: 'redeal' })}><span className="blabel">🔁 재경기 선언</span></button>);
    actBtns.push(<button key="passRedeal" className="b-call" onClick={() => send({ type: 'passRedeal' })}><span className="blabel">그냥 끝내기</span><span className="bamt">정산</span></button>);
  } else if (s.myTurn && s.actions) {
    (s.actions || []).forEach((a, i) => {
      actBtns.push(
        <button key={i} className={'b-' + a.act} onClick={() => send({ type: 'bet', act: a.act })}>
          <span className="blabel">{a.name || a.label}</span>
          {a.amount ? <span className="bamt">{a.amount}</span> : null}
        </button>
      );
    });
  }

  // ── 가운데 시작 컨트롤 ──
  const auto = s.autoStartIn != null ? ` (${s.autoStartIn}초 후 자동)` : '';
  let potCtrl = null;
  if (s.needRestart) {
    potCtrl = s.canRestartGame
      ? <button className="gold" onClick={() => send({ type: 'restartGame' })}>🔄 게임 재시작하기</button>
      : <button disabled>승리자의 게임 재시작 대기 중…</button>;
  } else if (s.canStart) {
    potCtrl = <button onClick={() => send({ type: 'start' })}>{(s.phase === 'finished' ? '다음 판 시작' : '게임 시작') + auto}</button>;
  } else if (s.isHost && s.phase !== 'playing') {
    potCtrl = <button disabled>2명 이상 필요 (칩 ≥ 앤티)</button>;
  } else if (s.autoStartIn != null) {
    potCtrl = <button disabled>{`다음 판 ${s.autoStartIn}초 후 시작…`}</button>;
  }

  // ── 대기열 (테이블에 못 올라간 초과 인원) ──
  const overflow = (s.waiting || []).filter((w) => w.name !== myName).slice(waitOthers.length);

  // ── 재참가 승인 푸쉬알람 (사이드바) ──
  const buyinReqs = s.buyinRequests || [];

  // ── 재경기 합류 모달 ──
  let rejoinModal = null;
  if (s.canRejoin) {
    rejoinModal = (
      <div id="rejoinModal" className="rejoin-modal" style={{ left: '50%', top: '50%' }}>
        <div className="rjtitle">🔁 재경기 합류</div>
        <div className="rjbody">묻힌 판돈의 절반 <b>{won(s.rejoinCost)}</b>을 내고<br />이번 재경기 판에 참여하시겠습니까?</div>
        {s.secondsLeft != null && <div className="rjtimer">⏱ {s.secondsLeft}초 후 자동 빠지기</div>}
        <div className="rjbtns">
          <button className="pok" onClick={() => send({ type: 'rejoin' })}>합류</button>
          <button className="pno" onClick={() => send({ type: 'passRejoin' })}>빠지기</button>
        </div>
      </div>
    );
  } else if (s.rejoinWaiting) {
    rejoinModal = (
      <div id="rejoinModal" className="rejoin-modal" style={{ left: '50%', top: '50%' }}>
        <div className="rjtitle">🔁 재경기</div>
        <div className="rjbody">묻고 더블로 갑니다!<br /><span className="pushmeta">다른 분들의 합류 결정을 기다리는 중…</span></div>
        {s.secondsLeft != null && <div className="rjtimer">⏱ {s.secondsLeft}초</div>}
      </div>
    );
  }

  // ── 사이드바(#roomInfo로 포털): 푸쉬알람 + 대기열 + 족보 토글 ──
  const sidebar = (
    <>
      <div id="pushZone">
        {buyinReqs.map((r) => (
          <div key={r.name} className="pushcard">
            <div className="pushtitle">🙋 재참가 요청</div>
            <div className="pushbody"><b>{r.name}</b>님이 판에 다시 들어오고 싶어해요<br /><span className="pushmeta">승인 {r.approvals} / {r.needed} (과반)</span></div>
            {r.voted
              ? <div className="pushvoted">✓ 투표 완료 — 결과 대기 중</div>
              : (
                <div className="pushbtns">
                  <button className="pok" onClick={() => send({ type: 'approveBuyin', name: r.name })}>승인</button>
                  <button className="pno" onClick={() => send({ type: 'rejectBuyin', name: r.name })}>거절</button>
                </div>
              )}
          </div>
        ))}
      </div>
      <div id="seotdaWait">
        {overflow.length > 0 && (
          <>
            <h3>대기열</h3>
            {overflow.map((w, i) => (
              <div key={i} className="qrow">
                <span className="qname" style={{ color: w.color }}>{w.name}</span>
                <span className="tag">{w.willSit ? '다음 판 합류' : '대기열'}</span>
                <span className="ch" style={{ color: 'var(--gold)', fontSize: 12 }}>{won(w.chips)}</span>
              </div>
            ))}
          </>
        )}
      </div>
      <button id="jokboToggle" className="sub" style={{ width: '100%', marginTop: 6 }} onClick={() => setJokboOpen((v) => !v)}>
        {jokboOpen ? '📖 족보 숨기기' : '📖 족보 보기'}
      </button>
      {jokboOpen && <div id="jokboPanel" style={{ marginTop: 8 }}><JokboTable /></div>}
    </>
  );

  return (
    <>
      <div id="seotdaStage"><div id="seotdaFelt"><div id="seotdaInner">
        <div className="inkmotif tl">梅</div>
        <div className="inkmotif br">蘭</div>
        {resultBanner}
        <div id="seotdaTable">
          {ordered.map((p, k) => <Seat key={k} p={p} style={seatStyle(k)} />)}
          <div id="potCenter">
            {piles > 0 && (
              <div className="potpile">
                {Array.from({ length: piles }).map((_, i) => {
                  const b = BILLS[i];
                  return (
                    <span key={i} className={'wbill ' + b[3]}
                      style={{ left: `calc(50% + ${b[0]}px)`, top: `calc(50% + ${b[1]}px)`, transform: `translate(-50%,-50%) rotate(${b[2]}deg)` }}>
                      <span className="strap"><i>{b[3] === 'oman' ? '50000' : '10000'}</i></span>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="potamt">₩ {won(pot)}</div>
            <div className="potlabel">판돈 POT</div>
            {(s.carryPot > 0 && s.phase === 'playing') && <div className="potsub">묻힌 {won(s.carryPot)}</div>}
            {s.secondsLeft != null && <div className="pottimer" id="sTimer">⏱ {s.secondsLeft}초</div>}
            <div id="potCtrl">{potCtrl}</div>
          </div>
        </div>
        {myStatus}
        <div id="seotdaActions">{actBtns}</div>
        <div id="buyinBox" />
        {rejoinModal}
      </div></div></div>
      {infoEl && createPortal(sidebar, infoEl)}
    </>
  );
}
