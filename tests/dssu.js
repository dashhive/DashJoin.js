'use strict';

let Assert = require('node:assert/strict');
let Fs = require('node:fs/promises');
let Path = require('node:path');

let Parser = require('../dev/parser.js');
// TODO copy .utils.bytesToHex rather than depend on it
let DashKeys = require('dashkeys');

async function test() {
	let totalSize = Parser.HEADER_SIZE + Parser.DSSU_SIZE;
	let fixtureDssuBytes = await readFixtureHex('dssu');
	let fixtureDssuJson = require('../fixtures/dssu.json');

	if (fixtureDssuBytes.length !== totalSize) {
		let msg = `sanity fail: fixture should be ${totalSize} bytes, not ${fixtureDssuBytes.length}`;
		throw new Error(msg);
	}

	let header = Parser.parseHeader(fixtureDssuBytes);
	if (header.command !== 'dssu') {
		throw new Error('sanity fail: loaded incorrect fixture');
	}

	if (header.payloadSize !== Parser.DSSU_SIZE) {
		throw new Error('sanity fail: wrong payload size in header');
	}

	let payload = fixtureDssuBytes.subarray(Parser.HEADER_SIZE);
	if (payload.length !== Parser.DSSU_SIZE) {
		throw new Error('sanity fail: payload has trailing bytes');
	}

	let dssu = Parser.parseDssu(payload);
	Assert.deepEqual(dssu, fixtureDssuJson);

	console.info('PASS: dssu correctly parsed and values match');
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
