#!/usr/bin/env node
'use strict';
//const { xt } = require('@mentoc/xtract');
const NetworkUtil = require('./network-util.js');
const hexToBytes = NetworkUtil.hexToBytes;
const hashByteOrder = NetworkUtil.hashByteOrder;
const DashCore = require('@dashevo/dashcore-lib');
const Transaction = DashCore.Transaction;
const Script = DashCore.Script;
const PrivateKey = DashCore.PrivateKey;
const Signature = DashCore.crypto.Signature;
const d = require('./debug.js');

let state = {
	verbosity: false,
};
function setVerbosity(setting) {
	state.verbosity = setting;
}
function verbose() {
	return state.verbosity;
}
async function extractSigScript(
	dboot,
	username,
	utxoInfo,
	denominatedAmount,
	onlyTx = false
) {
	let txid = utxoInfo.txid;
	if (utxoInfo.needs_hash_byte_order) {
		txid = hashByteOrder(utxoInfo.txid);
	}
	let outputIndex = parseInt(utxoInfo.outputIndex, 10);
	let seq = 0xffffffff;
	let address = utxoInfo.address;
	let utxos = {
		txId: txid,
		outputIndex,
		sequenceNumber: seq,
		scriptPubKey: Script.buildPublicKeyHashOut(address),
		satoshis: denominatedAmount,
	};
	if (verbose()) {
		d.d({ utxos });
		d.d({ utxoInfo, pk: utxoInfo.privateKey });
	}

	let pk = PrivateKey.fromWIF(utxoInfo.privateKey);

	let tx = new Transaction()
		.from(utxos)
		.to(address, denominatedAmount)
		.sign([pk], Signature.SIGHASH_ALL | Signature.SIGHASH_ANYONECANPAY);
	d.d(tx.verify());
	if (onlyTx) {
		return tx;
	}
	let sigScript = tx.inputs[0]._scriptBuffer;
	let encodedScript = hexToBytes(sigScript.toString('hex'));
	let len = encodedScript.length;
	return new Uint8Array([len, ...encodedScript]);
}
module.exports = {
	extractSigScript,
	setVerbosity,
};
