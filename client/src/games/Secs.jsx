import { useState, useEffect } from 'react';

// 서버 secondsLeft를 받아 클라에서 1초씩 틱다운(서버 푸시마다 리셋). 표시 지점만 감싸 쓰면 됨.
export function useCountdown(serverSeconds) {
  const [sec, setSec] = useState(serverSeconds);
  useEffect(() => {
    setSec(serverSeconds);
    if (serverSeconds == null) return undefined;
    const iv = setInterval(() => setSec((s) => (s != null && s > 0 ? s - 1 : s)), 1000);
    return () => clearInterval(iv);
  }, [serverSeconds]);
  return sec;
}

// 인라인 숫자만 틱다운: {s.secondsLeft}초 → <Secs n={s.secondsLeft} />초
export default function Secs({ n }) {
  const v = useCountdown(n);
  return <>{v}</>;
}
