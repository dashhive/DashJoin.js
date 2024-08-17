var DashJoin = ('object' === typeof module && exports) || {};
(function (window, DashJoin) {
	'use strict';

	let DashP2P = window.DashP2P || require('./dashp2p.js');
	let DashTx = window.DashTx || require('dashtx');

	const DV_LITTLE_ENDIAN = true;

	const DENOM_LOWEST = 100001;
	const PREDENOM_MIN = DENOM_LOWEST + 193;
	const MIN_COLLATERAL = 10000; // DENOM_LOWEST / 10

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
	DashJoin.MIN_COLLATERAL = MIN_COLLATERAL;
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

	Sizes.DSSU = 16;
	Sizes.SESSION_ID = 4;
	Sizes.MESSAGE_ID = 4;

	/////////////////////
	//                 //
	//     Packers     //
	//                 //
	/////////////////////

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

		let dv = new DataView(payload.buffer, payload.byteOffset);
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
			let msg = `'dss' should receive signed inputs as requested in 'dsi' and accepted in 'dsf', but got 0 inputs`;
			throw new Error(msg);
		}

		let txInputsHex = DashTx.serializeInputs(inputs);
		let txInputHex = txInputsHex.join('');

		let dssSize = txInputHex.length / 2;
		let [bytes, payload] = DashP2P.packers._alloc(message, dssSize);
		void DashP2P.utils.hexToPayload(txInputHex, payload);

		void DashP2P.packers.message({ network, command, bytes });
		return bytes;
	};

	/////////////////////
	//                 //
	//     Parsers     //
	//                 //
	/////////////////////

	/**
	 * @param {Uint8Array} bytes
	 */
	Parsers.dsq = function (bytes) {
		if (bytes.length !== Sizes.DSQ) {
			let msg = `developer error: 'dsq' must be ${Sizes.DSQ} bytes, but received ${bytes.length}`;
			throw new Error(msg);
		}
		let dv = new DataView(bytes.buffer, bytes.byteOffset);

		let offset = 0;

		let denomination_id = dv.getUint32(offset, DV_LITTLE_ENDIAN);
		offset += Sizes.DENOM;

		//@ts-ignore - correctness of denomination must be checked higher up
		let denomination = STANDARD_DENOMINATIONS_MAP[denomination_id];

		let protxhash_bytes = bytes.subarray(offset, offset + Sizes.PROTX);
		offset += Sizes.PROTX;

		let timestamp64n = dv.getBigInt64(offset, DV_LITTLE_ENDIAN);
		offset += Sizes.TIME;
		let timestamp_unix = Number(timestamp64n);
		let timestampMs = timestamp_unix * 1000;
		let timestampDate = new Date(timestampMs);
		let timestamp = timestampDate.toISOString();

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

	Parsers._DSSU_MESSAGE_IDS = {
		0x00: 'ERR_ALREADY_HAVE',
		0x01: 'ERR_DENOM',
		0x02: 'ERR_ENTRIES_FULL',
		0x03: 'ERR_EXISTING_TX',
		0x04: 'ERR_FEES',
		0x05: 'ERR_INVALID_COLLATERAL',
		0x06: 'ERR_INVALID_INPUT',
		0x07: 'ERR_INVALID_SCRIPT',
		0x08: 'ERR_INVALID_TX',
		0x09: 'ERR_MAXIMUM',
		0x0a: 'ERR_MN_LIST', // <--
		0x0b: 'ERR_MODE',
		0x0c: 'ERR_NON_STANDARD_PUBKEY', //	 (Not used)
		0x0d: 'ERR_NOT_A_MN', //(Not used)
		0x0e: 'ERR_QUEUE_FULL',
		0x0f: 'ERR_RECENT',
		0x10: 'ERR_SESSION',
		0x11: 'ERR_MISSING_TX',
		0x12: 'ERR_VERSION',
		0x13: 'MSG_NOERR',
		0x14: 'MSG_SUCCESS',
		0x15: 'MSG_ENTRIES_ADDED',
		0x16: 'ERR_SIZE_MISMATCH',
	};

	Parsers._DSSU_STATES = {
		0x00: 'IDLE',
		0x01: 'QUEUE',
		0x02: 'ACCEPTING_ENTRIES',
		0x03: 'SIGNING',
		0x04: 'ERROR',
		0x05: 'SUCCESS',
	};

	Parsers._DSSU_STATUSES = {
		0x00: 'REJECTED',
		0x01: 'ACCEPTED',
	};

	// TODO DSSU type
	/**
	 * 4	nMsgSessionID		- Required		- Session ID
	 * 4	nMsgState			- Required		- Current state of processing
	 * 4	nMsgEntriesCount	- Required		- Number of entries in the pool (deprecated)
	 * 4	nMsgStatusUpdate	- Required		- Update state and/or signal if entry was accepted or not
	 * 4	nMsgMessageID		- Required		- ID of the typical masternode reply message
	 */

	/**
	 * @param {Uint8Array} bytes
	 */
	Parsers.dssu = function (bytes) {
		const STATE_SIZE = 4;
		const STATUS_UPDATE_SIZE = 4;

		if (bytes.length !== Sizes.DSSU) {
			let msg = `developer error: a 'dssu' message is 16 bytes, but got ${bytes.length}`;
			throw new Error(msg);
		}
		let dv = new DataView(bytes.buffer, bytes.byteOffset);
		let offset = 0;

		let session_id = dv.getUint32(offset, DV_LITTLE_ENDIAN);
		offset += Sizes.SESSION_ID;

		let state_id = dv.getUint32(offset, DV_LITTLE_ENDIAN);
		offset += STATE_SIZE;

		let status_id = dv.getUint32(offset, DV_LITTLE_ENDIAN);
		offset += STATUS_UPDATE_SIZE;

		let message_id = dv.getUint32(offset, DV_LITTLE_ENDIAN);

		let dssuMessage = {
			session_id: session_id,
			state_id: state_id,
			state: Parsers._DSSU_STATES[state_id],
			status_id: status_id,
			status: Parsers._DSSU_STATUSES[status_id],
			message_id: message_id,
			message: Parsers._DSSU_MESSAGE_IDS[message_id],
		};
		return dssuMessage;
	};

	/**
	 * @param {Uint8Array} bytes
	 */
	Parsers.dsf = function (bytes) {
		let offset = 0;
		let sessionId = bytes.subarray(offset, Sizes.SESSION_ID);
		let session_id = DashTx.utils.bytesToHex(sessionId);
		offset += Sizes.SESSION_ID;

		console.log('DEBUG [[dsf]] bytes', DashTx.utils.bytesToHex(bytes));
		let transactionUnsigned = bytes.subarray(offset);
		let transaction_unsigned = DashTx.utils.bytesToHex(transactionUnsigned);
		console.log('DEBUG [[dsf]] tx', transaction_unsigned);

		let txRequest = DashTx.parseUnknown(transaction_unsigned);
		let dsfTxRequest = {
			session_id: session_id,
			version: txRequest.version,
			inputs: txRequest.inputs,
			outputs: txRequest.outputs,
			locktime: txRequest.locktime,
			transaction_unsigned: transaction_unsigned,
		};
		return dsfTxRequest;
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
	DashJoin.sizes = Sizes;
	DashJoin.utils = Utils;

	//@ts-ignore
	window.DashJoin = DashJoin;
})(globalThis.window || {}, DashJoin);
if ('object' === typeof module) {
	module.exports = DashJoin;
}
