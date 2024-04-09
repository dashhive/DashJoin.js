#!/usr/bin/env node
'use strict';
const COIN = require('./coin-join-constants.js').COIN;
const Network = require('./network.js');
//const NetworkUtil = require('./network-util.js');
//const { hashByteOrder } = NetworkUtil;
const { ClientSession } = require('./client-session.js');
const { xt } = require('@mentoc/xtract');
const Util = require('./util.js');
const SigScript = require('./sigscript.js');
const DsiFactory = require('./dsi-factory.js');
const DebugLib = require('./debug.js');
const { debug, info, d } = DebugLib;
const { dd } = DebugLib;
const LibInput = require('./choose-inputs.js');
const extractOption = require('./argv.js').extractOption;
const UserDetails = require('./bootstrap/user-details.js');
const dashboot = require('./bootstrap/index.js');
const FileLib = require('./file.js');
const MasterNodeConnection =
	require('./masternode-connection.js').MasterNodeConnection;
const DashCore = require('@dashevo/dashcore-lib');
const Transaction = DashCore.Transaction;
const Script = DashCore.Script;
//const PrivateKey = DashCore.PrivateKey;
const Address = DashCore.Address;
const Signature = DashCore.crypto.Signature;
const Sanitizers = require('./sanitizers.js');
const { sanitize_txid, sanitize_vout } = Sanitizers;

//const ArrayUtils = require('./array-utils.js');
//const random = ArrayUtils.random;
let done = false;
let dboot;
let network;
let sendDsi;
let username;
let INPUTS = 1;
let client_session;
let mainUser;
let masterNodeConnection;

let PATTERN = 100001;
let MAX = 200000; // the next significant digit after PATTERN
let SHIFT = 0;
//let SHIFT = 1000;

function getDemoDenomination() {
	let denom = PATTERN * Math.pow(10, SHIFT);
	return denom;
}

function getDemoMaxCoin() {
	let max = MAX * Math.pow(10, SHIFT);
	return max;
}

function getDemoSat() {
	let sat_pattern = 9990; // not sure why
	let sat = sat_pattern * Math.pow(10, SHIFT);
	return sat;
}

//function getDenominatedOutput(txn, amount) {
//	let vout = 0;
//	for (let output of txn.outputs) {
//		if (output._satoshis === parseInt(amount * COIN, 10)) {
//			output.vout = vout;
//			return output;
//		}
//		++vout;
//	}
//	return null;
//}
async function onDSFMessage(parsed, masterNode) {
	d('DSF message received');

	client_session.dsf_parsed = parsed;
	d(`submitted transactions: ${client_session.get_inputs().length}`);
	d('Submitting DSS packet');
	await FileLib.write_json(
		`dss-outputs-${client_session.username}-#DATE#`,
		client_session,
	);
	masterNode.client.write(
		await Network.packet.coinjoin.dss({
			chosen_network: masterNode.network,
			dsfPacket: parsed,
			client_session,
			dboot,
		}),
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
			masterNode.collateralTx.txid,
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
					}),
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
					INPUTS,
				);
				masterNode.client.write(packet);
				debug('sent dsi packet');
			}
			break;
		case 'EXPECT_DSQ':
			break;
	}
}

// const AMOUNT = 0.00100001;
// const SATOSHIS = parseInt(COIN * parseFloat(AMOUNT, 10), 10);
const SATOSHIS = getDemoDenomination(); // 100001000;
const AMOUNT = parseInt((SATOSHIS / COIN).toFixed(8), 10);

async function preInit(
	_in_instanceName = 'base',
	_in_username,
	_in_nickname,
	_in_count,
	_in_send_dsi,
	_in_verbose,
	_in_mn_choice,
) {
	let nickName = _in_username;
	let id = {};
	let config = _in_mn_choice;
	nickName += `(${_in_mn_choice})`;
	DebugLib.setNickname(nickName);
	if (String(_in_verbose).toLowerCase() === 'true') {
		SigScript.setVerbosity(true);
	} else {
		SigScript.setVerbosity(false);
	}
	client_session = new ClientSession();
	sendDsi = _in_send_dsi;

	for (const i of Array.from(Array(10).keys())) {
		console.log(`masternode chosen: ${id.mn} [${i}]`);
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

	/**
	 * Grab all unspent utxos
	 */
	let keep = [];
	let utxos = await dboot.get_denominated_utxos(username, SATOSHIS);
	let payeeAddress = await dboot.get_change_addresses(username);
	let good = 0;
	let bad = 0;
	for (const u of utxos) {
		/**
     * 'u' looks like this:
	address: 'yRFXBhHDkzZ7NM44tC8ZgbgP2Hm1dR4Li9',
  txid: '010cef7befeb498eeac48080cf6263f76a9a8837ee4603c79aa9b01f4cc95638',
  outputIndex: 156,
  script: '76a914361a95ab2dd6be825e9aca6a54b6ccb2c6a09ee088ac',
  //satoshis: 100001,
  satoshis: 100001000,
  height: 1846

		*/
		if (u.satoshis !== SATOSHIS) {
			throw new Error('got weird satoshi value');
		}
		let tx = await dboot.get_transaction(username, u.txid);
		for (const detail of tx[u.txid].details) {
			if (detail.category === 'receive') {
				++good;
				d({ good });
				d({ address: detail.address });
				let address = Address.fromString(detail.address);
				let utxo = {
					txId: u.txid,
					outputIndex: detail.vout,
					satoshis: parseInt(parseFloat(detail.amount, 10) * COIN, 10),
					scriptPubKey: Script.buildPublicKeyHashOut(
						address,
						Signature.SIGHASH_ALL | Signature.SIGHASH_ANYONECANPAY,
					),
					sequence: 0xffffffff,
				};
				let txn = new Transaction().from(utxo);
				let pk = await dboot.get_private_key(username, detail.address);
				txn.sign(pk, Signature.SIGHASH_ALL | Signature.SIGHASH_ANYONECANPAY);
				d(txn.inputs[0]._script.toHex());
				keep.push({
					signed: txn,
					private_key: pk,
					from_get_transaction: tx,
					payee: payeeAddress[0],
					utxo,
				});
			} else {
				++bad;
			}
			if (keep.length === INPUTS) {
				break;
			}
		}
	}
	d({ good, bad, done: true });
	client_session.mixing_inputs = keep;

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
		nickName,
		_in_count,
		_in_send_dsi,
		getDemoDenomination(),
		client_session,
		mainUser,
		randomPayeeName,
		payee,
	);

	//{
	//	/** FIXME
	//   */
	//	await psbt_main(dboot, client_session);
	//	process.exit(0);
	//}
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

{
	let _in_mn_choice = extractOption('mn', true); // local_1, local_2, local_3, etc
	let mnConfig = require('./.mn0-config.json');
	switch (_in_mn_choice) {
		default:
		case 'local_1':
			mnConfig = require('./.mn0-config.json');
			id.mn = 0;
			break;
		case 'local_2':
			mnConfig = require('./.mn1-config.json');
			id.mn = 1;
			break;
		case 'local_3':
			mnConfig = require('./.mn2-config.json');
			id.mn = 2;
	}
	preInit(
		extractOption('instance', true),
		extractOption('username', true),
		extractOption('nickname', true),
		extractOption('count', true),
		extractOption('senddsi', true),
		extractOption('verbose', true),
		mnConfig,
	);
}

async function psbt_main(dboot, client_session) {
	const quota = 3;
	//const SAT = 0.00109991;
	const SAT = 109991000;
	let cs = client_session;
	let wallet_exec = await dboot.auto.build_executor(cs);
	/**
	 * 1) Get unspent
	 */
	let addresses = {};
	let address = await dboot.nth_address(cs, 1);
	let unspent = await dboot.list_unspent_by_address(cs, address, {
		minimumAmount: SAT,
		maximumAmount: getDemoMaxCoin(),
	});
	for (const tx of unspent) {
		if (tx.amount === SAT) {
			if (typeof addresses[tx.address] === 'undefined') {
				addresses[tx.address] = [];
			}
			addresses[tx.address].push(tx);
		}
	}
	let chosen = [];
	for (const address in addresses) {
		if (addresses[address].length >= quota) {
			for (let i = 0; i < quota; i++) {
				chosen.push(addresses[address][i]);
			}
		}
		if (chosen.length === quota) {
			break;
		}
	}
	if (chosen.length !== quota) {
		throw new Error('unable to fill quota');
	}
	/**
	 * 2) Create quota inputs
	 */
	let payee = await dboot.generate_address(cs, quota);
	let json = [];
	for (const tx of chosen) {
		json.push({
			txid: sanitize_txid(tx.txid),
			vout: sanitize_vout(tx.vout),
		});
	}
	cs.privateKey = await dboot.get_private_key(cs, chosen[0].address);
	let inputs = JSON.stringify(json);
	let out_json = [];
	cs.payee = payee;
	cs.payouts = [];
	for (const address of payee) {
		out_json.push({ [address]: AMOUNT });
		cs.payouts.push([address, AMOUNT]);
	}
	let outputs = JSON.stringify(out_json);
	let { out, err } = await wallet_exec('createpsbt', inputs, outputs);
	if (err.length) {
		throw new Error(err);
	}

	let output = await wallet_exec(
		'walletprocesspsbt',
		out,
		'true',
		'ALL|ANYONECANPAY',
	);
	let hex = null;
	try {
		let decoded = JSON.parse(output.out);
		if (xt(decoded, 'psbt')) {
			let psbt = xt(decoded, 'psbt');
			output = await dboot.finalize_psbt(cs, psbt);
			if (xt(output, 'hex')) {
				hex = output.hex;
			}
		}
	} catch (e) {
		throw new Error(e);
	}
	if (hex) {
		output = await dboot.decode_raw_transaction(cs, hex);
		d(output);
		cs.mixing_inputs = output;
		output = await dboot.send_raw_transaction(cs, hex);
		dd(output);
	}

	/**
	 * 3) pass to cli
	 */
}
