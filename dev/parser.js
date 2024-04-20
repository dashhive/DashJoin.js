'use strict';

let Parser = module.exports;

const DV_LITTLE_ENDIAN = true;
// const DV_BIG_ENDIAN = false;
//let EMPTY_HASH = Buffer.from('5df6e0e2', 'hex');

Parser.HEADER_SIZE = 24;
Parser.DSSU_SIZE = 16;
Parser.DSQ_SIZE = 142;
Parser.SESSION_ID_SIZE = 4;

let CoinJoin = require('./coinjoin.js');
let DashTx = require('dashtx');

/**
 * Parse the 24-byte P2P Message Header
 *   -  4 byte magic bytes (delimiter) (possibly intended for non-tcp messages?)
 *   - 12 byte string (stop at first null)
 *   -  4 byte payload size
 *   -  4 byte checksum
 *
 * See also:
 *     - https://docs.dash.org/projects/core/en/stable/docs/reference/p2p-network-message-headers.html#message-headers
 */
Parser.parseHeader = function (bytes) {
	let buffer = Buffer.from(bytes);
	console.log(
		new Date(),
		'[debug] parseHeader(bytes)',
		buffer.length,
		buffer.toString('hex'),
	);
	console.log(buffer.toString('utf8'));

	bytes = new Uint8Array(buffer);
	if (bytes.length < Parser.HEADER_SIZE) {
		let msg = `developer error: header should be ${Parser.HEADER_SIZE}+ bytes (optional payload), not ${bytes.length}`;
		throw new Error(msg);
	}
	let dv = new DataView(bytes.buffer);

	let commandStart = 4;
	let payloadSizeStart = 16;
	let checksumStart = 20;

	let magicBytes = buffer.slice(0, commandStart);

	let commandEnd = buffer.indexOf(0x00, commandStart);
	if (commandEnd >= payloadSizeStart) {
		throw new Error('command name longer than 12 bytes');
	}
	let commandBuf = buffer.slice(commandStart, commandEnd);
	let command = commandBuf.toString('utf8');

	let payloadSize = dv.getUint32(payloadSizeStart, DV_LITTLE_ENDIAN);
	let checksum = buffer.slice(checksumStart, checksumStart + 4);

	let headerMessage = {
		magicBytes,
		command,
		payloadSize,
		checksum,
	};

	if (command !== 'inv') {
		console.log(new Date(), headerMessage);
	}
	console.log();
	return headerMessage;
};

Parser.parseVersion = function (bytes) {
	let buffer = Buffer.from(bytes);
	console.log(
		'[debug] parseVersion(bytes)',
		buffer.length,
		buffer.toString('hex'),
	);
	console.log(buffer.toString('utf8'));

	bytes = new Uint8Array(buffer);
	let dv = new DataView(bytes.buffer);

	let versionStart = 0;
	let version = dv.getUint32(versionStart, DV_LITTLE_ENDIAN);

	let servicesStart = versionStart + 4; // + SIZES.VERSION (4)
	let servicesMask = dv.getBigUint64(servicesStart, DV_LITTLE_ENDIAN);

	let timestampStart = servicesStart + 8; // + SIZES.SERVICES (8)
	let timestamp64n = dv.getBigInt64(timestampStart, DV_LITTLE_ENDIAN);
	let timestamp64 = Number(timestamp64n);
	let timestampMs = timestamp64 * 1000;
	let timestamp = new Date(timestampMs);

	let addrRecvServicesStart = timestampStart + 8; // + SIZES.TIMESTAMP (8)
	let addrRecvServicesMask = dv.getBigUint64(
		addrRecvServicesStart,
		DV_LITTLE_ENDIAN,
	);

	let addrRecvAddressStart = addrRecvServicesStart + 8; // + SIZES.SERVICES (8)
	let addrRecvAddress = buffer.slice(
		addrRecvAddressStart,
		addrRecvAddressStart + 16,
	);

	let addrRecvPortStart = addrRecvAddressStart + 16; // + SIZES.IPV6 (16)
	let addrRecvPort = dv.getUint16(addrRecvPortStart, DV_LITTLE_ENDIAN);

	let addrTransServicesStart = addrRecvPortStart + 2; // + SIZES.PORT (2)
	let addrTransServicesMask = dv.getBigUint64(
		addrTransServicesStart,
		DV_LITTLE_ENDIAN,
	);

	let addrTransAddressStart = addrTransServicesStart + 8; // + SIZES.SERVICES (8)
	let addrTransAddress = buffer.slice(
		addrTransAddressStart,
		addrTransAddressStart + 16,
	);

	let addrTransPortStart = addrTransAddressStart + 16; // + SIZES.IPV6 (16)
	let addrTransPort = dv.getUint16(addrTransPortStart, DV_LITTLE_ENDIAN);

	let nonceStart = addrTransPortStart + 2; // + SIZES.PORT (2)
	let nonce = buffer.slice(nonceStart, nonceStart + 8);

	let uaSizeStart = 80; // + SIZES.PORT (2)
	let uaSize = buffer[uaSizeStart];

	let uaStart = uaSizeStart + 1;
	let uaBytes = buffer.slice(uaStart, uaStart + uaSize);
	let ua = uaBytes.toString('utf8');

	let startHeightStart = uaStart + uaSize;
	let startHeight = dv.getUint32(startHeightStart, DV_LITTLE_ENDIAN);

	let relayStart = startHeightStart + 4;
	/** @type {Boolean?} */
	let relay = null;
	if (buffer.length > relayStart) {
		relay = buffer[relayStart] > 0;
	}

	let mnAuthChStart = relayStart + 1;
	/** @type {Uint8Array?} */
	let mnAuthChallenge = null;
	if (buffer.length > mnAuthChStart) {
		mnAuthChallenge = buffer.slice(mnAuthChStart, mnAuthChStart + 32);
	}

	let mnConnStart = mnAuthChStart + 32;
	/** @type {Boolean?} */
	let mnConn = null;
	if (buffer.length > mnConnStart) {
		mnConn = buffer[mnConnStart] > 0;
	}

	let versionMessage = {
		version,
		servicesMask,
		timestamp,
		addrRecvServicesMask,
		addrRecvAddress,
		addrRecvPort,
		addrTransServicesMask,
		addrTransAddress,
		addrTransPort,
		nonce,
		ua,
		startHeight,
		relay,
		mnAuthChallenge,
		mnConn,
	};

	console.log(versionMessage);
	console.log();
	return version;
};

Parser._DSSU_MESSAGE_IDS = {
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

Parser._DSSU_STATES = {
	0x00: 'IDLE',
	0x01: 'QUEUE',
	0x02: 'ACCEPTING_ENTRIES',
	0x03: 'SIGNING',
	0x04: 'ERROR',
	0x05: 'SUCCESS',
};

Parser._DSSU_STATUSES = {
	0x00: 'REJECTED',
	0x01: 'ACCEPTED',
};

Parser.parseDssu = function (bytes) {
	let buffer = Buffer.from(bytes);

	bytes = new Uint8Array(buffer);
	let dv = new DataView(bytes.buffer);
	console.log('[debug] parseDssu(bytes)', bytes.length, buffer.toString('hex'));
	console.log(buffer.toString('utf8'));
	if (bytes.length !== Parser.DSSU_SIZE) {
		let msg = `developer error: a 'dssu' message is 16 bytes, but got ${bytes.length}`;
		throw new Error(msg);
	}

	/**
	 * 4	nMsgSessionID		- Required		- Session ID
	 * 4	nMsgState			- Required		- Current state of processing
	 * 4	nMsgEntriesCount	- Required		- Number of entries in the pool (deprecated)
	 * 4	nMsgStatusUpdate	- Required		- Update state and/or signal if entry was accepted or not
	 * 4	nMsgMessageID		- Required		- ID of the typical masternode reply message
	 */
	const SIZES = {
		SESSION_ID: Parser.SESSION_ID_SIZE,
		STATE: 4,
		ENTRIES_COUNT: 4,
		STATUS_UPDATE: 4,
		MESSAGE_ID: 4,
	};

	let offset = 0;

	let session_id = dv.getUint32(offset, DV_LITTLE_ENDIAN);
	offset += SIZES.SESSION_ID;

	let state_id = dv.getUint32(offset, DV_LITTLE_ENDIAN);
	offset += SIZES.STATE;

	///**
	// * Grab the entries count
	// * Not parsed because apparently master nodes no longer send
	// * the entries count.
	// */
	//parsed.entries_count = dv.getUint32(offset, DV_LITTLE_ENDIAN);
	//offset += SIZES.ENTRIES_COUNT;

	let status_id = dv.getUint32(offset, DV_LITTLE_ENDIAN);
	offset += SIZES.STATUS_UPDATE;

	let message_id = dv.getUint32(offset, DV_LITTLE_ENDIAN);

	let dssuMessage = {
		session_id: session_id,
		state_id: state_id,
		state: Parser._DSSU_STATES[state_id],
		// entries_count: 0,
		status_id: status_id,
		status: Parser._DSSU_STATUSES[status_id],
		message_id: message_id,
		message: Parser._DSSU_MESSAGE_IDS[message_id],
	};

	console.log(dssuMessage);
	console.log();
	return dssuMessage;
};

Parser.parseDsq = function (bytes) {
	let buffer = Buffer.from(bytes);

	bytes = new Uint8Array(buffer);
	if (bytes.length !== Parser.DSQ_SIZE) {
		let msg = `developer error: 'dsq' messages are ${Parser.DSQ_SIZE} bytes, not ${bytes.length}`;
		throw new Error(msg);
	}
	let dv = new DataView(bytes.buffer);
	console.log('[debug] parseDsq(bytes)', bytes.length, buffer.toString('hex'));
	console.log(buffer.toString('utf8'));

	const SIZES = {
		DENOM: 4,
		PROTX: 32,
		TIME: 8,
		READY: 1,
		SIG: 97,
	};

	let offset = 0;

	/**
	 * Grab the denomination
	 */
	let denomination_id = dv.getUint32(offset, DV_LITTLE_ENDIAN);
	offset += SIZES.DENOM;
	let denomination = CoinJoin.STANDARD_DENOMINATIONS[denomination_id];

	/**
	 * Grab the protxhash
	 */
	let protxhash_bytes = bytes.slice(offset, offset + SIZES.PROTX);
	offset += SIZES.PROTX;

	/**
	 * Grab the time
	 */
	let timestamp64n = dv.getBigInt64(offset, DV_LITTLE_ENDIAN);
	offset += SIZES.TIME;
	let timestamp_unix = Number(timestamp64n);
	let timestampMs = timestamp_unix * 1000;
	let timestampDate = new Date(timestampMs);
	let timestamp = timestampDate.toISOString();

	/**
	 * Grab the fReady
	 */
	let ready = bytes[offset] > 0x00;
	offset += SIZES.READY;

	let signature_bytes = bytes.slice(offset, offset + SIZES.SIG);

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

	console.log(dsqMessage);
	console.log();
	return dsqMessage;
};

Parser.parseDsf = function (bytes) {
	console.log(
		new Date(),
		'[debug] parseDsf',
		bytes.length,
		bytes.toString('hex'),
	);

	let offset = 0;
	let sessionId = bytes.subarray(offset, Parser.SESSION_ID_SIZE);
	let session_id = DashTx.utils.bytesToHex(sessionId);
	offset += Parser.SESSION_ID_SIZE;

	// TODO parse transaction completely with DashTx
	let transactionUnsigned = bytes.subarray(offset);
	let transaction_unsigned = DashTx.utils.bytesToHex(transactionUnsigned);

	console.log(
		new Date(),
		'[debug] parseDsf',
		transaction_unsigned.length,
		transaction_unsigned,
	);

	return { session_id, transaction_unsigned };
};
