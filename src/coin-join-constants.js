/**
 * A port of DASH core's CCoinJoinClientManager
 */

let Lib = {};
module.exports = Lib;
const { COIN, MAX_MONEY } = require('./coin.js');
Lib.COINJOIN_AUTO_TIMEOUT_MIN = 5;
Lib.COINJOIN_AUTO_TIMEOUT_MAX = 15;
Lib.COINJOIN_QUEUE_TIMEOUT = 30;
Lib.COINJOIN_SIGNING_TIMEOUT = 15;
Lib.COINJOIN_ENTRY_MAX_SIZE = 9;
Lib.COINJOIN_DENOM_OUTPUTS_THRESHOLD = 500;
// Warn user if mixing in gui or try to create backup if mixing in daemon mode
// when we have only this many keys left
Lib.COINJOIN_KEYS_THRESHOLD_WARNING = 100;
// Stop mixing completely, it's too dangerous to continue when we have only this many keys left
Lib.COINJOIN_KEYS_THRESHOLD_STOP = 50;
// Pseudorandomly mix up to this many times in addition to base round count
Lib.COINJOIN_RANDOM_ROUNDS = 3;

Lib.MIN_COINJOIN_SESSIONS = 1;
Lib.MIN_COINJOIN_ROUNDS = 2;
Lib.MIN_COINJOIN_AMOUNT = 2;
Lib.MIN_COINJOIN_DENOMS_GOAL = 10;
Lib.MIN_COINJOIN_DENOMS_HARDCAP = 10;
Lib.MAX_COINJOIN_SESSIONS = 10;
Lib.MAX_COINJOIN_ROUNDS = 16;
Lib.MAX_COINJOIN_DENOMS_GOAL = 100000;
Lib.MAX_COINJOIN_DENOMS_HARDCAP = 100000;
Lib.MAX_COINJOIN_AMOUNT = MAX_MONEY / COIN;
Lib.DEFAULT_COINJOIN_SESSIONS = 4;
Lib.DEFAULT_COINJOIN_ROUNDS = 4;
Lib.DEFAULT_COINJOIN_AMOUNT = 1000;
Lib.DEFAULT_COINJOIN_DENOMS_GOAL = 50;
Lib.DEFAULT_COINJOIN_DENOMS_HARDCAP = 300;

Lib.DEFAULT_COINJOIN_AUTOSTART = false;
Lib.DEFAULT_COINJOIN_MULTISESSION = false;

// How many new denom outputs to create before we consider the "goal" loop in CreateDenominated
// a final one and start creating an actual tx. Same limit applies for the "hard cap" part of the algo.
// NOTE: We do not allow txes larger than 100kB, so we have to limit the number of outputs here.
// We still want to create a lot of outputs though.
// Knowing that each CTxOut is ~35b big, 400 outputs should take 400 x ~35b = ~17.5kb.
// More than 500 outputs starts to make qt quite laggy.
// Additionally to need all 500 outputs (assuming a max per denom of 50) you'd need to be trying to
// create denominations for over 3000 dash!
Lib.COINJOIN_DENOM_OUTPUTS_THRESHOLD = 500;

// Warn user if mixing in gui or try to create backup if mixing in daemon mode
// when we have only this many keys left
Lib.COINJOIN_KEYS_THRESHOLD_WARNING = 100;
// Stop mixing completely, it's too dangerous to continue when we have only this many keys left
Lib.COINJOIN_KEYS_THRESHOLD_STOP = 50;
// Pseudorandomly mix up to this many times in addition to base round count
Lib.COINJOIN_RANDOM_ROUNDS = 3;
Lib.ERR_ALREADY_HAVE = 0;
Lib.ERR_DENOM = 1;
Lib.ERR_ENTRIES_FULL = 2;
Lib.ERR_EXISTING_TX = 3;
Lib.ERR_FEES = 4;
Lib.ERR_INVALID_COLLATERAL = 5;
Lib.ERR_INVALID_INPUT = 6;
Lib.ERR_INVALID_SCRIPT = 7;
Lib.ERR_INVALID_TX = 8;
Lib.ERR_MAXIMUM = 9;
Lib.ERR_MN_LIST = 10;
Lib.ERR_MODE = 11;
Lib.ERR_NON_STANDARD_PUBKEY = 12; // not used
(Lib.ERR_NOT_A_MN = 13), // not used
	(Lib.ERR_QUEUE_FULL = 14);
Lib.ERR_RECENT = 15;
Lib.ERR_SESSION = 16;
Lib.ERR_MISSING_TX = 17;
Lib.ERR_VERSION = 18;
Lib.MSG_NOERR = 19;
Lib.MSG_SUCCESS = 20;
Lib.MSG_ENTRIES_ADDED = 21;
Lib.ERR_SIZE_MISMATCH = 22;
Lib.MSG_POOL_MIN = Lib.ERR_ALREADY_HAVE;
Lib.MSG_POOL_MAX = Lib.ERR_SIZE_MISMATCH;

Lib.STANDARD_DENOMINATIONS = [
	10 * COIN + 10000,
	1 * COIN + 1000,
	COIN / 10 + 100,
	COIN / 100 + 10,
	COIN / 1000 + 1,
];
Lib.COIN = COIN;

module.exports = Lib;
