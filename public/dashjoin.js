var DashJoin = ('object' === typeof module && exports) || {};
(function (window, DashJoin) {
	'use strict';

	const DENOM_LOWEST = 100001;
	const PREDENOM_MIN = DENOM_LOWEST + 193;
	const COLLATERAL = 10000; // DENOM_LOWEST / 10

	DashJoin.DENOM_LOWEST = DENOM_LOWEST;
	DashJoin.COLLATERAL = COLLATERAL;
	DashJoin.PREDENOM_MIN = PREDENOM_MIN;
	DashJoin.DENOMS = [
		100001, //      0.00100001
		1000010, //     0.01000010
		10000100, //    0.10000100
		100001000, //   1.00001000
		1000010000, // 10.00010000
	];
	let reverseDenoms = DashJoin.DENOMS.slice(0);
	reverseDenoms.reverse();

	// Ask Niles if there's an layman-ish obvious way to do this
	DashJoin.getDenom = function (sats) {
		for (let denom of reverseDenoms) {
			let isDenom = sats === denom;
			if (isDenom) {
				return denom;
			}
		}

		return 0;
	};

	//@ts-ignore
	window.DashJoin = DashJoin;
})(globalThis.window || {}, DashJoin);
if ('object' === typeof module) {
	module.exports = DashJoin;
}
