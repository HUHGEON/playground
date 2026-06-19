// 브라우저 Web Worker — 오셀로 봇 탐색을 페이지 메인 스레드와 분리.
// → 봇이 수초 생각해도 화면이 안 멈춤. (othello-ai.js를 워커 전역에 로드)
importScripts('othello-ai.js');
onmessage = function (e) {
  const { board, me, level, budgetMs } = e.data;
  const mv = self.OthelloAI.bestMove(board, me, level, budgetMs);   // [r,c] 또는 null
  postMessage(mv);
};
