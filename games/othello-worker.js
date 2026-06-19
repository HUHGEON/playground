// 오셀로 어려움/헬 봇 탐색을 메인 이벤트 루프와 분리된 워커 스레드에서 수행.
// → 봇이 수초간 "생각"해도 서버(채팅·다른 게임)가 멈추지 않음.
const { parentPort, workerData } = require('worker_threads');
const AI = require('./othello-ai');
const { board, me, level, budgetMs } = workerData;
const mv = AI.bestMove(board, me, level, budgetMs);   // [r,c] 또는 null
parentPort.postMessage(mv);
