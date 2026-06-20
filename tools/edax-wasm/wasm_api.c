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
  book_init(&g_book); play_init(&g_play,&g_book); g_play.search.id=1; g_inited=1;
}
EMSCRIPTEN_KEEPALIVE int edax_bestmove(const char* b,int level){
  if(!g_inited)edax_boot();
  options.level=level; play_set_board(&g_play,(char*)b);
  if(play_is_game_over(&g_play))return -1;
  play_go(&g_play,1);
  Move *m=play_get_last_move(&g_play); return m?m->x:-1;
}
