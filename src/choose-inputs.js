#!/usr/bin/env node
'use strict';
const Bootstrap = require('./bootstrap/index.js');
let dboot = null;
let localState = {
	dboot: null,
	denom: null,
};
function setDboot(db) {
	if (!(db instanceof Bootstrap)) {
		throw new Error('dboot must be a Bootstrap instance');
	}
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
	let utxos = await dboot.get_denominated_utxos(username, denominatedAmount);
	let selected = [];
	let txids = {};
	let iteration = 0;
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

LibInput.setDboot = setDboot;
LibInput.getPrivateKey = getPrivateKey;
LibInput.getDemoDenomination = getDemoDenomination;
LibInput.setDenom = setDenom;
LibInput.initialize = async function (obj) {
	setDboot(obj.dboot);
	setDenom(obj.denominatedAmount);
};
