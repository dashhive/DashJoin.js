var DashJoin = ('object' === typeof module && exports) || {};
(function (window, DashJoin) {
	'use strict';

	let DashP2P = window.DashP2P || require('dashp2p');

	const DV_LITTLE_ENDIAN = true;

	const DENOM_LOWEST = 100001;
	const PREDENOM_MIN = DENOM_LOWEST + 193;
	const COLLATERAL = 10000; // DENOM_LOWEST / 10
	const PAYLOAD_SIZE_MAX = 4 * 1024 * 1024;

	let STANDARD_DENOMINATIONS_MAP = {
		//  0.00100001
		0b00010000: 100001,
		//  0.01000010
		0b00001000: 1000010,
		//  0.10000100
		0b00000100: 10000100,
		//  1.00001000
		0b00000010: 100001000,
		// 10.00010000
		0b00000001: 1000010000,
	};

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

	let Packers = {};
	let Parsers = {};
	let Sizes = {};
	let Utils = {};

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

	/**
	 * Turns on or off DSQ messages (necessary for CoinJoin, but off by default)
	 * @param {Object} opts
	 * @param {NetworkName} opts.network - "mainnet", "testnet", etc
	 * @param {Uint8Array?} [opts.message]
	 * @param {Boolean?} [opts.send]
	 */
	Packers.senddsq = function ({
		network = 'mainnet',
		message = null,
		send = true,
	}) {
		const command = 'senddsq';
		const SENDDSQ_SIZE = 1; // 1-byte bool

		if (!message) {
			let dsqSize = DashP2P.sizes.HEADER_SIZE + SENDDSQ_SIZE;
			message = new Uint8Array(dsqSize);
		}

		let payload = message.subarray(DashP2P.sizes.HEADER_SIZE);
		if (send) {
			payload.set([0x01], 0);
		} else {
			payload.set([0x00], 0);
		}

		void DashP2P.packers.message({ network, command, bytes: message });
		return message;
		// return { message, payload };
	};

	Sizes.DSQ_SIZE = 142;
	// DSQ stuff??
	Sizes.DENOM = 4;
	Sizes.PROTX = 32;
	Sizes.TIME = 8;
	Sizes.READY = 1;
	Sizes.SIG = 97;
	//

	// Sizes.DSSU_SIZE = 16;
	// Sizes.SESSION_ID_SIZE = 4;

	/**
	 * @param {Uint8Array} bytes
	 */
	Parsers.dsq = function (bytes) {
		if (bytes.length !== Sizes.DSQ_SIZE) {
			let msg = `developer error: 'dsq' must be ${Sizes.DSQ_SIZE} bytes, but received ${bytes.length}`;
			throw new Error(msg);
		}
		let dv = new DataView(bytes.buffer);

		let offset = 0;

		let denomination_id = dv.getUint32(offset, DV_LITTLE_ENDIAN);
		offset += Sizes.DENOM;

		//@ts-ignore - correctness of denomination must be checked higher up
		let denomination = STANDARD_DENOMINATIONS_MAP[denomination_id];

		/**
		 * Grab the protxhash
		 */
		let protxhash_bytes = bytes.subarray(offset, offset + Sizes.PROTX);
		offset += Sizes.PROTX;

		/**
		 * Grab the time
		 */
		let timestamp64n = dv.getBigInt64(offset, DV_LITTLE_ENDIAN);
		offset += Sizes.TIME;
		let timestamp_unix = Number(timestamp64n);
		let timestampMs = timestamp_unix * 1000;
		let timestampDate = new Date(timestampMs);
		let timestamp = timestampDate.toISOString();

		/**
		 * Grab the fReady
		 */
		let ready = bytes[offset] > 0x00;
		offset += Sizes.READY;

		let signature_bytes = bytes.subarray(offset, offset + Sizes.SIG);

		let dsqMessage = {
			denomination_id,
			denomination,
			protxhash_bytes,
			// protxhash: '',
			timestamp_unix,
			timestamp,
			ready,
			signature_bytes,
			// signature: '',
		};

		return dsqMessage;
	};

	Utils.hexToBytes = function (hex) {
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

	Utils.bytesToHex = function (u8) {
		/** @type {Array<String>} */
		let hex = [];

		u8.forEach(function (b) {
			let h = b.toString(16).padStart(2, '0');
			hex.push(h);
		});

		return hex.join('');
	};

	Utils._evonodeMapToList = function (evonodesMap) {
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
		evonodes.sort(Utils.sortMnListById);
		return evonodes;
	};

	/**
	 * @param {Object} a
	 * @param {String} a.id
	 * @param {Object} b
	 * @param {String} b.id
	 */
	Utils.sortMnListById = function (a, b) {
		if (a.id > b.id) {
			return 1;
		}
		if (a.id < b.id) {
			return -1;
		}
		return 0;
	};

	DashJoin.packers = Packers;
	DashJoin.parsers = Parsers;
	DashJoin.utils = Utils;

	//@ts-ignore
	window.DashJoin = DashJoin;
})(globalThis.window || {}, DashJoin);
if ('object' === typeof module) {
	module.exports = DashJoin;
}
