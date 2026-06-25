import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// 채팅 메시지가 오면 보낸 사람 패널([data-player="이름"]) 위에 말풍선(섯다 모양)을 띄움.
// position:fixed + 화면좌표라 felt 스케일/레이아웃 무관. 4초 후 사라짐.
let _bid = 0;
export default function ChatBubbleLayer({ chat, bubbleClass = 'chat-bubble' }) {
  const [bubbles, setBubbles] = useState([]);
  const lastLen = useRef(chat.length);
  useEffect(() => {
    const news = chat.slice(lastLen.current);
    lastLen.current = chat.length;
    if (!news.length) return;
    const added = [];
    news.forEach((m) => {
      let el = null;
      try { el = document.querySelector(`[data-player="${(m.name || '').replace(/"/g, '\\"')}"]`); } catch { el = null; }
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      added.push({ id: ++_bid, text: m.text, x: Math.round(r.left + r.width / 2), y: Math.round(r.top) });
    });
    if (!added.length) return;
    setBubbles((b) => [...b.slice(-6), ...added]);
    added.forEach((a) => setTimeout(() => setBubbles((b) => b.filter((x) => x.id !== a.id)), 4000));
  }, [chat]);

  if (!bubbles.length) return null;
  return createPortal(
    <>
      {bubbles.map((b) => (
        <div key={b.id} className={bubbleClass} style={{ position: 'fixed', left: b.x, top: b.y }}>{b.text}</div>
      ))}
    </>,
    document.body,
  );
}
