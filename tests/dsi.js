'use strict';

let Assert = require('node:assert/strict');
let Fs = require('node:fs/promises');
let Path = require('node:path');

let Packer = require('../dev/packer.js');
// TODO copy .utils.bytesToHex rather than depend on it
let DashKeys = require('dashkeys');

async function test() {
	let expectedHex = await readFixtureHex('dsi');

	let network = 'regtest';

	// Canonical documentation example
	// See <https://docs.dash.org/projects/core/en/stable/docs/reference/p2p-network-privatesend-messages.html#dsi>

	let denomination = 100001 * 1000;

	let inputs = [
		{
			txid: 'c0b5306765c2950838da085d8f3758991a22e246c9862c5f2230566c79c3bd36',
			outputIndex: 2,
		},
		{
			txid: 'c0b5306765c2950838da085d8f3758991a22e246c9862c5f2230566c79c3bd36',
			outputIndex: 15,
		},
		{
			txid: 'c0b5306765c2950838da085d8f3758991a22e246c9862c5f2230566c79c3bd36',
			outputIndex: 13,
		},
	];

	let collateralTxHexes = [
		'01000000',
		'01',
		'83bd1980c71c38f035db9b14d7f934f7',
		'd595181b3436e36289902619f3f7d383',
		'00000000',
		'6b',
		'483045022100f4d8fa0ae4132235fecd540a',
		'62715ccfb1c9a97f8698d066656e30bb1e1e',
		'06b90220301b4cc93f38950a69396ed89dfc',
		'c08e72ec8e6e7169463592a0bf504946d98b',
		'812102fa4b9c0f9e76e06d57c75cab9c8368',
		'a62a1ce8db6eb0c25c3e0719ddd9ab549c',
		'ffffffff',
		'01',
		'e093040000000000',
		'19',
		'76',
		'a9',
		'14',
		'f8956a4eb0e53b05ee6b30edfd2770b5',
		'26c1f1bb',
		'88',
		'ac',
		'00000000',
	];
	let collateralTxHex = collateralTxHexes.join('');
	let collateralTx = DashKeys.utils.hexToBytes(collateralTxHex);

	let outputs = [
		{
			pubKeyHash: '14826d7ba05cf76588a5503c03951dc914c91b6c',
			satoshis: denomination,
		},
		{
			pubKeyHash: 'f01197177de2358928196a543b2bbd973c2ab002',
			satoshis: denomination,
		},
		{
			pubKeyHash: '426614716e94812d483bca32374f6ac8cd121b0d',
			satoshis: denomination,
		},
	];

	let message = Packer.packDsi({ network, inputs, collateralTx, outputs });
	let messageHex = DashKeys.utils.bytesToHex(message);

	Assert.equal(messageHex, expectedHex);

	console.info(
		`PASS: Packer.packDsi({ network, inputs, collateralTx, outputs }) matches`,
	);
}

async function readFixtureHex(name) {
	let fixturePath = Path.resolve(__dirname, `../fixtures/${name}.hex`);
	let fixtureStr = await Fs.readFile(fixturePath, 'ascii');

	// nix whitespace used for readability / debugging
	fixtureStr = fixtureStr.replace(/[\s\n]+/g, '');

	return fixtureStr;
}

test();
