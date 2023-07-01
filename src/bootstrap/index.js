'use strict';

/**
 * - lmdb file should be ~/.dashjoinjs/<INSTANCE_NAME>/db/data.mdb
 *
 */

const xt = require('@mentoc/xtract').xt;
const MetaDB = require('./metadb.js');
const ArrayUtils = require('../array-utils.js');
const DebugLib = require('../debug.js');
const Sanitizers = require('../sanitizers.js');
const { unique, bigint_safe_json_stringify, uniqueByKey, ps_extract } =
  ArrayUtils;
const { dd, d } = DebugLib;
const { sanitize_txid, sanitize_address, sanitize_addresses } = Sanitizers;
const { extractOption } = require('../argv.js');
const COIN = require('../coin-join-constants.js').COIN;
//const hashByteOrder = NetworkUtil.hashByteOrder;
let db_cj, db_cj_ns, db_put, db_get, db_append;
let mdb;

let Bootstrap = {};
module.exports = Bootstrap;

let cproc = require('child_process');

const crypto = require('crypto');
const fs = require('fs');

async function LogUtxos(user, utxos) {
	console.log(`LogUtxos: ${user}`);
	let fn = `${process.env.HOME}/data/${user}-utxos.json`;
	await require('fs/promises').appendFile(fn, JSON.stringify(utxos) + '\n');
}
function cli_args(list) {
	return [
		'-conf=' + process.env.HOME + '/.dashmate/local_seed/core/dash.conf',
		...list,
	];
}
Bootstrap.get_denominated_utxos = async function (
	username,
	denominatedAmount,
	count = 5250,
	filter_used = true
) {
	//console.debug('get_denominated_utxos');
	username = Bootstrap.alias_check(username);
	//d({ username });
	let list = [];
	//mdb.debug = true;
	let utxos = await Bootstrap.user_utxos_from_cli(username);
	denominatedAmount = parseInt(denominatedAmount, 10);
	for (const u of utxos) {
		if (filter_used && Bootstrap.is_txid_used(u.txid)) {
			//d('is used');
			continue;
		}
		let satoshis = parseInt(u.satoshis, 10);
		if (u.satoshis === denominatedAmount) {
			list.push(u);
		} else {
			list.push(u);
		}
		if (list.length === count) {
			return list;
		}
	}
	//dd({ list, denominatedAmount });
	return list;
};
Bootstrap.save_denominated_tx = async function (rows) {
	//let to = xt(rows, '0.to');
	//await mdb.paged_store(to, 'denomtx', rows);
	//d('saved');
};
Bootstrap.alias_users = async function () {
	let users = await Bootstrap.user_list();
	for (const user of users) {
		let alias = await Bootstrap.alias_user(user);
		d(`Assigned "${alias}" to "${user}"`);
	}
};
Bootstrap.alias_check = function (user) {
	if (user.match(/^user[\d]+$/)) {
		return Bootstrap.user_aliases[user];
	}
	return user;
};
Bootstrap.alias_ctr = 0;
Bootstrap.alias_user = async function (username) {
	db_cj_ns(username);
	Bootstrap.alias_ctr += 1;
	const alias = 'user' + String(Bootstrap.alias_ctr);
	await db_put('alias', alias);
	return alias;
};
Bootstrap.user_by_alias = async function (alias) {
	for (const user of await Bootstrap.user_list()) {
		db_cj_ns(user);
		let db_alias = await db_get('alias');
		if (db_alias === alias) {
			return user;
		}
	}
	return null;
};
Bootstrap.increment_key = async function (username, key_name) {
	username = Bootstrap.alias_check(username);
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
	username = Bootstrap.alias_check(username);
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
	username = Bootstrap.alias_check(username);
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
	username = Bootstrap.alias_check(username);
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
	return await mdb.paged_store('example', 'dsf', data);
};
function arbuf_to_hexstr(buffer) {
	// buffer is an ArrayBuffer
	return [...new Uint8Array(buffer)]
		.map((x) => x.toString(16).padStart(2, '0'))
		.join('');
}
Bootstrap.ps_extract = ps_extract;
Bootstrap.set_dash_cli = function (p) {
	Bootstrap.DASH_CLI = p;
};
Bootstrap.get_dash_cli = function () {
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
	username = Bootstrap.alias_check(username);
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
	count = parseInt(count, 10);
	if (isNaN(count) || count <= 0) {
		throw new Error('count must be a positive non-zero integer');
	}

	let utxos = await Bootstrap.get_denominated_utxos(
		username,
		denominatedAmount,
		count
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
	username = Bootstrap.alias_check(username);
	let addr = await Bootstrap.get_addresses(username, 500);
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
	return crypto.randomUUID().replace(/-/gi, '');
};

Bootstrap.run = async function (cli_arguments) {
	return await cproc.spawnSync(Bootstrap.DASH_CLI, cli_args(cli_arguments));
};

Bootstrap.__error = null;

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
	Bootstrap.MetaDB = new MetaDB(Bootstrap.DB);
	db_cj = Bootstrap.MetaDB.db_cj;
	db_cj_ns = Bootstrap.MetaDB.db_cj_ns;
	db_get = Bootstrap.MetaDB.db_get;
	db_put = Bootstrap.MetaDB.db_put;
	db_append = Bootstrap.MetaDB.db_append;
	mdb = Bootstrap.MetaDB;
	db_cj();
	mdb.before_tx = db_cj;
	await Bootstrap.load_used_txid_ram_slots();
	await Bootstrap.load_alias_ram_slots();
	return Bootstrap;
};
Bootstrap.initialize = Bootstrap.load_instance;

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
Bootstrap.user_list = async function (options = {}) {
	db_cj();
	let list = await db_get('users');
	try {
		list = JSON.parse(list);
		if (!Array.isArray(list)) {
			return [];
		}
		if (xt(options, 'with') === 'alias') {
			for (let i = 0; i < list.length; i++) {
				db_cj_ns(list[i]);
				let alias = await db_get('alias');
				list[i] = { user: list[i], alias };
			}
		}
		return list;
	} catch (e) {
		return [];
	}
};

Bootstrap.get_addresses = async function (username, max = 250) {
	username = Bootstrap.alias_check(username);
	let list = [];
	let addr_map = {};
	await mdb.paged_for_each(username, 'addresses', {}, function (addresses) {
		if (!Array.isArray(addresses)) {
			return true;
		}
		for (const a of addresses) {
			if (typeof addr_map[a] !== 'undefined') {
				continue;
			}
			addr_map[a] = 1;
			list.push(a);
			if (max !== null && list.length === max) {
				return false;
			}
		}
	});
	return list;
};
Bootstrap.user_addresses = async function (username, cb, context = {}) {
	username = Bootstrap.alias_check(username);
	await mdb.paged_for_each(
		username,
		'addresses',
		{ include_meta: true, context },
		cb
	);
};
Bootstrap.sanitize_address = sanitize_address;

Bootstrap.import_user_addresses_from_cli = async function (username) {
	username = Bootstrap.alias_check(username);
	let ps = await Bootstrap.wallet_exec(username, ['listaddressbalances']);
	let { err, out } = ps_extract(ps);
	if (err.length) {
		console.error(err);
	} else {
		try {
			let output = JSON.parse(out);
			let keep = [];
			for (const address in output) {
				keep.push(address);
			}
			if (keep.length) {
				await Bootstrap.set_addresses(username, keep);
				console.info(`${keep.length} addresses imported for user: ${username}`);
				return true;
			} else {
				//console.warn(`No addresses for user: ${username}`);
			}
		} catch (e) {
			//console.error(e);
		}
	}
	return false;
};

Bootstrap.user_utxos_from_cli = async function (username, addresses = []) {
	await Bootstrap.unlock_all_wallets();
	username = Bootstrap.alias_check(username);
	let utxos = [];
	if (addresses === null || addresses.length === 0) {
		addresses = await Bootstrap.get_addresses(username);
	}
	for (const address of addresses) {
		let ps = await Bootstrap.wallet_exec(username, [
			'getaddressutxos',
			JSON.stringify({ addresses: [Bootstrap.sanitize_address(address)] }),
		]);
		let { err, out } = ps_extract(ps);
		if (err.length) {
			console.error(err);
		} else {
			if (out === '[\n]') {
				continue;
			}
			try {
				let txns = JSON.parse(out);
				if (Array.isArray(txns)) {
					utxos.push(...txns);
				} else {
					utxos.push(txns);
				}
			} catch (e) {
				d(e);
			}
		}
	}
	return utxos;
};
Bootstrap.user_exists = async function (username) {
	username = Bootstrap.alias_check(username);
	let users = await Bootstrap.user_list();
	for (const user of users) {
		if (user === username) {
			return true;
		}
	}
	return false;
};

Bootstrap.user_create = async function (username) {
	username = Bootstrap.alias_check(username);
	db_cj();
	let list = await db_get('users');
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
	await db_put('users', JSON.stringify(list));
};

Bootstrap.wallet_exec = async function (wallet_name, cli_arguments) {
	if (['1', 'true'].indexOf(String(extractOption('verbose', true))) !== -1) {
		let args = cli_args([`-rpcwallet=${wallet_name}`, ...cli_arguments]);
		//console.info(`wallet_exec: "${Bootstrap.DASH_CLI} ${args}`);
	}
	return await cproc.spawnSync(
		Bootstrap.DASH_CLI,
		cli_args([`-rpcwallet=${wallet_name}`, ...cli_arguments])
	);
};
Bootstrap.get_multi_change_address_from_cli = async function (
	username,
	count,
	save = true
) {
	let addresses = [];
	for (let i = 0; i < count; i++) {
		let buffer = await Bootstrap.wallet_exec(username, ['getrawchangeaddress']);
		let { out } = ps_extract(buffer, false);
		if (out.length) {
			addresses.push(out);
		}
	}
	if (save) {
		await Bootstrap.store_addresses(username, addresses);
	}
	return addresses;
};
Bootstrap.get_change_address_from_cli = async function (username, save = true) {
	username = Bootstrap.alias_check(username);
	let buffer = await Bootstrap.wallet_exec(username, ['getrawchangeaddress']);
	let { out } = ps_extract(buffer, false);
	if (!save) {
		return out;
	}

	await Bootstrap.store_addresses(username, [out]);
	return out;
};
Bootstrap.get_change_addresses = async function (username, cb) {
	username = Bootstrap.alias_check(username);
	return await mdb.paged_for_each(
		username,
		'change',
		{ include_meta: true },
		cb
	);
};
Bootstrap.generate_new_addresses = async function (username, count) {
	username = Bootstrap.alias_check(username);
	let w_addresses = [];
	for (let i = 0; i < count; i++) {
		let buffer = await Bootstrap.wallet_exec(username, ['getnewaddress']);
		let { out } = ps_extract(buffer, false);
		if (out.length) {
			w_addresses.push(out);
		}
	}
	await Bootstrap.store_addresses(username, w_addresses);
	return w_addresses;
};
Bootstrap.generate_address = async function (username) {
	username = Bootstrap.alias_check(username);
	let w_addresses = [];
	for (let i = 0; i < 10; i++) {
		let buffer = await Bootstrap.wallet_exec(username, ['getnewaddress']);
		let { out } = ps_extract(buffer, false);
		if (out.length) {
			w_addresses.push(out);
		}
	}
	await Bootstrap.store_addresses(username, w_addresses);
	return w_addresses;
};
Bootstrap.store_change_addresses = async function (username, w_addresses) {
	username = Bootstrap.alias_check(username);
	return await mdb.paged_store(
		username,
		'change',
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
	username = Bootstrap.alias_check(username);
	let buffer = await Bootstrap.wallet_exec(username, ['dumpprivkey', address]);
	let { out, err } = ps_extract(buffer, false);
	if (err.length) {
		console.error(err);
	}
	if (out.length) {
		return out;
	}
};
Bootstrap.set_addresses = async function (
	username,
	w_addresses,
	items_per_page = 30
) {
	username = Bootstrap.alias_check(username);
	return await mdb.paged_set(
		username,
		'addresses',
		sanitize_addresses(w_addresses),
		items_per_page
	);
};

Bootstrap.store_addresses = async function (
	username,
	w_addresses,
	items_per_page = 30
) {
	username = Bootstrap.alias_check(username);
	return await mdb.paged_store(
		username,
		'addresses',
		sanitize_addresses(w_addresses),
		items_per_page
	);
};

/**
 * Returns a user that is not `forUser`
 */
Bootstrap.get_random_payee = async function (forUser) {
	forUser = Bootstrap.alias_check(forUser);
	let users = await Bootstrap.user_list();
	users = Bootstrap.shuffle(users);
	for (const user of users) {
		if (user !== forUser) {
			return user;
		}
	}
};

Bootstrap.random_payee_address = async function (forUser) {
	forUser = Bootstrap.alias_check(forUser);
	let users = await Bootstrap.user_list();
	users = Bootstrap.shuffle(users);
	let addy = null;
	for (const user of users) {
		if (user !== forUser) {
			await Bootstrap.user_addresses(user, function (addresses) {
				addresses = Bootstrap.shuffle(addresses);
				addy = { user: user, address: addresses[0] };
				return false; // stop looping
			});
			if (addy !== null) {
				return addy;
			}
		}
	}
};
Bootstrap.filter_address = async function (username, except) {
	username = Bootstrap.alias_check(username);
	let keep = [];
	await mdb.paged_for_each(username, 'addresses', {}, function (addresses) {
		for (const address of addresses) {
			if (except.indexOf(address) === -1) {
				keep.push(address);
			}
		}
	});
	return keep;
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
		//console.info(`[ok]: user "${wallet_name}" created`);
		await Bootstrap.run([
			'createwallet',
			wallet_name,
			'false',
			'false',
			'foobar',
			'false',
			'true',
		]);
		//console.info(`[ok]: wallet "${wallet_name}" created`);

		let w_addresses = [];
		for (let actr = 0; actr < 2; actr++) {
			let buffer = await Bootstrap.wallet_exec(wallet_name, ['getnewaddress']);
			let { out } = ps_extract(buffer, false);
			if (out.length) {
				w_addresses.push(out);
			}
		}
		await Bootstrap.set_addresses(wallet_name, sanitize_addresses(w_addresses));
		await Bootstrap.unlock_wallet(wallet_name);
	}
	await Bootstrap.alias_users();
	await Bootstrap.unlock_all_wallets();
	await Bootstrap.dump_all_privkeys();
	await Bootstrap.generate_dash_to_all();
	await Bootstrap.create_denominations_to_all();
};
Bootstrap.grind = async function () {
	for (let i = 0; i < 100; i++) {
		if (i % 10 === 0) {
			await Bootstrap.generate_dash_to_all();
		}
		await Bootstrap.create_denominations_to_all();
	}
};
Bootstrap.create_denominations_to_all = async function (iterations = 1) {
	for (let i = 0; i < iterations; i++) {
		await Bootstrap.unlock_all_wallets();
		const AMOUNT = '0.00100001';
		/**
     * Loop through all wallets and send the lowest denomination to
     * all other users
     */
		let users = await Bootstrap.user_list();
		for (const user of users) {
			for (const otherUser of users) {
				if (otherUser === user) {
					continue;
				}
				let pmt_context = {
					from: user,
					to: otherUser,
					amount: parseInt(parseFloat(AMOUNT, 10) * COIN, 10),
				};
				await (async function (_in_otherUser, _in_bs, _in_pmt_context) {
					let _otherUser = _in_otherUser;
					let _bs = _in_bs;
					let _pmt_context = _in_pmt_context;
					await _bs.user_addresses(
						_otherUser,
						async function (addresses, meta, context) {
							let txid_list = [];
							for (const address of addresses) {
								//d({ user, address });
								let ps = await _bs.wallet_exec(user, [
									'sendtoaddress',
									address,
									AMOUNT,
								]);
								let { out, err } = ps_extract(ps);
								if (out.length) {
									let txid = sanitize_txid(out);
									txid_list.push({
										from: context.from,
										to: context.to,
										txid,
										amount: context.amount,
										address,
									});
									console.log(
										`Saved ${txid} from: ${context.from} for user: ${context.to}`
									);
								}
								if (err.length) {
									console.error(err);
								}
							}
							if (txid_list.length) {
								//console.log('saving', txid_list);
								await _bs.save_denominated_tx(txid_list);
								txid_list = [];
							}
							return false;
						},
						_pmt_context
					);
				})(otherUser, Bootstrap, pmt_context);
			}
		}
	}
};
const LOW_COLLATERAL = (COIN / 1000 + 1) / 10;
const LOW_COLLATERAL_AMOUNT = 0.0007;
Bootstrap.collateral_amount = {
	amount: LOW_COLLATERAL_AMOUNT,
	satoshis: parseInt(LOW_COLLATERAL_AMOUNT * COIN, 10),
};
Bootstrap.create_collaterals_to_all = async function (iterations = 1) {
	for (let i = 0; i < iterations; i++) {
		await Bootstrap.unlock_all_wallets();
		const AMOUNT = String(Bootstrap.collateral_amount.amount);
		/**
     * Loop through all wallets and send the lowest denomination to
     * all other users
     */
		let users = await Bootstrap.user_list();
		for (const user of users) {
			for (const otherUser of users) {
				if (otherUser === user) {
					continue;
				}
				let pmt_context = {
					from: user,
					to: otherUser,
					amount: AMOUNT,
				};
				await (async function (_in_otherUser, _in_bs, _in_pmt_context) {
					let _otherUser = _in_otherUser;
					let _bs = _in_bs;
					let _pmt_context = _in_pmt_context;
					await _bs.user_addresses(
						_otherUser,
						async function (addresses, meta, context) {
							let txid_list = [];
							for (const address of addresses) {
								let ps = await _bs.wallet_exec(user, [
									'sendtoaddress',
									address,
									context.amount,
								]);
								let { out, err } = ps_extract(ps);
								if (out.length) {
									let txid = sanitize_txid(out);
									txid_list.push({
										from: context.from,
										to: context.to,
										txid,
										amount: context.amount,
										address,
									});
									console.log(
										`Saved ${txid} from: ${context.from} for user: ${context.to}`
									);
								}
								if (err.length) {
									console.error(err);
								}
							}
							if (txid_list.length) {
								console.log('saving', txid_list);
								await _bs.save_denominated_tx(txid_list);
								txid_list = [];
							}
							return false;
						},
						_pmt_context
					);
				})(otherUser, Bootstrap, pmt_context);
			}
		}
	}
};
Bootstrap.unlock_wallet = async function (username) {
	username = Bootstrap.alias_check(username);
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
	username = Bootstrap.alias_check(username);
	let ps = await Bootstrap.wallet_exec(username, ['dumpprivkey', address]);
	let err = trim(ps.stderr.toString());
	let out = trim(ps.stdout.toString());
	if (out.length) {
		return out;
	}
	throw new Error(`dumpprivkey failed: "${err}"`);
};

Bootstrap.dump_all_privkeys = async function () {
	const users = await Bootstrap.user_list();
	for (const user of users) {
		(async function (_in_user, _in_bs, _in_mdb) {
			let _mdb = _in_mdb;
			let _bs = _in_bs;
			let _user = _in_user;
			await _bs.user_addresses(_user, async function (addresses) {
				let keep = [];
				for (const address of addresses) {
					let privateKey = await _bs
						.dump_private_key(user, address)
						.catch(function (error) {
							console.error(error);
							return null;
						});
					if (privateKey === null) {
						continue;
					}
					keep.push({ user, privateKey, address });
				}
				if (keep.length) {
					for (const pair of keep) {
						await _mdb.paged_store(
							pair.user,
							['privatekey', pair.address].join('|'),
							pair.privateKey
						);
					}
				}
			});
		})(user, Bootstrap, mdb);
	}
};
Bootstrap.generate_dash_to_all = async function (iterations = 1) {
	for (let i = 0; i < iterations; i++) {
		await Bootstrap.unlock_all_wallets();
		const users = await Bootstrap.user_list();
		for (const user of users) {
			await (async function (_in_user, _in_bs, _in_mdb) {
				let _user = _in_user;
				let _bs = _in_bs;
				let _mdb = _in_mdb;
				await _bs.user_addresses(_user, async function (addresses) {
					console.info(`${_user} has ${addresses.length} addresses...`);
					let ctr = 10;
					for (const address of addresses) {
						--ctr;
						if (ctr < 0) {
							return false;
						}
						//console.info('Running wallet_exec..');
						let ps = await _bs.wallet_exec(_user, [
							'generatetoaddress',
							'2',
							address,
						]);
						let { err, out } = ps_extract(ps, false);
						if (err.length) {
							console.error(`ERROR: ${_user}: "${err}"`);
						} else {
							//console.log({ out });
							try {
								let txns = JSON.parse(out);
								if (txns.length === 0) {
									//console.info(`${_user} skipping empty output`);
									continue;
								}
								await _mdb.paged_store(_user, 'utxos', txns);
								//d({ [_user]: address, utxos: out, txns });
								process.stdout.write('.');
							} catch (e) {
								console.error(e);
							}
						}
					}
				});
			})(user, Bootstrap, mdb);
		}
	}
};

Bootstrap.generate_dash_to = async function (username) {
	username = Bootstrap.alias_check(username);
	await Bootstrap.unlock_all_wallets();
	await Bootstrap.user_addresses(username, async function (addresses) {
		for (const address of addresses) {
			let ps = await Bootstrap.wallet_exec(username, [
				'generatetoaddress',
				'10',
				address,
			]);
			let { err, out } = ps_extract(ps);
			if (err.length) {
				console.error(err);
			} else {
				console.log({ out });
				try {
					let txns = JSON.parse(out);
					if (txns.length === 0) {
						continue;
					}
					console.info(`storing ${txns.length} txns at ${username}.utxos`);
					await mdb.paged_store(username, 'utxos', txns);
					//d({ [username]: address, utxos: out, txns });
				} catch (e) {
					console.error(e);
				}
			}
		}
	});
};

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
	console.log(
		'--create-cols      Loops through all wallets and creates collaterals'
	);
	console.log('--list-users       Lists all users');
	console.log(
		'--filter-unused=User  Filter unused txids and discard used txids from lmdb entries for User'
	);
	console.log(
		'--user-denoms=AMT  Lists all users with the desired denominated amount'
	);
	console.log('--list-addr=user   Lists all addresses for a user');
	console.log('--list-utxos=user  Lists all UTXO\'s for a user');
	console.log('--all-utxos        Lists all UTXO\'s for ALL users');
	console.log('--new-addr=user    Creates 10 new addresses for the given user');
	console.log(
		'--wallet-cmd=user  Gives you the ability to call dash-cli for the specified user'
	);
	console.log(
		'--dump-dsf         Dumps the db contents for DSF example payloads that have been logged'
	);
	console.log(
		'--dsf-to=FILE      Dumps the db contents for DSF example payloads to the specified file'
	);
	console.log(
		'--import-addresses=USER  Import addresses from dash-cli into lmdb'
	);
	console.log(
		'--sync-all         Will import all addresses from dash-cli into lmdb for ALL users'
	);
	console.log('--alias-users      Will give easy to use names for each user');
	console.log(
		'--grind            Calls generate dash and create denoms in a loop'
	);
	if (extractOption('helpinstances')) {
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
}
function report(stats) {
	let buffer = [];
	for (const key in stats) {
		buffer.push(`[${key}: ${stats[key]}]`);
	}
	process.stdout.write('\r' + buffer.join(' '));
}

Bootstrap.run_cli_program = async function () {
	let help = false;
	let config = {
		instance: 'base',
		unlock: null,
		generateTo: null,
		create_wallets: false,
		create_denoms: false,
		create_collaterals: false,
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
	config.create_collaterals = extractOption('create-cols');
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
	{
		if (extractOption('grind')) {
			d(await Bootstrap.grind());
			process.exit(0);
		}
	}
	{
		let user = extractOption('new-addr', true);
		if (user) {
			d(await Bootstrap.generate_address(user));
			process.exit(0);
		}
	}
	{
		let user = extractOption('filter-unused', true);
		if (user) {
			d(await Bootstrap.filter_unused_txids(user));
			process.exit(0);
		}
	}
	let txid = null;
	if ((txid = extractOption('addrfromtxid', true))) {
		d(
			await Bootstrap.get_address_from_txid(
				extractOption('username', true),
				txid
			)
		);
		process.exit(0);
	}
	{
		if (extractOption('all-utxos')) {
			let blob = [];
			let users = await Bootstrap.user_list();
			await users.forEach(async function (user) {
				console.log(user);
				await Bootstrap.user_addresses(user, async function (addresses) {
					let utxos = await Bootstrap.user_utxos_from_cli(user, addresses);
					d({ utxos });
					blob.push({ user, utxos });
				});
				console.log('.');
			});
			console.log(JSON.stringify(blob, null, 2));
			process.exit(0);
		}
	}
	{
		if (extractOption('alias-users')) {
			d(await Bootstrap.alias_users());
			process.exit(0);
		}
	}
	{
		let user = extractOption('import-addresses', true);
		if (user) {
			if (user === 'all') {
				const users = await Bootstrap.user_list();
				for (const user of users) {
					await Bootstrap.import_user_addresses_from_cli(user);
				}
				d('done importing all user addresses');
				process.exit(0);
			}
			d(await Bootstrap.import_user_addresses_from_cli(user));
			process.exit(0);
		}
	}
	{
		if (extractOption('sync-all')) {
			let stats = {
				skipped: 0,
				good: 0,
				addresses: 0,
				utxos: 0,
				users: 0,
				empty_utxos: 0,
			};

			let users = await Bootstrap.user_list();
			//d(users);
			//for (const user of users) {
			//	await Bootstrap.user_addresses(user, async function (addresses) {
			//		stats.addresses += addresses.length;
			//		let utxos = await Bootstrap.user_utxos_from_cli(user, addresses);
			//		stats.utxos += utxos.length;
			//		stats.users += 1;
			//		report(stats);
			//		for (let batch of utxos) {
			//			if (Array.isArray(batch) === false) {
			//				if (xt(batch, 'address')) {
			//					batch = [batch];
			//				} else {
			//					d(batch);
			//					continue;
			//				}
			//			}
			//			let txids = [];
			//			for (const utxo of batch) {
			//				if (Bootstrap.is_txid_used(utxo.txid)) {
			//					stats.skipped += 1;
			//					report(stats);
			//					continue;
			//				}
			//				txids.push(utxo.txid);
			//				stats.good += 1;
			//				report(stats);
			//			}
			//			if (txids.length) {
			//				await mdb.paged_store(user, 'utxos', txids);
			//			}
			//		}
			//	});
			//}

			for (const user of users) {
				await Bootstrap.import_user_addresses_from_cli(user);
			}
			process.exit(0);
		}
	}
	if (extractOption('increment')) {
		d(await Bootstrap.increment_key('randomuser', 'ctr'));
		process.exit(0);
	}
	if (extractOption('dsftest1')) {
		let buffer = await fs.readFileSync(
			'./dsf-7250bb2a2e294f728081f50ee2bdd3a1.dat'
		);
		d(await Bootstrap._dsftest1(buffer, '7250bb2a2e294f728081f50ee2bdd3a1'));
		process.exit(0);
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
		d(await Bootstrap.get_denominated_utxos(username, denom));
		process.exit(0);
	}
	let userDenoms = extractOption('user-denom', true);
	if (userDenoms) {
		d(await Bootstrap.get_users_with_denominated_utxos(userDenoms));
		process.exit(0);
	}
	let cmd = extractOption('wallet-cmd', true);
	if (cmd) {
		let capture = false;
		let args = [];
		for (const arg of process.argv) {
			if (arg.match(/^--wallet-cmd.*$/)) {
				capture = true;
				continue;
			}
			if (capture) {
				args.push(arg);
			}
		}
		cmd = await Bootstrap.alias_check(cmd);
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
	if (config.create_collaterals) {
		d(await Bootstrap.create_collaterals_to_all());
		process.exit(0);
	}
	if (config.create_denoms) {
		d(await Bootstrap.create_denominations_to_all());
		process.exit(0);
	}
	if (config.list_users) {
		d(await Bootstrap.user_list({ with: 'alias' }));
		process.exit(0);
	}
	if (config.list_addr) {
		d('config.list_addr: ' + config.list_addr);
		await Bootstrap.user_addresses(
			config.list_addr,
			async function (addresses) {
				d({ addresses });
				for (const address of addresses) {
					d(address);
				}
			}
		);
		process.exit(0);
	}
	if (config.list_utxos) {
		config.list_utxos = Bootstrap.alias_check(config.list_utxos);
		console.debug('config:', config);
		dd(await Bootstrap.get_denominated_utxos(config.list_utxos, null, 5000));
		//d({ config });
		let num = await Bootstrap.user_addresses(
			config.list_utxos,
			async function (addresses) {
				//d({ addresses });
				const CHUNK_SIZE = 40;
				for (let i = 0; i < addresses.length / CHUNK_SIZE; i++) {
					let chunk = addresses.splice(i + i * CHUNK_SIZE, i + 1 * CHUNK_SIZE);
					let utxos = await Bootstrap.user_utxos_from_cli(
						config.list_utxos,
						chunk
					);
					d(utxos);
					if (extractOption('log-to-file')) {
						for (const u of utxos) {
							if (u.length === 0) {
								continue;
							}
							if (u.length === 1) {
								await LogUtxos(config.list_utxos, u[0]);
							} else {
								await LogUtxos(config.list_utxos, u);
							}
						}
					}
				}
				return true;
			}
		);
		d({ num });
		process.exit(0);
	}
	usage();
	process.exit(1);
};
Bootstrap.is_txid_used = function (username, txid) {
	if (txid === null || typeof txid === 'undefined') {
		txid = username;
	}
	return Bootstrap.ram_txid_used(txid);
};
Bootstrap.used_txids = [];
Bootstrap.load_used_txid_ram_slots = async function () {
	console.info('[ ] Loading used txids into ram....');
	Bootstrap.used_txids = [];
	let map = {};
	for (const user of await Bootstrap.user_list()) {
		let used = await Bootstrap.get_used_txids(user);
		for (const u of used) {
			if (u === null) {
				continue;
			}
			if (Array.isArray(u)) {
				for (const u2 of u) {
					if (map[u2] !== 1) {
						Bootstrap.used_txids.push(u2);
						map[u2] = 1;
					}
				}
			} else {
				if (map[u] !== 1) {
					Bootstrap.used_txids.push(u);
					map[u] = 1;
				}
			}
		}
	}
	console.info(`[+] ${Bootstrap.used_txids.length} used txids loaded into ram`);
};
Bootstrap.user_aliases = {};
Bootstrap.load_alias_ram_slots = async function () {
	console.info('[ ] Loading user aliases into ram....');
	Bootstrap.user_aliases = {};
	for (const user of await Bootstrap.user_list({ with: 'alias' })) {
		Bootstrap.user_aliases[user.alias] = user.user;
	}
	console.info(
		`[+] ${
			Object.keys(Bootstrap.user_aliases).length
		} user aliases loaded into ram`
	);
};
Bootstrap.mark_txid_used = async function (username, txid) {
	username = Bootstrap.alias_check(username);
	let existing = await Bootstrap.get_used_txids(username);
	existing.push(txid);
	existing = unique(existing);
	Bootstrap.used_txids.push(txid);
	return await mdb.paged_store(username, 'usedtxids', existing);
};
Bootstrap.get_used_txids = async function (username) {
	username = Bootstrap.alias_check(username);
	let list = [];
	await mdb.paged_for_each(username, 'usedtxids', {}, function (txids) {
		if (!Array.isArray(txids)) {
			return true;
		}
		for (const tx of txids) {
			list.push(tx);
		}
	});
	return list;
};
Bootstrap.ram_txid_used = function (txid) {
	return Bootstrap.used_txids.indexOf(txid) !== -1;
};

Bootstrap.extract_unique_users = async function (
	count,
	denominatedAmount,
	besides
) {
	await Bootstrap.unlock_all_wallets();
	await Bootstrap.load_used_txid_ram_slots();
	let users = await Bootstrap.user_list();
	let choices = [];
	denominatedAmount = parseInt(denominatedAmount, 10);

	users = users.filter(function (user) {
		return besides.indexOf(user) === -1;
	});

	for (const user of users) {
		d({ user });
		if (count === choices.length - 1) {
			return choices;
		}
		let rando = await Bootstrap.getRandomPayee(user);
		choices.push({
			user,
			utxos: await Bootstrap.get_denominated_utxos(user, denominatedAmount),
			changeAddress: await Bootstrap.get_change_address_from_cli(user),
			randomPayee: rando,
		});
	}
	d({ choices });
	return choices;
};
Bootstrap.getRandomPayee = async function (username) {
	username = Bootstrap.alias_check(username);
	let users = await Bootstrap.user_list();
	for (const user of users) {
		if (user !== username && Math.random() * 100 > 50) {
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
