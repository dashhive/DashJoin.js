'use strict';

let Assert = require('node:assert/strict');
let Fs = require('node:fs/promises');
let Path = require('node:path');

// let Parser = require('../dev/parser.js');
let DashKeys = require('dashkeys');
let DashTx = require('dashtx');
require('dashtx/txparser.js');

let Secp256k1 = require('@dashincubator/secp256k1');

async function signNonRandom(privKeyBytes, hashBytes) {
	let sigOpts = { canonical: true /*extraEntropy: true*/ };
	let sigBytes = await Secp256k1.sign(hashBytes, privKeyBytes, sigOpts);
	return sigBytes;
}

async function sign(privKeyBytes, hashBytes) {
	let sigOpts = { canonical: true, extraEntropy: true };
	let sigBytes = await Secp256k1.sign(hashBytes, privKeyBytes, sigOpts);
	return sigBytes;
}

async function test() {
	let privHex = await readFixtureHex('he-1-privkey');
	let privBytes = DashKeys.utils.hexToBytes(privHex);
	console.log('[debug] Priv Hex', privHex.length, privHex);
	// console.log('[debug] Priv Bytes', privBytes.length, privBytes);

	let pubBytes = await DashKeys.utils.toPublicKey(privBytes);
	let pubHex = DashKeys.utils.bytesToHex(pubBytes);
	console.log('[debug] Pub hex', pubHex.length, pubHex);
	// console.log('[debug] Pub Bytes', pubBytes.length, pubBytes);

	let p2pkhHex = await readFixtureHex('he-1-p2pkh');
	let originalPkhHex = p2pkhHex.slice(6, -4);
	console.log('[debug] P2PKH hex', p2pkhHex.length, p2pkhHex);
	console.log('[debug] PKH OG:', originalPkhHex.length, originalPkhHex);

	let pkhBytes = await DashKeys.pubkeyToPkh(pubBytes);
	let pkhHex = DashKeys.utils.bytesToHex(pkhBytes);
	console.log('[debug] PKH hex', pkhHex.length, pkhHex);
	// console.log('[debug] PKH Bytes', pkhBytes.length, pkhBytes);

	Assert.equal(originalPkhHex, pkhHex);

	let hashTxHex = await readFixtureHex('he-1-hashtx');
	let hashTxBytes = DashKeys.utils.hexToBytes(hashTxHex);
	{
		let hashTxHead = hashTxHex.slice(0, 24);
		let hashTxFoot = hashTxHex.slice(-24);
		console.log(
			'[debug] hashTx hex',
			hashTxHex.length,
			`${hashTxHead}...${hashTxFoot}`,
		);
	}

	let sigHashHexExp = await readFixtureHex('he-1-sighash');
	console.log('[debug] sigHash OG:', sigHashHexExp.length, sigHashHexExp);

	let sigHashBytes = await DashTx._hash(hashTxBytes);
	let sigHashHex = DashKeys.utils.bytesToHex(sigHashBytes);
	console.log('[debug] sigHash hex', sigHashHex.length, sigHashHex);

	Assert.equal(sigHashHex, sigHashHexExp);

	let sigHexExp = await readFixtureHex('he-1-asn1-sig');
	console.log('[debug] sig OG:', sigHexExp.length, sigHexExp);

	// non-random for the purpose of testing
	{
		let sigBytes = await signNonRandom(privBytes, sigHashBytes);
		let sigHex = DashKeys.utils.bytesToHex(sigBytes);
		console.log('[debug] sig hex', sigHex.length, sigHex);

		Assert.equal(sigHex, sigHexExp);

		let verified = await Secp256k1.verify(sigBytes, sigHashBytes, pubBytes);
		console.log('[debug] verified', verified);
	}

	{
		let sigRndBytes = await sign(privBytes, sigHashBytes);
		let sigRndHex = DashKeys.utils.bytesToHex(sigRndBytes);
		console.log('[debug] sig rnd', sigRndHex.length, sigRndHex);

		Assert.notEqual(sigRndHex, sigHexExp);

		let verified = await Secp256k1.verify(sigRndBytes, sigHashBytes, pubBytes);
		console.log('[debug] verified rnd', verified);
	}

	{
		let dsfHex = await readFixtureHex('he-dsf');

		let dsfSerial = dsfHex.slice(0, 8);
		console.log('[debug] dsf serial', dsfSerial);

		let txRequestHex = dsfHex.slice(8);
		let dsfTxInfo = DashTx.parseUnknown(txRequestHex);
		console.log('[debug] dsf tx', dsfTxInfo);
		let txRequestHex2 = DashTx._create(dsfTxInfo);

		Assert.equal(txRequestHex, txRequestHex2);
		console.log('[debug] verified parse => pack');
		// console.log(txRequestHex2);

		let coin = require('../fixtures/he-1-utxo.json');
		let inputIndex = -1;
		let version = dsfTxInfo.version;
		let inputs = [];
		for (let i = 0; i < dsfTxInfo.inputs.length; i += 1) {
			let _input = dsfTxInfo.inputs[i];
			let input = {
				txid: _input.txid || _input.txId,
				txId: _input.txid || _input.txId,
				outputIndex: _input.outputIndex,
				pubKeyHash: '',
			};
			inputs.push(input);
			if (_input.txid !== coin.txid) {
				continue;
			}
			if (_input.outputIndex !== coin.outputIndex) {
				continue;
			}
			input.pubKeyHash = pkhHex;
			inputIndex = i;
		}
		let outputs = [];
		for (let _output of dsfTxInfo.outputs) {
			let output = {
				satoshis: _output.satoshis,
				pubKeyHash: _output.pubKeyHash,
			};
			outputs.push(output);
		}
		let locktime = dsfTxInfo.locktime;

		let txInfo = {
			version,
			inputs,
			outputs,
			locktime,
		};
		let hasIndex = inputIndex > -1;
		if (!hasIndex) {
			throw new Error('selected coin not found in selected inputs');
		}
		let sigHashType = 0x01;
		let hashTxHex2 = DashTx.createHashable(txInfo, inputIndex, sigHashType);
		console.log('[debug] hashTxHex ', hashTxHex);
		console.log('[debug] hashTxHex2', hashTxHex2);
		Assert.equal(hashTxHex2, hashTxHex);
	}

	// let sigHex = await readFixtureHex('he-1-sighash');
	// console.info("PASS: verify signature of 'he' fixture");
}

async function readFixtureHex(name) {
	let fixturePath = Path.resolve(__dirname, `../fixtures/${name}.hex`);
	let fixtureStr = await Fs.readFile(fixturePath, 'ascii');

	// nix whitespace used for debugging
	fixtureStr = fixtureStr.replace(/[\s\n]+/g, '');

	return fixtureStr;
}

test().catch(function (err) {
	console.error(err);
	process.exit(1);
});
