'use strict';

let Parser = module.exports;

const DV_LITTLE_ENDIAN = true;
const DV_BIG_ENDIAN = true;
//let EMPTY_HASH = Buffer.from('5df6e0e2', 'hex');

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
Parser.parseHeader = function (buffer) {
	console.log(buffer);
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

	let bytes = new Uint8Array(buffer);
	let dv = new DataView(bytes.buffer);
	let payloadSize = dv.getUint32(payloadSizeStart, DV_LITTLE_ENDIAN);
	let checksum = buffer.slice(checksumStart, checksumStart + 4);

	let header = {
		magicBytes,
		command,
		payloadSize,
		checksum,
	};

	return header;
};

Parser.parseVersion = function (bytes) {
	let buffer = Buffer.from(bytes);
	console.log('parseVerack', buffer.toString('hex'));
	console.log(buffer.toString('utf8'));

	bytes = new Uint8Array(buffer);
	let dv = new DataView(bytes.buffer);

	let versionStart = 0;
	let version = dv.getUint32(versionStart, DV_LITTLE_ENDIAN);

	let servicesStart = versionStart + 4; // + SIZES.VERSION (4)
	let servicesMask = dv.getBigUint64(servicesStart, DV_LITTLE_ENDIAN);

	let timestampStart = servicesStart + 8; // + SIZES.SERVICES (8)
	let timestamp64n = dv.getBigUint64(timestampStart, DV_LITTLE_ENDIAN);
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

	let verack = {
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
	return verack;
};
Parser.parseVerack = Parser.parseVersion;
