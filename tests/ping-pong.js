'use strict';

let Packer = require('../packer.js');

function test() {
	let network = 'regtest';
	let messageSize = Packer.HEADER_SIZE + Packer.PING_SIZE;
	let message = new Uint8Array(messageSize);

	// These two are the same, but the latter is more intuitive to use:
	//
	// - this is ONLY a reference IF the underlying ArrayBuffer is used
	// - the OFFSET is ONLY a property, it DOES NOT affect .set()
	//let pingBytes = new Uint8Array(bytes.buffer, offset);
	// - this is a reference, as you'd expect
	// - .set() works from the offset
	let pingBytes = message.subarray(Packer.HEADER_SIZE);
	let zeroNonceStr = [0, 0, 0, 0, 0, 0, 0, 0].toString();
	if (zeroNonceStr !== pingBytes.toString()) {
		throw new Error('sanity fail: nonce bytes should be initialized to 0');
	}
	void Packer.packPing({ network, message });
	let randNonceStr = pingBytes.toString();
	if (zeroNonceStr === randNonceStr) {
		throw new Error('nonce bytes should be randomized, not 0');
	}
	let randNonceBytes2 = message.slice(Packer.HEADER_SIZE);
	let randNonceStr2 = randNonceBytes2.toString();
	if (randNonceStr !== randNonceStr2) {
		throw new Error(
			'nonce bytes subarray and nonce bytes slice should be equal',
		);
	}

	let nonce = new Uint8Array(Packer.FIELD_SIZES.NONCE);
	nonce[0] = 0xab;
	nonce[1] = 0xcd;
	nonce[2] = 0xef;
	nonce[3] = 0x12;
	nonce[4] = 0x34;
	nonce[5] = 0x56;
	nonce[6] = 0x78;
	nonce[7] = 0x90;
	let staticNonceStr = nonce.toString();
	void Packer.packPing({ network, message, nonce });
	let staticNonceStr2 = nonce.toString();
	if (staticNonceStr !== staticNonceStr2) {
		throw new Error('static nonce bytes should NOT have been overwritten');
	}

	let nonceBytes3 = pingBytes.slice(0);
	let staticNonceStr3 = nonceBytes3.toString();
	if (staticNonceStr !== staticNonceStr3) {
		throw new Error(
			'ping nonce bytes and static nonce bytes should have been identical',
		);
	}

	let nonceBytes4 = message.slice(Packer.HEADER_SIZE);
	let staticNonceStr4 = nonceBytes4.toString();
	if (staticNonceStr !== staticNonceStr4) {
		throw new Error(
			'message bytes at ping nonce offset should have matched static nonce',
		);
	}

	{
		void Packer.packMessage({
			network: 'regtest',
			command: 'ping',
			bytes: message,
		});
		let headerInts = [
			// regtest
			252, 193, 183, 220,
			// 4-char "ping" + 8 trailing nulls
			112, 105, 110, 103,
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
		let messageStr = message.toString();
		if (expectedStr !== messageStr) {
			throw new Error('complete messages did not match');
		}
	}

	{
		let messageBytes = Packer.packMessage({
			network: 'regtest',
			command: 'ping',
			payload: pingBytes,
		});
		let headerInts = [
			// regtest
			252, 193, 183, 220,
			// 4-char "ping" + 8 trailing nulls
			112, 105, 110, 103,
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

	console.log(`PASS: headers and ping pack as expected`);

	{
		let messageBytes = Packer.packPong({
			network,
			nonce,
		});
		let headerInts = [
			// regtest
			252, 193, 183, 220,
			// 4-char "pong" + 8 trailing nulls
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
			throw new Error('complete pong messages did not match');
		}
	}

	console.log(`PASS: headers and pong pack as expected`);
}

test();
