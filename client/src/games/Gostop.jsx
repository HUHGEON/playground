// 임시 스텁 — 다음 단계에서 Framer Motion으로 본격 이전
export default function Gostop({ ws }) {
  const s = ws.room;
  return (
    <div className="muted" style={{ padding: 30, lineHeight: 1.7 }}>
      <p><b>맞고(고스톱)</b> — React 이전 진행 중 🃏</p>
      <p>현재 phase: <b>{s.phase}</b> / 좌석 {s.seats?.length ?? '-'}명</p>
      {s.canStart && <button className="primary" onClick={() => ws.send({ type: 'start' })}>시작하기</button>}
    </div>
  );
}
