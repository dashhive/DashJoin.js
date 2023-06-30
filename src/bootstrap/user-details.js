#!/usr/bin/env node
'use strict';
var Lib = {};
module.exports = Lib;
const dboot = require('./index.js');
//const { dd } = require('../debug.js');

Lib.extractUserDetails = async function (
	username,
	denominatedAmount,
	count = 3
) {
	let utxos = await dboot.get_denominated_utxos(
		username,
		denominatedAmount,
		count
	);
	if (!utxos || utxos.length === 0) {
		throw new Error('User doesn\'t have any UTXOS!');
	}
	if (utxos.length !== count) {
		throw new Error('Couldnt find enough UTXOS');
	}
	let addrMap = {};
	for (const u of utxos) {
		addrMap[u.address] = 1;
	}
	for (const addr in addrMap) {
		let buffer = await dboot.wallet_exec(username, ['dumpprivkey', addr]);
		let { out, err } = dboot.ps_extract(buffer, false);
		if (err.length) {
			console.error(err);
		}
		if (out.length) {
			addrMap[addr] = out;
		}
	}
	for (let i = 0; i < utxos.length; i++) {
		utxos[i].privateKey = addrMap[utxos[i].address];
	}
	return {
		user: username,
		utxos,
		changeAddress: await dboot.get_change_address_from_cli(username),
	};
};
