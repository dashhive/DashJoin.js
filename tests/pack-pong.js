'use strict';

let Packer = require('../dev/ds.js');

function test() {
	let messageSize = Packer.HEADER_SIZE + Packer.PING_SIZE;
	let bytes = new Uint8Array(messageSize);
	let offset = Packer.HEADER_SIZE;

	// These two are the same, but the latter is more intuitive to use:
	//
	// - this is ONLY a reference IF the underlying ArrayBuffer is used
	// - the OFFSET is ONLY a property, it DOES NOT affect .set()
	//let pongBytes = new Uint8Array(bytes.buffer, offset);
	// - this is a reference, as you'd expect
	// - .set() works from the offset
	let pongBytes = bytes.subarray(offset);
	let zeroNonceStr = [0, 0, 0, 0, 0, 0, 0, 0].toString();
	if (zeroNonceStr !== pongBytes.toString()) {
		throw new Error('sanity fail: nonce bytes should be initialized to 0');
	}
	void Packer.packPong({ bytes: pongBytes });
	let randNonceStr = pongBytes.toString();
	if (zeroNonceStr === randNonceStr) {
		throw new Error('nonce bytes should be randomized, not 0');
	}
	let randNonceBytes2 = bytes.slice(offset);
	let randNonceStr2 = randNonceBytes2.toString();
	if (randNonceStr !== randNonceStr2) {
		throw new Error(
			'nonce bytes subarray and nonce bytes slice should be equal',
		);
	}

	let staticNonceBytes = new Uint8Array(Packer.FIELD_SIZES.NONCE);
	staticNonceBytes[0] = 0xab;
	staticNonceBytes[1] = 0xcd;
	staticNonceBytes[2] = 0xef;
	staticNonceBytes[3] = 0x12;
	staticNonceBytes[4] = 0x34;
	staticNonceBytes[5] = 0x56;
	staticNonceBytes[6] = 0x78;
	staticNonceBytes[7] = 0x90;
	let staticNonceStr = staticNonceBytes.toString();
	void Packer.packPong({ bytes: pongBytes, nonce: staticNonceBytes });
	let staticNonceStr2 = staticNonceBytes.toString();
	if (staticNonceStr !== staticNonceStr2) {
		throw new Error('static nonce bytes should NOT have been overwritten');
	}

	let nonceBytes3 = pongBytes.slice(0);
	let staticNonceStr3 = nonceBytes3.toString();
	if (staticNonceStr !== staticNonceStr3) {
		throw new Error(
			'pong nonce bytes and static nonce bytes should have been identical',
		);
	}

	let nonceBytes4 = bytes.slice(offset);
	let staticNonceStr4 = nonceBytes4.toString();
	if (staticNonceStr !== staticNonceStr4) {
		throw new Error(
			'message bytes at pong nonce offset should have matched static nonce',
		);
	}

	{
		void Packer.packMessage({
			network: 'regtest',
			command: 'pong',
			bytes: bytes,
		});
		let headerInts = [
			// regtest
			252, 193, 183, 220,
			// 4-char "ping" + 8 trailing nulls
			112, 111, 110, 103,
			//
			0, 0, 0, 0,
			//
			0, 0, 0, 0,
			// little-endian Uint32 payload size
			8, 0, 0, 0,
			// first 4 bytes of the sha256(sha256(staticNonce))
			97, 172, 101, 125,
		];
		let headerStr = headerInts.toString();
		let expectedStr = `${headerStr},${staticNonceStr}`;
		let messageStr = bytes.toString();
		if (expectedStr !== messageStr) {
			throw new Error('complete messages did not match');
		}
	}

	{
		let messageBytes = Packer.packMessage({
			network: 'regtest',
			command: 'pong',
			payload: pongBytes,
		});
		let headerInts = [
			// regtest
			252, 193, 183, 220,
			// 4-char "ping" + 8 trailing nulls
			112, 111, 110, 103,
			//
			0, 0, 0, 0,
			//
			0, 0, 0, 0,
			// little-endian Uint32 payload size
			8, 0, 0, 0,
			// first 4 bytes of the sha256(sha256(staticNonce))
			97, 172, 101, 125,
		];
		let headerStr = headerInts.toString();
		let expectedStr = `${headerStr},${staticNonceStr}`;
		let messageStr = messageBytes.toString();
		if (expectedStr !== messageStr) {
			throw new Error('complete messages did not match');
		}
	}

	console.log(`PASS: headers and pong pack as expected`);
}

test();
