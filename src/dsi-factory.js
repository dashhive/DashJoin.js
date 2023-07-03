#!/usr/bin/env node
'use strict';
const COIN = require('./coin-join-constants.js').COIN;
//const LOW_COLLATERAL = (COIN / 1000 + 1) / 10;
const Network = require('./network.js');
const Util = require('./util.js');
const DebugLib = require('./debug.js');
const { debug, d, dd } = DebugLib;

const assert = require('assert');
const DashCore = require('@dashevo/dashcore-lib');
const Transaction = DashCore.Transaction;
const Script = DashCore.Script;
const Signature = DashCore.crypto.Signature;
const fs = require('fs');
const { bigint_safe_json_stringify } = require('./array-utils.js');

let client_session;
function setClientSession(c) {
	client_session = c;
}
let dboot;

async function makeDSICollateralTx(masterNode, client_session) {
	return masterNode.makeCollateralTx({ no_serialize: true });
}
async function createDSIPacket(masterNode, username, denominatedAmount, count) {
	let collateralTxn = await makeDSICollateralTx(masterNode, client_session);
	client_session.mixing_inputs = await dboot.get_denominated_utxos(
		client_session.username,
		denominatedAmount,
		250
	);
	client_session.mixing_inputs = client_session.mixing_inputs.filter(function (
		input
	) {
		return parseInt(input.satoshis, 10) === parseInt(denominatedAmount, 10);
	});
	client_session.mixing_inputs = client_session.mixing_inputs.splice(0, count);
	assert.equal(
		client_session.mixing_inputs.length,
		count,
		'mixing inputs should equal count'
	);
	client_session.mixing_inputs.map(async function (ele) {
		let privateKey = await dboot
			.get_private_key(username, ele.address)
			.catch(function (error) {
				console.error(error);
				return null;
			});
		ele.privateKey = privateKey;
		return ele;
	});
	debug({ inputs: client_session.mixing_inputs });

	client_session.generated_addresses = await dboot.generate_new_addresses(
		client_session.username,
		count
	);
	let pk_mappings = [];
	for (const addy of client_session.generated_addresses) {
		pk_mappings.push({
			address: addy,
			privateKey: await dboot.get_private_key(username, addy),
		});
	}
	client_session.private_keys = pk_mappings;
	if (await Util.dataDirExists()) {
		debug('writing dsf file');
		let lmdb_counter = await dboot.increment_key(username, 'dsfcounter');
		await fs.writeFileSync(
			`${Util.getDataDir()}/dsf-mixing-inputs-${username}-${lmdb_counter}.json`,
			bigint_safe_json_stringify(client_session, null, 2)
		);
	}
	return Network.packet.coinjoin.dsi({
		chosen_network: masterNode.network,
		collateralTxn,
		client_session,
		denominatedAmount,
	});
}
async function initialize(
	_in_dboot,
	_in_username,
	_in_nickname,
	_in_count,
	_in_send_dsi,
	_in_denominated_amount,
	_in_client_session
) {
	debug(`${_in_username},${_in_nickname},${_in_count},${_in_send_dsi}`);
	DebugLib.setNickname(_in_nickname);
	dboot = _in_dboot;
	client_session = _in_client_session;
	setClientSession(client_session);
}

module.exports = {
	setClientSession,
	makeDSICollateralTx,
	createDSIPacket,
	initialize,
};
