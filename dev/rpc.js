'use strict';

// let Rpc = module.exports;

let DotEnv = require('dotenv');
void DotEnv.config({ path: '.env' });
void DotEnv.config({ path: '.env.secret' });

let pkg = require('../package.json');

let Net = require('node:net');

let CoinJoin = require('./coinjoin.js');
let Packer = require('./packer.js'); // TODO rename packer
let Parser = require('./parser.js');

let DashPhrase = require('dashphrase');
let DashHd = require('dashhd');
let DashKeys = require('dashkeys');
let DashRpc = require('dashrpc');
let DashTx = require('dashtx');
let Secp256k1 = require('@dashincubator/secp256k1');

const DENOM_LOWEST = 100001;
const PREDENOM_MIN = DENOM_LOWEST + 193;
// const MIN_UNUSED = 2500;
const MIN_UNUSED = 500;
const MIN_BALANCE = 100001 * 100000;
const MIN_DENOMINATED = 100;

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
	/* jshint maxcomplexity: 100 */

	let walletSalt = process.argv[2] || '';
	let isHelp = walletSalt === 'help' || walletSalt === '--help';
	if (isHelp) {
		throw new Error(
			`USAGE\n    ${process.argv[1]} [wallet-salt]\n\nEXAMPLE\n    ${process.argv[1]} 'luke|han|chewie'`,
		);
	}

	let walletPhrase = process.env.DASH_WALLET_PHRASE || '';
	if (!walletPhrase) {
		throw new Error('missing DASH_WALLET_PHRASE');
	}

	// let cache = {};
	// try {
	//     cache = require('./cache.json');
	// } catch(e) {
	//     cache = {}
	// }

	let network = 'regtest';
	// let minimumParticipants = Packer.NETWORKS[network].minimumParticiparts;
	rpcConfig.onconnected = async function () {
		let rpc = this;
		console.info(`[info] rpc client connected ${rpc.host}`);
	};

	let rpc = new DashRpc(rpcConfig);
	rpc.onconnected = rpcConfig.onconnected;
	let height = await rpc.init(rpc);
	console.info(`[info] rpc server is ready. Height = ${height}`);

	let keyUtils = {
		sign: async function (privateKey, hash) {
			// TODO update DashTx docs arguments from object to 2 args
			let sigOpts = { canonical: true, extraEntropy: true };
			let sigBytes = await Secp256k1.sign(hash, privateKey, sigOpts);
			// TODO update DashTx docs return from hex to bytes
			//return DashTx.utils.u8ToHex(sigBytes);
			return sigBytes;
		},
		toPublicKey: async function (privKeyBytes) {
			return await DashKeys.utils.toPublicKey(privKeyBytes);
		},
	};
	let dashTx = DashTx.create(keyUtils);

	let testCoin = '1';
	let seedBytes = await DashPhrase.toSeed(walletPhrase, walletSalt);
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
					walletId: walletId,
					prefix: "m/44'/1'",
					account: 0,
					usage: 0,
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
		// console.log('[debug] addresses.length', addresses.length);
		// console.log('[debug] uncheckedAddresses.length', uncheckedAddresses.length);

		// TODO segment unused addresses
		// let unusedAddresses = Object.keys(unusedMap);
		// console.log('[debug] unusedAddresses.length', unusedAddresses.length);

		let mempooldeltas = await rpc.getAddressMempool({
			addresses: uncheckedAddresses,
			// addresses: unusedAddresses,
		});
		// console.log(
		// 	'[debug] mempooldeltas.result.length',
		// 	mempooldeltas.result.length,
		// );
		// TODO check that we have a duplicate in both deltas by using txid, vin/vout
		for (let delta of mempooldeltas.result) {
			totalBalance += delta.satoshis;

			let data = keysMap[delta.address];
			data.satoshis += delta.satoshis;
			data.used = true;
			if (!used.includes(data)) {
				used.push(data);
			}
			delete unusedMap[data.address];
		}

		let deltas = await rpc.getAddressDeltas({
			addresses: uncheckedAddresses,
		});
		// console.log('[debug] deltas.result.length', deltas.result.length);
		for (let delta of deltas.result) {
			totalBalance += delta.satoshis;

			let data = keysMap[delta.address];
			data.satoshis += delta.satoshis;
			data.used = true;
			if (!used.includes(data)) {
				used.push(data);
			}
			delete unusedMap[data.address];
		}

		let numUnused = addresses.length - used.length;
		if (numUnused >= MIN_UNUSED) {
			// console.log('[debug] addresses.length', addresses.length);
			// console.log('[debug] used.length', used.length);
			break;
		}
	}
	console.log('[debug] wallet balance:', totalBalance);

	void (await generateMinBalance());
	void (await generateDenominations());

	// TODO sort denominated
	// for (let addr of addresses) { ... }

	async function generateMinBalance() {
		for (let addr of addresses) {
			// console.log('[debug] totalBalance:', totalBalance);
			if (totalBalance >= MIN_BALANCE) {
				break;
			}

			let data = keysMap[addr];
			// console.log(data);
			if (data.reserved) {
				continue;
			}
			if (data.used) {
				continue;
			}

			void (await generateToAddress(data));
		}
	}

	async function generateDenominations() {
		// jshint maxcomplexity: 25
		let denomCount = 0;
		let denominable = [];
		let denominated = {};
		for (let addr of addresses) {
			let data = keysMap[addr];
			if (data.reserved) {
				continue;
			}
			if (data.satoshis === 0) {
				continue;
			}

			// TODO denominations.includes(data.satoshis)
			let isUndenominated = data.satoshis % DENOM_LOWEST;
			if (isUndenominated) {
				if (data.satoshis >= PREDENOM_MIN) {
					denominable.push(data);
				}
				continue;
			}

			if (!denominated[data.satoshis]) {
				denominated[data.satoshis] = [];
			}
			denomCount += 1;
			denominated[data.satoshis].push(data);
		}

		// CAVEAT: this fee-approximation strategy that guarantees
		// to denominate all coins _correctly_, but in some cases will
		// create _smaller_ denominations than necessary - specifically
		// 10 x 100001 instead of 1 x 1000010 when the lowest order of
		// coin is near the single coin value (i.e. 551000010)
		// (because 551000010 / 100194 yields 5499 x 100001 coins + full fees,
		// but we actually only generate 5 + 4 + 9 + 9 = 27 coins, leaving
		// well over 5472 * 193 extra value)
		for (let data of denominable) {
			console.log('[debug] denominable', data);
			if (denomCount >= MIN_DENOMINATED) {
				break;
			}

			let fee = data.satoshis;

			// 123 means
			//   - 3 x   100001
			//   - 2 x  1000010
			//   - 1 x 10000100
			let order = data.satoshis / PREDENOM_MIN;
			order = Math.floor(order);
			let orderStr = order.toString();
			// TODO mod and divide to loop and shift positions, rather than stringify
			let orders = orderStr.split('');
			orders.reverse();

			// TODO Math.min(orders.length, STANDARD_DENOMS.length);
			// let numOutputs = 0;
			let denomOutputs = [];
			// let magnitudes = [0];
			for (let i = 0; i < orders.length; i += 1) {
				let order = orders[i];
				let count = parseInt(order, 10);
				let orderSingle = DENOM_LOWEST * Math.pow(10, i);
				// let orderTotal = count * orderSingle;
				// numOutputs += count;
				for (let i = 0; i < count; i += 1) {
					fee -= orderSingle;
					denomOutputs.push({
						satoshis: orderSingle,
					});
				}
				// magnitudes.push(count);
			}
			// example:
			//   [ 0, 3, 2, 1 ]
			//   - 0 x 100001 * 0
			//   - 3 x 100001 * 1
			//   - 2 x 100001 * 10
			//   - 1 x 100001 * 100

			console.log('[debug] denom outputs', denomOutputs);
			console.log('[debug] fee', fee);
			// Note: this is where we reconcile the difference between
			// the number of the smallest denom, and the number of actual denoms
			// (and where we may end up with 10 x LOWEST, which we could carry
			// over into the next tier, but won't right now for simplicity).
			for (;;) {
				let numInputs = 1;
				let fees = DashTx._appraiseCounts(numInputs, denomOutputs.length + 1);
				let nextCoinCost = DENOM_LOWEST + fees.max;
				if (fee < nextCoinCost) {
					// TODO split out 10200 (or 10193) collaterals as well
					break;
				}
				fee -= DashTx.OUTPUT_SIZE;
				fee -= DENOM_LOWEST;
				denomOutputs.push({
					satoshis: DENOM_LOWEST,
				});
				// numOutputs += 1;
				// magnitudes[1] += 1;
			}
			console.log('[debug] denom outputs', denomOutputs);

			let changes = [];
			for (let addr of addresses) {
				if (denomOutputs.length === 0) {
					break;
				}

				let unused = unusedMap[addr];
				if (!unused) {
					continue;
				}

				unused.reserved = Date.now();
				delete unusedMap[addr];

				let denomValue = denomOutputs.pop();
				if (!denomValue) {
					break;
				}

				unused.satoshis = denomValue.satoshis;
				changes.push(unused);
			}

			let txInfo;
			{
				let utxosRpc = await rpc.getAddressUtxos({ addresses: [data.address] });
				let utxos = utxosRpc.result;
				for (let utxo of utxos) {
					console.log('[debug] input utxo', utxo);
					// utxo.sigHashType = 0x01;
					utxo.address = data.address;
					if (utxo.txid) {
						// TODO fix in dashtx
						utxo.txId = utxo.txid;
					}
				}
				for (let change of changes) {
					let pubKeyHashBytes = await DashKeys.addrToPkh(change.address, {
						version: 'testnet',
					});
					change.pubKeyHash = DashKeys.utils.bytesToHex(pubKeyHashBytes);
				}

				txInfo = {
					version: 3,
					inputs: utxos,
					outputs: changes,
					locktime: 0,
				};
				txInfo.inputs.sort(DashTx.sortInputs);
				txInfo.outputs.sort(DashTx.sortOutputs);
			}

			let keys = [];
			for (let input of txInfo.inputs) {
				let data = keysMap[input.address];
				let addressKey = await xreceiveKey.deriveAddress(data.index);
				keys.push(addressKey.privateKey);
				// DEBUG check pkh hex
				let pubKeyHashBytes = await DashKeys.addrToPkh(data.address, {
					version: 'testnet',
				});
				data.pubKeyHash = DashKeys.utils.bytesToHex(pubKeyHashBytes);
				console.log(data);
			}
			let txInfoSigned = await dashTx.hashAndSignAll(txInfo, keys);

			console.log('[debug], txInfo, keys, txSigned');
			console.log(txInfo);
			console.log(keys);
			console.log(txInfoSigned);
			await sleep(150);
			let txRpc = await rpc.sendRawTransaction(txInfoSigned.transaction);
			await sleep(150);
			console.log('[debug] txRpc.result', txRpc.result);

			// TODO don't add collateral coins
			for (let change of changes) {
				denomCount += 1;
				if (!denominated[change.satoshis]) {
					denominated[change.satoshis] = [];
				}
				denominated[change.satoshis].push(change);
			}
		}
	}

	async function generateToAddress(data) {
		let numBlocks = 1;
		await sleep(150);
		void (await rpc.generateToAddress(numBlocks, data.address));
		await sleep(150);
		// let blocksRpc = await rpc.generateToAddress(numBlocks, addr);
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

		let utxosRpc = await rpc.getAddressUtxos({ addresses: [data.address] });
		let utxos = utxosRpc.result;
		for (let utxo of utxos) {
			// console.log(data.index, '[debug] utxo.satoshis', utxo.satoshis);
			data.satoshis += utxo.satoshis;
			totalBalance += utxo.satoshis;
			keysMap[utxo.address].used = true;
			delete unusedMap[utxo.address];
		}
	}

	async function getCollateralTx({ denomination }) {
		let largest = { satoshis: 0 };
		let change;
		for (let addr of addresses) {
			let data = keysMap[addr];
			// console.log(data);
			if (data.reserved) {
				continue;
			}
			if (data.satoshis > largest.satoshis) {
				largest = data;
				largest.reserved = Date.now();
				// console.log('[debug] new largest:', largest);
			}
			if (data.used) {
				continue;
			}
			if (!change) {
				change = data;
				data.used = true;
			}

			// console.log('[debug] totalBalance:', totalBalance);
			if (totalBalance >= MIN_BALANCE) {
				break;
			}

			let numBlocks = 1;
			await sleep(150);
			void (await rpc.generateToAddress(numBlocks, addr));
			await sleep(150);
			// let blocksRpc = await rpc.generateToAddress(numBlocks, addr);
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
				// console.log(data.index, '[debug] utxo.satoshis', utxo.satoshis);
				data.satoshis += utxo.satoshis;
				totalBalance += utxo.satoshis;
				keysMap[utxo.address].used = true;
				delete unusedMap[utxo.address];
			}
		}
		console.log('[debug] largest coin:', largest);

		let collateralTxInfo;
		{
			let addr = largest.address;
			let utxosRpc = await rpc.getAddressUtxos({ addresses: [addr] });
			let utxos = utxosRpc.result;
			let fee = CoinJoin.COLLATERAL;
			for (let utxo of utxos) {
				console.log('[debug] input utxo', utxo);
				// utxo.sigHashType = 0x01;
				utxo.address = addr;
				if (utxo.txid) {
					// TODO fix in dashtx
					utxo.txId = utxo.txid;
				}
			}
			let output = Object.assign({}, change);
			let pubKeyHashBytes = await DashKeys.addrToPkh(change.address, {
				version: 'testnet',
			});
			output.pubKeyHash = DashKeys.utils.bytesToHex(pubKeyHashBytes);
			output.satoshis = largest.satoshis - fee;
			// TODO
			// if (collateralUtxoIsDust) {
			//     output = { memo: '', satoshis: 0 };
			// }
			console.log('[debug] change', change);
			let txInfo = {
				version: 3,
				inputs: utxos,
				outputs: [output],
				locktime: 0,
			};
			txInfo.inputs.sort(DashTx.sortInputs);
			txInfo.outputs.sort(DashTx.sortOutputs);

			collateralTxInfo = txInfo;
		}
		console.log('[debug] dsa collateral tx', collateralTxInfo);
		return collateralTxInfo;
	}

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

	// void shuffle(evonodes);
	evonodes.sort(byId);
	let evonode = evonodes.at(-1);
	console.info('[info] chosen evonode:');
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
		console.error('Error:');
		console.error(err);
		conn.removeListener('error', onError);
		errReject(err);
	}
	function onEnd() {
		console.info('[info] disconnected from server');
	}
	conn.on('error', onError);
	conn.once('end', onEnd);
	conn.setMaxListeners(2);
	let dataCount = 0;
	conn.on('data', function (data) {
		console.log('[DEBUG] data');
		console.log(dataCount, data.length, data.toString('hex'));
		dataCount += 1;
	});

	let messages = [];
	let listenerMap = {};
	async function goRead() {
		let pongSize = Packer.HEADER_SIZE + Packer.PING_SIZE;
		let pongMessageBytes = new Uint8Array(pongSize);
		for (;;) {
			console.log('[debug] readMessage()');
			let msg = await readMessage();
			if (msg.command === 'ping') {
				void Packer.packPong({
					network: network,
					message: pongMessageBytes,
					nonce: msg.payload,
				});
				console.log('[debug] pong', pongMessageBytes);
				conn.write(pongMessageBytes);
				continue;
			}
			// console.log('[DEBUG] readMessage', msg);
			// console.log('[DEBUG] msg.command', msg.command);
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
			console.log("[debug] readMessage handlers: remove 'onReadableHeader'");
			conn.removeListener('data', onReadableHeader);
			conn.removeListener('readable', onReadableHeader);

			console.log("[debug] readMessage handlers: remove 'onReadablePayload'");
			conn.removeListener('data', onReadablePayload);
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
			let size = data?.length || 0;
			console.log('State: reading header', size);
			let chunk;
			for (;;) {
				chunk = data;
				// chunk = conn.read(); // TODO reenable
				if (!chunk) {
					break;
				}
				chunks.push(chunk);
				chunksLength += chunk.byteLength;
				data = null; // TODO nix
			}
			if (chunksLength < HEADER_SIZE) {
				return;
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
				throw new Error('too big you are, handle you I cannot');
			}
			// console.log('DEBUG header', header);
			conn.removeListener('readable', onReadableHeader);
			conn.removeListener('data', onReadableHeader);

			if (header.payloadSize === 0) {
				resolve(header);
				return;
			}

			console.log("[debug] readMessage handlers: add 'onReadablePayload'");
			//conn.on('readable', onReadablePayload);
			conn.on('data', onReadablePayload);
			onReadablePayload(null);
		}

		function onReadablePayload(data) {
			let size = data?.length || 0;
			console.log('State: reading payload', size);
			let chunk;
			for (;;) {
				chunk = data;
				// chunk = conn.read(); // TODO revert
				if (!chunk) {
					break;
				}
				chunks.push(chunk);
				chunksLength += chunk.byteLength;
				data = null; // TODO nix
			}
			if (chunksLength < header.payloadSize) {
				return;
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

		console.log("[debug] readMessage handlers: add 'onReadableHeader'");
		//conn.on('readable', onReadableHeader);
		conn.on('data', onReadableHeader);

		if (chunks.length) {
			onReadableHeader(null);
		}

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

	//
	// version / verack
	//
	let versionMsg = Packer.version({
		network: network, // Packer.NETWORKS.regtest,
		//protocol_version: Packer.PROTOCOL_VERSION,
		//addr_recv_services: [Packer.IDENTIFIER_SERVICES.NETWORK],
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

	// let versionBuffer = Buffer.from(versionMsg);
	// console.log('version', versionBuffer.toString('hex'));
	// console.log(Parser.parseHeader(versionBuffer.slice(0, 24)));
	// console.log(Parser.parseVerack(versionBuffer.slice(24)));

	{
		let versionP = new Promise(function (resolve, reject) {
			listenerMap['version'] = async function (message) {
				let version = await Parser.parseVersion(message.payload);
				console.log('DEBUG version', version);
				resolve();
				listenerMap['version'] = null;
				delete listenerMap['version'];
			};
		});
		await sleep(150);
		conn.write(versionMsg);

		await versionP;
	}

	{
		let verackP = await new Promise(function (resolve, reject) {
			listenerMap['verack'] = async function (message) {
				if (message.command !== 'verack') {
					return;
				}

				console.log('DEBUG verack', message);
				resolve();
				listenerMap['verack'] = null;
				delete listenerMap['verack'];
			};
		});
		let verackBytes = Packer.packMessage({
			network,
			command: 'verack',
			payload: null,
		});
		await sleep(150);
		conn.write(verackBytes);

		await verackP;
	}

	{
		let mnauthP = new Promise(function (resolve, reject) {
			listenerMap['mnauth'] = async function (message) {
				if (message.command !== 'mnauth') {
					return;
				}

				resolve();
				listenerMap['mnauth'] = null;
				delete listenerMap['mnauth'];
			};
		});

		let senddsqP = new Promise(function (resolve, reject) {
			listenerMap['senddsq'] = async function (message) {
				if (message.command !== 'senddsq') {
					return;
				}

				let sendDsqMessage = Packer.packSendDsq({
					network: network,
					send: true,
				});
				await sleep(150);
				conn.write(sendDsqMessage);
				console.log("[debug] sending 'senddsq':", sendDsqMessage);

				resolve();
				listenerMap['senddsq'] = null;
				delete listenerMap['senddsq'];
			};
		});

		// TODO setTimeout
		// void new Promise(function (resolve, reject) {
		listenerMap['dssu'] = async function (message) {
			if (message.command !== 'dssu') {
				return;
			}

			let dssu = await Parser.parseDssu(message.payload);
			console.log('DEBUG dssu', dssu);

			// resolve(dssu);
			listenerMap['dssu'] = null;
			delete listenerMap['dssu'];
		};
		// });

		await mnauthP;
		await senddsqP;
	}

	{
		let dsqPromise = new Promise(readDsq);
		//
		// dsa / dssu + dsq
		//
		//for (let i = 0; i < minimumParticipants; i += 1)
		let denomination = 100001 * 1;
		let collateralTx;
		{
			void (await generateMinBalance());
			void (await generateDenominations());

			let collateralTxInfo = await getCollateralTx({ denomination });
			let keys = [];
			for (let input of collateralTxInfo.inputs) {
				let data = keysMap[input.address];
				let addressKey = await xreceiveKey.deriveAddress(data.index);
				keys.push(addressKey.privateKey);
			}
			let txInfoSigned = await dashTx.hashAndSignAll(collateralTxInfo, keys);
			collateralTx = DashTx.utils.hexToBytes(txInfoSigned.transaction);
		}
		let dsaMsg = await Packer.packAllow({
			network,
			denomination,
			collateralTx,
		});
		await sleep(150);
		conn.write(dsaMsg);

		let dsaBuf = Buffer.from(dsaMsg);
		console.log('[debug] dsa', dsaBuf.toString('hex'));

		let dsq = await dsqPromise;
		for (; !dsq.ready; ) {
			dsq = await new Promise(readDsq);
			if (dsq.ready) {
				break;
			}
		}
	}

	function readDsq(resolve, reject) {
		listenerMap['dsq'] = async function (message) {
			if (message.command !== 'dsq') {
				return;
			}

			let dsq = await Parser.parseDsq(message.payload);
			console.log('DEBUG dsq', dsq);

			resolve(dsq);
			listenerMap['dsq'] = null;
			delete listenerMap['dsq'];
		};
	}

	console.log('exiting?');
}

function byId(a, b) {
	if (a.id > b.id) {
		return 1;
	}
	if (a.id < b.id) {
		return -1;
	}
	return 0;
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

function sleep(ms) {
	return new Promise(function (resolve) {
		setTimeout(resolve, ms);
	});
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
