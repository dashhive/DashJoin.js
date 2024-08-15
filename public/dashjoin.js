var DashJoin = ('object' === typeof module && exports) || {};
(function (window, DashJoin) {
	'use strict';

	// let DashTx = window.DashTx || require('dashtx');

	const DENOM_LOWEST = 100001;
	const PREDENOM_MIN = DENOM_LOWEST + 193;
	const COLLATERAL = 10000; // DENOM_LOWEST / 10
	const PAYLOAD_SIZE_MAX = 4 * 1024 * 1024;

	// https://github.com/dashpay/dash/blob/v19.x/src/coinjoin/coinjoin.h#L39
	// const COINJOIN_ENTRY_MAX_SIZE = 9; // real
	// const COINJOIN_ENTRY_MAX_SIZE = 2; // just for testing right now

	DashJoin.PAYLOAD_SIZE_MAX = PAYLOAD_SIZE_MAX;
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

	DashJoin.utils = {};

	DashJoin.utils.hexToBytes = function (hex) {
		let bufLen = hex.length / 2;
		let u8 = new Uint8Array(bufLen);

		let i = 0;
		let index = 0;
		let lastIndex = hex.length - 2;
		for (;;) {
			if (i > lastIndex) {
				break;
			}

			let h = hex.slice(i, i + 2);
			let b = parseInt(h, 16);
			u8[index] = b;

			i += 2;
			index += 1;
		}

		return u8;
	};

	DashJoin.utils.bytesToHex = function (u8) {
		/** @type {Array<String>} */
		let hex = [];

		u8.forEach(function (b) {
			let h = b.toString(16).padStart(2, '0');
			hex.push(h);
		});

		return hex.join('');
	};

	DashJoin.utils._evonodeMapToList = function (evonodesMap) {
		console.log('[debug] get evonode list...');
		let evonodes = [];
		{
			//let resp = await rpc.masternodelist();
			let evonodeProTxIds = Object.keys(evonodesMap);
			for (let id of evonodeProTxIds) {
				let evonode = evonodesMap[id];
				if (evonode.status !== 'ENABLED') {
					continue;
				}

				let hostParts = evonode.address.split(':');
				let evodata = {
					id: evonode.id,
					host: evonode.address,
					hostname: hostParts[0],
					port: hostParts[1],
					type: evonode.type,
				};
				evonodes.push(evodata);
			}
			if (!evonodes.length) {
				throw new Error('Sanity Fail: no evonodes online');
			}
		}

		// void shuffle(evonodes);
		evonodes.sort(DashJoin.utils.sortMnListById);
		return evonodes;
	};

	/**
	 * @param {Object} a
	 * @param {String} a.id
	 * @param {Object} b
	 * @param {String} b.id
	 */
	DashJoin.utils.sortMnListById = function (a, b) {
		if (a.id > b.id) {
			return 1;
		}
		if (a.id < b.id) {
			return -1;
		}
		return 0;
	};

	//@ts-ignore
	window.DashJoin = DashJoin;
})(globalThis.window || {}, DashJoin);
if ('object' === typeof module) {
	module.exports = DashJoin;
}
