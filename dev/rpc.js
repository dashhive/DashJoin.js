'use strict';

// let Rpc = module.exports;

let DotEnv = require('dotenv');
void DotEnv.config({ path: '.env' });
void DotEnv.config({ path: '.env.secret' });

let pkg = require('../package.json');

let Net = require('node:net');

let DarkSend = require('./ds.js'); // TODO rename packer
let Parser = require('./parser.js');

let RpcClient = require('@dashevo/dashd-rpc/promise');
require('./rpc-shim.js'); // see https://github.com/dashpay/dashd-rpc/issues/68

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
	let network = 'regtest';
	rpcConfig.onconnected = async function () {
		let rpc = this;
		console.log(`[debug] rpc client connected ${rpc.host}`);
	};

	let rpc = new RpcClient(rpcConfig);
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
		errReject();
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

	// connect / connected
	// TODO setTimeout
	await new Promise(function (_resolve, _reject) {
		function cleanup() {
			conn.removeListener('readable', onReadable);
			conn.removeListener('data', onReadable);
		}

		function resolve() {
			cleanup();
			_resolve();
		}

		function reject() {
			cleanup();
			_reject();
		}

		function onConnect() {
			console.log('connected');
			resolve();
		}

		function onReadable() {
			console.log('readable');
			// checking an impossible condition, just in case
			throw new Error('unexpected response before request');
		}

		errReject = reject;
		conn.once('connect', onConnect);
		//conn.on('readable', onReadable);
		conn.on('data', onReadable);
	});

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
	conn.write(versionMsg);
	console.log(Parser.parseHeader(versionBuffer.slice(0, 24)));
	console.log(Parser.parseVerack(versionBuffer.slice(24)));

	for (;;) {
		// TODO setTimeout
		await new Promise(function (_resolve, _reject) {
			let header;
			let verack;

			function cleanup() {
				conn.removeListener('data', onReadableHeader);
				conn.removeListener('data', onReadableVerack);
				conn.removeListener('readable', onReadableHeader);
				conn.removeListener('readable', onReadableVerack);
			}

			function resolve() {
				cleanup();
				_resolve();
			}

			function reject() {
				cleanup();
				_reject();
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
					if (chunksLength < 24) {
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
				if (chunk.byteLength > 24) {
					let extra = chunk.slice(24);
					chunks.push(extra);
					chunksLength += chunk.byteLength;
					chunk = chunk.slice(0, 24);
				}
				header = Parser.parseHeader(chunk);
				console.log('DEBUG header', header);
				conn.removeListener('readable', onReadableHeader);
				conn.removeListener('data', onReadableHeader);
				//conn.on('readable', onReadableVerack);
				conn.on('data', onReadableVerack);
				onReadableVerack(null);
			}

			function onReadableVerack(data) {
				console.log('readable verack');
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
				} else {
					chunk = chunks[0];
				}
				chunks = [];
				chunksLength = 0;
				if (chunk.byteLength > header.payloadSize) {
					let extra = chunk.slice(header.payloadSize);
					chunks.push(extra);
					chunksLength += chunk.byteLength;
					chunk = chunk.slice(0, header.payloadSize);
				}
				verack = Parser.parseVerack(chunk);
				console.log('DEBUG verack', verack);
				conn.removeListener('readable', onReadableVerack);
				conn.removeListener('data', onReadableVerack);
				resolve();
			}

			errReject = reject;
			//conn.on('readable', onReadableHeader);
			conn.on('data', onReadableHeader);
		});
	}

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
