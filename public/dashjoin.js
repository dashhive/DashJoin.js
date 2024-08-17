var DashJoin = ('object' === typeof module && exports) || {};
(function (window, DashJoin) {
	'use strict';

	let DashP2P = window.DashP2P || require('dashp2p');
	let DashTx = window.DashTx || require('dashtx');

	const DV_LITTLE_ENDIAN = true;

	const DENOM_LOWEST = 100001;
	const PREDENOM_MIN = DENOM_LOWEST + 193;
	const COLLATERAL = 10000; // DENOM_LOWEST / 10

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

	// Note: "mask" may be a misnomer. The spec seems to be more of an ID,
	//       but the implementation makes it look more like a mask...
	let STANDARD_DENOMINATION_MASKS = {
		//  0.00100001
		100001: 0b00010000,
		//  0.01000010
		1000010: 0b00001000,
		//  0.10000100
		10000100: 0b00000100,
		//  1.00001000
		100001000: 0b00000010,
		// 10.00010000
		1000010000: 0b00000001,
	};

	// https://github.com/dashpay/dash/blob/v19.x/src/coinjoin/coinjoin.h#L39
	// const COINJOIN_ENTRY_MAX_SIZE = 9; // real
	// const COINJOIN_ENTRY_MAX_SIZE = 2; // just for testing right now

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

	Sizes.DSQ = 142;
	Sizes.SENDDSQ = 1; // 1-byte bool
	Sizes.DENOM = 4; // 32-bit uint
	Sizes.PROTX = 32;
	Sizes.TIME = 8; // 64-bit uint
	Sizes.READY = 1; // 1-byte bool
	Sizes.SIG = 97;

	// Sizes.DSSU = 16;
	// Sizes.SESSION_ID = 4;

	/**
	 * Turns on or off DSQ messages (necessary for CoinJoin, but off by default)
	 * @param {Object} opts
	 * @param {NetworkName} opts.network - "mainnet", "testnet", etc
	 * @param {Uint8Array?} [opts.message]
	 * @param {Boolean?} [opts.send]
	 */
	Packers.senddsq = function ({ network = 'mainnet', message, send = true }) {
		const command = 'senddsq';
		let [bytes, payload] = DashP2P.packers._alloc(message, Sizes.SENDDSQ);

		let sendByte = [0x01];
		if (!send) {
			sendByte = [0x00];
		}
		payload.set(sendByte, 0);

		void DashP2P.packers.message({ network, command, bytes });
		return bytes;
	};

	/**
	 * Request to be allowed to join a CoinJoin pool. This may join an existing
	 * session - such as one already broadcast by a dsq - or may create a new one.
	 * @param {Object} opts
	 * @param {NetworkName} opts.network - "mainnet", "testnet", etc
	 * @param {Uint8Array?} [opts.message]
	 * @param {Uint32} opts.denomination
	 * @param {Uint8Array} opts.collateralTx
	 */
	Packers.dsa = function ({
		network = 'mainnet',
		message,
		denomination,
		collateralTx,
	}) {
		const command = 'dsa';
		let dsaSize = Sizes.DENOM + collateralTx.length;
		let [bytes, payload] = DashP2P.packers._alloc(message, dsaSize);

		//@ts-ignore - numbers can be used as map keys
		let denomMask = STANDARD_DENOMINATION_MASKS[denomination];
		if (!denomMask) {
			throw new Error(
				`contact your local Dash representative to vote for denominations of '${denomination}'`,
			);
		}

		let dv = new DataView(payload.buffer);
		let offset = 0;

		dv.setUint32(offset, denomMask, DV_LITTLE_ENDIAN);
		offset += Sizes.DENOM;

		payload.set(collateralTx, offset);

		void DashP2P.packers.message({ network, command, bytes });
		return bytes;
	};

	/**
	 * @param {Object} opts
	 * @param {NetworkName} opts.network - "mainnet", "testnet", etc
	 * @param {Uint8Array?} [opts.message]
	 * @param {Array<import('dashtx').TxInput>} opts.inputs
	 * @param {Array<import('dashtx').TxOutput>} opts.outputs
	 * @param {Uint8Array} opts.collateralTx
	 */
	Packers.dsi = function ({
		network = 'mainnet',
		message,
		inputs,
		collateralTx,
		outputs,
	}) {
		const command = 'dsi';

		let neutered = [];
		for (let input of inputs) {
			let _input = {
				txId: input.txId || input.txid,
				txid: input.txid || input.txId,
				outputIndex: input.outputIndex,
			};
			neutered.push(_input);
		}

		let inputsHex = DashTx.serializeInputs(inputs);
		let inputHex = inputsHex.join('');
		let outputsHex = DashTx.serializeOutputs(outputs);
		let outputHex = outputsHex.join('');

		let dsiSize = collateralTx.length;
		dsiSize += inputHex.length / 2;
		dsiSize += outputHex.length / 2;

		let [bytes, payload] = DashP2P.packers._alloc(message, dsiSize);

		let offset = 0;
		{
			let j = 0;
			for (let i = 0; i < inputHex.length; i += 2) {
				let end = i + 2;
				let hex = inputHex.slice(i, end);
				payload[j] = parseInt(hex, 16);
				j += 1;
			}
			offset += inputHex.length / 2;
		}

		payload.set(collateralTx, offset);
		offset += collateralTx.length;

		{
			let outputsPayload = payload.subarray(offset);
			let j = 0;
			for (let i = 0; i < outputHex.length; i += 2) {
				let end = i + 2;
				let hex = outputHex.slice(i, end);
				outputsPayload[j] = parseInt(hex, 16);
				j += 1;
			}
			offset += outputHex.length / 2;
		}

		void DashP2P.packers.message({ network, command, bytes });
		return bytes;
	};

	/**
	 * @param {Object} opts
	 * @param {Uint8Array?} [opts.message]
	 * @param {NetworkName} opts.network - "mainnet", "testnet", etc
	 * @param {Array<import('dashtx').CoreUtxo>} [opts.inputs]
	 */
	Packers.dss = function ({ network = 'mainnet', message, inputs }) {
		const command = 'dss';

		if (!inputs?.length) {
			// TODO make better
			throw new Error('you must provide some inputs');
		}

		let txInputsHex = DashTx.serializeInputs(inputs);
		let txInputHex = txInputsHex.join('');

		let dssSize = txInputHex.length / 2;
		let [bytes, payload] = DashP2P.packers._alloc(message, dssSize);
		void DashP2P.utils.hexToPayload(txInputHex, payload);

		void DashP2P.packers.message({ network, command, bytes });
		return bytes;
	};

	/**
	 * @param {Uint8Array} bytes
	 */
	Parsers.dsq = function (bytes) {
		if (bytes.length !== Sizes.DSQ) {
			let msg = `developer error: 'dsq' must be ${Sizes.DSQ} bytes, but received ${bytes.length}`;
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

	// Utils.hexToBytes = DashTx.utils.hexToBytes;
	// Utils.bytesToHex = DashTx.utils.bytesToHex;

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
