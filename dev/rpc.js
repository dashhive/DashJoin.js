'use strict';

let Rpc = module.exports;

let DotEnv = require('dotenv');
void DotEnv.config({ path: '.env' });
void DotEnv.config({ path: '.env.secret' });

let Net = require('node:net');

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

const E_RPC_IN_WARMUP = -28;
let rpcConnected = false;

async function main() {
	rpcConfig.onconnected = async function () {
		let rpc = this;
		console.log(`[debug] rpc client connected ${rpc.host}`);
	};

	let rpc = new RpcClient(rpcConfig);
	rpc.onconnected = rpcConfig.onconnected;
	await rpc.init(rpc);
	console.info('[debug] rpc server is ready.');

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
		host: evonode.host,
		port: evonode.port,
		keepAlive: true,
		keepAliveInitialDelay: 3,
		//localAddress: rpc.host,
	});
	conn.on('error', function (err) {
		console.log('error');
		console.error(err);
	});
	conn.on('connect', function (err) {
		console.log('connected');
	});
	conn.on('readable', function () {
		console.log('readable');
		let chunk = conn.read();
		let str = chunk.toString('utf8');
		console.log(str);
	});
	conn.on('data', function () {
		console.log('data');
		let chunk = conn.read();
		let str = chunk.toString('utf8');
		console.log(str);
	});
	conn.on('end', function () {
		console.log('[debug] disconnected from server');
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
