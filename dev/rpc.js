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
let DashTx = require('dashtx');

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
	let seedHex = process.env.DASH_WALLET_SEED || '';
	let seedBuffer = Buffer.from(seedHex, 'hex');
	let seedBytes = new Uint8Array(seedBuffer);
	let walletKey = await DashHd.fromSeed(seedBytes, '');
	let walletId = DashHd.toId(walletKey);
	let xprvHdpath = `m/44'/5'/0'/0`;
	let xprvKey = await DashHd.derivePath(walletKey, xprvHdpath);

	// generate bunches of keys
	// remove the leading `m/` or `m'/`
	let partialPath = xprvHdpath.replace(/^m'?\//, '');
	let lastUsedIndex = 0;
	let keysMap = {};
	let used = [];
	for (;;) {
		let index = 0;
		let addresses = [];
		for (let i = 0; i < 1000; i += 1) {
			let addressKey = await xprvKey.deriveAddress(index);
			index += 1;

			// Descriptors are in the form of
			//   - pkh(xpub123...abc/2) - for the 3rd address of a receiving or change xpub
			//   - pkh(xpub456...def/0/2) - for the 3rd receive address of an account xpub
			//   - pkh([walletid/44'/0'/0']xpub123...abc/0/2) - same, plus wallet & hd info
			//   - pkh([walletid/44'/0'/0'/0/2]Xaddr...#checksum) - same, but the address
			// See also: https://github.com/dashpay/dash/blob/master/doc/descriptors.md
			// TODO sort out sha vs double-sha vs fingerprint
			let descriptor = `pkh([${walletId}/${partialPath}/${index}])`;
			let address = await DashHd.toAddr(addressKey);
			let data = { index, descriptor, address };
			keysMap[index] = data;
			keysMap[address] = data;
			addresses.push(address);
		}
		let mempooldeltas = await rpc.getAddressMempool({ addresses });
		for (let delta of mempooldeltas) {
			let data = keysMap[delta.address];
			data.used = true;
			used.push(data);
		}
		let deltas = await rpc.getAddressDeltas({ addresses });
		for (let delta of deltas) {
			let data = keysMap[delta.address];
			data.used = true;
			used.push(data);
		}

		console.log(keysMap);
		// TODO check for unused
		console.log(used);
		process.exit(1);
	}

	let network = 'regtest';
	rpcConfig.onconnected = async function () {
		let rpc = this;
		console.log(`[debug] rpc client connected ${rpc.host}`);
	};

	let rpc = new DashRpc(rpcConfig);
	rpc.onconnected = rpcConfig.onconnected;
	let height = await rpc.init(rpc);
	console.info(`[debug] rpc server is ready. Height = ${height}`);

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
