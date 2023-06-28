#!/usr/bin/env node
'use strict';
//const { xt } = require('@mentoc/xtract');
const NetworkUtil = require('./network-util.js');
const hexToBytes = NetworkUtil.hexToBytes;
const hashByteOrder = NetworkUtil.hashByteOrder;
const DashCore = require('@dashevo/dashcore-lib');
const Transaction = DashCore.Transaction;
const Script = DashCore.Script;
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
	}
	d.dd({ utxoInfo, pk: utxoInfo.privateKey });

	let tx = new Transaction()
		.from(utxos)
		.sign(
			utxoInfo.privateKey,
			Signature.SIGHASH_ALL | Signature.SIGHASH_ANYONECANPAY
		);
	if (onlyTx) {
		return tx;
	}
	let sigScript = tx.inputs[0]._scriptBuffer;
	let sig = Script.buildPublicKeyIn(sigScript, 0x81);
	let encodedScript = sig.toString('hex');
	let len = encodedScript.length / 2;
	return new Uint8Array([len, ...hexToBytes(encodedScript)]);
}
module.exports = {
	extractSigScript,
	setVerbosity,
};
