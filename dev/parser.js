'use strict';

let Parser = module.exports;

const DV_LITTLE_ENDIAN = true;
// const DV_BIG_ENDIAN = true;
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
