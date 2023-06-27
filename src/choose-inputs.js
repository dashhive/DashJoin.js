#!/usr/bin/env node
'use strict';
const Util = require('./util.js');
let dboot = null;
let localState = {
	dboot: null,
	denom: null,
};
function setDboot(db) {
	localState.dboot = db;
	dboot = localState.dboot;
}
function setDenom(d) {
	localState.denom = parseInt(d, 10);
	if (isNaN(localState.denom)) {
		throw new Error('denomination invalid');
	}
}
function getDemoDenomination() {
	return parseInt(localState.denom, 10);
}
async function getPrivateKey(username, address) {
	let privateKey = await dboot
		.get_private_key(username, address)
		.catch(function (error) {
			console.error(error);
			return null;
		});
	if (privateKey === null) {
		throw new Error('private key could not be loaded');
	}
	return privateKey;
}
async function getUserInputs(username, denominatedAmount, count) {
	count = parseInt(count, 10);
	if (count <= 0 || isNaN(count)) {
		throw new Error('count must be a valid positive integer');
	}
	denominatedAmount = parseInt(denominatedAmount, 10);
	if (denominatedAmount <= 0 || isNaN(denominatedAmount)) {
		throw new Error('denominatedAmount must be a valid positive integer');
	}
	let utxos = await dboot.get_denominated_utxos(username, denominatedAmount);
	let selected = [];
	let txids = {};
	let i = 0;
	while (selected.length < count) {
		if (typeof txids[utxos[i].txid] !== 'undefined') {
			++i;
			continue;
		}
		txids[utxos[i].txid] = 1;
		selected.push(utxos[i]);
		await dboot.mark_txid_used(username, utxos[i].txid);
		++i;
	}
	return selected;
}

let LibInput = {};

module.exports = LibInput;

LibInput.getUserInputs = getUserInputs;
LibInput.setDboot = setDboot;
LibInput.getPrivateKey = getPrivateKey;
LibInput.getDemoDenomination = getDemoDenomination;
LibInput.setDenom = setDenom;
LibInput.initialize = async function (obj) {
	Util.setNickname(obj.nickName);
	setDboot(obj.dboot);
	setDenom(obj.denominatedAmount);
};
