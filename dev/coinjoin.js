'use strict';

let CoinJoin = module.exports;

CoinJoin.STANDARD_DENOMINATIONS = [
	// 0.00100001
	100001,
	// 0.01000010
	1000010,
	// 0.10000100
	10000100,
	// 1.00001000
	100001000,
	// 10.0000100
	1000010000,
];

// (STANDARD_DENOMINATIONS[0] / 10).floor();
CoinJoin.COLLATERAL = 10000;
// COLLATERAL * 4
CoinJoin.MAX_COLLATERAL = 40000;

CoinJoin.isDenominated = function (sats) {
	return CoinJoin.STANDARD_DENOMINATIONS.includes(sats);
};
