#!/usr/bin/env node
'use strict';
const COIN = require('./coin-join-constants.js').COIN;
const Network = require('./network.js');

let Lib = {};
module.exports = Lib;

let config = require('./.config.json');
let masterNodeIP = config.masterNodeIP;
let masterNodePort = config.masterNodePort;
let network = config.network;
let ourIP = config.ourIP;
let startBlockHeight = config.startBlockHeight;
const TxnConstants = require('./transaction-constants.js');
const NetUtil = require('./network-util.js');
const hexToBytes = NetUtil.hexToBytes;

let DashCore = require('@dashevo/dashcore-lib');
let Transaction = DashCore.Transaction;
let Script = DashCore.Script;
let PrivateKey = DashCore.PrivateKey;
let Address = DashCore.Address;
const LOW_COLLATERAL = (COIN / 1000 + 1) / 10;
const HI_COLLATERAL = LOW_COLLATERAL * 4;
const fs = require('fs');

async function read_file(fname) {
	return await fs
		.readFileSync(fname)
		.toString()
		.replace(/^\s+/, '')
		.replace(/\s+$/, '');
}
async function logUsedTransaction(fileName, txnId) {
	let buffer = await fs.readFileSync(fileName);
	buffer = buffer.toString();
	let data = JSON.parse(buffer);
	data.list.push(txnId);
	await fs.writeFileSync(fileName, JSON.stringify(data, null, 2));
}
async function isUsed(fileName, txnId) {
	let buffer = await fs.readFileSync(fileName);
	buffer = buffer.toString();
	let data = JSON.parse(buffer);
	return data.list.indexOf(txnId) !== -1;
}
const NETWORK = 'regtest';
let PsendUsedTxnFile = '/home/foobar/docs/dp-used-txn.json';
let PsendTxnList = require('/home/foobar/docs/dp-txn.json');
let PsendChangeAddress = await read_file(
	'/home/foobar/docs/dp-change-address-0',
);
let sourceAddress = await read_file('/home/foobar/docs/dp-address-0');
let payeeAddress = await read_file('/home/foobar/docs/df-address-0');
let privkeySet = PrivateKey(
	PrivateKey.fromWIF(
		await read_file('/home/foobar/docs/dp-privkey-0'),
		NETWORK,
	),
);

/**
 * Parameters:
 * 1) An unused txn input
    - txid
    - vout
    - satoshis
 * 2) WIF associated with txn input address
 * 3) The network (regtest,testnet,livenet)
 * 4) A random destination address
 *  - not incredibly important
 *  - but needs to be there from what i can tell
 * 5) denominations
 * 6) 
 */

module.exports = {
	Session,
};

let BrowserLib = {};

BrowserLib.Session = function (
	args = {
		txid,
		vout,
		satoshis,
		wif,
		network,
		payeeAddress,
		sourceAddress,
		denomination,
	},
) {
	let self = this;
	self.sourceAddress = args.sourceAddress;
	self.txid = args.txid;
	self.vout = args.vout;
	self.satoshis = parseInt(args.satoshis, 10);
	self.wif = args.wif;
	self.network = args.network;
	self.payeeAddress = args.payeeAddress;
	self.denomination = args.denomination;

	self.makeCollateralTx = function () {
		let fee = 50000;
		let amount = parseInt(LOW_COLLATERAL * 2, 10);
		let unspent = self.satoshis - amount;
		let sourceAddress = Address(self.sourceAddress, self.network);
		let utxos = {
			txId: self.txid,
			outputIndex: self.vout,
			sequenceNumber: 0xffffffff,
			scriptPubKey: Script.buildPublicKeyHashOut(sourceAddress),
			satoshis: self.satoshis,
		};
		var tx = new Transaction()
			.from(utxos)
			.to(payeeAddress, amount)
			.to(PsendChangeAddress, unspent - fee)
			.sign(privkeySet);

		return hexToBytes(tx.uncheckedSerialize());
	};

	/**
	 * Connect to the backend server and send in the collateral transaction
	 * bytes created by makeCollateralTx(). This should ask the server
	 * to put you into a queue pending coinjoin session arrival.
	 *
	 * Once the server has a spot for you in a master node, it will call
	 * the cb parameter.
	 */
	self.matchmake = async function (cb) {};
};

async function getUnusedTxn() {
	for (let txn of PsendTxnList) {
		/**
		 * Pull from PsendTxnList where:
		 * 1) category is 'generate'.
		 * 2) has more than zero confirmations
		 * 3) where address matches dp-address-0
		 * 4) txid does NOT exist in /home/foobar/docs/dp-used-txn.json
		 */
		if (txn.category !== 'generate') {
			continue;
		}
		if (txn.confirmations === 0) {
			continue;
		}
		if (txn.address !== sourceAddress) {
			continue;
		}
		if (await isUsed(PsendUsedTxnFile, txn.txid)) {
			continue;
		}
		return txn;
		break;
	}
	return null;
}
(async function () {
	let PsendTx = await getUnusedTxn();

	if (PsendTx === null) {
		throw new Error('Couldnt find unused transaction');
	}

	let amount = LOW_COLLATERAL * 2;
	async function makeCollateralTx(prefs) {
		let origAmount = PsendTx.amount * COIN;
		let times = 1;

		let fee = 50000;
		amount = parseInt(amount, 10);
		let unspent = origAmount - amount;
		let sourceAddress = Address(PsendTx.address, NETWORK);
		let utxos = {
			txId: PsendTx.txid,
			outputIndex: PsendTx.vout,
			sequenceNumber: 0xffffffff,
			scriptPubKey: Script.buildPublicKeyHashOut(sourceAddress),
			satoshis: origAmount,
		};
		var tx = new Transaction()
			.from(utxos)
			.to(payeeAddress, amount)
			.to(PsendChangeAddress, unspent - fee)
			.sign(privkeySet);

		if (typeof prefs.logUsed !== 'undefined' && prefs.logUsed) {
			await logUsedTransaction(PsendUsedTxnFile, utxos.txId);
		}
		return hexToBytes(tx.uncheckedSerialize());
	}

	function exit() {
		process.exit(0);
	}
	async function sendCoins(prefs) {
		let origAmount = PsendTx.amount * COIN;
		let times = 1;

		let fee = 1000;
		amount = parseInt(amount, 10);
		let unspent = origAmount - amount;
		unspent -= fee;
		console.debug({ fee, PsendTx, unspent, amount, origAmount });
		let sourceAddress = Address(PsendTx.address, NETWORK);
		/**
		 * Take the input of the PrevTx, send it to another wallet
		 * which will hold the new funds and the change will go to
		 * a change address.
		 */
		let utxos = {
			txId: PsendTx.txid,
			outputIndex: PsendTx.vout,
			sequenceNumber: 0xffffffff,
			scriptPubKey: Script.buildPublicKeyHashOut(sourceAddress),
			satoshis: origAmount,
		};
		var tx = new Transaction()
			.from(utxos) // Feed information about what unspent outputs one can use
			.to(payeeAddress, amount) // Add an output with the given amount of satoshis
			.to(PsendChangeAddress, unspent)
			.change(PsendChangeAddress) // Sets up a change address where the rest of the funds will go
			.fee(fee)
			.sign(privkeySet); // Signs all the inputs it can

		console.debug({ tx, cereal: tx.serialize() });
		console.debug(tx.inputs);
		console.debug(tx.outputs);
		console.debug(tx._changeScript);

		console.debug(tx.serialize());
		if (typeof prefs.logUsed !== 'undefined' && prefs.logUsed) {
			await logUsedTransaction(PsendUsedTxnFile, utxos.txId);
		}
	}
	let logUsed = false;
	if (process.argv.includes('--log-used')) {
		logUsed = true;
	}
	if (process.argv.includes('--send-coin')) {
		sendCoins({
			logUsed,
		}).then(function () {
			process.exit(0);
		});
	}

	let dsaSent = false;

	function stateChanged(obj) {
		let masterNode = obj.self;
		switch (masterNode.status) {
			default:
				console.info('unhandled status:', masterNode.status);
				break;
			case 'CLOSED':
				console.warn('[-] Connection closed');
				break;
			case 'NEEDS_AUTH':
			case 'EXPECT_VERACK':
			case 'EXPECT_HCDP':
			case 'RESPOND_VERACK':
				console.info('[ ... ] Handshake in progress');
				break;
			case 'READY':
				console.log(
					'[+] Ready to start dealing with CoinJoin traffic...',
				);
				masterNode.switchHandlerTo('coinjoin');
				if (dsaSent === false) {
					setTimeout(async () => {
						masterNode.client.write(
							Network.packet.coinjoin.dsa({
								chosen_network: network,
								denomination: COIN / 1000 + 1,
								collateral: await makeCollateralTx({ logUsed }),
							}),
						);
						dsaSent = true;
					}, 2000);
				}
				break;
			case 'EXPECT_DSQ':
				console.info('[+] dsa sent');
				break;
		}
	}

	let MasterNodeConnection =
		require('./masternode-connection.js').MasterNodeConnection;
	let masterNodeConnection = new MasterNodeConnection({
		ip: masterNodeIP,
		port: masterNodePort,
		network,
		ourIP,
		startBlockHeight,
		onStatusChange: stateChanged,
		debugFunction: console.debug,
		userAgent: config.userAgent ?? null,
	});

	masterNodeConnection.connect();
})();
