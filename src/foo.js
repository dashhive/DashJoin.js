#!/usr/bin/env node
'use strict';
const { xt } = require('@mentoc/xtract');
const Util = require('./util.js');
const dashboot = require('./bootstrap/index.js');
const SigScript = require('./sigscript.js');
const { dd, d } = require('./debug.js');
const DashCore = require('@dashevo/dashcore-lib');
const Transaction = DashCore.Transaction;
const Script = DashCore.Script;
const MetaDB = require('./bootstrap/metadb.js');
const DB = require('./lmdb/lmdb.js');
const mdb = new MetaDB(DB);
const fs = require('node:fs');
const { extractOption } = require('./argv.js');
const ArrayUtils = require('./array-utils.js');
const { ps_extract } = ArrayUtils;
let Address = DashCore.Address;
let PrivateKey = DashCore.PrivateKey;
let Signature = DashCore.crypto.Signature;
let assert = require('assert');
const NetworkUtil = require('./network-util.js');
const { hexToBytes, hashByteOrder } = NetworkUtil;
let cproc = require('child_process');

(async function () {
	let username = 'user1';
	let dboot = await dashboot.load_instance('base1');
	dboot.DASH_CLI = [process.env.HOME, 'bin', 'dash-cli'].join('/');
	let inputs = require('/home/foobar/data/dss-outputs-fde664227d6541a4abf0d6da6f8832db-2023-7-108:56:45.json');
	//inputs = await dboot.get_denominated_utxos(username, 100001);
	inputs = [
		{
			address: 'yPK8VVu6V4NGctZcraSgnWS36GnyvXfWHR',
			txid: 'd446dd9db51cb8fec9d34aa9a9ab7492f2e38eba431a0ad523cfcb34bad3b01f',
			outputIndex: 0,
			script: '76a91420d90dc122f556f153dcfb67b6d3d5b3ece6ede488ac',
			satoshis: 100001,
			height: 3471,
			privateKey: 'cW9Yk5V62HKDtP2NxuZoe2NJzMpZcEPU3ouNSxMEvGYTjL3Q1tjE',
		},
		{
			address: 'yPK8VVu6V4NGctZcraSgnWS36GnyvXfWHR',
			txid: '958314a80d578738872eee19cca143393f8994091e943f79e05940b6b02d0a1b',
			outputIndex: 0,
			script: '76a91420d90dc122f556f153dcfb67b6d3d5b3ece6ede488ac',
			satoshis: 100001,
			height: 3472,
			privateKey: 'cW9Yk5V62HKDtP2NxuZoe2NJzMpZcEPU3ouNSxMEvGYTjL3Q1tjE',
		},
		{
			address: 'yPK8VVu6V4NGctZcraSgnWS36GnyvXfWHR',
			txid: 'a69934a9bf5b625f293ca6bee4b33aa47a3eeb29ddb5c6bfb5b21bf51ad6df37',
			outputIndex: 0,
			script: '76a91420d90dc122f556f153dcfb67b6d3d5b3ece6ede488ac',
			satoshis: 100001,
			height: 3472,
			privateKey: 'cW9Yk5V62HKDtP2NxuZoe2NJzMpZcEPU3ouNSxMEvGYTjL3Q1tjE',
		},
	];
	for (let input of inputs) {
		input.privateKey = await dboot.get_private_key(username, input.address);
		input.publicKey = new PrivateKey(input.privateKey).publicKey;
	}
	inputs = inputs.splice(0, 3);
	const USER_INPUT_SIZE = inputs.length;
	let client_session = {
		mixing_inputs: inputs,
		generated_addresses: await dboot.generate_new_addresses(
			username,
			inputs.length,
		),
	};

	let signatures = [];
	//d({ inputs, client_session });
	/**
	 * The input count byte
	 */
	let TOTAL_SIZE = 1; // TODO: support compactSize
	const TXID_LENGTH = 32;
	const OUTPUT_INDEX_LENGTH = 4;
	const SEQUENCE_NUMBER_LENGTH = 4;

	let pubkeys = [];
	for (const input of inputs) {
		pubkeys.push(input.publicKey);
	}
	let threshold = 1;
	for (let i = 0; i < client_session.mixing_inputs.length; i++) {
		let txid = client_session.mixing_inputs[i].txid;
		//let _tx = hashByteOrder(txid);
		TOTAL_SIZE += TXID_LENGTH + OUTPUT_INDEX_LENGTH;
		/**
		 * Assumes that the length byte of signatures[txid].signature
		 * is present as the first byte
		 */
		console.debug({ txid });
		let utxo = {
			txId: client_session.mixing_inputs[i].txid,
			outputIndex: client_session.mixing_inputs[i].outputIndex,
			scriptPubKey: Script.buildMultisigOut(pubkeys, threshold),
			satoshis: client_session.mixing_inputs[i].satoshis,
		};
		let tx = new Transaction()
			.from(utxo)
			.to(
				client_session.generated_addresses[i],
				client_session.mixing_inputs[i].satoshis,
			);
		dd({ tx });

		let output = await dboot.wallet_exec(username, [
			'decoderawtransaction',
			tx.toString(),
		]);
		let { out } = ps_extract(output);
		let json = JSON.parse(out);
		//dd(out);
		//d(json.vout[0].scriptPubKey);
		//d(json.vin[0].scriptSig);

		// we then extract the signature from the first input
		let inputIndex = client_session.mixing_inputs[i].outputIndex;
		let sig = tx.getSignatures(client_session.mixing_inputs[i].privateKey)[
			inputIndex
		].signature;
		signatures.push(sig.toBuffer());
		client_session.mixing_inputs[i].signature = sig;
		TOTAL_SIZE += 1;
		TOTAL_SIZE += hexToBytes(sig).length;
		TOTAL_SIZE += SEQUENCE_NUMBER_LENGTH;
	}
	let s = Script.buildP2SHMultisigIn(pubkeys, threshold, signatures);
	for (let i = 0; i < client_session.mixing_inputs.length; i++) {
		let txid = client_session.mixing_inputs[i].txid;
		let utxo = {
			txId: client_session.mixing_inputs[i].txid,
			outputIndex: client_session.mixing_inputs[i].outputIndex,
			scriptPubKey: signatures[i],
			satoshis: client_session.mixing_inputs[i].satoshis,
		};
		let tx = new Transaction()
			.from(utxo)
			.to(
				client_session.generated_addresses[i],
				client_session.mixing_inputs[i].satoshis,
			)
			.sign(
				[client_session.mixing_inputs[0].privateKey],
				Signature.SIGHASH_ALL | Signature.SIGHASH_ANYONECANPAY,
			);

		let output = await dboot.wallet_exec(username, [
			'decoderawtransaction',
			tx.toString(),
		]);
		let { out } = ps_extract(output);
		let json = JSON.parse(out);
		dd(out);
		//d(json.vout[0].scriptPubKey);
		//d(json.vin[0].scriptSig);

		// we then extract the signature from the first input
		//var inputIndex = client_session.mixing_inputs[i].outputIndex;
		//var sig = tx.getSignatures(client_session.mixing_inputs[i].privateKey)[
		//	inputIndex
		//].signature;
		//signatures.push(sig.toBuffer());
		//client_session.mixing_inputs[i].signature = sig;
		//TOTAL_SIZE += 1;
		//TOTAL_SIZE += hexToBytes(sig).length;
		//TOTAL_SIZE += SEQUENCE_NUMBER_LENGTH;
	}

	dd(s);

	/**
	 * Packet payload
	 */
	let offset = 0;
	let packet = new Uint8Array(TOTAL_SIZE);
	packet.set([USER_INPUT_SIZE], 0);
	offset += 1; // TODO: compactSize

	/**
	 * Add each input
	 */
	for (const input of client_session.mixing_inputs) {
		packet.set(hexToBytes(input.txid), offset);
		offset += 32;
		packet.set([input.outputIndex], offset);
		offset += 4;
		packet.set([hexToBytes(input.signature).length], offset);
		offset += 1;
		packet.set(hexToBytes(input.signature), offset);
		offset += hexToBytes(input.signature).length;
		packet.set(hexToBytes('ffffffff'), offset);
		offset += 4;
	}
})();
