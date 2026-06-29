/**
 * @file all.c
 *
 * @brief Gather all other files to facilitate compiler inter-procedural optimization.
 *
 * @date 1998 - 2024
 * @author Richard Delorme
 * @version 4.6
 */

/* miscellaneous utilities */
#include "options.c"
#include "util.c"
#include "stats.c"
#include "bit.c"
#include "crc32c.c"

/* move generation */
#include "flip.c"
#include "board.c"
#include "move.c"

/* eval & search */
#include "eval.c"
#include "hash.c"
#include "ybwc.c"
#include "search.c"
#include "endgame.c"
#include "midgame.c"
#include "root.c"

/* miscellaneous tests */
#include "perft.c"
#include "obftest.c"
#include "histogram.c"

/* opening book & game database */
#include "book.c"
#include "game.c"
#include "base.c"
#include "opening.c"

/* game play with various protocols */
#include "play.c"
#include "event.c"
#include "ui.c"
#include "edax.c"
#include "cassio.c"
#include "ggs.c"
#include "gtp.c"
#include "nboard.c"
#include "xboard.c"

/* main */
// main.c 제외(인터랙티브 UI/스레드 우회)


#include <emscripten.h>
void usage(void) {}
static Play g_play; static Book g_book; static int g_inited=0;
EMSCRIPTEN_KEEPALIVE void edax_boot(void){
  if(g_inited)return;
  options.n_task=1; options_parse("edax.ini"); options.verbosity=0; options_bound();
  edge_stability_init(); statistics_init(); eval_open(options.eval_file); search_global_init();
  book_init(&g_book); play_init(&g_play,&g_book); g_play.search.id=1;
  options.play_type=EDAX_TIME_PER_MOVE;   // per-move 시간모드(시간 상한용)
  g_inited=1;
}
// level=탐색 깊이(강도), timeMs=한 수 시간 상한. 둘 중 먼저 도달하면 그 시점 최선수.
EMSCRIPTEN_KEEPALIVE int edax_bestmove(const char* b,int level,int timeMs){
  if(!g_inited)edax_boot();
  options.level=level; options.time=timeMs;
  play_set_board(&g_play,(char*)b);
  if(play_is_game_over(&g_play))return -1;
  play_go(&g_play,1);
  Move *m=play_get_last_move(&g_play); return m?m->x:-1;
}
// 코치 모드: 둘 차례(X) 관점에서 이 국면의 평가값(돌 차이). play_go가 찾은 최선수의 score = 국면값.
// 자식 국면을 각각 넣어 부르면(상대 관점) 음수화로 각 수의 가치를 매겨 순위/손해 산출.
// 합법수 없음/종국 → sentinel(-127).
EMSCRIPTEN_KEEPALIVE int edax_eval(const char* b,int level,int timeMs){
  if(!g_inited)edax_boot();
  options.level=level; options.time=timeMs;
  play_set_board(&g_play,(char*)b);
  if(play_is_game_over(&g_play))return -127;
  play_go(&g_play,1);
  Move *m=play_get_last_move(&g_play); return m?m->score:-127;
}
