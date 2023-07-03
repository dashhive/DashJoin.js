#!/usr/bin/env node
'use strict';
const COIN = require('./coin-join-constants.js').COIN;
const Network = require('./network.js');
const { ClientSession } = require('./client-session.js');
const Util = require('./util.js');
const SigScript = require('./sigscript.js');
const DsiFactory = require('./dsi-factory.js');
const { debug, info, d, dd } = require('./debug.js');
const LibInput = require('./choose-inputs.js');
const extractOption = require('./argv.js').extractOption;
const UserDetails = require('./bootstrap/user-details.js');
const dashboot = require('./bootstrap/index.js');
const ArrayUtils = require('./array-utils.js');
const FileLib = require('./file.js');
const MasterNodeConnection =
  require('./masternode-connection.js').MasterNodeConnection;

let done = false;
let dboot;
let network;
let sendDsi;
let username;
let INPUTS = 1;
let client_session;
let mainUser;
let masterNodeConnection;
function getDemoDenomination() {
	return parseInt(COIN / 1000 + 1, 10);
}
function date() {
	const d = new Date();
	let h = d.getHours();
	if (String(h).length === 1) {
		h = `0${h}`;
	}
	let m = d.getMinutes();
	if (String(m).length === 1) {
		m = `0${m}`;
	}
	let s = d.getSeconds();
	if (String(s).length === 1) {
		s = `0${s}`;
	}
	return (
		[d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-') +
    ' ' +
    [h, m, s].join(':')
	);
}
async function onDSFMessage(parsed, masterNode) {
	d('DSF message received');
	client_session.dsf_parsed = parsed;
	if (await Util.dataDirExists()) {
		const fs = require('fs');
		await fs.writeFileSync(
			`${Util.getDataDir()}/dsf-${client_session.username}-${date()}.json`,
			ArrayUtils.bigint_safe_json_stringify(client_session, 2) + '\n'
		);
	}
	d(`submitted transactions: ${client_session.get_inputs().length}`);
	d('Submitting DSS packet');
	FileLib.write_json(
		`dss-outputs-${client_session.username}-#DATE#`,
		client_session.mixing_inputs
	);
	masterNode.client.write(
		Network.packet.coinjoin.dss({
			chosen_network: masterNode.network,
			dsfPacket: parsed,
			client_session,
		})
	);
	d('DSS sent');
}
async function onDSSUChanged(parsed, masterNode) {
	let msgId = parsed.message_id[1];
	let state = parsed.state[1];
	let update = parsed.status_update[1];
	if (msgId === 'MSG_NOERR') {
		msgId = 'OKAY';
	}
	d({
		username: masterNode.client_session.username,
		nick: masterNode.nickName,
		msgId,
		state,
		update,
	});
	if (update === 'REJECTED') {
		for (const input of client_session.mixing_inputs) {
			await dboot.mark_txid_used(client_session.username, input.txid);
			debug(`marked ${input.txid} as used`);
		}
		if (msgId === 'ERR_QUEUE_FULL') {
			await masterNodeConnection.disconnect(function () {
				done = true;
				console.log('Closed connection');
				process.exit(0);
			});
		}
	}
	if (msgId === 'ERR_INVALID_COLLATERAL') {
		client_session.used_txids.push(masterNode.collateralTx.txid);
		await dboot.mark_txid_used(
			client_session.username,
			masterNode.collateralTx.txid
		);
		debug(`marked collateral input: ${masterNode.collateralTx.txid} as used`);
		debug('input: ', masterNode.collateralTx);
		await masterNodeConnection.disconnect(function () {
			done = true;
			console.log('Closed connection');
			process.exit(0);
		});
	}
}
async function onCollateralTxCreated(tx, masterNode) {
	debug(`onCollateralTxCreated via masterNode: ${masterNode.id()}`);
	await dboot.mark_txid_used(tx.user, tx.tx.txid);
}
async function stateChanged(obj) {
	let dsaSent = false;
	let self = obj.self;
	let masterNode = self;
	switch (masterNode.status) {
	default:
		break;
	case 'CLOSED':
		console.warn('[-] Connection closed');
		break;
	case 'NEEDS_AUTH':
	case 'EXPECT_VERACK':
	case 'EXPECT_HCDP':
	case 'RESPOND_VERACK':
		break;
	case 'READY':
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
		}
		break;
	case 'DSQ_RECEIVED':
		{
			if (self.dsq.fReady) {
				debug('sending dsi');
			} else {
				info('[-][COINJOIN] masternode not ready for dsi...');
				return;
			}
			if (String(sendDsi) === 'false') {
				info('not sending dsi as per cli switch');
				return;
			}
			let packet = await DsiFactory.createDSIPacket(
				masterNode,
				username,
				getDemoDenomination(),
				INPUTS
			);
			masterNode.client.write(packet);
			debug('sent dsi packet');
		}
		break;
	case 'EXPECT_DSQ':
		break;
	}
}
async function preInit(
	_in_instanceName,
	_in_username,
	_in_nickname,
	_in_count,
	_in_send_dsi,
	_in_verbose
) {
	let nickName = _in_nickname;
	if (String(_in_verbose).toLowerCase() === 'true') {
		SigScript.setVerbosity(true);
	} else {
		SigScript.setVerbosity(false);
	}
	client_session = new ClientSession();
	sendDsi = _in_send_dsi;

	let id = {};

	let config = require('./.mn0-config.json');
	id.mn = 0;
	if (extractOption('mn0')) {
		config = require('./.mn0-config.json');
		id.mn = 0;
	}
	if (extractOption('mn1')) {
		config = require('./.mn1-config.json');
		id.mn = 1;
	}
	if (extractOption('mn2')) {
		config = require('./.mn2-config.json');
		id.mn = 2;
	}

	let masterNodeIP = config.masterNodeIP;
	let masterNodePort = config.masterNodePort;
	network = config.network;
	let ourIP = config.ourIP;
	let startBlockHeight = config.startBlockHeight;
	if (_in_count) {
		INPUTS = parseInt(_in_count, 10);
	}
	if (isNaN(INPUTS)) {
		throw new Error('--count must be a positive integer');
	}
	if (INPUTS >= 253) {
		throw new Error('--count currently only supports a max of 252');
	}
	let instanceName = _in_instanceName;
	username = _in_username;
	dboot = await dashboot.load_instance(instanceName);
	mainUser = await UserDetails.extractUserDetails(username);
	mainUser.user = username;
	//dd({ mainUser });
	d('user details fetched');
	let randomPayeeName = await dboot.get_random_payee(username);
	d('random payee fetched');
	let payee = await UserDetails.extractUserDetails(randomPayeeName);
	d('payee fetched');

	client_session.nickName = nickName;
	client_session.instanceName = instanceName;
	client_session.username = _in_username;
	client_session.dboot = dboot;
	client_session.mainUser = mainUser;
	client_session.randomPayeeName = randomPayeeName;
	client_session.payee = payee;
	client_session.denominatedAmount = getDemoDenomination();

	LibInput.initialize({
		dboot,
		denominatedAmount: getDemoDenomination(),
		client_session,
		nickName,
	});
	DsiFactory.initialize(
		dboot,
		_in_username,
		_in_nickname,
		_in_count,
		_in_send_dsi,
		getDemoDenomination(),
		client_session,
		mainUser,
		randomPayeeName,
		payee
	);

	masterNodeConnection = new MasterNodeConnection({
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
		nickName,
		client_session,
	});
	debug('Connecting...');
	await masterNodeConnection.connect();
	debug('connected.');
	while (!done) {
		await Util.sleep_ms(1500);
	}
	debug('exiting main function');
}
preInit(
	extractOption('instance', true),
	extractOption('username', true),
	extractOption('nickname', true),
	extractOption('count', true),
	extractOption('senddsi', true),
	extractOption('verbose', true)
);
