#!/usr/bin/env node
'use strict';
const NetUtil = require('./network-util.js');
const { COIN } = require('./coin-join-constants.js');
const { hashByteOrder } = NetUtil;
const { hexToBytes } = NetUtil;
const bytesToString = NetUtil.bytesToString;
const DashCore = require('@dashevo/dashcore-lib');
const Transaction = DashCore.Transaction;
const Script = DashCore.Script;
const ArrayUtils = require('./array-utils.js');
const Signature = DashCore.crypto.Signature;
const Bootstrap = require('./bootstrap/index.js');
const fs = require('fs');
const { ClientSession } = require('./client-session.js');
const { d } = require('./debug.js');
const { dd } = require('./debug.js');
const { ps_extract } = ArrayUtils;
const { xt } = require('@mentoc/xtract');
const {
	sanitize_vout,
	sanitize_txid,
	sanitize_private_key,
	sanitize_address,
	sanitize_username,
	sanitize_tx_format,
} = require('./sanitizers.js');

function build_pk_sig(pk) {
	let s = '[';
	let ctr = 1;
	for (const p of pk) {
		s += `"${sanitize_private_key(p)}"`;
		if (++ctr >= pk.length) {
			break;
		}
		s += ',';
	}
	s += ']';
	return s;
}
async function signTransaction(dboot, client_session, txid) {
	await dboot.unlock_all_wallets();
	let username = client_session.username;
	username = sanitize_username(username);
	let txns = await dboot.list_unspent(username);
	let choice = null;
	for (const input of txns) {
		if (input.txid === txid) {
			choice = input;
			break;
		}
	}
	if (choice === null) {
		throw new Error('couldnt find denominated input');
	}
	let utxos = {
		txId: sanitize_txid(choice.txid),
		outputIndex: sanitize_vout(choice.vout),
		address: sanitize_address(choice.address),
		sequenceNumber: 0xffffffff,
		satoshis: parseInt(choice.amount * COIN, 10),
		scriptPubKey: Script.buildPublicKeyHashOut(
			sanitize_address(choice.address),
		),
	};
	let pk = await dboot.get_private_key(username, choice.address);
	let payeeAddress = await dboot.generate_new_addresses(
		client_session.username,
		1,
	);
	payeeAddress = payeeAddress[0];
	//for (let input of client_session.mixing_inputs) {
	//	let transaction = await dboot.get_transaction(username, utxos.txId);
	//	input.gettransaction = transaction;
	//	pk.push(
	//		await dboot.get_private_key(
	//			username,
	//			xt(transaction, 'details.0.address')
	//		)
	//	);
	//	d(input.txid, 'gettransaction:', input.gettransaction, pk);
	//}

	let fee = 200;
	let tx = new Transaction()
		.from(utxos)
		.fee(fee)
		.to(payeeAddress, utxos.satoshis - fee)
		.sign(pk, Signature.SIGHASH_ALL | Signature.SIGHASH_ANYONECANPAY);
	let signature = tx.inputs[0]._script.toHex();
	let encodedScript = hexToBytes(signature);
	let len = encodedScript.length;
	client_session.cli_sign = {
		_script: tx.inputs[0]._script,
		_hex: tx.inputs[0]._script.toHex(),
		utxos,
		choice,
		pk,
		tx,
	};
	await client_session.write('clisign');
	return [len, ...encodedScript];
}

let Lib = {};
Lib.signTransaction = signTransaction;
module.exports = Lib;
