'use strict';

//const cproc = require('child_process');
//const crypto = require('crypto');
//const fs = require('fs');
//const { xt } = require('@mentoc/xtract');
//const ArrayUtils = require('../array-utils.js');

function d(f) {
	console.debug(f);
}
//function dd(f) {
//	console.debug(f);
//	process.exit();
//}

module.exports = function (_DB) {
	let Lib = { DB: _DB, debug: false };
	Lib.before_tx = function () {};
	Lib.set_debug = function (on_or_off) {
		Lib.debug = on_or_off;
	};
	Lib.get_debug = function () {
		return Lib.debug;
	};
	Lib.set_namespaces = function (n) {
		Lib.DB.set_namespaces(n);
	};
	Lib.db_cj = function db_cj() {
		Lib.DB.set_namespaces(['coinjoin']);
	};
	Lib.db_cj_ns = function db_cj_ns(list) {
		Lib.DB.set_namespaces(['coinjoin', ...list]);
	};
	Lib.db_put = async function db_put(key, val) {
		if (Lib.debug) {
			d({ db_put: { key, val } });
		}
		await Lib.DB.ns.put(key, val);
	};
	Lib.db_del = async function db_del(key) {
		if (Lib.debug) {
			d({ db_del: key });
		}
		return await Lib.DB.ns.del(key);
	};
	Lib.db_get = async function db_get(key) {
		if (Lib.debug) {
			d({ db_get: key });
		}
		return await Lib.DB.ns.get(key);
	};
	Lib.db_append = function db_append(key, val) {
		let ex = Lib.DB.ns.get(key);
		Lib.DB.ns.put(key, ex + val);
	};

	Lib.meta_get = async function (username, key) {
		if (Array.isArray(username)) {
			Lib.db_cj_ns(username);
		} else {
			Lib.db_cj_ns([username]);
		}
		try {
			let t = await Lib.db_get(key);
			t = JSON.parse(t);
			if (!Array.isArray(t)) {
				return [];
			}
			return t;
		} catch (e) {
			return [];
		}
	};
	Lib.meta_set = async function (username, key, values) {
		if (Lib.debug) {
			if (Array.isArray(values)) {
				d('meta_set entry', { username, key, item_count: values.length });
			} else {
				d('meta_set entry', { username, key, item_count: 'not-array' });
			}
		}
		if (Array.isArray(username)) {
			Lib.db_cj_ns(username);
		} else {
			Lib.db_cj_ns([username]);
		}
		if (!Array.isArray(values)) {
			values = [values];
		}
		await Lib.db_put(key, JSON.stringify(values));
	};
	Lib.meta_store = async function (username, key, values) {
		if (Lib.debug) {
			if (Array.isArray(values)) {
				d('meta_store entry', { username, key, item_count: values.length });
			} else {
				d('meta_store entry', { username, key, item_count: 'not-array' });
			}
		}
		if (Array.isArray(username)) {
			Lib.db_cj_ns(username);
		} else {
			Lib.db_cj_ns([username]);
		}
		let existing = await Lib.meta_get(username, key);
		if (!Array.isArray(existing)) {
			existing = [];
		}
		if (Array.isArray(values)) {
			for (const r of values) {
				existing.push(r);
			}
		} else {
			existing.push(values);
		}
		if (Array.isArray(username)) {
			Lib.db_cj_ns(username);
		} else {
			Lib.db_cj_ns([username]);
		}
		await Lib.db_put(key, JSON.stringify(existing));
	};
	Lib.meta_remove = async function (username, key, values) {
		if (Lib.debug) {
			if (Array.isArray(values)) {
				d('meta_remove entry', { username, key, item_count: values.length });
			} else {
				d('meta_remove entry', { username, key, item_count: 'not-array' });
			}
		}

		if (Array.isArray(username)) {
			Lib.db_cj_ns(username);
		} else {
			Lib.db_cj_ns([username]);
		}
		let existing = await Lib.meta_get(username, key);
		if (!Array.isArray(existing)) {
			existing = [];
		}
		if (Array.isArray(values)) {
			existing = existing.filter(function (val) {
				return values.indexOf(val) === -1;
			});
		} else {
			existing = existing.filter(function (val) {
				return val !== values;
			});
		}
		if (Array.isArray(username)) {
			Lib.db_cj_ns(username);
		} else {
			Lib.db_cj_ns([username]);
		}
		await Lib.db_put(key, JSON.stringify(existing));
	};
	return Lib;
};
