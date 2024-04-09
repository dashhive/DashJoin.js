'use strict';

let Packer = require('../packer.js');
// TODO copy .utils.bytesToHex rather than depend on it
let DashKeys = require('dashkeys');

// regtest magic network bytes
let network = 'regtest';
let regtest = 'fcc1b7dc';

// dsa\0\0\0\0\0\0\0\0\0
let command = '647361000000000000000000';

// collateralTx.length (195 or 0xc3) as LITTLE ENDIAN
let payloadSize = 'c3000000';

// sha256(sha256(collateralTx))
let checksum = 'edf0d8b1';

//  0.10000100
// 10000100: 0b00000100 as LITTLE_ENDIAN
let denomination = 10000100;
let denomMask = '04000000';

// 10000 fee,
// (decode at https://live.blockcypher.com/dash/decodetx/)
let collateralTxHex =
	'030000000127c03b36308e0925666682de270cdaa212b696776ac3529242851e338c627a1c000000006a47304402203d8a4f9d25dbff1b7c4711411d6102c6bd8c868a393081d262480f9df89c428a022079a61ce32d26fc522b05eebbceae17a056bf58518de7b6e17e89ff7ee980b64f0121026215ac5afb5a890d06e4eb07ed6383fb4cd46ca0de222cca4c4f8c9fcf9a6023ffffffff01bbae9606000000001976a914ef46d2e30c714916c43676364b27657ed753ef0788ac00000000';

function test() {
	let expectedHex = `${regtest}${command}${payloadSize}${checksum}${denomMask}${collateralTxHex}`;
	let collateralTx = DashKeys.utils.hexToBytes(collateralTxHex);
	let message = Packer.packAllow({ network, denomination, collateralTx });
	let messageHex = DashKeys.utils.bytesToHex(message);
	if (expectedHex.length !== messageHex.length) {
		let length = expectedHex.length / 2;
		throw new Error(
			`expected message.length to be ${length}, but actual message is ${message.length}`,
		);
	}
	if (expectedHex !== messageHex) {
		throw new Error(
			'bytes of dsa (allow / join request) messages do not match',
		);
	}

	console.info(
		`PASS: Packer.packAllow({ network, denomination, collateralTx }) matches`,
	);
}

test();
