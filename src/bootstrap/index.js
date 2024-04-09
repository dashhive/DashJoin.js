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
const { unique, bigint_safe_json_stringify, ps_extract } = ArrayUtils;
const { dd, d } = DebugLib;
const { sanitize_txid, sanitize_address, sanitize_addresses } = Sanitizers;
const { sanitize_tx_format } = Sanitizers;
const { sanitize_psbt } = Sanitizers;
const { extractOption } = require('../argv.js');
const COIN = require('../coin-join-constants.js').COIN;
const NetworkUtil = require('../network-util.js');
const hashByteOrder = NetworkUtil.hashByteOrder;
const DashCore = require('@dashevo/dashcore-lib');
const Transaction = DashCore.Transaction;
const Script = DashCore.Script;
const Signature = DashCore.crypto.Signature;
const PrivateKey = DashCore.PrivateKey;
let db_cj, db_cj_ns, db_put, db_get, db_append, db_del;
let db_set_ns;
const UserDB = require('./userdb.js');

function RingBuffer(items) {
	let self = this;
	self.items = items;
	self.i = 0;
	self.next = function () {
		if (self.i >= self.items.length) {
			self.i = 0;
		}
		let item = self.items[self.i];
		self.i += 1;
		return item;
	};
}

let Bootstrap = {};
let db = Bootstrap;
module.exports = Bootstrap;

let cproc = require('child_process');

//const crypto = require('crypto');
const fs = require('fs');

async function LogUtxos(user, utxos) {
	console.log(`LogUtxos: ${user}`);
	let fn = `${process.env.HOME}/data/${user}-utxos.json`;
	await require('node:fs').promises.writeFile(fn, JSON.stringify(utxos));
}
function cli_args(list) {
	return [
		'-conf=' + process.env.HOME + '/.dashmate/local_seed/core/dash.conf',
		...list,
	];
}

function mkudb(username) {
	return new UserDB(
		{
			db_cj,
			db_cj_ns,
			db_put,
			db_get,
			db_append,
			db_del,
			db_set_ns,
			db_make_key: Bootstrap.MetaDB.DB.make_key,
		},
		username,
		'cj',
	);
}

/**
 * options is exactly like the man page says:
 {
		minimumAmount, //(numeric or string, optional, default=0) Minimum value of each UTXO in DASH
		maximumAmount, //(numeric or string, optional, default=unlimited) Maximum value of each UTXO in DASH
		maximumCount, //            (numeric, optional, default=unlimited) Maximum number of UTXOs
		minimumSumAmount, //    (numeric or string, optional, default=unlimited) Minimum sum value of all UTXOs in DASH
		coinType, //(numeric, optional, default=0) Filter coinTypes as follows:
		//0=ALL_COINS, 1=ONLY_FULLY_MIXED, 2=ONLY_READY_TO_MIX, 3=ONLY_NONDENOMINATED,
		//4=ONLY_MASTERNODE_COLLATERAL, 5=ONLY_COINJOIN_COLLATERAL
	};
 ----
 If addresses is a string or an array, it'll be used.
 If not set, then the `main-address` will be used

*/

Bootstrap.list_unspent_advanced = async function (
	username,
	options,
	addresses = null,
) {
	username = Bootstrap.alias_check(username);
	let udb = mkudb(username);
	let main_address = await udb.main_address();

	let addr_json = JSON.stringify([main_address]);
	if (Array.isArray(addresses)) {
		let addr = unique(sanitize_addresses(addresses));
		addr_json = JSON.stringify(addr);
	} else if (typeof addresses === 'string') {
		addr_json = JSON.stringify(sanitize_addresses([addresses]));
	}
	let minimumAmount = null;
	let maximumAmount = null;
	let maximumCount = null;
	let minimumSumAmount = null;
	let coinType = 0;

	if (xt(options, 'minimumAmount') !== null) {
		minimumAmount = options.minimumAmount;
	}
	if (xt(options, 'maximumAmount') !== null) {
		maximumAmount = options.maximumAmount;
	}
	if (xt(options, 'maximumCount') !== null) {
		maximumCount = options.maximumCount;
	}
	if (xt(options, 'minimumSumAmount') !== null) {
		minimumSumAmount = options.minimumSumAmount;
	}
	if (xt(options, 'coinType') !== null) {
		coinType = options.coinType;
	}

	let query_options = {};
	if (minimumAmount !== null) {
		query_options.minimumAmount = minimumAmount;
	}
	if (maximumAmount !== null) {
		query_options.maximumAmount = maximumAmount;
	}
	if (maximumCount !== null) {
		query_options.maximumCount = maximumCount;
	}
	if (minimumSumAmount !== null) {
		query_options.minimumSumAmount = minimumSumAmount;
	}
	if (coinType !== null) {
		query_options.coinType = coinType;
	}
	query_options = JSON.stringify(query_options);
	let unspent_options = [
		'listunspent',
		'1', // 1. minconf (numeric, optional, default=1) The minimum confirmations to filter
		'9999999', // 2. maxconf (numeric, optional, default=9999999) The maximum confirmations to filter
		addr_json, // 3. addresses (json array, optional, default=empty array) The dash addresses to filter
		'true', // (boolean, optional, default=true) Include outputs that are not safe to spend
		query_options, // 5. query_options (json object, optional) JSON with query options
	];
	let { out, err } = await Bootstrap.auto.wallet_exec(
		username,
		unspent_options,
	);
	if (err.length) {
		throw new Error(err);
	}
	try {
		out = JSON.parse(out);
	} catch (e) {
		throw new Error(e);
	}
	return out;
};
/**
 * Take a single UTXO and split it up into as many denominated inputs
 * as possible.
 */
Bootstrap.split_utxo = async function (username) {
	const AMOUNT = '0.00100001';
	const SATOSHIS = parseInt(parseFloat(AMOUNT, 10) * COIN, 10);
	username = Bootstrap.alias_check(username);
	const udb = mkudb(username);
	let main_address = await udb.main_address();
	if (main_address === null || main_address.length === 0) {
		let ps = await Bootstrap.wallet_exec(username, ['listaddressbalances']);
		let { err, out } = ps_extract(ps);
		if (err) {
			throw new Error(err);
		}
		out = JSON.parse(out);
		main_address = Object.keys(out)[0];
		await udb.set_main_address(main_address);
		main_address = await udb.main_address();
	}

	let query_options = {
		minimumAmount: 10, //(numeric or string, optional, default=0) Minimum value of each UTXO in DASH
		//maximumAmount: AMOUNT, //(numeric or string, optional, default=unlimited) Maximum value of each UTXO in DASH
		maximumCount: 10, //            (numeric, optional, default=unlimited) Maximum number of UTXOs
		//"minimumSumAmount": amount,    (numeric or string, optional, default=unlimited) Minimum sum value of all UTXOs in DASH
		coinType: 0, //(numeric, optional, default=0) Filter coinTypes as follows:
		//0=ALL_COINS, 1=ONLY_FULLY_MIXED, 2=ONLY_READY_TO_MIX, 3=ONLY_NONDENOMINATED,
		//4=ONLY_MASTERNODE_COLLATERAL, 5=ONLY_COINJOIN_COLLATERAL
	};
	let utxos = await Bootstrap.list_unspent_advanced(username, query_options);
	if (utxos.length === 0) {
		throw new Error('no utxos matching the criteria could be found');
	}
	let created = await Bootstrap.generate_new_addresses(username, 2);
	await Bootstrap.store_denominated_addresses(username, created);
	let change_address = await Bootstrap.get_multi_change_address_from_cli(
		username,
		1,
	);
	let rb_address = new RingBuffer(created);
	if (Array.isArray(change_address)) {
		change_address = change_address[0];
	}
	for (const choice of utxos) {
		let tx = new Transaction();
		tx.from({
			txId: choice.txid,
			outputIndex: choice.vout,
			scriptPubKey: Script.buildPublicKeyHashOut(
				choice.address,
				Signature.SIGHASH_ALL | Signature.SIGHASH_ANYONECANPAY,
			),
			amount: choice.amount,
		});
		let pk = await Bootstrap.get_private_key(username, choice.address);
		pk = PrivateKey.fromWIF(pk);
		for (let i = 0; i < 200; i++) {
			tx.to(rb_address.next(), SATOSHIS);
		}
		tx.change(change_address);
		tx.sign(pk, Signature.SIGHASH_ALL | Signature.SIGHASH_ANYONECANPAY);
		let ser = tx.serialize();
		let output = await Bootstrap.wallet_exec(username, [
			'sendrawtransaction',
			ser,
		]);
		let { out, err } = ps_extract(output);
		if (err.length) {
			throw new Error(err);
		}
		d(out);
		await Bootstrap.save_denominated_tx(username, out);
	}
};
Bootstrap.get_junk_username = function () {
	for (const key in Bootstrap.user_aliases) {
		if (Bootstrap.user_aliases[key].match(/^junk/)) {
			return Bootstrap.user_aliases[key];
		}
	}
	return null;
};
Bootstrap.grind_junk_user = async function () {
	await Bootstrap.load_alias_ram_slots();
	await Bootstrap.unlock_all_wallets();
	for (let i = 0; i < 100; i++) {
		await Bootstrap.generate_dash_to('junk');
	}
};
db.junk_name = function () {
	return 'junk';
};
db.make_junk_wallet = async function () {
	let wallet_name = await db.junk_name();
	await db.user_create(wallet_name);
	console.info(`[ok]: user "${wallet_name}" created`);
	await db.run([
		'createwallet',
		wallet_name,
		'false',
		'false',
		'foobar',
		'false',
		'true',
	]);

	let w_addresses = [];
	let buffer = await db.wallet_exec(wallet_name, ['getnewaddress']);
	let { out } = ps_extract(buffer, false);
	if (out.length) {
		w_addresses.push(out);
	}
	await Bootstrap.set_addresses(wallet_name, sanitize_addresses(w_addresses));
	await Bootstrap.unlock_wallet(wallet_name);
	await Bootstrap.alias_users();
	await Bootstrap.unlock_all_wallets();
};
function sanitize_txid_list(out) {
	for (let i = 0; i < out.length; i++) {
		out[i] = sanitize_txid(out[i]);
	}
	return out;
}

Bootstrap.save_denominated_tx = async function (username, out) {
	username = Bootstrap.alias_check(username);
	if (Array.isArray(out)) {
		out = sanitize_txid_list(out);
		return await mkudb(username).append_array('denom-txids', out);
	} else {
		out = sanitize_txid(out);
		return await mkudb(username).append_array('denom-txids', [out]);
	}
};
Bootstrap.send_satoshis_to = async function (send_to, amt, times = 10) {
	send_to = Bootstrap.alias_check(send_to);
	let address = await Bootstrap.first_address(send_to);
	d(`sending to ${address}`);
	//await Bootstrap.wallet_exec(send_to, ['generatetoaddress', '200', address]);
	//address = await Bootstrap.nth_address(send_to, 2);

	for (let i = 0; i < times; i++) {
		let output = await Bootstrap.wallet_exec(send_to, [
			'sendtoaddress',
			address,
			amt,
		]);
		let { out, err } = ps_extract(output);
		d({ out, err });
	}
};

Bootstrap.nth_address = async function (username, n) {
	let address = await Bootstrap.get_addresses(username, n);
	if (Array.isArray(address)) {
		return address[n - 1];
	}
	return address;
};
Bootstrap.first_address = async function (username) {
	let address = await Bootstrap.get_addresses(username, 1);
	if (Array.isArray(address)) {
		return address[0];
	}
	return address;
};
Bootstrap.send_raw_transaction = async function (username, str) {
	let output = await Bootstrap.auto.wallet_exec(username, [
		'sendrawtransaction',
		sanitize_tx_format(str),
	]);
	if (output.err.length) {
		throw new Error(output.err);
	}
	return output.out;
};
Bootstrap.decode_raw_transaction = async function (username, decode) {
	let output = await Bootstrap.auto.wallet_exec(username, [
		'decoderawtransaction',
		sanitize_tx_format(decode),
	]);
	if (output.err.length) {
		throw new Error(output.err);
	}
	try {
		return JSON.parse(output.out);
	} catch (e) {
		throw new Error(e);
	}
};
Bootstrap.get_transaction = async function (
	username,
	txid_list,
	keep_errors = false,
) {
	if (keep_errors) {
		Bootstrap.get_transaction_errors = [];
	}
	username = Bootstrap.alias_check(username);
	if (Array.isArray(txid_list) === false) {
		txid_list = [txid_list];
	}
	let mappings = {};
	for (const txid of txid_list) {
		let output = await Bootstrap.wallet_exec(username, [
			'gettransaction',
			sanitize_txid(txid),
		]);
		let { out, err } = ps_extract(output);
		if (err.length) {
			if (keep_errors) {
				Bootstrap.get_transaction_errors.push(err);
			}
		}
		try {
			mappings[txid] = JSON.parse(out);
		} catch (e) {
			if (keep_errors) {
				Bootstrap.get_transaction_errors.push(e);
			}
			mappings[txid] = null;
		}
	}
	return mappings;
};
Bootstrap.get_address_from_txid = async function (username, txid_list) {
	username = Bootstrap.alias_check(username);
	if (Array.isArray(txid_list) === false) {
		txid_list = [txid_list];
	}
	let mappings = {};
	for (const txid of txid_list) {
		let output = await Bootstrap.wallet_exec(username, [
			'gettransaction',
			sanitize_txid(txid),
		]);
		let { out, err } = ps_extract(output);
		if (err.length) {
			throw new Error(err);
		}
		try {
			out = JSON.parse(out);
			mappings[txid] = xt(out, 'details.0.address');
		} catch (e) {
			throw new Error(e);
		}
	}
	return mappings;
};
Bootstrap.save_exec = false;
Bootstrap.verbose = false;
Bootstrap.list_unspent = async function (username, opts = []) {
	await Bootstrap.unlock_all_wallets();
	username = Bootstrap.alias_check(username);
	let params = ['listunspent'];
	if (Array.isArray(opts)) {
		for (const p of opts) {
			params.push(p);
		}
	}
	let output = await Bootstrap.wallet_exec(username, params);
	let { out, err } = ps_extract(output);
	if (err) {
		throw new Error(err);
	}
	//dd(out.split('\n').length);
	return JSON.parse(out);
};
Bootstrap.list_unspent_by_address = async function (
	username,
	address,
	query_opts = null,
) {
	await Bootstrap.unlock_all_wallets();
	username = Bootstrap.alias_check(username);
	let params = [
		'listunspent',
		'1',
		'99999',
		`["${sanitize_address(address)}"]`,
	];
	let query = {};
	if (query_opts !== null) {
		if (xt(query_opts, 'minimumAmount')) {
			query.minimumAmount = xt(query_opts, 'minimumAmount');
		}
		if (xt(query_opts, 'maximumAmount')) {
			query.maximumAmount = xt(query_opts, 'maximumAmount');
		}
		if (xt(query_opts, 'maximumCount')) {
			query.maximumCount = xt(query_opts, 'maximumCount');
		}
		if ([true, false].includes(xt(query_opts, 'include_unsafe'))) {
			params.push(xt(query_opts, 'include_safe'));
		} else {
			params.push('false');
		}
		params.push(JSON.stringify(query));
	}

	let output = await Bootstrap.wallet_exec(username, params);
	let { out, err } = ps_extract(output);
	if (err) {
		throw new Error(err);
	}
	return JSON.parse(out);
};
Bootstrap.get_denominated_utxos = async function (
	username,
	denominatedAmount = null,
	count = 5250,
	filter_used = true,
) {
	username = Bootstrap.alias_check(username);
	let list = [];
	let utxos = await Bootstrap.user_utxos_from_cli(username);
	for (const u of utxos) {
		if (filter_used && Bootstrap.is_txid_used(u.txid)) {
			continue;
		}
		if (denominatedAmount === null) {
			list.push(u);
		} else if (u.satoshis === denominatedAmount) {
			list.push(u);
		}
		if (list.length === count) {
			return list;
		}
	}
	return list;
};
Bootstrap.alias_users = async function () {
	let users = await Bootstrap.user_list();
	for (const user of users) {
		let alias = await Bootstrap.alias_user(user);
		d(`Assigned "${alias}" to "${user}"`);
	}
};
Bootstrap.alias_check = function (user) {
	if (user === 'junk') {
		user = Bootstrap.get_junk_username();
		if (!user) {
			return 'junk';
		}
	}
	if (xt(user, 'clazz') === 'ClientSession') {
		user = user.username;
	}
	if (user.match(/^user[\d]+$/)) {
		DebugLib.setNickname(user);
		return Bootstrap.user_aliases[user];
	}
	DebugLib.setNickname(user);
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
Bootstrap.ring_buffer_init = async function (key_name, values) {
	db_cj_ns('ring_buffer');
	await db_put(
		key_name,
		JSON.stringify({
			value: values[0],
			values,
		}),
	);
};
Bootstrap.ring_buffer_next = async function (key_name) {
	db_cj_ns('ring_buffer');
	let val = await db_get(key_name);
	try {
		val = JSON.parse(val);
	} catch (e) {
		throw new Error(e);
	}
	if (val === null) {
		throw new Error('needs-init');
	}
	let values = val.values;
	let current = val.value;
	let index = values.indexOf(current);
	if (index + 1 >= values.length) {
		val.value = values[0];
	} else {
		val.value = values[index + 1];
	}
	await db_put(
		key_name,
		JSON.stringify({
			value: val.value,
			values: val.values,
		}),
	);
	return val.value;
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
	throw new Error('stub');
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
	count,
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
	except,
) {
	count = parseInt(count, 10);
	if (isNaN(count) || count <= 0) {
		throw new Error('count must be a positive non-zero integer');
	}

	let utxos = await Bootstrap.get_denominated_utxos(
		username,
		denominatedAmount,
		count,
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
	throw new Error("Couldn't find enough transactions");
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
Bootstrap._data = {
	user_names: [
		'luke',
		'han',
		'chewie',
		'vader',
		'padme',
		'wedge',
		'tobias',
		'obi',
		'jarjar',
		'lando',
		'boba',
		'jango',
		'finn',
		'kit',
	],
	un_index: -1,
};

Bootstrap.random_name = async function () {
	Bootstrap._data.un_index += 1;
	return Bootstrap._data.user_names[Bootstrap._data.un_index];
};

Bootstrap.run = async function (cli_arguments) {
	return await cproc.spawnSync(Bootstrap.DASH_CLI, cli_args(cli_arguments));
};

Bootstrap.__error = null;
Bootstrap.saved_exec_list = [];

Bootstrap.load_instance = async function (instance_name, options = {}) {
	if (instance_name === null) {
		let file = `${process.env.HOME}/.dashjoinjs/current`;
		instance_name = await fs.readFileSync(file);
		instance_name = instance_name.toString().replace(/[^a-z0-9]+/gi, '');
	}
	if ([true, false].includes(xt(options, 'save_exec'))) {
		Bootstrap.save_exec = options.save_exec;
	}
	Bootstrap.saved_exec_list = [];
	Bootstrap.DASH_CLI = 'dash-cli';
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
	db_set_ns = Bootstrap.MetaDB.set_namespaces;
	db_cj = Bootstrap.MetaDB.db_cj;
	db_cj_ns = Bootstrap.MetaDB.db_cj_ns;
	db_get = Bootstrap.MetaDB.db_get;
	db_put = Bootstrap.MetaDB.db_put;
	db_append = Bootstrap.MetaDB.db_append;
	db_del = Bootstrap.MetaDB.db_del;
	db_cj();
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

/**
 * opts can be:
 * {
     change: true/false, // to get change addresses as well
     only_change: true, // will return only change addresses and not combined with addresses
     main_only: true, // will return main address
     include_all: true, // will give main, change, and addresses
   }
 */
Bootstrap.get_addresses = async function (username, opts = {}) {
	username = Bootstrap.alias_check(username);
	let udb = mkudb(username);
	let change = xt(opts, 'change');
	let only_change = xt(opts, 'only_change');
	let main_only = xt(opts, 'main_only');
	let include_all = xt(opts, 'include_all');
	let main = await udb.main_address();
	if (main_only === true) {
		return main;
	}
	if (only_change === true) {
		return unique(await udb.get_array('change'));
	}
	let list = await udb.get_array('addresses');
	if (change === true) {
		list = unique([...list, ...(await udb.get_array('change'))]);
	}
	if (include_all === true) {
		return unique([...list, ...(await udb.get_array('change')), main]);
	}

	return list;
};
Bootstrap.user_addresses = async function (username) {
	username = Bootstrap.alias_check(username);
	return await mkudb(username).get_array('addresses');
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
				await mkudb(username).set_array('addresses', keep);
				console.info(`${keep.length} addresses imported for user: ${username}`);
				return true;
			} else {
				console.warn(`No addresses for user: ${username}`);
			}
		} catch (e) {
			console.error(e);
		}
	}
	return false;
};

Bootstrap.is_sane_address = function (address) {
	try {
		if (address === null || address === 'null') {
			return false;
		}
		let a = sanitize_address(address);
		if (a === null || String(a).length === 0) {
			return false;
		}
		return a.length > 0;
	} catch (e) {
		return false;
	}
};
Bootstrap.user_utxos_from_cli = async function (username, addresses = []) {
	await Bootstrap.unlock_all_wallets();
	username = Bootstrap.alias_check(username);
	let utxos = [];
	if (addresses === null || addresses.length === 0) {
		addresses = await Bootstrap.get_addresses(username);
	}
	for (const address of addresses) {
		if (Bootstrap.is_sane_address(address) === false) {
			d(`weird address: "${address}"`);
			continue;
		}
		let encoded = JSON.stringify({
			addresses: [Bootstrap.sanitize_address(address)],
		});
		let ps = await Bootstrap.wallet_exec(username, [
			'getaddressutxos',
			encoded,
		]);
		let { err, out } = ps_extract(ps);
		if (err.length) {
			console.error({ user_utxos_from_cli_ERROR: err, encoded });
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

Bootstrap.auto = {};
Bootstrap.auto.build_executor = async function (wallet_name) {
	wallet_name = Bootstrap.alias_check(wallet_name);
	let _wallet = wallet_name;
	return async function (...args) {
		return await Bootstrap.auto.wallet_exec(_wallet, [...args]);
	};
};
Bootstrap.auto.wallet_exec = async function (wallet_name, cli_arguments) {
	wallet_name = Bootstrap.alias_check(wallet_name);
	if (['1', 'true'].indexOf(String(extractOption('verbose', true))) !== -1) {
		let args = cli_args([`-rpcwallet=${wallet_name}`, ...cli_arguments]);
		if (Bootstrap.verbose || Bootstrap.save_exec) {
			console.info(`wallet_exec: "${Bootstrap.DASH_CLI} ${args}`);
		}
	}
	if (Bootstrap.save_exec) {
		Bootstrap.saved_exec_list.push([
			Bootstrap.DASH_CLI,
			cli_args([`-rpcwallet=${wallet_name}`, ...cli_arguments]),
		]);
	}
	let output = await cproc.spawnSync(
		Bootstrap.DASH_CLI,
		cli_args([`-rpcwallet=${wallet_name}`, ...cli_arguments]),
	);
	return ps_extract(output);
};
Bootstrap.wallet_exec = async function (wallet_name, cli_arguments) {
	wallet_name = Bootstrap.alias_check(wallet_name);
	if (['1', 'true'].indexOf(String(extractOption('verbose', true))) !== -1) {
		let args = cli_args([`-rpcwallet=${wallet_name}`, ...cli_arguments]);
		if (Bootstrap.verbose || Bootstrap.save_exec) {
			console.info(`wallet_exec: "${Bootstrap.DASH_CLI} ${args}`);
		}
	}
	if (Bootstrap.save_exec) {
		Bootstrap.saved_exec_list.push([
			Bootstrap.DASH_CLI,
			cli_args([`-rpcwallet=${wallet_name}`, ...cli_arguments]),
		]);
	}
	return await cproc.spawnSync(
		Bootstrap.DASH_CLI,
		cli_args([`-rpcwallet=${wallet_name}`, ...cli_arguments]),
	);
};
Bootstrap.get_multi_change_address_from_cli = async function (
	username,
	count,
	save = true,
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
		await Bootstrap.store_addresses(username, addresses, 'change');
	}
	return addresses;
};
Bootstrap.get_change_address_from_cli = async function (username, save = true) {
	username = Bootstrap.alias_check(username);
	let buffer = await Bootstrap.wallet_exec(username, ['getrawchangeaddress']);
	let { out, err } = ps_extract(buffer, false);
	if (err.length) {
		throw new Error(err);
	}
	if (!save) {
		return out;
	}

	await Bootstrap.store_addresses(username, [out], 'change');
	return out;
};
Bootstrap.get_change_addresses = async function (username) {
	username = Bootstrap.alias_check(username);
	return await mkudb(username).get_array('change');
};
Bootstrap.decode = function (in_ps_extracted) {
	if (in_ps_extracted.err.length) {
		throw new Error(in_ps_extracted.err);
	}
	try {
		return JSON.parse(in_ps_extracted.out);
	} catch (e) {
		throw new Error(e);
	}
};
Bootstrap.finalize_psbt = async function (username, psbt) {
	username = Bootstrap.alias_check(username);
	return Bootstrap.decode(
		await Bootstrap.auto.wallet_exec(username, [
			'finalizepsbt',
			sanitize_psbt(psbt),
		]),
	);
};
Bootstrap.generate_new_addresses = async function (username, count) {
	username = Bootstrap.alias_check(username);
	let addresses = [];
	for (let i = 0; i < count; i++) {
		let buffer = await Bootstrap.wallet_exec(username, ['getnewaddress']);
		let { out } = ps_extract(buffer, false);
		if (out.length) {
			addresses.push(out);
		}
	}
	await Bootstrap.store_addresses(username, addresses);
	return addresses;
};
Bootstrap.generate_address = async function (username, count = 10) {
	if (isNaN(parseInt(count, 10))) {
		count = 10;
	}
	username = Bootstrap.alias_check(username);
	let addresses = [];
	for (let i = 0; i < count; i++) {
		let buffer = await Bootstrap.wallet_exec(username, ['getnewaddress']);
		let { out } = ps_extract(buffer, false);
		if (out.length) {
			addresses.push(out);
		}
	}
	await Bootstrap.store_addresses(username, addresses);
	return addresses;
};
Bootstrap.store_change_addresses = async function (username, w_addresses) {
	username = Bootstrap.alias_check(username);
	return await Bootstrap.store_addresses(
		username,
		sanitize_addresses(w_addresses),
		'change',
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
Bootstrap.set_addresses = async function (username, w_addresses) {
	username = Bootstrap.alias_check(username);
	return await mkudb(username).set_array(
		'addresses',
		sanitize_addresses(w_addresses),
	);
};

Bootstrap.store_denominated_addresses = async function (username, addresses) {
	username = Bootstrap.alias_check(username);
	return await Bootstrap.store_addresses(
		username,
		addresses,
		'denominated-addresses',
	);
};
Bootstrap.get_denominated_addresses = async function (username) {
	username = Bootstrap.alias_check(username);
	return await Bootstrap.get_addresses(username, 'denominated-addresses');
};

Bootstrap.get_addresses = async function (username, key = 'addresses') {
	username = Bootstrap.alias_check(username);
	let udb = mkudb(username);
	let addresses = await udb.get_array(key);
	if (Array.isArray(addresses)) {
		return unique(sanitize_addresses(addresses));
	}
	return [];
};

Bootstrap.store_addresses = async function (
	username,
	w_addresses,
	key = 'addresses',
) {
	username = Bootstrap.alias_check(username);
	let udb = mkudb(username);
	let addresses = await udb.get_array(key);
	if (Array.isArray(addresses)) {
		addresses = [...addresses, ...sanitize_addresses(w_addresses)];
	} else {
		addresses = sanitize_addresses(w_addresses);
	}
	addresses = unique(addresses);
	return await udb.set_array(key, addresses);
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
	let addresses = [];
	for (const user of users) {
		if (user !== forUser) {
			addresses = await Bootstrap.user_addresses(user);
			addresses = Bootstrap.shuffle(addresses);
			addy = { user: user, address: addresses[0] };
			return addy;
		}
	}
	return addy;
};
Bootstrap.filter_address = async function (username, except) {
	username = Bootstrap.alias_check(username);
	let keep = [];
	await mkudb(username).page_array('addresses', function (address) {
		if (except.indexOf(address) === -1) {
			keep.push(address);
		}
	});
	return keep;
};

Bootstrap.get_users_with_denominated_utxos = async function (userDenoms) {
	await Bootstrap.unlock_all_wallets();
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
Bootstrap.create_wallets = async function (count = 3) {
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
		for (let actr = 0; actr < 1; actr++) {
			let buffer = await Bootstrap.wallet_exec(wallet_name, ['getnewaddress']);
			let { out } = ps_extract(buffer, false);
			if (out.length) {
				await mkudb(wallet_name).set_main_address(out);
				w_addresses.push(out);
			}
		}
		await Bootstrap.store_addresses(
			wallet_name,
			sanitize_addresses(w_addresses),
		);
		await Bootstrap.unlock_wallet(wallet_name);
	}
	await Bootstrap.alias_users();
	await Bootstrap.unlock_all_wallets();
};
Bootstrap.grind = async function () {
	await Bootstrap.unlock_all_wallets();
	for (let i = 0; i < 100; i++) {
		if (i % 10 === 0) {
			await Bootstrap.generate_dash_to_all();
		}
		await Bootstrap.create_denominations_to_all();
	}
};
Bootstrap.create_denominations_to_all = async function (iterations = 10) {
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
				let address = await mkudb(otherUser).main_address();
				let ps = await Bootstrap.wallet_exec(user, [
					'sendtoaddress',
					address,
					AMOUNT,
				]);
				let { out, err } = ps_extract(ps);
				if (err) {
					console.error(`ERROR: ${err}`);
				} else {
					console.log(out);
				}
			}
		}
	}
};
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
				let address = await mkudb(otherUser).main_address();
				let ps = await Bootstrap.wallet_exec(user, [
					'sendtoaddress',
					address,
					AMOUNT,
				]);
				let { out, err } = ps_extract(ps);
				if (out.length) {
					let txid = sanitize_txid(out);
					console.log({
						sent_to: address,
						from: user,
						to: otherUser,
						txid,
					});
				}
				if (err.length) {
					console.error({ address, from: user, to: otherUser, err });
				}
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
		]),
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
function line() {
	console.log('');
	for (let i = 0; i < 80; i++) {
		process.stdout.write('-');
	}
	console.log('');
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

Bootstrap.generate_dash_to_all = async function (iterations = 1) {
	for (let i = 0; i < iterations; i++) {
		const users = await Bootstrap.user_list();
		for (const user of users) {
			let address = await mkudb(user).main_address();
			let ps = await Bootstrap.wallet_exec(user, [
				'generatetoaddress',
				'2',
				address,
			]);
			let { err, out } = ps_extract(ps, false);
			if (err.length) {
				console.error(`ERROR: ${user}: "${err}"`);
			} else {
				console.log(out);
			}
		}
	}
};

Bootstrap.generate_dash_to = async function (username) {
	username = Bootstrap.alias_check(username);
	let address = await mkudb(username).main_address();
	if (address === null) {
		address = await Bootstrap.generate_new_addresses(username, 1);
		await mkudb(username).set_main_address(address[0]);
		return await Bootstrap.generate_dash_to(username);
	}
	let ps = await Bootstrap.wallet_exec(username, [
		'generatetoaddress',
		'10',
		address,
	]);
	let { err, out } = ps_extract(ps, false);
	if (err.length) {
		console.error(`ERROR: ${username}: "${err}"`);
	} else {
		console.log(out);
	}
};

function usage() {
	console.log('Usage: dashboot [options] --instance=N');
	console.log('');
	console.log('# Options');
	console.log('-------------------------------------------------------');
	console.log(
		'--instance=N       Uses N as the instance. If not passed, defaults to "base"',
	);
	console.log('--unlock-all       Unlocks all user wallets.');
	console.log('--addrfromtxid=TX  [EXPERIMENTAL]           ');
	console.log('             i---> Requires --username=U    ');
	console.log('--generate-to=N    Generates DASH to the user named N');
	console.log('--dash-for-all     Generates DASH to EVERY user');
	console.log("--create-wallets   Creates wallets, addresses, and UTXO's");
	console.log('--create-n-wallet=N  Creates N wallets');
	console.log(
		"--denom-amt=N      Search through user's UTXO's for denominated amounts matching N",
	);
	console.log(
		'                   denom-amt also requires that you pass in --username=U',
	);
	console.log(
		'--create-denoms    Loops through all wallets and sends each wallet 0.00100001 DASH',
	);
	console.log(
		'--create-cols      Loops through all wallets and creates collaterals',
	);
	console.log('--list-users       Lists all users');
	console.log(
		'--filter-unused=User  Filter unused txids and discard used txids from lmdb entries for User',
	);
	console.log(
		'--user-denoms=AMT  Lists all users with the desired denominated amount',
	);
	console.log(
		'--send-to=USER/--amount=SAT  When combined, sends SAT satoshis to USER',
	);
	console.log('--list-addr=user   Lists all addresses for a user');
	console.log("--list-utxos=user  Lists all UTXO's for a user");
	console.log("--all-utxos        Lists all UTXO's for ALL users");
	console.log('--new-addr=user    Creates 10 new addresses for the given user');
	console.log(
		'--wallet-cmd=user  Gives you the ability to call dash-cli for the specified user',
	);
	console.log(
		'--dump-dsf         Dumps the db contents for DSF example payloads that have been logged',
	);
	console.log(
		'--dsf-to=FILE      Dumps the db contents for DSF example payloads to the specified file',
	);
	console.log(
		'--import-addresses=USER  Import addresses from dash-cli into lmdb',
	);
	console.log(
		'--sync-all         Will import all addresses from dash-cli into lmdb for ALL users',
	);
	console.log('--alias-users      Will give easy to use names for each user');
	console.log(
		'--grind            Calls generate dash and create denoms in a loop',
	);
	console.log('--hash-byte-order=N  Convert the string N into hash byte order');
	console.log('--split-utxos=USER   Split one big transaction into 0.00100001');
	console.log('--make-junk-user     Create a junk user');
	console.log(
		'--grind-junk-user    Send a ton of dash to this junk user to give the more important users confirmations',
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
	let hbo = extractOption('hash-byte-order', true);
	if (hbo) {
		process.stdout.write(hashByteOrder(hbo));
		process.exit(0);
	}
	await Bootstrap.load_instance(config.instance);
	await Bootstrap.load_alias_ram_slots();
	{
		let user = extractOption('split-utxos', true);
		let count = extractOption('count', true);
		if (user) {
			count = parseInt(count, 10);
			if (isNaN(count)) {
				count = 1;
			}
			for (let i = 0; i < count; i++) {
				d(await Bootstrap.split_utxo(user));
			}
			process.exit(0);
		}
	}
	{
		if (extractOption('make-junk-user')) {
			d(await db.make_junk_wallet());
			process.exit(0);
		}
	}
	{
		if (extractOption('grind-junk-user')) {
			d(await Bootstrap.grind_junk_user());
			process.exit(0);
		}
	}
	{
		if (extractOption('grind')) {
			d(await Bootstrap.grind());
			process.exit(0);
		}
	}
	{
		let send_to = extractOption('send-to', true);
		let amt = extractOption('amount', true);
		if (send_to && amt) {
			let times = extractOption('times', true);
			if (!times) {
				console.log('defaulting to 20 sends. to override, use --times=N');
				times = 20;
			}
			d(await Bootstrap.send_satoshis_to(send_to, amt, times));
			process.exit(0);
		}
	}
	{
		let user = extractOption('new-addr', true);
		if (user) {
			let count = extractOption('count', true);
			d(await Bootstrap.generate_address(user, count));
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
				txid,
			),
		);
		process.exit(0);
	}
	{
		if (extractOption('all-utxos')) {
			let users = await Bootstrap.user_list();
			for (const user of users) {
				line();
				console.log({ [user]: 'start' });
				line();
				let addresses = await Bootstrap.user_addresses(user);
				let utxos = await Bootstrap.user_utxos_from_cli(user, addresses);
				for (const u of utxos) {
					console.log(u);
				}
				line();
				console.log({ [user]: utxos.length });
				line();
			}
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
			let users = await Bootstrap.user_list();
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
			'./dsf-7250bb2a2e294f728081f50ee2bdd3a1.dat',
		);
		d(await Bootstrap._dsftest1(buffer, '7250bb2a2e294f728081f50ee2bdd3a1'));
		process.exit(0);
	}
	let denom = extractOption('denom-amt', true);
	if (denom) {
		let username = extractOption('username', true);
		if (!username) {
			console.error('Error: --username must be passed with --denom-amt');
			process.exit(1);
		}
		let utxos = await Bootstrap.get_denominated_utxos(
			username,
			parseInt(denom, 10),
		);
		await LogUtxos(username, utxos);
		d(utxos);
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
		cmd = Bootstrap.alias_check(cmd);
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
			'...',
		);
		await Bootstrap.unlock_all_wallets();
		d(await Bootstrap.generate_dash_to(config.generateTo));
		console.log('[DONE]');
		process.exit(0);
		return;
	}
	let countArg = extractOption('create-n-wallets', true);
	if (countArg !== null) {
		let count = parseInt(String(countArg), 10);
		if (isNaN(count)) {
			d('usage: --create-n-wallets=N where N is a number');
			process.exit(1);
		}
		await Bootstrap.create_wallets(count);
		d('created wallets');
		process.exit(0);
	}
	if (config.create_wallets ?? false) {
		d(await Bootstrap.create_wallets());
		process.exit(0);
	}
	if (config.dash_for_all) {
		await Bootstrap.unlock_all_wallets();
		d(await Bootstrap.generate_dash_to_all(100));
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
		config.list_addr = Bootstrap.alias_check(config.list_addr);
		d({ conf_user: config.list_addr });
		d({ 'main-address': await mkudb(config.list_addr).main_address() });
		let address = await Bootstrap.user_addresses(config.list_addr);
		d(address);
		process.exit(0);
	}
	if (config.list_utxos) {
		config.list_utxos = Bootstrap.alias_check(config.list_utxos);
		d(await Bootstrap.get_denominated_utxos(config.list_utxos, null, 5000));
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
	//console.info('[ ] Loading used txids into ram....');
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
					if (u2 === null) {
						continue;
					}
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
	//console.info(`[+] ${Bootstrap.used_txids.length} used txids loaded into ram`);
};
Bootstrap.user_aliases = {};
Bootstrap.load_alias_ram_slots = async function () {
	//console.info('[ ] Loading user aliases into ram....');
	Bootstrap.user_aliases = {};
	for (const user of await Bootstrap.user_list({ with: 'alias' })) {
		Bootstrap.user_aliases[user.alias] = user.user;
	}
	//console.info(Bootstrap.user_aliases);
	//console.info(
	//	`[+] ${
	//		Object.keys(Bootstrap.user_aliases).length
	//	} user aliases loaded into ram`
	//);
};
Bootstrap.mark_txid_used = async function (username, txid) {
	username = Bootstrap.alias_check(username);
	let existing = await Bootstrap.get_used_txids(username);
	existing.push(txid);
	existing = unique(existing);
	Bootstrap.used_txids.push(txid);
	return await mkudb(username).append_array('usedtxids', existing);
};
Bootstrap.get_used_txids = async function (username) {
	username = Bootstrap.alias_check(username);
	return await mkudb(username).get_array('usedtxids');
};
Bootstrap.ram_txid_used = function (txid) {
	return Bootstrap.used_txids.indexOf(txid) !== -1;
};

Bootstrap.extract_unique_users = async function (
	count,
	denominatedAmount,
	besides,
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
		debug: {
			dd,
			d,
		},
	};
};
Bootstrap.utils = Bootstrap.helpers();
