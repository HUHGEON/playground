# 🎮 playground — 오셀로 · 섯다 · 세븐포커

같은 네트워크/인터넷에서 친구들과 즐기는 웹 멀티플레이 게임. 닉네임 입력 → 로비에서 방 생성/입장 → 실시간 대전.

- **섯다** — 최대 5인. 화투 20장, 실제 족보(38광땡/광땡/땡/암행어사·땡잡이·구사·멍구사/끗), 풀 베팅(삥·콜·따당·하프·풀·올인·다이), 재경기·동점 이월·재참가·자동시작.
- **세븐포커** — 최대 6인. 정통 세븐스터드(히든2+오픈1 → 오픈3 → 히든1, 3~7구간 베팅 5라운드). 7장 중 베스트 5장, 표준 족보(로열SF~하이카드), 올인 사이드팟·자동시작·재참가. 트럼프 카드는 `public/cards-trump/{랭크}{무늬}.png`(예 `As.png`), 없으면 CSS 카드로 폴백.
- **오셀로** — 2인 대국 + 승자 잔류 대기열.

## 로컬 실행
```bash
npm install
npm start            # http://localhost:45678
npm run bots         # (옵션) 연습용 봇 입장.  BOTS=4 node bots.js 로 인원 조절
```

## 기술
- 백엔드: Node.js + `ws` (WebSocket). 인메모리 상태(방·세션·칩). DB 없음.
- 프론트: 바닐라 JS (빌드 불필요), 정적 파일 서빙.
- 서버는 `process.env.PORT`(없으면 45678)에 `0.0.0.0`으로 바인딩 → PaaS 배포 호환.

## 배포 (Render Web Service)
1. 이 레포를 GitHub에 push.
2. Render → New → **Web Service** → 레포 연결.
3. 설정: **Build** `npm install` · **Start** `npm start` (Node 환경).
4. 무료 플랜은 15분 무접속 시 슬립(다음 접속 콜드스타트 + 인메모리 상태 초기화). 캐주얼 플레이엔 충분.

## 구조 (게임별 모듈화 — 새 게임은 "드롭인")
```
server.js            공통: 연결/세션/재접속/로비/채팅 + games/ 자동 로드 레지스트리
games/<game>.js      게임 서버 모듈(룰·상태). type/title/emoji + init·state·canStart… 인터페이스
public/index.html    셸(폰트/링크/방 레이아웃). 게임별 CSS는 <link>로 로드
public/css/common.css   로비·방 셸·채팅·오버레이 + 게임별 배경/태그색
public/css/<game>.css   게임별 스타일
public/app.js        공통 클라(세션/로비/채팅/라우팅). 게임 무관 — 렌더러 meta로 동작
public/<game>.js     게임 렌더러. window.RENDERERS.<game>=R + R.meta(옵션·채팅 위치)
bots.js              연습용 봇
test-flow.js         섯다 회귀 테스트 (node test-flow.js)
test-poker.js        세븐포커 족보/사이드팟 단위 테스트 (node test-poker.js)
test-poker-sim.js    세븐포커 한 판 통합 시뮬 (node test-poker-sim.js)
slice_cards.py       화투 원본 → 카드 20장 분할 스크립트(순수 파이썬)
```

### 새 게임 추가법 (공유 파일 수정 없이)
1. `games/<game>.js` — 서버 모듈(`type/title/emoji/maxPlayers` + `init·state·canStart·start·action·onEnter·onLeave·reattach·cleanup·lobbyInfo`). → server.js가 자동 등록.
2. `public/<game>.js` — 렌더러. `R.init(main,info)`/`R.render(s)` 구현 후 `window.RENDERERS.<game>=R`. `R.meta = { chat:'felt'|'sidebar', options:{fields,hint,validate} }` 선언 → app.js가 방생성 폼·채팅 위치 자동 처리.
3. `public/css/<game>.css` + index.html에 `<link>` 한 줄.
4. (배경·로비 태그색은 common.css에 `body.game-<game>` / `.g-<game>` 한 줄씩.)
