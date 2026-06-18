// 세븐포커 엔진 회귀 테스트 — 족보 평가 / 비교 / 사이드팟
// 실행: node test-poker.js
const P = require('./games/poker');
const ev = P._eval, cmp = P._cmp, side = P._sidePots;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); } }
// 카드 헬퍼: 'As' 'Th' '2c' → {r,s}  (s:0=♠ 1=♥ 2=♦ 3=♣)
const SUIT = { s: 0, h: 1, d: 2, c: 3 };
const RANK = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
function C(str) { const r = str.slice(0, -1), su = str.slice(-1); return { r: RANK[r] || +r, s: SUIT[su] }; }
function H(s) { return s.split(' ').map(C); }
function name(s) { return ev(H(s)).name; }
function beats(a, b) { return cmp(ev(H(a)), ev(H(b))) > 0; }
function tie(a, b) { return cmp(ev(H(a)), ev(H(b))) === 0; }

// ── 족보 이름 ──
ok(name('Ah Kh Qh Jh Th 2c 3d') === '로열 스트레이트 플러시', '로열SF');
ok(name('9h 8h 7h 6h 5h 2c 3d') === '스트레이트 플러시', 'SF');
ok(name('Ah 5h 4h 3h 2h Kc Qd') === '스트레이트 플러시', 'SF 휠');
ok(name('Ah Ad As Ac Kh 2c 3d') === '포카드', '포카드');
ok(name('Ah Ad As Kh Kd 2c 3d') === '풀하우스', '풀하우스');
ok(name('Ah Ad As Kh Kd Kc 3d') === '풀하우스', '트리플 두벌→풀하우스');
ok(name('Ah Kh 9h 5h 2h 3c 4d') === '플러시', '플러시');
ok(name('9c 8h 7d 6s 5h Ac Kd') === '스트레이트', '스트레이트');
ok(name('Ah 2d 3c 4s 5h Kc Qd') === '스트레이트', '스트레이트 휠');
ok(name('Ah Ad As Kh Qd Jc 9d') === '트리플', '트리플');
ok(name('Ah Ad Kh Kd Qc 9s 2d') === '투페어', '투페어');
ok(name('Ah Ad Kh Qd Jc 9s 2d') === '원페어', '원페어');
ok(name('Ah Kd Qh Js 9c 7d 2h') === 'A 탑', '하이카드');

// ── 비교 ──
ok(beats('Ah Kh Qh Jh Th 2c 3d', '9h 8h 7h 6h 5h 2c 3d'), '로열 > SF');
ok(beats('2h 2d 2s 2c 3h 4d 5c', 'Ah Ad As Kh Kd Qc Jd'), '포카드 > 풀하우스');
ok(beats('Ah Ad As Kh Kd 2c 3d', 'Ah Kh 9h 5h 2h 3c 4d'), '풀하우스 > 플러시');
ok(beats('Kc Kd Ks 2h 3d 4c 5s', 'Qc Qd Qs Ah Kd Jc 9s'), 'K트리플 > Q트리플');
ok(beats('Ah Ad Kh Kd Qc 9s 2d', 'Ah Ad Qh Qd Kc 9s 2d'), 'AAKK > AAQQ');
ok(beats('Ah Ad Kh Qd Jc 9s 2d', 'Ah Ad Kh Qd Tc 9s 2d'), '원페어 킥커 J > T');
ok(beats('9c 8h 7d 6s 5h 2c 2d', '8c 7h 6d 5s 4h Ac Kd'), '9스트 > 8스트');
ok(tie('Ah Kh Qh Jh Th 2c 3d', 'As Ks Qs Js Ts 2c 3d'), '로열끼리 동점(무늬무시)');

// ── 사이드팟 ──
// A=100 올인, B=100, C=60 올인.  메인팟 180(전원), 사이드 80(A·B)
(function () {
  const A = { name: 'A' }, B = { name: 'B' }, Cc = { name: 'C' };
  const contrib = new Map([[A, 100], [B, 100], [Cc, 60]]);
  const pots = side(contrib, [A, B, Cc]);
  const total = pots.reduce((s, p) => s + p.amount, 0);
  ok(total === 260, '사이드팟 총액=260 (실=' + total + ')');
  const main = pots.find((p) => p.eligible.length === 3);
  ok(main && main.amount === 180, '메인팟 180 전원 (실=' + (main && main.amount) + ')');
  const sidePot = pots.find((p) => p.eligible.length === 2);
  ok(sidePot && sidePot.amount === 80, '사이드팟 80 A·B (실=' + (sidePot && sidePot.amount) + ')');
})();
// 다이한 사람 칩도 팟에 포함되지만 eligible엔 없음
(function () {
  const A = { name: 'A' }, B = { name: 'B' }, D = { name: 'D' };
  const contrib = new Map([[A, 50], [B, 50], [D, 30]]);
  const pots = side(contrib, [A, B]);                 // D는 contender 아님
  const total = pots.reduce((s, p) => s + p.amount, 0);
  ok(total === 130, '폴드 칩 포함 총액=130 (실=' + total + ')');
  ok(pots.every((p) => !p.eligible.includes(D)), '폴드자는 eligible 제외');
})();

console.log(`\n  세븐포커 엔진 테스트: ${pass} 통과 / ${fail} 실패\n`);
process.exit(fail ? 1 : 0);
