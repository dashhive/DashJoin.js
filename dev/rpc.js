'use strict';

// let Rpc = module.exports;

let DotEnv = require('dotenv');
void DotEnv.config({ path: '.env' });
void DotEnv.config({ path: '.env.secret' });

let pkg = require('../package.json');

let Net = require('node:net');

let DarkSend = require('./ds.js'); // TODO rename packer
let Parser = require('./parser.js');

let DashHd = require('dashhd');
let DashRpc = require('dashrpc');
//let DashTx = require('dashtx');

// const DENOM_MOD = 100001;
const MIN_UNUSED = 2500;
// const MIN_UNUSED = 200;
const MIN_BALANCE = 100001 * 10000;

let rpcConfig = {
	protocol: 'http', // https for remote, http for local / private networking
	user: process.env.DASHD_RPC_USER,
	pass: process.env.DASHD_RPC_PASS || process.env.DASHD_RPC_PASSWORD,
	host: process.env.DASHD_RPC_HOST || '127.0.0.1',
	port: process.env.DASHD_RPC_PORT || '19898', // mainnet=9998, testnet=19998, regtest=19898
	timeout: 10 * 1000, // bump default from 5s to 10s for up to 10k addresses
};
if (process.env.DASHD_RPC_TIMEOUT) {
	let rpcTimeoutSec = parseFloat(process.env.DASHD_RPC_TIMEOUT);
	rpcConfig.timeout = rpcTimeoutSec * 1000;
}

async function main() {
	/* jshint maxstatements: 1000 */

	// let cache = {};
	// try {
	//     cache = require('./cache.json');
	// } catch(e) {
	//     cache = {}
	// }

	let network = 'regtest';
	rpcConfig.onconnected = async function () {
		let rpc = this;
		console.info(`[info] rpc client connected ${rpc.host}`);
	};

	let rpc = new DashRpc(rpcConfig);
	rpc.onconnected = rpcConfig.onconnected;
	let height = await rpc.init(rpc);
	console.info(`[debug] rpc server is ready. Height = ${height}`);

	let seedHex = process.env.DASH_WALLET_SEED || '';
	if (!seedHex) {
		throw new Error('missing DASH_WALLET_SEED');
	}
	let seedBuffer = Buffer.from(seedHex, 'hex');
	let seedBytes = new Uint8Array(seedBuffer);
	let testCoin = '1';
	let walletKey = await DashHd.fromSeed(seedBytes, {
		coinType: testCoin,
		versions: DashHd.TESTNET,
	});
	let walletId = await DashHd.toId(walletKey);

	let accountHdpath = `m/44'/1'/0'`;
	let accountKey = await walletKey.deriveAccount(0);
	let xreceiveKey = await accountKey.deriveXKey(walletKey, 0);
	// let xchangeKey = await accountKey.deriveXKey(walletKey, 1);
	// let xprvHdpath = `m/44'/5'/0'/0`;
	// let xprvKey = await DashHd.derivePath(walletKey, xprvHdpath);

	// generate bunches of keys
	// remove the leading `m/` or `m'/`
	let partialPath = accountHdpath.replace(/^m'?\//, '');
	let totalBalance = 0;
	let keysMap = {};
	let used = [];
	let addresses = [];
	let unusedMap = {};
	let index = 0;
	let numAddresses = 100;
	for (;;) {
		let uncheckedAddresses = [];
		for (let i = 0; i < numAddresses; i += 1) {
			let addressKey = await xreceiveKey.deriveAddress(index);

			// Descriptors are in the form of
			//   - pkh(xpub123...abc/2) - for the 3rd address of a receiving or change xpub
			//   - pkh(xpub456...def/0/2) - for the 3rd receive address of an account xpub
			//   - pkh([walletid/44'/0'/0']xpub123...abc/0/2) - same, plus wallet & hd info
			//   - pkh([walletid/44'/0'/0'/0/2]Xaddr...#checksum) - same, but the address
			// See also: https://github.com/dashpay/dash/blob/master/doc/descriptors.md
			// TODO sort out sha vs double-sha vs fingerprint
			let descriptor = `pkh([${walletId}/${partialPath}/0/${index}])`;
			let address = await DashHd.toAddr(addressKey.publicKey, {
				version: 'testnet',
			});
			// let utxosRpc = await rpc.getAddressUtxos({ addresses: [address] });
			// let utxos = utxosRpc.result;
			// console.log('utxosRpc.result.length', utxosRpc.result.length);

			let data = keysMap[address];
			if (!data) {
				data = {
					index: index,
					descriptor: descriptor,
					address: address,
					// uxtos: utxos,
					used: false,
					satoshis: 0,
				};
				// console.log('[debug] addr info', data);
				addresses.push(address);
				uncheckedAddresses.push(address);
			}
			keysMap[index] = data;
			keysMap[address] = data;
			// console.log('[DEBUG] address:', address);
			if (!data.used) {
				unusedMap[address] = data;
			}

			index += 1;
		}
		console.log('[debug] addresses.length', addresses.length);
		console.log('[debug] uncheckedAddresses.length', uncheckedAddresses.length);

		// TODO segment unused addresses
		// let unusedAddresses = Object.keys(unusedMap);
		// console.log('[debug] unusedAddresses.length', unusedAddresses.length);

		let mempooldeltas = await rpc.getAddressMempool({
			addresses: uncheckedAddresses,
			// addresses: unusedAddresses,
		});
		console.log(
			'[debug] mempooldeltas.result.length',
			mempooldeltas.result.length,
		);
		// TODO check that we have a duplicate in both deltas by using txid, vin/vout
		for (let delta of mempooldeltas.result) {
			totalBalance += delta.satoshis;

			let data = keysMap[delta.address];
			data.balance += delta.satoshis;
			data.used = true;
			if (!used.includes(data)) {
				used.push(data);
			}
			delete unusedMap[data.address];
		}

		let deltas = await rpc.getAddressDeltas({
			addresses: uncheckedAddresses,
		});
		console.log('[debug] deltas.result.length', deltas.result.length);
		for (let delta of deltas.result) {
			totalBalance += delta.satoshis;

			let data = keysMap[delta.address];
			data.balance += delta.satoshis;
			data.used = true;
			if (!used.includes(data)) {
				used.push(data);
			}
			delete unusedMap[data.address];
		}

		let numUnused = addresses.length - used.length;
		if (numUnused >= MIN_UNUSED) {
			console.log('[debug] addresses.length', addresses.length);
			console.log('[debug] used.length', used.length);
			break;
		}
	}
	console.log('t:', totalBalance);

	// TODO sort denominated
	// for (let addr of addresses) { ... }

	let largest = { balance: 0 };
	for (let addr of addresses) {
		let data = keysMap[addr];
		if (data.balance > largest.balance) {
			largest = data;
			console.log('[debug] new largest:', largest);
		}
		if (data.used) {
			continue;
		}

		console.log('[debug] totalBalance:', totalBalance);
		if (totalBalance >= MIN_BALANCE) {
			break;
		}

		void await rpc.generateToAddress(1, addr);
		// let blocksRpc = await rpc.generateToAddress(1, addr);
		// console.log('[debug] blocksRpc', blocksRpc);

		// let deltas = await rpc.getAddressMempool({ addresses: [addr] });
		// console.log('[debug] generatetoaddress mempool', deltas);
		// let deltas2 = await rpc.getAddressDeltas({ addresses: [addr] });
		// console.log('[debug] generatetoaddress deltas', deltas);
		// let results = deltas.result.concat(deltas2.result);
		// for (let delta of results) {
		// 	totalBalance += delta.satoshis;
		// 	keysMap[delta.address].used = true;
		// 	delete unusedMap[delta.address];
		// }

		let utxosRpc = await rpc.getAddressUtxos({ addresses: [addr] });
		let utxos = utxosRpc.result;
		for (let utxo of utxos) {
			console.log(data.index, '[debug] utxo.satoshis', utxo.satoshis);
			totalBalance += utxo.satoshis;
			keysMap[utxo.address].used = true;
			delete unusedMap[utxo.address];
		}
	}
	console.log('[debug] absolute largest:', largest);
	process.exit(1);

	let evonodes = [];
	{
		let resp = await rpc.masternodelist();
		let evonodesMap = resp.result;
		let evonodeProTxIds = Object.keys(evonodesMap);
		for (let id of evonodeProTxIds) {
			let evonode = evonodesMap[id];
			if (evonode.status === 'ENABLED') {
				let hostParts = evonode.address.split(':');
				let evodata = {
					id: evonode.id,
					hostname: hostParts[0],
					port: hostParts[1],
					type: evonode.type,
				};
				evonodes.push(evodata);
			}
		}
		if (!evonodes.length) {
			throw new Error('Sanity Fail: no evonodes online');
		}
	}

	void shuffle(evonodes);
	let evonode = evonodes.at(-1);
	console.log('[debug] chosen evonode:');
	console.log(JSON.stringify(evonode, null, 2));

	let conn = Net.createConnection({
		host: evonode.hostname,
		port: evonode.port,
		keepAlive: true,
		keepAliveInitialDelay: 3,
		//localAddress: rpc.host,
	});

	/** @type {Array<Buffer>} */
	let chunks = [];
	let chunksLength = 0;
	let errReject;

	function onError(err) {
		console.log('error');
		console.error(err);
		conn.removeListener('error', onError);
		errReject(err);
	}
	function onEnd() {
		console.log('[debug] disconnected from server');
	}
	conn.on('error', onError);
	conn.once('end', onEnd);
	conn.on('data', function (data) {
		console.log('[DEBUG] data');
		console.log(data);
	});

	let messages = [];
	let listenerMap = {};
	async function goRead() {
		for (;;) {
			let msg = await readMessage();
			console.log('[DEBUG] readMessage', msg);
			console.log('[DEBUG] msg.command', msg.command);
			let i = messages.length;
			messages.push(msg);
			let listeners = Object.values(listenerMap);
			for (let ln of listeners) {
				void ln(msg, i, messages);
			}
		}
	}
	void goRead();

	/**
	 * Reads a for a full 24 bytes, parses those bytes as a header,
	 * and then reads the length of the payload. Any excess bytes will
	 * be saved for the next cycle - meaning it can handle multiple
	 * messages in a single packet.
	 */
	async function readMessage() {
		const HEADER_SIZE = 24;
		const PAYLOAD_SIZE_MAX = 4 * 1024 * 1024;

		// TODO setTimeout
		let _resolve;
		let _reject;
		let p = new Promise(function (__resolve, __reject) {
			_resolve = __resolve;
			_reject = __reject;
		});

		let header;

		function cleanup() {
			conn.removeListener('data', onReadableHeader);
			conn.removeListener('data', onReadablePayload);
			conn.removeListener('readable', onReadableHeader);
			conn.removeListener('readable', onReadablePayload);
		}

		function resolve(data) {
			cleanup();
			_resolve(data);
		}

		function reject(err) {
			cleanup();
			_reject(err);
		}

		function onReadableHeader(data) {
			console.log('readable header');
			let chunk;
			for (;;) {
				chunk = data;
				// chunk = conn.read(); // TODO reenable
				if (!chunk) {
					break;
				}
				chunks.push(chunk);
				chunksLength += chunk.byteLength;
				if (chunksLength < HEADER_SIZE) {
					return;
				}
				data = null; // TODO nix
			}
			if (chunks.length > 1) {
				chunk = Buffer.concat(chunks, chunksLength);
			} else {
				chunk = chunks[0];
			}
			chunks = [];
			chunksLength = 0;
			if (chunk.byteLength > HEADER_SIZE) {
				let extra = chunk.slice(HEADER_SIZE);
				chunks.push(extra);
				chunksLength += chunk.byteLength;
				chunk = chunk.slice(0, HEADER_SIZE);
			}
			header = Parser.parseHeader(chunk);
			if (header.payloadSize > PAYLOAD_SIZE_MAX) {
				throw new Error('no big you are, handle you I cannot');
			}
			console.log('DEBUG header', header);
			conn.removeListener('readable', onReadableHeader);
			conn.removeListener('data', onReadableHeader);
			//conn.on('readable', onReadablePayload);
			conn.on('data', onReadablePayload);
			onReadablePayload(null);
		}

		function onReadablePayload(data) {
			console.log('readable payload');
			let chunk;
			for (;;) {
				chunk = data;
				// chunk = conn.read(); // TODO revert
				if (!chunk) {
					break;
				}
				chunks.push(chunk);
				chunksLength += chunk.byteLength;
				if (chunksLength < header.payloadSize) {
					return;
				}
				data = null; // TODO nx
			}
			if (chunks.length > 1) {
				chunk = Buffer.concat(chunks, chunksLength);
			} else if (chunks.length === 1) {
				chunk = chunks[0];
			} else {
				console.log("[warn] 'chunk' is 'null' (probably the debug null)");
				return;
			}
			chunks = [];
			chunksLength = 0;
			if (chunk.byteLength > header.payloadSize) {
				let extra = chunk.slice(header.payloadSize);
				chunks.push(extra);
				chunksLength += chunk.byteLength;
				chunk = chunk.slice(0, header.payloadSize);
			}
			header.payload = chunk;
			conn.removeListener('readable', onReadablePayload);
			conn.removeListener('data', onReadablePayload);
			resolve(header);
		}

		errReject = reject;
		//conn.on('readable', onReadableHeader);
		conn.on('data', onReadableHeader);

		let msg = await p;
		return msg;
	}

	async function waitForConnect() {
		// connect / connected
		// TODO setTimeout
		await new Promise(function (_resolve, _reject) {
			function cleanup() {
				conn.removeListener('readable', onReadable);
				conn.removeListener('data', onReadable);
			}

			function resolve(data) {
				cleanup();
				_resolve(data);
			}

			function reject(err) {
				cleanup();
				_reject(err);
			}

			function onConnect() {
				resolve();
			}

			function onReadable() {
				// checking an impossible condition, just in case
				throw new Error('unexpected response before request');
			}

			errReject = reject;
			conn.once('connect', onConnect);
			//conn.on('readable', onReadable);
			conn.on('data', onReadable);
		});
	}

	await waitForConnect();
	console.log('connected');

	// version / verack
	let versionMsg = DarkSend.version({
		chosen_network: network, // DarkSend.NETWORKS.regtest,
		//protocol_version: DarkSend.PROTOCOL_VERSION,
		//addr_recv_services: [DarkSend.IDENTIFIER_SERVICES.NETWORK],
		addr_recv_ip: evonode.hostname,
		addr_recv_port: evonode.port,
		//addr_trans_services: [],
		//addr_trans_ip: '127.0.01',
		//addr_trans_port: null,
		// addr_trans_ip: conn.localAddress,
		// addr_trans_port: conn.localPort,
		start_height: height,
		//nonce: null,
		user_agent: `DashJoin.js/${pkg.version}`,
		// optional-ish
		relay: false,
		mnauth_challenge: null,
		mn_connection: false,
	});

	let versionBuffer = Buffer.from(versionMsg);
	console.log('version', versionBuffer.toString('hex'));
	console.log(Parser.parseHeader(versionBuffer.slice(0, 24)));
	console.log(Parser.parseVerack(versionBuffer.slice(24)));

	conn.write(versionMsg);

	await new Promise(function (resolve, reject) {
		listenerMap['version'] = async function (message) {
			let version = await Parser.parseVersion(message.payload);
			console.log('DEBUG version', version);
			resolve();
			listenerMap['version'] = null;
			delete listenerMap['version'];
		};
	});

	let verackBytes = DarkSend.packMessage(network, 'verack', null);
	conn.write(verackBytes);

	await new Promise(function (resolve, reject) {
		listenerMap['verack'] = async function (message) {
			console.log('DEBUG verack', message);
			resolve();
			listenerMap['verack'] = null;
			delete listenerMap['verack'];
		};
	});

	// dsa / dssu + dsq
	// TODO setTimeout
	await new Promise(function (_resolve, _reject) {
		//
		_resolve();
	});

	console.log('exiting?');
}

// http://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
function shuffle(arr) {
	let currentIndex = arr.length;

	// While there remain elements to shuffle...
	for (; currentIndex !== 0; ) {
		// Pick a remaining element...
		let randomIndexFloat = Math.random() * currentIndex;
		let randomIndex = Math.floor(randomIndexFloat);
		currentIndex -= 1;

		// And swap it with the current element.
		let temporaryValue = arr[currentIndex];
		arr[currentIndex] = arr[randomIndex];
		arr[randomIndex] = temporaryValue;
	}

	return arr;
}

main()
	.then(function () {
		console.info('Done');
		process.exit(0);
	})
	.catch(function (err) {
		console.error('Fail:');
		console.error(err.stack || err);
		process.exit(1);
	});
