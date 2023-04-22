/**
 * A port of DASH core's CCoinJoinClientManager
 */

let Lib = {};
module.exports = Lib;
Lib.POOL_STATE_IDLE = 0;
Lib.POOL_STATE_QUEUE = 1;
Lib.POOL_STATE_ACCEPTING_ENTRIES = 2;
Lib.POOL_STATE_SIGNING = 3;
Lib.POOL_STATE_ERROR = 4;
Lib.POOL_STATE_MIN = Lib.POOL_STATE_IDLE;
Lib.POOL_STATE_MAX = Lib.POOL_STATE_ERROR;
