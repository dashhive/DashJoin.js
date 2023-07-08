#!/usr/bin/env node
'use strict';
function sanitize_username(u) {
	return u.replace(/[^a-f0-9]+/gi, '').replace(/[\n]+$/, '');
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
function sanitize_psbt(str) {
	if (typeof str === 'undefined' || str === null) {
		return '';
	}
	return String(str).replace(/[^a-zA-Z0-9\+=\/]+/gi, '');
}
function sanitize_private_key(str) {
	// example: privateKey": "cRhoitVgpq4svK5RraxYpBC7RwBBkUpDYAN3Yic6BGWwwb4BU1sp",
	if (str === null) {
		throw new Error('private key cannot be null');
	}
	if (typeof str === 'undefined') {
		throw new Error('private key is undefined');
	}
	if (typeof str !== 'string') {
		throw new Error('private key must be a string');
	}
	return String(str).replace(/[^a-z0-9]+/gi, '');
}
function sanitize_tx_format(str) {
	if (str === null) {
		throw new Error('tx cannot be null');
	}
	if (typeof str === 'undefined') {
		throw new Error('tx is undefined');
	}
	if (typeof str !== 'string') {
		throw new Error('tx must be a string');
	}
	return String(str).replace(/[^0-9a-f]+/gi, '');
}
function sanitize_vout(str) {
	if (str === null) {
		throw new Error('vout cannot be null');
	}
	if (typeof str === 'undefined') {
		throw new Error('vout is undefined');
	}
	let tmp = parseInt(String(str).replace(/[^0-9]+/gi, ''), 10);
	if (isNaN(tmp)) {
		throw new Error('after sanitization, vout is not an integer');
	}
	return tmp;
}
function sanitize_hex(str) {
	if (str === null) {
		throw new Error('hex string is null');
	}
	if (typeof str === 'undefined') {
		throw new Error('hex string is undefined');
	}
	return String(str).replace(/[^a-f0-9]+/gi, '');
}

function sanitize_pubkey(str) {
	if (str === null) {
		throw new Error('pubkey cannot be null');
	}
	if (typeof str === 'undefined') {
		throw new Error('pubkey is undefined');
	}
	return sanitize_hex(str);
}
function sanitize_satoshis(amount) {
	if (amount === null) {
		throw new Error('satoshis cannot be null');
	}
	if (typeof amount === 'undefined') {
		throw new Error('satoshis is undefined');
	}
	return parseInt(String(amount).replace(/[^0-9]+/, ''), 10);
}
module.exports = {
	sanitize_txid,
	sanitize_address,
	sanitize_addresses,
	sanitize_private_key,
	sanitize_tx_format,
	sanitize_vout,
	sanitize_pubkey,
	sanitize_satoshis,
	sanitize_username,
	sanitize_psbt,
};
