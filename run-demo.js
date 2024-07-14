'use strict';

let CJDemo = require('./demo.js');

// TODO move to
let ENV = require('./node-env.js');
let rpcConfig = {
	protocol: ENV.DASHD_RPC_PROTOCOL || 'http', // https for remote, http for local / private networking
	user: ENV.DASHD_RPC_USER,
	pass: ENV.DASHD_RPC_PASS || ENV.DASHD_RPC_PASSWORD,
	host: ENV.DASHD_RPC_HOST || '127.0.0.1',
	port: ENV.DASHD_RPC_PORT || '19898', // mainnet=9998, testnet=19998, regtest=19898
	timeout: 10 * 1000, // bump default from 5s to 10s for up to 10k addresses
	onconnected: async function () {
		console.info(`[info] rpc client connected ${rpcConfig.host}`);
	},
};
if (ENV.DASHD_RPC_TIMEOUT) {
	let rpcTimeoutSec = parseFloat(ENV.DASHD_RPC_TIMEOUT);
	rpcConfig.timeout = rpcTimeoutSec * 1000;
}

CJDemo.run(ENV, rpcConfig)
	.then(function () {
		console.info('Done');
		if (typeof process !== 'undefined') {
			process.exit(0);
		}
	})
	.catch(function (err) {
		console.error('Fail:');
		console.error(err.stack || err);
		if (typeof process !== 'undefined') {
			process.exit(1);
		}
	});
