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
const MasterNodeConnection =
  require('./masternode-connection.js').MasterNodeConnection;

let done = false;
let dboot;
let network;
let sendDsi;
let username;
let INPUTS;
let client_session;
let mainUser;
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
	if (extractOption('verbose') && (await Util.dataDirExists())) {
		const fs = require('fs');
		debug('onDSFMessage hit');
		debug(masterNode.dsfOrig);
		await fs.writeFileSync(
			`${Util.getDataDir()}/dsf-${client_session.username}-${date()}.json`,
			ArrayUtils.bigint_safe_json_stringify(parsed, 2) + '\n'
		);
	}
	let amount = getDemoDenomination();
	let sigScripts = {};
	debug(`submitted transactions: ${client_session.get_inputs().length}`);
	//debug(client_session.get_inputs());
	for (const submission of client_session.get_inputs()) {
		//d({ submission });
		let sig = await SigScript.extractSigScript(
			dboot,
			client_session.username,
			{
				needs_hash_byte_order: true,
				txid: submission.txid,
				address: submission.address,
				outputIndex: submission.outputIndex,
				privateKey: submission.privateKey,
				parsed,
			},
			amount
		);
		debug({ txid: submission.txid, outputIndex: submission.outputIndex });
		debug({
			parsed,
			t: parsed.transaction,
			out: parsed.transaction.outputs,
			in: parsed.transaction.inputs,
		});
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
async function onDSSUChanged(parsed) {
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
async function onCollateralTxCreated(tx, masterNode) {
	debug(`onCollateralTxCreated via masterNode: ${masterNode.id()}`);
	await dboot.mark_txid_used(tx.user, tx.txid);
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
(async function preInit(
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
	INPUTS = 3;
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
	d('before load');
	dboot = await dashboot.load_instance(instanceName);
	d('after load');
	d({ username });
	mainUser = await UserDetails.extractUserDetails(
		username,
		getDemoDenomination(),
		10
	);
	//dd({ mainUser });
	d('user details fetched');
	let randomPayeeName = await dboot.get_random_payee(username);
	d('random payee fetched');
	let payee = await UserDetails.extractUserDetails(randomPayeeName);

	dd({ payee });
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
		nickName,
	});
	debug('Connecting...');
	await masterNodeConnection.connect();
	debug('connected.');
	while (!done) {
		await Util.sleep_ms(1500);
	}
	debug('exiting main function');
})(
	extractOption('instance', true),
	extractOption('username', true),
	extractOption('nickname', true),
	extractOption('count', true),
	extractOption('senddsi', true),
	extractOption('verbose', true)
);
