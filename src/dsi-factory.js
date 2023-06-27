#!/usr/bin/env node
'use strict';
const COIN = require('./coin-join-constants.js').COIN;
const LOW_COLLATERAL = (COIN / 1000 + 1) / 10;
const Network = require('./network.js');
//const toSerializedFormat = Network.util.toSerializedFormat;
//const fsu = require('./fs-util.js');
//const xt = require('@mentoc/xtract').xt;
//const DsfInspect = require('./dsf-inspect.js');
const Util = require('./util.js');
let { debug, /*info, d,*/ dd } = Util;
const assert = require('assert');
let DashCore = require('@dashevo/dashcore-lib');
let Transaction = DashCore.Transaction;
let Script = DashCore.Script;
const fs = require('fs');
const LibInput = require('./choose-inputs.js');
const { getUserInputs } = LibInput;
//let PrivateKey = DashCore.PrivateKey;
const extractOption = require('./argv.js').extractOption;

let DSIFactory = {};
module.exports = DSIFactory;

let client_session;
function setClientSession(c) {
	client_session = c;
}
//let INPUTS;
let dboot;
let denominatedAmount;
//let network;
//let mainUser;
//let randomPayeeName;
//let payee;
//let username;
//let nickName;
//let count;
//let send_dsi;

async function makeDSICollateralTx(masterNode, username) {
	assert.equal(masterNode !== null, true, 'masterNode object cannot be null');
	let amount = parseInt(LOW_COLLATERAL * 2, 10);
	let fee = 50000; // FIXME
	let payee = await dboot.random_payee_address(username);
	let payeeAddress = payee.address;
	let utxoList = await dboot.filter_denominated_transaction(
		username,
		denominatedAmount,
		1,
		client_session.get_used_txids()
	);
	assert.equal(amount > 0, true, 'amount has to be non-zero positive');
	assert.notEqual(payee.user, username, 'payee cannot be the same as user');
	assert.notEqual(payeeAddress.length, 0, 'payeeAddress cannot be empty');
	assert.notEqual(utxoList, null, 'no utxos found');
	assert.notEqual(utxoList.length, 0, 'denominated utxos could not be found');
	assert.equal(utxoList.length, 1, 'not enough utxos could be found');

	const chosenTxn = utxoList.shift();
	let sourceAddress = chosenTxn.address;
	let txid = chosenTxn.txid;
	let vout = chosenTxn.outputIndex;
	let satoshis = chosenTxn.satoshis;
	assert.notEqual(sourceAddress, null, 'sourceAddress is empty');

	client_session.add_addresses([sourceAddress]);
	let changeAddress = await dboot.random_change_address(
		username,
		client_session.get_used_addresses()
	);
	if (changeAddress === null) {
		throw new Error('changeAddress cannot be null');
	}
	client_session.add_addresses([changeAddress]);
	let privateKey = await dboot
		.get_private_key(username, sourceAddress)
		.catch(function (error) {
			console.error('Error: get_private_key:', error);
			return null;
		});
	if (privateKey === null) {
		throw new Error('private key is empty');
	}
	let unspent = satoshis - amount;
	let utxos = {
		txId: txid,
		outputIndex: vout,
		sequenceNumber: 0xffffffff,
		scriptPubKey: Script.buildPublicKeyHashOut(sourceAddress),
		satoshis,
	};
	client_session.add_txids([txid]);
	let tx = new Transaction()
		.from(utxos)
		.to(payeeAddress, amount)
		.to(changeAddress, unspent - fee)
		.sign(privateKey);
	await dboot.mark_txid_used(username, txid);
	return tx;
}
async function getUserOutputs(username, denominatedAmount, count) {
	debug(`getUserOutputs for user "${username}"`);
	let outputs = [];

	for (let i = 0; i < count; i++) {
		outputs.push(denominatedAmount);
	}
	return outputs;
}
async function createDSIPacket(
	masterNode,
	username,
	denominationAmount,
	count
) {
	/**
   * Step 1: create inputs
   */
	let chosenInputTxns = await getUserInputs(
		username,
		denominationAmount,
		count,
		client_session.get_used_txids()
	).catch(function (error) {
		throw new Error(error);
	});
	if (chosenInputTxns === null) {
		throw new Error('Failed to get denominated input transactions');
	}
	if (chosenInputTxns.length !== count) {
		throw new Error('Couldn\'t find enough denominated input transactions');
	}
	client_session.add_inputs(chosenInputTxns);
	client_session.submitted = [];
	client_session.get_inputs().map(async function (ele) {
		let privateKey = await dboot
			.get_private_key(username, ele.address)
			.catch(function (error) {
				console.error(error);
				return null;
			});
		ele.privateKey = privateKey;
		return ele;
	});
	dd(client_session.report_inputs());
	if (extractOption('verbose') && (await Util.dataDirExists())) {
		let lmdb_counter = await dboot.increment_key(username, 'dsfcounter');
		await fs.writeFileSync(
			`${Util.getDataDir()}/dsf-mixing-inputs-${
				client_session.username
			}-${lmdb_counter}.json`,
			JSON.stringify(client_session, null, 2)
		);
	}

	/**
   * Step 2: create collateral transaction
   */
	let collateralTxn = await makeDSICollateralTx(masterNode, username);

	let userOutputs = await getUserOutputs(username, denominationAmount, count);
	let userOutputAddresses = await dboot.filter_shuffle_address_count(
		username,
		client_session.get_used_addresses(),
		count
	);
	//dd({ userOutputAddresses, current: client_session });
	if (userOutputAddresses.length !== count) {
		throw new Error(`Couldnt find ${count} unique unused addresses`);
	}
	return Network.packet.coinjoin.dsi({
		chosen_network: masterNode.network,
		userInputs: chosenInputTxns,
		collateralTxn,
		userOutputs,
		userOutputAddresses,
		sourceAddress: client_session.used_addresses[0], // FIXME
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
	//_in_mainUser,
	//_in_randomPayeeName,
	//_in_payee
) {
	debug(`${_in_username},${_in_nickname},${_in_count},${_in_send_dsi}`);
	//nickName = _in_nickname;
	//username = _in_username;
	dboot = _in_dboot;
	//mainUser = _in_mainUser;
	//randomPayeeName = _in_randomPayeeName;
	//payee = _in_payee;
	//count = _in_count;
	//send_dsi = _in_send_dsi;
	denominatedAmount = _in_denominated_amount;
	client_session = _in_client_session;
	setClientSession(client_session);
}

DSIFactory = {
	setClientSession,
	makeDSICollateralTx,
	getUserOutputs,
	createDSIPacket,
	initialize,
};
