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

// 바닥 레이아웃 — 같은 월만 한 셀에 겹침, 다른 월은 분리 셀. w,h = #gsFloor px. 반환 id→{x,y(%),rot}
export function floorLayout(floor, w, h) {
  const pos = {};
  if (!floor || !floor.length || !w || !h) return pos;
  const byMonth = {};
  for (const c of floor) (byMonth[c.m] = byMonth[c.m] || []).push(c);
  const months = Object.keys(byMonth).sort((a, b) => byMonth[b].length - byMonth[a].length || a - b);
  const CW = 52, CH = 78, GO = 12;
  const cellW = CW + GO * 2 + 24, cellH = CH + 24;
  const cols = Math.max(2, Math.floor((w - 2) / cellW));
  const rows = Math.max(2, Math.floor((h - 2) / cellH));
  const gw = cols * cellW, gh = rows * cellH, ox = (w - gw) / 2, oy = (h - gh) / 2;
  const fx = w / 2, fy = h / 2;
  const cells = [];
  for (let r = 0; r < rows; r++) for (let cc = 0; cc < cols; cc++) {
    const x = ox + cc * cellW + cellW / 2, y = oy + r * cellH + cellH / 2;
    if (Math.hypot(x - fx, y - fy) < 64) continue;
    cells.push({ x, y, d: Math.hypot(x - fx, y - fy) });
  }
  cells.sort((a, b) => a.d - b.d);
  months.forEach((m, i) => {
    const cell = cells[i % cells.length] || { x: fx, y: fy };
    const g = byMonth[m];
    const x0 = cell.x - (g.length - 1) * GO / 2;
    g.forEach((c, k) => {
      pos[c.id] = { x: (x0 + k * GO) / w * 100, y: cell.y / h * 100, rot: (hashId(c.id) % 10) - 5 };
    });
  });
  return pos;
}
