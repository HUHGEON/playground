import { useEffect, useRef } from 'react';

// 고정폭 felt(#feltId)를 컨테이너(#stageId)에 맞춰 transform:scale — 바닐라 fitStage 이전.
// CSS에서 #feltId { transform-origin: top center } 가정.
export function useFitStage(stageId, feltId, { max = 1.12, reserveBottom = 92 } = {}) {
  const fitRef = useRef(null);
  // 매 렌더 최신 옵션을 담은 fit 함수 갱신
  fitRef.current = () => {
    const stage = document.getElementById(stageId), felt = document.getElementById(feltId);
    if (!stage || !felt || stage.offsetParent === null) return;
    felt.style.transform = 'none';               // 자연 크기 측정
    const fw = felt.offsetWidth, fh = felt.offsetHeight;
    if (!fh) return;
    const availW = stage.clientWidth;
    const topY = stage.getBoundingClientRect().top;
    const availH = window.innerHeight - topY - reserveBottom;
    let s = Math.min(availW / fw, availH / fh, max);
    s = Math.max(s, 0.3);
    felt.style.transform = `scale(${s})`;
    stage.style.height = Math.ceil(fh * s) + 'px';
  };
  useEffect(() => {
    let raf = 0;
    const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => fitRef.current && fitRef.current()); };
    window.addEventListener('resize', run);
    // ResizeObserver: observe 시 즉시 1회 + felt 레이아웃/내용 변화(이미지 로드 등) 시 재맞춤
    const ro = new ResizeObserver(run);
    const stage = document.getElementById(stageId), felt = document.getElementById(feltId);
    if (stage) ro.observe(stage);
    if (felt) ro.observe(felt);
    run();
    return () => { window.removeEventListener('resize', run); ro.disconnect(); cancelAnimationFrame(raf); };
  }, [stageId, feltId]);
  // 매 렌더(상태 변화·단계 전환으로 felt가 늦게 mount되는 경우) rAF 재맞춤
  useEffect(() => {
    const raf = requestAnimationFrame(() => fitRef.current && fitRef.current());
    return () => cancelAnimationFrame(raf);
  });
}
