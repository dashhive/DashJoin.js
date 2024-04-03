/**
 * A port of DASH core's CoinJoin CCoinJoinClientOptions class
 */

const DEFAULT_COINJOIN_SESSIONS = 4;
const DEFAULT_COINJOIN_ROUNDS = 4;
const DEFAULT_COINJOIN_AMOUNT = 1000;
const DEFAULT_COINJOIN_DENOMS_GOAL = 50;
const DEFAULT_COINJOIN_DENOMS_HARDCAP = 300;
const DEFAULT_COINJOIN_AUTOSTART = false;
const DEFAULT_COINJOIN_MULTISESSION = false;

let Lib = {};
module.exports = Lib;
/* Application wide mixing options */
Lib.CCoinJoinClientOptions = {};
Lib.CCoinJoinClientOptions._instance = null;
Lib.CCoinJoinClientOptions.GetSessions = function () {
	return Lib._instance.nCoinJoinSessions;
};
Lib.CCoinJoinClientOptions.GetRounds = function () {
	return Lib._instance.nCoinJoinRounds;
};
Lib.CCoinJoinClientOptions.GetRandomRounds = function () {
	return Lib._instance.nCoinJoinRandomRounds;
};
Lib.CCoinJoinClientOptions.GetAmount = function () {
	return Lib._instance.nCoinJoinAmount;
};
Lib.CCoinJoinClientOptions.GetDenomsGoal = function () {
	return Lib._instance.nCoinJoinDenomsGoal;
};
Lib.CCoinJoinClientOptions.GetDenomsHardCap = function () {
	return Lib._instance.nCoinJoinDenomsHardCap;
};
Lib.CCoinJoinClientOptions.IsEnabled = function () {
	return Lib._instance.fEnableCoinJoin;
};
Lib.IsMultiSessionEnabled = function () {
	return Lib._instance.fCoinJoinMultiSession;
};

Lib.CCoinJoinClientOptions.SetEnabled = function (fEnabled) {
	Lib._instance.fEnableCoinJoin = fEnabled;
};
Lib.CCoinJoinClientOptions.SetMultiSessionEnabled = function (fEnabled) {
	Lib._instance.fCoinJoinMultiSession = fEnabled;
};
Lib.CCoinJoinClientOptions.SetRounds = function (nRounds) {
	Lib._instance.nCoinJoinRounds = nRounds;
};
Lib.CCoinJoinClientOptions.SetAmount = function (amount) {
	Lib._instance.nCoinJoinAmount = amount;
};
Lib.CCoinJoinClientOptions.Init = function () {
	Lib._instance = {};
	Lib._instance.fCoinJoinMultiSession = DEFAULT_COINJOIN_MULTISESSION;
	Lib._instance.nCoinJoinSessions = DEFAULT_COINJOIN_SESSIONS;
	Lib._instance.nCoinJoinRounds = DEFAULT_COINJOIN_ROUNDS;
	Lib._instance.nCoinJoinAmount = DEFAULT_COINJOIN_AMOUNT;
	Lib._instance.nCoinJoinDenomsGoal = DEFAULT_COINJOIN_DENOMS_GOAL;
	Lib._instance.nCoinJoinDenomsHardCap = DEFAULT_COINJOIN_DENOMS_HARDCAP;
};

Lib.CCoinJoinClientOptions.GetJsonInfo = function () {
	return JSON.stringify({
		enabled: Lib._instance.fEnableCoinJoin,
		multisession: Lib._instance.fCoinJoinMultiSession,
		max_sessions: Lib._instance.nCoinJoinSessions,
		max_rounds: Lib._instance.nCoinJoinRounds,
		max_amount: Lib._instance.nCoinJoinAmount,
		denoms_goal: Lib._instance.nCoinJoinDenomsGoal,
		denoms_hardcap: Lib._instance.nCoinJoinDenomsHardCap,
	});
};
