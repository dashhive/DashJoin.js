#!/usr/bin/env node
'use strict';
var Lib = {};
module.exports = Lib;
const dboot = require('./index.js');
const { d, dd } = require('../debug.js');

Lib.extractUserDetails = async function (username) {
	let addresses = await dboot.get_addresses(username, null);
	let utxos = await dboot
		.user_utxos_from_cli(username, addresses)
		.catch(function (error) {
			console.error({ error });
			return null;
		});
	if (!utxos || utxos.length === 0) {
		throw new Error("User doesn't have any UTXOS!");
	}
	//dd({ utxos });
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
	let flatUtxos = [];
	for (let u of utxos) {
		let used = dboot.is_txid_used(username, u.txid);
		if (used) {
			continue;
		}
		u.privateKey = addrMap[u.address];
		flatUtxos.push(u);
	}
	d({ flatUtxos: flatUtxos.length });
	//let rando = await dboot.getRandomPayee(username);
	let data = {
		user: username,
		utxos: flatUtxos,
		changeAddress: await dboot.get_change_address_from_cli(username),
	};
	//d({ data });
	return data;
};
