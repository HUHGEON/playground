// 고스톱(맞고) 렌더 헬퍼 — 바닐라 gostop.js에서 이전
export const AVATARS = ['🦊', '🐯', '🐰', '🐼', '🐸', '🐵', '🦁', '🐶', '🐱', '🐲', '🦝', '🐷'];
export function avatar(name) {
  let h = 0; const s = name || '?';
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}
export const MNAME = { 1: '송학', 2: '매조', 3: '벚꽃', 4: '흑싸리', 5: '난초', 6: '모란', 7: '홍싸리', 8: '공산', 9: '국진', 10: '단풍', 11: '오동', 12: '비' };
export function nyang(n) {
  n = n || 0;
  if (n >= 1e8) return Math.floor(n / 1e8) + '억' + (n % 1e8 >= 1e4 ? ' ' + Math.floor((n % 1e8) / 1e4) + '만' : '');
  if (n >= 1e4) return Math.floor(n / 1e4) + '만';
  return String(n);
}
export const cardSrc = (c) => '/' + (c.img || ('gostop/' + c.m + '-' + c.idx + '.png'));
export function hashId(id) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h; }

// 획득더미: 광/멍/단/피로 분류
export function pileGroups(captured) {
  const g = { KWANG: [], YEOL: [], TTI: [], PI: [] }; let piVal = 0;
  for (const c of captured || []) { (g[c.cat] || g.PI).push(c); if (c.cat === 'PI') piVal += c.pi; }
  return { g, piVal };
}

// 바닥 레이아웃 — 월 번호로 고정 위치(중앙 더미 둘레 링). 다른 월 카드가 추가/제거돼도 안 흔들림.
// 같은 월만 한 자리에 겹침. 순수 % 라 #gsFloor 크기와 무관. 반환 id→{x,y(%),rot}
const MONTH_RING = (() => {
  const map = {};
  const order = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0];   // 0=보너스
  order.forEach((m, i) => {
    const a = (i / order.length) * 2 * Math.PI - Math.PI / 2;   // 위에서 시계방향
    map[m] = { x: 50 + 40 * Math.cos(a), y: 50 + 34 * Math.sin(a) };
  });
  return map;
})();
export function floorLayout(floor) {
  const pos = {};
  if (!floor || !floor.length) return pos;
  const byMonth = {};
  for (const c of floor) (byMonth[c.m] = byMonth[c.m] || []).push(c);
  const OFF = 2.6;   // 같은 월 겹침 간격(%)
  for (const m of Object.keys(byMonth)) {
    const c0 = MONTH_RING[m] || { x: 50, y: 50 };
    const g = byMonth[m];
    const x0 = c0.x - (g.length - 1) * OFF / 2;
    g.forEach((c, k) => { pos[c.id] = { x: x0 + k * OFF, y: c0.y, rot: (hashId(c.id) % 8) - 4 }; });
  }
  return pos;
}
