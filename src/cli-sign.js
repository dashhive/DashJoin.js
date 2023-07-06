'use strict';
const NetUtil = require('./network-util.js');
const bytesToString = NetUtil.bytesToString;
const DashCore = require('@dashevo/dashcore-lib');
const Transaction = DashCore.Transaction;
const Script = DashCore.Script;
const ArrayUtils = require('./array-utils.js');
const { ps_extract } = ArrayUtils;
const {
	sanitize_vout,
	sanitize_txid,
	sanitize_private_key,
	sanitize_address,
	sanitize_username,
	sanitize_tx_format,
} = require('./sanitizers.js');

async function signTransaction(dboot, username, txid) {
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
		satoshis: parseFloat(choice.amount, 10),
		scriptPubKey: Script.buildPublicKeyHashOut(
			sanitize_address(choice.address)
		),
	};
	let payeeAddress = await dboot.generate_new_addresses(username, 1);
	payeeAddress = payeeAddress[0];

	let fee = 0.00000191;
	await dboot.unlock_all_wallets();
	let pk = await dboot.get_private_key(username, utxos.address);
	pk = sanitize_private_key(pk);
	let output = await dboot.wallet_exec(username, [
		'createrawtransaction',
		`[{"txid":"${utxos.txId}","vout":${utxos.outputIndex}}]`,
		`[{"${payeeAddress}":${utxos.satoshis - fee}}]`,
	]);
	let out = ps_extract(output).out;
	let scriptPubKey = bytesToString(utxos.scriptPubKey.toBuffer());
	output = await dboot.wallet_exec(username, [
		'signrawtransactionwithkey',
		sanitize_tx_format(out),
		`["${pk}"]`,
		`[{"txid":"${utxos.txId}","vout":${utxos.outputIndex},"scriptPubKey":"${scriptPubKey}","amount":${utxos.satoshis}}]`,
		'ALL|ANYONECANPAY',
	]);
	out = ps_extract(output).out;
	out = JSON.parse(out);
	out = out.hex;
	let tx = new Transaction(out);
	let signature = tx.inputs[0]._scriptBuffer;
	return signature;
}

let Lib = {};
Lib.signTransaction = signTransaction;
module.exports = Lib;
