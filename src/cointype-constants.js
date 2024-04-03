const CoinType = {
	ALL_COINS: 0,
	ONLY_FULLY_MIXED: 1,
	ONLY_READY_TO_MIX: 2,
	ONLY_NONDENOMINATED: 3,
	ONLY_MASTERNODE_COLLATERAL: 4, // find masternode outputs including locked ones (use with caution)
	ONLY_COINJOIN_COLLATERAL: 5,
	// Attributes
	MIN_COIN_TYPE: 0,
	MAX_COIN_TYPE: 5,
};

module.exports = CoinType;
