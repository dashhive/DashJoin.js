#!/usr/bin/env node
'use strict';
const COIN = require('./coin-join-constants.js').COIN;
const LOW_COLLATERAL = (COIN / 1000 + 1) / 10;
const Network = require('./network.js');
const toSerializedFormat = Network.util.toSerializedFormat;
const fsu = require('./fs-util.js');
const xt = require('@mentoc/xtract').xt;
const DsfInspect = require('./dsf-inspect.js');
const Util = require('./util.js');
const { ClientSession } = require('./client-session.js');
const { getDataDir, extract, extractSigScript, bigint_safe_json_stringify } =
  Util;
let { debug, info, error, d, dd } = Util;
const NetworkUtil = require('./network-util.js');
const hexToBytes = NetworkUtil.hexToBytes;
const hashByteOrder = NetworkUtil.hashByteOrder;
const assert = require('assert');
let DashCore = require('@dashevo/dashcore-lib');
let Transaction = DashCore.Transaction;
let Script = DashCore.Script;
const fs = require('fs');
const LibInput = require('./choose-inputs.js');
const { getUserInputs } = LibInput;
//let PrivateKey = DashCore.PrivateKey;
const extractOption = require('./argv.js').extractOption;
const { extractUserDetails } = require('./bootstrap/user-details.js');
const dashboot = require('./bootstrap/index.js');
const MasterNodeConnection =
  require('./masternode-connection.js').MasterNodeConnection;
let client_session = new ClientSession();
let INPUTS = 2;
let dboot = null;

let id = {};

let config = require('./.mn0-config.json');
id.mn = 0;
if (process.argv.includes('--mn0')) {
	config = require('./.mn0-config.json');
	id.mn = 0;
}
if (process.argv.includes('--mn1')) {
	config = require('./.mn1-config.json');
	id.mn = 1;
}
if (process.argv.includes('--mn2')) {
	config = require('./.mn2-config.json');
	id.mn = 2;
}

let masterNodeIP = config.masterNodeIP;
let masterNodePort = config.masterNodePort;
let network = config.network;
let ourIP = config.ourIP;
let startBlockHeight = config.startBlockHeight;

let mainUser;
let randomPayeeName;
let payee;
let username;
let instanceName;

let nickName = null;

/**
 * Periodically print id information
 */
if (process.argv.includes('--id')) {
	setInterval(function () {
		console.info(id);
	}, 10000);
}
/** FIXME: put in library */
function getDemoDenomination() {
	return parseInt(COIN / 1000 + 1, 10);
}
async function getUserOutputs(username, denominatedAmount, count) {
	debug(`getUserOutputs for user "${username}"`);
	let outputs = [];

	for (let i = 0; i < count; i++) {
		outputs.push(denominatedAmount);
	}
	return outputs;
}
async function onDSSUChanged(parsed) {
	//, _self) {
	let msgId = parsed.message_id[1];
	let state = parsed.state[1];
	let update = parsed.status_update[1];
	d({ msgId, state, update });
	if (msgId === 'ERR_INVALID_COLLATERAL') {
		client_session.used_txids.push(mainUser.utxos[0].txid);
		await dboot.mark_txid_used(username, mainUser.utxos[0].txid);
		debug('marked collateral inputs as used');
	}
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
		return null;
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
			`${getDataDir()}/dsf-mixing-inputs-${
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
async function makeDSICollateralTx(masterNode, username) {
	let amount = parseInt(LOW_COLLATERAL * 2, 10);
	let fee = 50000; // FIXME
	let payee = await dboot.random_payee_address(username);
	let payeeAddress = payee.address;
	let utxoList = await dboot.filter_denominated_transaction(
		username,
		getDemoDenomination(),
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
async function onCollateralTxCreated(tx, masterNode) {
	debug(`onCollateralTxCreated via masterNode: ${masterNode.id()}`);
	await dboot.mark_txid_used(tx.user, tx.txid);
}
async function onDSFMessage(parsed, masterNode) {
	if (extractOption('verbose') && data_dir_exists) {
		const fs = require('fs');
		debug('onDSFMessage hit');
		debug(masterNode.dsfOrig);
		await fs.writeFileSync(
			`${getDataDir()}/dsf-${client_session.username}.dat`,
			masterNode.dsfOrig
		);
	}
	let amount = getDemoDenomination();
	let sigScripts = {};
	debug(`submitted.length: ${client_session.submitted.length}`);
	for (const submission of client_session.submitted) {
		let sig = await extractSigScript(
			dboot,
			parsed,
			client_session.username,
			submission,
			amount
		);
		debug({ txid: submission.txid, outputIndex: submission.outputIndex });
		sigScripts[submission.txid] = {
			signature: sig,
			outputIndex: submission.outputIndex,
		};
	}
	masterNode.client.write(
		Network.packet.coinjoin.dss({
			chosen_network: masterNode.network,
			dsfPacket: parsed,
			signatures: sigScripts,
		})
	);
}
async function initialize(
	_in_instanceName,
	_in_username,
	_in_nickname,
	_in_count,
	_in_send_dsi
) {
	nickName = _in_nickname;
	instanceName = _in_instanceName;
	username = _in_username;
	//console.info(`[status]: loading "${instanceName}" instance...`);
	dboot = await dashboot.load_instance(instanceName);
	mainUser = await extractUserDetails(username);
	randomPayeeName = await dboot.get_random_payee(username);
	payee = await extractUserDetails(randomPayeeName);

	client_session.nickName = nickName;
	client_session.instanceName = instanceName;
	client_session.username = _in_username;
	client_session.dboot = dboot;
	client_session.mainUser = mainUser;
	client_session.randomPayeeName = randomPayeeName;
	client_session.payee = payee;

	LibInput.initialize({
		dboot,
		denominatedAmount: getDemoDenomination(),
		client_session,
	});
}

/**
 * argv should include:
 * - instance name
 * - user
 */
(async function (
	_in_instanceName,
	_in_username,
	_in_nickname,
	_in_count,
	_in_send_dsi
) {
	if (_in_count) {
		INPUTS = parseInt(_in_count, 10);
	}
	if (isNaN(INPUTS)) {
		throw new Error('--count must be a positive integer');
	}
	if (INPUTS >= 253) {
		throw new Error('--count currently only supports a max of 252');
		process.exit(1);
	}
	await initialize(
		_in_instanceName,
		_in_username,
		_in_nickname,
		_in_count,
		_in_send_dsi
	);

	//let signed = await signWhatWeCan(
	//	await fs.readFileSync(`./dsf-${client_session.username}.dat`)
	//);

	let masterNodeConnection = new MasterNodeConnection({
		ip: masterNodeIP,
		port: masterNodePort,
		network,
		ourIP,
		startBlockHeight,
		onCollateralTxCreated: onCollateralTxCreated,
		onStatusChange: stateChanged,
		onDSSU: onDSSUChanged,
		onDSF: onDSFMessage,
		debugFunction: null,
		userAgent: config.userAgent ?? null,
		coinJoinData: mainUser,
		user: mainUser.user,
		payee,
		changeAddresses: mainUser.changeAddresses,
	});

	let dsaSent = false;
	//let dsi = await createDSIPacket(
	//	masterNodeConnection,
	//	_in_username,
	//	getDemoDenomination(),
	//	INPUTS
	//);
	//dd({ dsi });

	async function stateChanged(obj) {
		let self = obj.self;
		let masterNode = self;
		switch (masterNode.status) {
		default:
			//console.info("unhandled status:", masterNode.status);
			break;
		case 'CLOSED':
			console.warn('[-] Connection closed');
			break;
		case 'NEEDS_AUTH':
		case 'EXPECT_VERACK':
		case 'EXPECT_HCDP':
		case 'RESPOND_VERACK':
			//console.info("[ ... ] Handshake in progress");
			break;
		case 'READY':
			//console.log("[+] Ready to start dealing with CoinJoin traffic...");
			if (dsaSent === false) {
				self.denominationsAmount = getDemoDenomination();
				masterNode.client.write(
					Network.packet.coinjoin.dsa({
						chosen_network: network,
						denomination: getDemoDenomination(),
						collateral: await masterNode.makeCollateralTx(),
					})
				);
				dsaSent = true;
				//console.debug("sent dsa");
			}
			break;
		case 'DSQ_RECEIVED':
			{
				//console.log('dsq received');
				//console.log("[+][COINJOIN] DSQ received. Responding with inputs...");
				//console.debug(self.dsq, "<< dsq");
				if (self.dsq.fReady) {
					debug('sending dsi');
					//console.log("[+][COINJOIN] Ready to send dsi message...");
				} else {
					info('[-][COINJOIN] masternode not ready for dsi...');
					return;
				}
				if (String(_in_send_dsi) === 'false') {
					info('not sending dsi as per cli switch');
					return;
				}
				let packet = await createDSIPacket(
					masterNode,
					_in_username,
					getDemoDenomination(),
					INPUTS
				);
				masterNode.client.write(packet);
				debug('sent dsi packet');
			}
			break;
		case 'EXPECT_DSQ':
			//console.info("[+] dsa sent");
			break;
		}
	}

	masterNodeConnection.connect();
})(
	extractOption('instance', true),
	extractOption('username', true),
	extractOption('nickname', true),
	extractOption('count', true),
	extractOption('senddsi', true)
);
