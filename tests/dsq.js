'use strict';

let Assert = require('node:assert/strict');
let Fs = require('node:fs/promises');
let Path = require('node:path');

let Parser = require('../dev/parser.js');
// TODO copy .utils.bytesToHex rather than depend on it
let DashKeys = require('dashkeys');

async function test() {
	let totalSize = Parser.HEADER_SIZE + Parser.DSQ_SIZE;
	let fixtureDsqBytes = await readFixtureHex('dsq');
	let fixtureDsqJson = require('../fixtures/dsq.json');

	if (fixtureDsqBytes.length !== totalSize) {
		let msg = `sanity fail: fixture should be ${totalSize} bytes, not ${fixtureDsqBytes.length}`;
		throw new Error(msg);
	}

	let header = Parser.parseHeader(fixtureDsqBytes);
	if (header.command !== 'dsq') {
		throw new Error('sanity fail: loaded incorrect fixture');
	}

	if (header.payloadSize !== Parser.DSQ_SIZE) {
		throw new Error('sanity fail: wrong payload size in header');
	}

	let payload = fixtureDsqBytes.subarray(Parser.HEADER_SIZE);
	if (payload.length !== Parser.DSQ_SIZE) {
		throw new Error('sanity fail: payload has trailing bytes');
	}

	let dsq = Parser.parseDsq(payload);

	// JSON-ify
	dsq.protxhash = DashKeys.utils.bytesToHex(dsq.protxhash_bytes);
	dsq.protxhash_bytes = null;
	dsq.signature = DashKeys.utils.bytesToHex(dsq.signature_bytes);
	dsq.signature_bytes = null;

	Assert.deepEqual(dsq, fixtureDsqJson);

	console.info('PASS: dsq correctly parsed and values match');
}

async function readFixtureHex(name) {
	let fixturePath = Path.resolve(__dirname, `../fixtures/${name}.hex`);
	let fixtureStr = await Fs.readFile(fixturePath, 'ascii');

	// nix whitespace used for debugging
	fixtureStr = fixtureStr.replace(/[\s\n]+/, '');

	let bytes = DashKeys.utils.hexToBytes(fixtureStr);
	return bytes;
}

test().catch(function (err) {
	console.error(err);
	process.exit(1);
});
