'use strict';

let RpcClient = require('@dashevo/dashd-rpc');

RpcClient.E_IN_WARMUP = -28;

RpcClient.prototype.init = async function (opts) {
	let rpc = this;
	let retry = opts?.retry || 5000;

	rpc._connected = false;
	for (;;) {
		let ready = await RpcClient._isReady(rpc);
		if (ready) {
			break;
		}
		await sleep(retry);
	}
};

RpcClient._isReady = async function (rpc) {
	let warn = null;
	let ready = await rpc
		.getBestBlockHash()
		.then(function (result) {
			// { id, error, result }
			if (result.error) {
				// impossible, but we'll check anyway
				throw new Error(result.error);
			}

			return true;
		})
		.catch(function (e) {
			if (e.code === RpcClient.E_IN_WARMUP) {
				warn = e;
				return false;
			}

			throw e;
		});

	if (!rpc._connected) {
		rpc._connected = true;
		let onconnected = rpc.onconnected || RpcClient._onconnected;
		void onconnected.call(rpc, warn);
	}

	return ready;
};

RpcClient._onconnected = function () {
	let rpc = this;
	console.info(`[dashd-rpc] client connected to ${rpc.host}:${rpc.port}`);
};
