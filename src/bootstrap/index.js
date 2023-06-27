'use strict';

/**
 * - lmdb file should be ~/.dashjoinjs/<INSTANCE_NAME>/db/data.mdb
 *
 */

const xt = require('@mentoc/xtract').xt;
const Network = require('../network.js');
const MetaDB = require('./metadb.js');

let Bootstrap = {};
module.exports = Bootstrap;

let cproc = require('child_process');

const crypto = require('crypto');
const fs = require('fs');

/**
 * TODO: move to import via utils lib
 */
function bigint_safe_json_stringify(buffer, stringify_space = 2) {
	return JSON.stringify(
		buffer,
		(key, value) =>
			typeof value === 'bigint' ? value.toString() + 'n' : value,
		stringify_space
	);
}
function uniqueByKey(array, key) {
	let map = {};
	let saved = [];
	for (const ele of array) {
		if (typeof map[ele[key]] !== 'undefined') {
			continue;
		}
		map[ele[key]] = 1;
		saved.push(ele);
	}
	return saved;
}
function flatten(arr) {
	if (arr.length === 1 && Array.isArray(arr[0])) {
		return flatten(arr[0]);
	}
	if (!Array.isArray(arr)) {
		return arr;
	}
	if (Array.isArray(arr) && !Array.isArray(arr[0])) {
		return arr[0];
	}
	return arr;
}
Bootstrap._dsftest1 = async function (buffer, username) {
	//let utxos = await Bootstrap.get_denominated_utxos(
	//  "7250bb2a2e294f728081f50ee2bdd3a1",
	//  100001
	//);
	//dd(utxos);
	/**
   * Network.packet.parse.dsf is not async
   */
	let parsed = Network.packet.parse.dsf(buffer);
	if (extractOption('verbose')) {
		dump_parsed(parsed);
	}
	let sourceAddress = 'yS21kYR1kcgmLi9sUPArp6whJKBoXa42fb';

	const inputs = xt(parsed, 'transaction.inputs');
	let utxos = {
		txId: inputs[0].txid,
		outputIndex: inputs[0].vout,
		sequenceNumber: 0xffffffff,
		scriptPubKey: Script.buildPublicKeyHashOut(sourceAddress),
		satoshis: 100001,
	};
	let privateKey = await Bootstrap.get_private_key(
		username,
		sourceAddress
	).catch(function (error) {
		console.error('Error: get_private_key failed with:', error);
		return null;
	});
	if (privateKey === null) {
		throw new Error('no private key could be found');
	}
	privateKey = flatten(privateKey);
	/**
   *
PublicKeyHashInput {
  output: Output {
    _satoshisBN: BN { negative: 0, words: [Array], length: 1, red: null },
    _satoshis: 100001,
    _scriptBuffer: <Buffer 76 a9 14 3e 84 bb a1 86 81 f7 fb b3 f4 be c4 ca e6 44 d1 b0 80 bc 44 88 ac>,
    _script: Script { chunks: [Array], _isOutput: true }
  },
  prevTxId: <Buffer a4 00 9c d7 be 36 c0 b4 1e 70 46 72 3e 51 60 4a 1a 5d 7e 7e 2a eb 90 24 fb ea fc d0 7b 44 e7 53>,
  outputIndex: 0,
  sequenceNumber: 4294967295,
  _script: Script { chunks: [ [Object], [Object] ], _isInput: true },
  _scriptBuffer: <Buffer 47 30 44 02 20 7f 83 84 3b b7 36 c2 3f 78 b4 46 d6 8c 96 93 f1 ea be b4 9d 52 46 dc 44 95 0c bd 89 b1 f3 2e bb 02 20 4a 21 e3 e7 6c 70 32 3f 7b 2b 46 ... 56 more bytes>
}
*/

	let tx = new Transaction().from(utxos).sign(privateKey);
	let sigScript = tx.inputs[0]._scriptBuffer;
	let encodedScript = sigScript.toString('hex');
	let len = encodedScript.length / 2;
	let payload = new Uint8Array([len, ...hexToBytes(encodedScript)]);
	d(sigScript.toString('hex'));
	dd(payload);
};
Bootstrap.increment_key = async function (username, key_name) {
	db_cj_ns([username, 'counters']);
	let ctr = await db_get(key_name);
	if (typeof ctr === 'undefined' || ctr === null) {
		ctr = 0;
	}
	ctr = parseInt(ctr, 10);
	if (isNaN(ctr)) {
		ctr = 0;
	}
	++ctr;
	await db_put(key_name, String(ctr));
	return ctr;
};
Bootstrap.get_address_from_txid = async function (username, txid) {
	await Bootstrap.unlock_all_wallets();
	let addresses = await Bootstrap.user_addresses(username);
	for (const address of addresses) {
		let ps = await Bootstrap.wallet_exec(username, [
			'getaddresstxids',
			`"${sanitize_address(address)}"`,
		]);
		let { out, err } = ps_extract(ps);
		if (err.length) {
			console.error({ err });
			throw new Error(err);
		}
		out = out.split('\n').map(function (c) {
			return String(c)
				.replace(/^\s*["]{1}/, '')
				.replace(/[",]{1,2}.*$/, '');
		});
		if (out.indexOf(txid) !== -1) {
			return address;
		}
	}
	throw new Error('none found');
};
Bootstrap.decode_raw_transaction = async function (username, rawTx) {
	let ps = await Bootstrap.wallet_exec(username, [
		'decoderawtransaction',
		sanitize_txid(rawTx),
	]);
	let { out, err } = ps_extract(ps);
	if (err.length) {
		throw new Error(err);
	}
	if (out.length) {
		return out;
	}
};
Bootstrap.raw_transaction = async function (username, txid) {
	let ps = await Bootstrap.wallet_exec(username, [
		'getrawtransaction',
		sanitize_txid(txid),
	]);
	let { out, err } = ps_extract(ps);
	if (err.length) {
		throw new Error(err);
	}
	if (out.length) {
		return out;
	}
};
Bootstrap.store_dsf = async function (data) {
	if (data instanceof Uint8Array) {
		data = data.toString();
	}
	return await Bootstrap.meta_store(['example', 'payloads'], 'dsf', data);
};
Bootstrap.dsf_list = async function () {
	return await Bootstrap.meta_get(['example', 'payloads'], 'dsf');
};
function arbuf_to_hexstr(buffer) {
	// buffer is an ArrayBuffer
	return [...new Uint8Array(buffer)]
		.map((x) => x.toString(16).padStart(2, '0'))
		.join('');
}
Bootstrap.ps_extract = ps_extract;
function ps_extract(ps, newlines = true) {
	let out = ps.stdout.toString();
	let err = ps.stderr.toString();
	out = out.replace(/^[\s]+/, '').replace(/[\s]+$/, '');
	err = err.replace(/^[\s]+/, '').replace(/[\s]+$/, '');
	if (!newlines) {
		out = out.replace(/[\n]+$/, '');
		err = err.replace(/[\n]+$/, '');
	}
	return { err, out };
}
Bootstrap.set_dash_cli = function (p) {
	Bootstrap.DASH_CLI = p;
};
Bootstrap.get_dash_cli = function (p) {
	return Bootstrap.DASH_CLI;
};
Bootstrap.get_config = function () {
	Bootstrap.__config = {
		db: {
			handle: Bootstrap.DB,
		},
		helpers: Bootstrap.helpers(),
		instance: Bootstrap.__data.instance,
	};
	return Bootstrap.__config;
};
Bootstrap.__data = {
	instance: {
		name: 'base',
		db_path: null,
		db_name: 'dash',
		max_dbs: 10,
	},
};
Bootstrap.shuffle = function (a) {
	/**
   * Shuffles array in place.
   * @param {Array} a items An array containing the items.
   */
	let j, x, i;
	for (i = a.length - 1; i > 0; i--) {
		j = Math.floor(Math.random() * (i + 1));
		x = a[i];
		a[i] = a[j];
		a[j] = x;
	}
	return a;
};
Bootstrap.filter_shuffle_address_count = async function (
	username,
	except,
	count
) {
	let addr = await Bootstrap.user_addresses(username);
	addr = Bootstrap.shuffle(addr);
	let selected = [];
	let selectedMap = {};
	for (const a of addr) {
		if (except.indexOf(a) === -1) {
			if (typeof selectedMap[a] !== 'undefined') {
				continue;
			}
			selectedMap[a] = 1;
			selected.push(a);
			if (selected.length === count) {
				return selected;
			}
		}
	}
};
Bootstrap.filter_shuffle_address = async function (username, except) {
	let addr = await Bootstrap.user_addresses(username);
	addr = Bootstrap.shuffle(addr);
	if (except.length === 0) {
		return addr[0];
	}
	for (const a of addr) {
		if (except.indexOf(a) === -1) {
			return a;
		}
	}
};
Bootstrap.filter_denominated_transaction = async function (
	username,
	denominatedAmount,
	count,
	except
) {
	let utxos = await Bootstrap.get_denominated_utxos(
		username,
		denominatedAmount
	);
	let selected = [];
	let selMap = {};
	for (const utxo of utxos) {
		if (except.indexOf(utxo.txid) !== -1) {
			continue;
		}
		if (typeof selMap[utxo.txid] === 'undefined') {
			selMap[utxo.txid] = 1;
			selected.push(utxo);
			if (selected.length === count) {
				return selected;
			}
		}
	}
	throw new Error('Couldn\'t find enough transactions');
};
Bootstrap.random_change_address = async function (username, except) {
	let addr = await Bootstrap.user_addresses(username);
	addr = Bootstrap.shuffle(addr);
	for (const a of addr) {
		if (except.indexOf(a) === -1) {
			return a;
		}
	}
};
Bootstrap.mkpath = async function (path) {
	await cproc.spawnSync('mkdir', ['-p', path]);
};

Bootstrap.random_name = async function () {
	return crypto.randomUUID().replace(/\-/gi, '');
};

Bootstrap.run = async function (cli_arguments) {
	return await cproc.spawnSync(Bootstrap.DASH_CLI, cli_args(cli_arguments));
};

Bootstrap.__error = null;

function cli_args(list) {
	return [
		'-conf=' + process.env.HOME + '/.dashmate/local_seed/core/dash.conf',
		...list,
	];
}

let db_cj, db_cj_ns, db_put, db_get, db_append;

function sanitize_txid(txid) {
	return txid.replace(/[^a-f0-9]+/gi, '').replace(/[\n]+$/, '');
}
function sanitize_address(address) {
	return address.replace(/[^a-zA-Z0-9]+/gi, '').replace(/[\n]+$/, '');
}

function sanitize_addresses(list) {
	let flist = [];
	for (const row of list) {
		flist.push(row.replace(/[^a-zA-Z0-9]+/gi, ''));
	}
	return flist;
}

Bootstrap.load_instance = async function (instance_name) {
	Bootstrap.DASH_CLI = [process.env.HOME, 'bin', 'dash-cli'].join('/');
	Bootstrap.DB = require('../lmdb/lmdb.js');
	Bootstrap.__data.instance.name = instance_name;
	if (!Bootstrap.sane_instance()) {
		throw new Error(`Couldn't load instance: "${Bootstrap.__error}"`);
	}
	let n = Bootstrap.__data.instance.name;
	let db_path = [process.env.HOME, '.dashjoinjs', n, 'db'].join('/');
	Bootstrap.__data.instance.db_path = db_path;
	await Bootstrap.mkpath(db_path);

	let exists = await fs.existsSync(db_path.replace(/\/$/, '') + '/data.mdb');
	Bootstrap.DB.open({
		path: db_path,
		db_name: Bootstrap.__data.instance.db_name,
		create: !exists,
		maxDbs: Bootstrap.__data.instance.max_dbs,
		mapSize: 32 * 1024 * 1024,
	});
	Bootstrap.MetaDB = MetaDB(Bootstrap.DB);
	db_cj = Bootstrap.MetaDB.db_cj;
	db_cj_ns = Bootstrap.MetaDB.db_cj_ns;
	db_get = Bootstrap.MetaDB.db_get;
	db_put = Bootstrap.MetaDB.db_put;
	db_append = Bootstrap.MetaDB.db_append;
	Bootstrap.meta_get = Bootstrap.MetaDB.meta_get;
	Bootstrap.meta_store = Bootstrap.MetaDB.meta_store;
	Bootstrap.meta_set = Bootstrap.MetaDB.meta_set;
	db_cj();
	return Bootstrap;
};

Bootstrap.sane_instance = function () {
	if (typeof Bootstrap.__data.instance.name === 'undefined') {
		Bootstrap.__error = 'instance structure corrupt';
		return false;
	}
	let n = Bootstrap.__data.instance.name;
	if (n === null || String(n).length === 0) {
		Bootstrap.__error = 'empty instance name';
		return false;
	}
	Bootstrap.__data.instance.name = n.replace(/[^a-z0-9_]+/gi, '');
	if (Bootstrap.__data.instance.name.length === 0) {
		Bootstrap.__error = 'after sanitization: empty instance name';
		return false;
	}
	return true;
};
Bootstrap.user_list = async function () {
	db_cj();
	let list = db_get('users');
	try {
		list = JSON.parse(list);
		if (!Array.isArray(list)) {
			return [];
		}
		return list;
	} catch (e) {
		return [];
	}
};

Bootstrap.user_addresses = async function (username) {
	return await Bootstrap.meta_get(username, 'addresses');
};
Bootstrap.sanitize_address = sanitize_address;

Bootstrap.user_utxos_from_cli = async function (username, addresses) {
	let utxos = [];
	for (const address of addresses) {
		let ps = await Bootstrap.wallet_exec(username, [
			'getaddressutxos',
			JSON.stringify({ addresses: [Bootstrap.sanitize_address(address)] }),
		]);
		let { err, out } = ps_extract(ps);
		if (err.length) {
			console.error(err);
		} else {
			try {
				let txns = JSON.parse(out);
				utxos.push(txns);
			} catch (e) {
				d(e);
			}
		}
	}
	return utxos;
};
Bootstrap.user_exists = async function (username) {
	let users = await Bootstrap.user_list();
	for (const user of users) {
		if (user === username) {
			return true;
		}
	}
	return false;
};

Bootstrap.user_create = async function (username) {
	db_cj();
	let list = db_get('users');
	try {
		list = JSON.parse(list);
		if (!Array.isArray(list)) {
			list = [];
		}
	} catch (e) {
		list = [];
	}
	for (let user of list) {
		if (user === username) {
			throw new Error('user already exists');
		}
	}
	list.push(username);
	db_put('users', JSON.stringify(list));
};

Bootstrap.wallet_exec = async function (wallet_name, cli_arguments) {
	return await cproc.spawnSync(
		Bootstrap.DASH_CLI,
		cli_args([`-rpcwallet=${wallet_name}`, ...cli_arguments])
	);
};
Bootstrap.get_change_address_from_cli = async function (username) {
	let buffer = await Bootstrap.wallet_exec(username, ['getrawchangeaddress']);
	let { err, out } = ps_extract(buffer, false);
	if (out.length) {
		return out;
	}
};
Bootstrap.get_change_addresses = async function (username) {
	return await Bootstrap.meta_get([username, 'change'], 'addresses');
};
Bootstrap.store_change_addresses = async function (username, w_addresses) {
	return await Bootstrap.meta_store(
		[username, 'change'],
		'addresses',
		sanitize_addresses(w_addresses)
	);
};
Bootstrap.normalize_pk = async function (privateKey) {
	if (Array.isArray(privateKey)) {
		if (Array.isArray(privateKey[0])) {
			return privateKey[0][0];
		}
	}
	return privateKey;
};
Bootstrap.get_private_key = async function (username, address) {
	let pk = await Bootstrap.meta_get([username, 'privatekey'], address).catch(
		function (error) {
			console.error('Error: get_private_key:', error);
			return null;
		}
	);
	if (!pk) {
		return null;
	}
	return flatten(pk);
};
Bootstrap.store_addresses = async function (username, w_addresses) {
	return await Bootstrap.meta_store(
		username,
		'addresses',
		sanitize_addresses(w_addresses)
	);
};

Bootstrap.get_denominated_utxos = async function (username, denominatedAmount) {
	let addresses = await Bootstrap.user_addresses(username);
	let utxos = await Bootstrap.user_utxos_from_cli(username, addresses);
	let matches = [];
	for (const batch of utxos) {
		for (const ut of batch) {
			if (ut.satoshis === parseInt(denominatedAmount, 10)) {
				let used = await Bootstrap.is_txid_used(username, ut.txid);
				if (used) {
					continue;
				}
				matches.push(ut);
			}
		}
	}
	return matches;
};

/**
 * Returns a user that is not `forUser`
 */
Bootstrap.get_random_payee = async function (forUser) {
	let users = await Bootstrap.user_list();
	users = Bootstrap.shuffle(users);
	for (const user of users) {
		if (user !== forUser) {
			return user;
		}
	}
};

Bootstrap.random_payee_address = async function (forUser) {
	let users = await Bootstrap.user_list();
	users = Bootstrap.shuffle(users);
	for (const user of users) {
		if (user !== forUser) {
			let addresses = await Bootstrap.get_addresses(user);
			addresses = Bootstrap.shuffle(addresses);
			return { user: user, address: addresses[0] };
		}
	}
};
Bootstrap.filter_address = async function (username, except) {
	let addresses = await Bootstrap.meta_get(username, 'addresses');
	let keep = [];
	for (const address of addresses) {
		if (except.indexOf(address) === -1) {
			keep.push(address);
		}
	}
	return keep;
};
Bootstrap.get_addresses = async function (username) {
	return await Bootstrap.meta_get(username, 'addresses');
};
Bootstrap.store_addresses = async function (username, w_addresses) {
	return await Bootstrap.meta_store(
		username,
		'addresses',
		sanitize_addresses(w_addresses)
	);
};

Bootstrap.get_users_with_denominated_utxos = async function (userDenoms) {
	//await Bootstrap.unlock_all_wallets();
	let users = await Bootstrap.user_list();
	let usersWithDenoms = [];
	for (const userName of users) {
		let utxos = await Bootstrap.get_denominated_utxos(userName, userDenoms);
		if (utxos.length === 0) {
			continue;
		}
		usersWithDenoms.push(userName);
	}
	return unique(usersWithDenoms);
};
Bootstrap.create_wallets = async function (count = 10) {
	for (let ctr = 0; ctr < count; ctr++) {
		let wallet_name = await Bootstrap.random_name();
		await Bootstrap.user_create(wallet_name).catch(function (error) {
			console.error('ERROR: ', error);
		});
		console.info(`[ok]: user "${wallet_name}" created`);
		await Bootstrap.run([
			'createwallet',
			wallet_name,
			'false',
			'false',
			'foobar',
			'false',
			'true',
		]);
		console.info(`[ok]: wallet "${wallet_name}" created`);

		let w_addresses = [];
		for (let actr = 0; actr < 10; actr++) {
			let buffer = await Bootstrap.wallet_exec(wallet_name, ['getnewaddress']);
			let { err, out } = ps_extract(buffer, false);
			if (out.length) {
				w_addresses.push(out);
			}
		}
		await Bootstrap.store_addresses(
			wallet_name,
			sanitize_addresses(w_addresses)
		);
		await Bootstrap.unlock_wallet(wallet_name);
	}
	await Bootstrap.unlock_all_wallets();
	await Bootstrap.dump_all_privkeys();
	await Bootstrap.generate_dash_to_all();
	await Bootstrap.create_denominations_to_all();
};
Bootstrap.create_denominations_to_all = async function () {
	/**
   * Loop through all wallets and send the lowest denomination to
   * all other users
   */
	let users = await Bootstrap.user_list();
	for (const user of users) {
		await Bootstrap.unlock_wallet(user);
		for (const otherUser of users) {
			if (otherUser === user) {
				continue;
			}
			let addresses = await Bootstrap.user_addresses(otherUser);
			for (const address of addresses) {
				for (let i = 0; i < 10; i++) {
					let ps = await Bootstrap.wallet_exec(user, [
						'sendtoaddress',
						address,
						'0.00100001',
					]);
					let { out, err } = ps_extract(ps);
					if (out.length) {
						console.log(out);
					}
					if (err.length) {
						console.error(err);
					}
				}
			}
		}
	}
};
Bootstrap.unlock_wallet = async function (username) {
	return await Bootstrap.run(
		cli_args([
			`-rpcwallet=${username}`,
			'walletpassphrase',
			'foobar',
			'100000000',
		])
	);
};

Bootstrap.unlock_all_wallets = async function (options = {}) {
	let errors = [];
	let keep = [];
	let silent = true;
	if (typeof options.verbose !== 'undefined' && options.verbose === true) {
		silent = false;
	}
	const users = await Bootstrap.user_list();
	for (const user of users) {
		if (!silent) {
			process.stdout.write(`[ ] unlocking "${user}"...`);
		}
		let ps = await Bootstrap.unlock_wallet(user);
		let err = ps.stderr.toString();
		err = err.replace(/[\s]+$/i, '');
		if (err.length) {
			if (!silent) {
				console.log('[x] ERROR');
			}
			errors.push(user);
		} else {
			if (!silent) {
				console.log('[+] unlocked');
			}
			keep.push(user);
		}
	}
	if (!silent) {
		console.info('The following wallets should probably be cleaned up:');
		console.info(JSON.stringify(errors, null, 2));
	}
	return {
		bad_wallets: errors,
		good_wallets: keep,
	};
};

function trim(s) {
	let f = s.replace(/[\s]+$/, '');
	f.replace(/^[\s]+/, '');
	return f;
}

Bootstrap.dump_private_key = async function (username, address) {
	let ps = await Bootstrap.wallet_exec(username, ['dumpprivkey', address]);
	let err = trim(ps.stderr.toString());
	let out = trim(ps.stdout.toString());
	if (out.length) {
		return out;
	}
	throw new Error(`dumpprivkey failed: "${err}"`);
};

Bootstrap.dump_all_privkeys = async function () {
	let keep = [];
	const users = await Bootstrap.user_list();
	for (const user of users) {
		const addresses = await Bootstrap.get_addresses(user);
		if (Array.isArray(addresses) === false || addresses.length === 0) {
			continue;
		}
		for (const address of addresses) {
			let privateKey = await Bootstrap.dump_private_key(user, address).catch(
				function (error) {
					console.error(error);
					return null;
				}
			);
			if (privateKey === null) {
				continue;
			}
			keep.push({ user, privateKey, address });
		}
	}
	for (const pair of keep) {
		let r = await Bootstrap.meta_set(
			[pair.user, 'privatekey'],
			pair.address,
			pair.privateKey
		);
	}
};
Bootstrap.generate_dash_to_all = async function () {
	let keep = [];
	const users = await Bootstrap.user_list();
	for (const user of users) {
		const addresses = await Bootstrap.get_addresses(user);
		if (Array.isArray(addresses) === false || addresses.length === 0) {
			continue;
		}
		for (const address of addresses) {
			let ps = await Bootstrap.wallet_exec(user, [
				'generatetoaddress',
				'10',
				address,
			]);
			let { err, out } = ps_extract(ps);
			if (err.length) {
				console.error(err);
			} else {
				try {
					let txns = JSON.parse(out);
					await Bootstrap.meta_store([user, 'utxos'], address, txns);
					d({ [user]: address, utxos: out, txns });
				} catch (e) {
					dd(e);
				}
			}
		}
	}
};

Bootstrap.generate_dash_to = async function (username) {
	let keep = [];
	let user = username;
	const addresses = await Bootstrap.get_addresses(user);
	if (Array.isArray(addresses) === false || addresses.length === 0) {
		// TODO: instead, just create a bunch of addresses for the user
		throw new Error(`user: ${username} doesn't have any addresses`);
	}
	for (const address of addresses) {
		let ps = await Bootstrap.wallet_exec(user, [
			'generatetoaddress',
			'10',
			address,
		]);
		let { err, out } = ps_extract(ps);
		if (err.length) {
			console.error(err);
		} else {
			try {
				let txns = JSON.parse(out);
				await Bootstrap.meta_store([user, 'utxos'], address, txns);
				d({ [user]: address, utxos: out, txns });
			} catch (e) {
				dd(e);
			}
		}
	}
};
function d(f) {
	console.debug(f);
}
function dd(f) {
	console.debug(f);
	process.exit();
}

function usage() {
	console.log('Usage: dashboot [options] --instance=N');
	console.log('');
	console.log('# Options');
	console.log('-------------------------------------------------------');
	console.log(
		'--instance=N       Uses N as the instance. If not passed, defaults to "base"'
	);
	console.log('--unlock-all       Unlocks all user wallets.');
	console.log('--addrfromtxid=TX  [EXPERIMENTAL]           ');
	console.log('             i---> Requires --username=U    ');
	console.log('--generate-to=N    Generates DASH to the user named N');
	console.log('--dash-for-all     Generates DASH to EVERY user');
	console.log('--create-wallets   Creates wallets, addresses, and UTXO\'s');
	console.log(
		'--denom-amt=N      Search through user\'s UTXO\'s for denominated amounts matching N'
	);
	console.log(
		'                   denom-amt also requires that you pass in --username=U'
	);
	console.log(
		'--create-denoms    Loops through all wallets and sends each wallet 0.00100001 DASH'
	);
	console.log('--list-users       Lists all users');
	console.log(
		'--user-denoms=AMT  Lists all users with the desired denominated amount'
	);
	console.log('--list-addr=user   Lists all addresses for a user');
	console.log('--list-utxos=user  Lists all UTXO\'s for a user');
	console.log(
		'--wallet-cmd=user  Gives you the ability to call dash-cli for the specified user'
	);
	console.log(
		'--dump-dsf         Dumps the db contents for DSF example payloads that have been logged'
	);
	console.log(
		'--dsf-to=FILE      Dumps the db contents for DSF example payloads to the specified file'
	);
	console.log('');
	console.log('# What are instances?');
	console.log('-------------------------------------------------------');
	console.log(' An instance is just a folder, but it helps in that it ');
	console.log(' it will help you separate wallets on a name basis.    ');
	console.log(' Passing in an instance of "foobar" will create the    ');
	console.log(' following folder:                                     ');
	console.log('   ~/.dashjoinjs/foobar/db/                            ');
	console.log('                                                       ');
	console.log(' Stored in that directory will be the lmdb database    ');
	console.log(' which has all wallet data for that instance. This     ');
	console.log(' makes it trivial to use different datasets by using   ');
	console.log(' different instances.                                  ');
	console.log('                                                       ');
	console.log(' Keep in mind that if you end up deleting an instance  ');
	console.log(' directory, the wallet and all its transaction data    ');
	console.log(' still exists in your dashmate cluster.                ');
	console.log(' This is usually not a problem as the point of dashboot');
	console.log(' is to allow you to easily create lots of wallets and  ');
	console.log(' addresses/utxos really easily.                        ');
	console.log('                                                       ');
	console.log('# Ideal use case                                       ');
	console.log('-------------------------------------------------------');
	console.log(' The ideal usecase is to create a completely brand new ');
	console.log(' dashmate regtest cluster, then run dashboot for a few ');
	console.log(' minutes. Then, point your development code at the LMDB');
	console.log(' database which has all the randomly named wallets,    ');
	console.log(' utxos, and addresses.                                 ');
	console.log('                                                       ');
}
const { extractOption } = require('../argv.js');

Bootstrap.run_cli_program = async function () {
	let help = false;
	let config = {
		instance: 'base',
		unlock: null,
		generateTo: null,
		create_wallets: false,
		create_denoms: false,
		dash_for_all: false,
		list_users: false,
		list_addr: null,
		list_utxos: null,
		wallet_cmd: null,
		dump_dsf: false,
		dsf_to_file: null,
		//console.log(`--dump-dsf         Dumps the db contents for DSF example payloads that have been logged`);
		//console.log(`--dsf-to=FILE      Dumps the db contents for DSF example payloads to the specified file`);
	};
	let dump_dsf = extractOption('dump-dsf');
	if (dump_dsf) {
		config.dump_dsf = true;
		help = false;
	}
	let iname = extractOption('instance', true);
	if (iname) {
		config.instance = iname;
		help = false;
	}
	await Bootstrap.load_instance(config.instance);
	let txid = null;
	if ((txid = extractOption('addrfromtxid', true))) {
		dd(
			await Bootstrap.get_address_from_txid(
				extractOption('username', true),
				txid
			)
		);
	}
	if (extractOption('increment')) {
		dd(await Bootstrap.increment_key('randomuser', 'ctr'));
	}
	if (extractOption('dsftest1')) {
		let buffer = await fs.readFileSync(
			'./dsf-7250bb2a2e294f728081f50ee2bdd3a1.dat'
		);
		dd(await Bootstrap._dsftest1(buffer, '7250bb2a2e294f728081f50ee2bdd3a1'));
	}
	let denom = extractOption('denom-amt', true);
	if (denom) {
		let username = extractOption('username', true);
		if (!username) {
			console.error(
				'Error: --username must be passed with --denominated-amout'
			);
			process.exit(1);
		}
		dd(await Bootstrap.get_denominated_utxos(username, denom));
	}
	let userDenoms = extractOption('user-denom', true);
	if (userDenoms) {
		dd(await Bootstrap.get_users_with_denominated_utxos(userDenoms));
	}
	let cmd = extractOption('wallet-cmd', true);
	if (cmd) {
		let capture = false;
		let args = [];
		for (const arg of process.argv) {
			if (arg.match(/^\-\-wallet\-cmd.*$/)) {
				capture = true;
				continue;
			}
			if (capture) {
				args.push(arg);
			}
		}
		let ps = await Bootstrap.wallet_exec(cmd, args);
		let { out, err } = ps_extract(ps);
		if (out.length) {
			console.log(out);
		}
		if (err.length) {
			console.error(err);
		}
		process.exit(0);
	}
	if (extractOption('list-users')) {
		config.list_users = true;
		help = false;
	}
	let uAddr = extractOption('list-addr', true);
	if (uAddr) {
		config.list_addr = uAddr;
		help = false;
	}
	//console.log(`--list-utxos=user  Lists all UTXO's for a user`);
	let utxos = extractOption('list-utxos', true);
	if (utxos) {
		config.list_utxos = utxos;
		help = false;
	}
	if (config.dump_dsf) {
		dd(await Bootstrap.dsf_list());
	}
	if (config.dsf_to_file) {
		await fs.writeFileSync(
			config.dsf_to_file,
			(await Bootstrap.dsf_list()).toString()
		);
		dd('did it work?');
	}

	if (extractOption('help') || extractOption('h')) {
		help = true;
	}
	if (help) {
		usage();
		process.exit(1);
	}
	if (extractOption('create-denoms')) {
		help = false;
		config.create_denoms = true;
	}
	if (extractOption('dash-for-all')) {
		config.dash_for_all = true;
		help = false;
	}
	if (extractOption('unlock-all')) {
		config.unlock = 'all';
		console.debug('all');
		help = false;
	}
	let genTo = extractOption('generate-to', true);
	if (genTo) {
		config.generateTo = genTo;
		help = false;
	}
	let cwall = extractOption('create-wallets');
	if (cwall) {
		config.create_wallets = true;
	}
	if (extractOption('create-wallets')) {
		config.create_wallets = true;
		help = false;
	}

	if (config.unlock === 'all') {
		console.info('[status]: Unlocking...');
		d(await Bootstrap.unlock_all_wallets());
		console.log('[DONE]');
		process.exit(0);
		return;
	}
	if (config.generateTo !== null) {
		console.info(
			'[status]: Generating dash to user:',
			config.generateTo,
			'...'
		);
		d(await Bootstrap.generate_dash_to(config.generateTo));
		console.log('[DONE]');
		process.exit(0);
		return;
	}
	if (config.create_wallets ?? false) {
		d(await Bootstrap.create_wallets());
		process.exit(0);
	}
	if (config.dash_for_all) {
		d(await Bootstrap.generate_dash_to_all());
		process.exit(0);
	}
	if (config.create_denoms) {
		d(await Bootstrap.create_denominations_to_all());
		process.exit(0);
	}
	if (config.list_users) {
		d(await Bootstrap.user_list());
		process.exit(0);
	}
	if (config.list_addr) {
		d(await Bootstrap.user_addresses(config.list_addr));
		process.exit(0);
	}
	if (config.list_utxos) {
		let addresses = await Bootstrap.user_addresses();
		d(await Bootstrap.user_utxos_from_cli(config.list_utxos, addresses));
		process.exit(0);
	}
	process.exit(1);
};
function unique(arr) {
	let map = {};
	let uni = [];
	for (const a of arr) {
		if (typeof map[a] !== 'undefined') {
			continue;
		}
		map[a] = 1;
		uni.push(a);
	}
	return uni;
}
Bootstrap.is_txid_used = async function (username, txid) {
	let existing = await Bootstrap.get_used_txids(username);
	return existing.indexOf(txid) !== -1;
};
Bootstrap.mark_txid_used = async function (username, txid) {
	let existing = await Bootstrap.get_used_txids(username);
	existing.push(txid);
	existing = unique(existing);
	return await Bootstrap.meta_store(username, 'usedtxids', existing);
};
Bootstrap.get_used_txids = async function (username) {
	return await Bootstrap.meta_get(username, 'usedtxids');
};
Bootstrap.store_change_addresses = async function (username, w_addresses) {
	return await Bootstrap.meta_store(
		[username, 'change'],
		'addresses',
		sanitize_addresses(w_addresses)
	);
};

Bootstrap.extract_unique_users = async function (count, options = {}) {
	await Bootstrap.unlock_all_wallets();
	let users = await Bootstrap.user_list();
	let choices = [];
	let filterByDenoms = null;
	if (typeof options.filterByDenoms !== 'undefined') {
		filterByDenoms = parseInt(options.filterByDenoms, 10);
	}
	if (typeof options.except_users !== 'undefined') {
		users = users.filter(function (username) {
			return options.except_users.indexOf(username) !== -1;
		});
	}

	let flatUtxos = [];
	for (const user of users) {
		flatUtxos = [];
		if (count === choices.length - 1) {
			return choices;
		}
		let addresses = await Bootstrap.get_addresses(user);
		let utxos = await Bootstrap.user_utxos_from_cli(user, addresses).catch(
			function (error) {
				console.error({ error });
				return null;
			}
		);
		if (!utxos || utxos.length === 0) {
			continue;
		}
		let addrMap = {};
		for (let k = 0; k < Object.keys(utxos).length; k++) {
			for (let x = 0; x < utxos[k].length; x++) {
				let u = utxos[k][x];
				addrMap[u.address] = 1;
			}
		}
		for (const addr in addrMap) {
			let buffer = await Bootstrap.wallet_exec(user, ['dumpprivkey', addr]);
			let { out, err } = Bootstrap.ps_extract(buffer, false);
			if (err.length) {
				console.error(err);
			}
			if (out.length) {
				addrMap[addr] = out;
			}
		}
		if (filterByDenoms === null) {
			for (let k = 0; k < Object.keys(utxos).length; k++) {
				for (let x = 0; x < utxos[k].length; x++) {
					let txid = utxos[k][x].txid;
					utxos[k][x].privateKey = addrMap[utxos[k][x].address];
					if (filterByDenoms !== null) {
						if (utxos[k][x].satoshis !== parseInt(filterByDenoms, 10)) {
							continue;
						}
					}
					let used = await Bootstrap.is_txid_used(user, utxos[k][x].txid);
					if (!used) {
						flatUtxos.push(utxos[k][x]);
					}
				}
			}
		} else {
			let utxos = await Bootstrap.get_denominated_utxos(user, filterByDenoms);
			flatUtxos = [...flatUtxos, ...utxos];
			flatUtxos = uniqueByKey(flatUtxos, 'txid');
			let finalUtxos = [];
			for (const u of flatUtxos) {
				let used = await Bootstrap.is_txid_used(user, u.txid);
				if (!used) {
					finalUtxos.push(u);
				}
			}
			flatUtxos = finalUtxos;
		}
		if (flatUtxos.length === 0) {
			d({ skipping: user });
			continue;
		}
		let rando = await Bootstrap.getRandomPayee(user);
		choices.push({
			user: user,
			utxos: flatUtxos,
			changeAddress: await Bootstrap.get_change_address_from_cli(user),
			randomPayee: rando,
		});
	}
	dd({ choices });
	return choices;
};
Bootstrap.getRandomPayee = async function (username) {
	let users = await Bootstrap.user_list();
	for (const user of users) {
		if (user != username && Math.random() * 100 > 50) {
			return user;
		}
	}
	return await Bootstrap.getRandomPayee(username);
};
Bootstrap.helpers = function () {
	return {
		db_cj,
		db_cj_ns,
		db_put,
		db_get,
		db_append,
		rng: {
			random_name: Bootstrap.random_name,
		},
		shell: {
			ps_extract: ps_extract,
			mkpath: Bootstrap.mkpath,
			run: Bootstrap.run,
			cli_args,
			wallet_exec: Bootstrap.wallet_exec,
		},
		validation: {
			sanitize_address,
			sanitize_txid,
		},
		users: {
			get_list: Bootstrap.user_list,
			user_create: Bootstrap.user_create,
		},
		conversion: {
			arbuf_to_hexstr,
			bigint_safe_json_stringify,
		},
	};
};
Bootstrap.utils = Bootstrap.helpers();
