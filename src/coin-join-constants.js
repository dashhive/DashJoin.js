/**
 * A port of DASH core's CCoinJoinClientManager
 */

let Lib = {};
module.exports = Lib;
Lib.COINJOIN_AUTO_TIMEOUT_MIN = 5;
Lib.COINJOIN_AUTO_TIMEOUT_MAX = 15;
Lib.COINJOIN_QUEUE_TIMEOUT = 30;
Lib.COINJOIN_SIGNING_TIMEOUT = 15;
Lib.COINJOIN_ENTRY_MAX_SIZE = 9;
