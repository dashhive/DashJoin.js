const NetUtil = require('./network-util.js');
const assert = require('assert');
let DashCore = require('@dashevo/dashcore-lib');
let Transaction = DashCore.Transaction;
let Script = DashCore.Script;
let PrivateKey = DashCore.PrivateKey;
let Address = DashCore.Address;
const fs = require('fs');
const {
	calculateCompactSize,
	encodeCompactSizeBytes,
	setUint32,
	setSignedInt64,
	hexToBytes,
} = NetUtil;

module.exports = {
	read_file,
	logUsedTransaction,
	isUsed,
	sendCoins,
};

async function read_file(fname) {
	return await fs
		.readFileSync(fname)
		.toString()
		.replace(/^\s+/, '')
		.replace(/\s+$/, '');
}
async function logUsedTransaction(fileName, txnId) {
	let buffer = await fs.readFileSync(fileName);
	buffer = buffer.toString();
	let data = JSON.parse(buffer);
	data.list.push(txnId);
	await fs.writeFileSync(fileName, JSON.stringify(data, null, 2));
}
async function isUsed(fileName, txnId) {
	let buffer = await fs.readFileSync(fileName);
	buffer = buffer.toString();
	let data = JSON.parse(buffer);
	return data.list.indexOf(txnId) !== -1;
}
async function sendCoins(
	origAmount,
	sendAmount,
	fromAddress,
	payeeAddress,
	changeAddress,
	network,
	txid,
	vout,
	privkeySet,
) {
	let times = 1;

	let fee = 1000;
	sendAmount = parseInt(sendAmount, 10);
	let unspent = origAmount - sendAmount;
	unspent -= fee;
	let sourceAddress = Address(fromAddress, network);
	/**
	 * Take the input of the PrevTx, send it to another wallet
	 * which will hold the new funds and the change will go to
	 * a change address.
	 */
	let utxos = {
		txId: txid,
		outputIndex: vout,
		sequenceNumber: 0xffffffff,
		scriptPubKey: Script.buildPublicKeyHashOut(sourceAddress),
		satoshis: origAmount,
	};
	return new Transaction()
		.from(utxos) // Feed information about what unspent outputs one can use
		.to(payeeAddress, sendAmount) // Add an output with the given amount of satoshis
		.to(changeAddress, unspent)
		.change(changeAddress) // Sets up a change address where the rest of the funds will go
		.fee(fee)
		.sign(privkeySet); // Signs all the inputs it can
}
