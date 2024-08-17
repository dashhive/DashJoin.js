'use strict';

// let Assert = require('node:assert/strict');
let Fs = require('node:fs/promises');
let Path = require('node:path');

let DashP2P = require('../public/dashp2p.js');
let DashJoin = require('../public/dashjoin.js');
// TODO copy .utils.bytesToHex rather than depend on it
let DashKeys = require('dashkeys');

async function test() {
	let fixtureDsfBytes = await readFixtureHex('dsf');
	// let fixtureDsqJson = require('../fixtures/dsf.json');

	let header = DashP2P.parsers.header(fixtureDsfBytes);
	if (header.command !== 'dsf') {
		throw new Error(
			`sanity fail: should have loaded 'dsf' fixture, but got '${header.command}'`,
		);
	}

	let payload = fixtureDsfBytes.subarray(DashP2P.sizes.HEADER);
	// TODO verify
	//   - a chosen subset of our offered inputs (e.g. we offer 9, but 3 are selected)
	//   - that equally many of our offered outputs are selected (e.g. 3 = 3)
	//   - that the satoshi values of our outputs match coin for coin
	let dsf = DashJoin.parsers.dsf(payload);
	console.log(new Date(), '[debug] dsf obj:', dsf);
	if ('string' !== typeof dsf.transaction_unsigned) {
		throw new Error("'.transaction_unsigned' should exist as a hex string");
	}
	let txLen = dsf.transaction_unsigned.length / 2;
	let expectedLen = header.payloadSize - DashJoin.sizes.SESSION_ID;
	console.log(new Date(), '[debug] dsf len:', txLen);
	if (txLen !== expectedLen) {
		throw new Error(
			`expected '.transaction_unsigned' to represent ${header.payloadSize} bytes, but got ${txLen}`,
		);
	}

	// Assert.deepEqual(dsq, fixtureDsqJson);

	// console.info('PASS: dsf correctly parsed and values match');
}

async function readFixtureHex(name) {
	let fixturePath = Path.resolve(__dirname, `../fixtures/${name}.hex`);
	let fixtureStr = await Fs.readFile(fixturePath, 'ascii');

	// nix whitespace used for debugging
	fixtureStr = fixtureStr.replace(/[\s\n]+/g, '');

	let bytes = DashKeys.utils.hexToBytes(fixtureStr);
	return bytes;
}

test().catch(function (err) {
	console.error(err);
	process.exit(1);
});
