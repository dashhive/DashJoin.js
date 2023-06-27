'use strict';
const xt = require('@mentoc/xtract').xt;
const NetworkUtil = require('./network-util.js');
const hexToBytes = NetworkUtil.hexToBytes;
const hashByteOrder = NetworkUtil.hashByteOrder;
const fs = require('fs');
const DashCore = require('@dashevo/dashcore-lib');
const Transaction = DashCore.Transaction;
const Script = DashCore.Script;

let nickName;

function setNickname(n) {
	nickName = n;
}

function getDataDir() {
	return `${process.env.HOME}/data`;
}

async function dataDirExists() {
	return await fs.existsSync(getDataDir());
}

function debug(...args) {
	console.debug(`${nickName}[DBG]:`, ...args);
}
function info(...args) {
	console.info(`${nickName}[INFO]:`, ...args);
}
function error(...args) {
	console.error(`[${nickName}[ERROR]:`, ...args);
}
function d(...args) {
	debug(...args);
}
function dd(...args) {
	debug(...args);
	process.exit();
}

function extract(array, key) {
	let selected = [];
	for (const ele of array) {
		selected.push(ele[key]);
	}
	return selected;
}
function bigint_safe_json_stringify(buffer, stringify_space = 2) {
	return JSON.stringify(
		buffer,
		(_, value) => (typeof value === 'bigint' ? value.toString() + 'n' : value),
		stringify_space
	);
}
async function extractSigScript(
	dboot,
	parsed,
	username,
	submission,
	denominatedAmount
) {
	let utxos = {
		txId: hashByteOrder(submission.txid),
		outputIndex: submission.vout,
		sequenceNumber: 0xffffffff,
		scriptPubKey: Script.buildPublicKeyHashOut(submission.address),
		satoshis: denominatedAmount,
	};
	let privateKey = await dboot
		.get_private_key(username, submission.address)
		.catch(function (error) {
			console.error('Error: get_private_key failed with:', error);
			return null;
		});
	if (privateKey === null) {
		throw new Error('no private key could be found');
	}

	let tx = new Transaction().from(utxos).sign(privateKey);
	let sigScript = tx.inputs[0]._scriptBuffer;
	let encodedScript = sigScript.toString('hex');
	let len = encodedScript.length / 2;
	return new Uint8Array([len, ...hexToBytes(encodedScript)]);
}

module.exports = {
	setNickname,
	getDataDir,
	dataDirExists,
	debug,
	info,
	extract,
	extractSigScript,
	bigint_safe_json_stringify,
	dd,
	d,
	error,
};
