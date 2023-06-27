'use strict';

const cproc = require('child_process');
const crypto = require('crypto');
const fs = require('fs');

function d(f) {
	console.debug(f);
}
function dd(f) {
	console.debug(f);
	process.exit();
}

module.exports = function (_DB) {
	let Lib = { DB: _DB, debug: false };
	let ourDB = _DB;
	Lib.set_debug = function (on_or_off) {
		Lib.debug = on_or_off;
	};
	Lib.get_debug = function () {
		return Lib.debug;
	};
	Lib.db_cj = function db_cj() {
		Lib.DB.set_namespaces(['coinjoin']);
	};
	Lib.db_cj_ns = function db_cj_ns(list) {
		Lib.DB.set_namespaces(['coinjoin', ...list]);
	};
	Lib.db_put = function db_put(key, val) {
		if (Lib.debug) {
			d({ db_put: { key, val } });
		}
		Lib.DB.ns.put(key, val);
	};
	Lib.db_get = function db_get(key) {
		if (Lib.debug) {
			d({ db_get: key });
		}
		return Lib.DB.ns.get(key);
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
			let t = Lib.db_get(key);
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
		if (Array.isArray(username)) {
			Lib.db_cj_ns(username);
		} else {
			Lib.db_cj_ns([username]);
		}
		if (!Array.isArray(values)) {
			values = [values];
		}
		Lib.db_put(key, JSON.stringify(values));
	};
	Lib.meta_store = async function (username, key, values) {
		if (Array.isArray(username)) {
			Lib.db_cj_ns(username);
		} else {
			Lib.db_cj_ns([username]);
		}
		let existing = Lib.meta_get(username, key);
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
		Lib.db_put(key, JSON.stringify(existing));
	};
	return Lib;
};
