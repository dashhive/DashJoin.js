'use strict';
const xt = require('@mentoc/xtract').xt;
const assert = require('assert');
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
		function (key, value) {
			this.k = key;
			return typeof value === 'bigint' ? value.toString() + 'n' : value;
		},
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
	assert.equal(parsed !== null, true, 'parsed shouldnt be null');
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
function uniqueByKey(array, key) {
	let map = {};
	let saved = [];
	for (const ele of array) {
		if (typeof map[ele[key]] !== 'undefined') {
			continue;
		}
		map[ele[key]] = 1;
		saved.push(ele);
	}
	return saved;
}
function flatten(arr) {
	if (arr.length === 1 && Array.isArray(arr[0])) {
		return flatten(arr[0]);
	}
	if (!Array.isArray(arr)) {
		return arr;
	}
	if (Array.isArray(arr) && !Array.isArray(arr[0])) {
		return arr[0];
	}
	return arr;
}
function unique(arr) {
	let map = {};
	let uni = [];
	for (const a of arr) {
		if (typeof map[a] !== 'undefined') {
			continue;
		}
		map[a] = 1;
		uni.push(a);
	}
	return uni;
}

function sanitize_txid(txid) {
	return txid.replace(/[^a-f0-9]+/gi, '').replace(/[\n]+$/, '');
}
function sanitize_address(address) {
	return address.replace(/[^a-zA-Z0-9]+/gi, '').replace(/[\n]+$/, '');
}

function sanitize_addresses(list) {
	let flist = [];
	for (const row of list) {
		flist.push(row.replace(/[^a-zA-Z0-9]+/gi, ''));
	}
	return flist;
}

function ps_extract(ps, newlines = true) {
	let out = ps.stdout.toString();
	let err = ps.stderr.toString();
	out = out.replace(/^[\s]+/, '').replace(/[\s]+$/, '');
	err = err.replace(/^[\s]+/, '').replace(/[\s]+$/, '');
	if (!newlines) {
		out = out.replace(/[\n]+$/, '');
		err = err.replace(/[\n]+$/, '');
	}
	return { err, out };
}
async function sleep_ms(ms) {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		}, ms);
	});
}
module.exports = {
	sanitize_txid,
	sanitize_address,
	sanitize_addresses,
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
	uniqueByKey,
	flatten,
	unique,
	ps_extract,
	xt,
	sleep_ms,
};
