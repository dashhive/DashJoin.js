#!/usr/bin/env node
'use strict';

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

module.exports = {
	sanitize_txid,
	sanitize_address,
	sanitize_addresses,
};
