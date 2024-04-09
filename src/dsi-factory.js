#!/usr/bin/env node
'use strict';
const COIN = require('./coin-join-constants.js').COIN;
//const LOW_COLLATERAL = (COIN / 1000 + 1) / 10;
const Network = require('./network.js');
const Util = require('./util.js');
const DebugLib = require('./debug.js');
const { debug, d, dd } = DebugLib;
const Sanitizers = require('./sanitizers.js');
const { sanitize_address } = Sanitizers;

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
	console.log('[DEBUG] client_session', c);
}
let dboot;

async function makeDSICollateralTx(masterNode, client_session) {
	return masterNode.makeCollateralTx({ no_serialize: true });
}
async function createDSIPacket(masterNode, username, denominatedAmount, count) {
	console.log(
		'[DEBUG] createDSIPacket',
		masterNode,
		username,
		denominatedAmount,
		count,
	);
	let collateralTxn = await makeDSICollateralTx(masterNode, client_session);
	assert.equal(
		client_session.mixing_inputs.length,
		count,
		'mixing inputs should equal count',
	);
	debug({ inputs: client_session.mixing_inputs });

	client_session.generated_addresses = await dboot.generate_new_addresses(
		client_session.username,
		count,
	);
	{
		let other = [];
		for (let i = 0; i < client_session.generated_addresses.length; i++) {
			let obj = {
				privateKey: await dboot.get_private_key(
					client_session.username,
					client_session.generated_addresses[i],
				),
				address: client_session.generated_addresses[i],
			};
			other.push(obj);
		}
		client_session.generated_addresses = other;
	}
	if (await Util.dataDirExists()) {
		let lmdb_counter = await dboot.increment_key(username, 'dsfcounter');
		await fs.writeFileSync(
			`${Util.getDataDir()}/dsf-mixing-inputs-${username}-${lmdb_counter}.json`,
			bigint_safe_json_stringify(client_session, null, 2),
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
	_in_client_session,
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
