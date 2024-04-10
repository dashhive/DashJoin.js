'use strict';

let RpcClient = require('@dashevo/dashd-rpc');

RpcClient.E_IN_WARMUP = -28;

RpcClient.prototype.init = async function (opts) {
	let rpc = this;
	rpc._connected = false;

	let retry = opts?.retry || 5000;

	let height = 0;
	for (;;) {
		height = await RpcClient._getHeight(rpc);
		if (height) {
			break;
		}
		await sleep(retry);
	}

	return height;
};

function sleep(ms) {
	return new Promise(function (resolve) {
		setTimeout(resolve, ms);
	});
}

RpcClient._getHeight = async function (rpc) {
	let warn = null;
	let tip = await rpc
		.getChainTips()
		//.getBestBlockHash()
		.then(function (result) {
			// { id, error, result }
			if (result.error) {
				// impossible, but we'll check anyway
				throw new Error(result.error);
			}

			if (!result.result?.[0].height) {
				// also impossible, and we still check anyway
				throw new Error('Sanity Fail: missing tip');
			}

			return result.result[0].height;
		})
		.catch(function (e) {
			if (e.code === RpcClient.E_IN_WARMUP) {
				warn = e;
				return 0;
			}

			throw e;
		});

	if (!rpc._connected) {
		rpc._connected = true;
		let onconnected = rpc.onconnected || RpcClient._onconnected;
		void onconnected.call(rpc, warn);
	}

	return tip;
};

RpcClient._onconnected = function () {
	let rpc = this;
	console.info(`[dashd-rpc] client connected to ${rpc.host}:${rpc.port}`);
};
