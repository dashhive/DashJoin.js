'use strict';

const cproc = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const { xt } = require('@mentoc/xtract');
const ArrayUtils = require('../array-utils.js');

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
	Lib.db_put = async function db_put(key, val) {
		//if (Lib.debug) {
		//	d({ db_put: { key, val } });
		//}
		await Lib.DB.ns.put(key, val);
	};
	Lib.db_get = async function db_get(key) {
		//if (Lib.debug) {
		//	d({ db_get: key });
		//}
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
		if (Array.isArray(username)) {
			Lib.db_cj_ns(username);
		} else {
			Lib.db_cj_ns([username]);
		}
		if (!Array.isArray(values)) {
			values = [values];
		}
		//console.debug(
		//	`meta_set ${username}|${key} size: ${JSON.stringify(values).length}`
		//);
		await Lib.db_put(key, JSON.stringify(values));
	};
	Lib.meta_store = async function (username, key, values) {
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
		//console.debug(
		//	`meta_store ${username}|${key} size: ${JSON.stringify(existing).length}`
		//);
		await Lib.db_put(key, JSON.stringify(existing));
	};
	Lib.meta_remove = async function (username, key, values) {
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
	Lib.paged_index_key = function (username, key) {
		return `${username}|${key}|index`;
	};
	Lib.page = function () {
		return {
			pages: 0,
			template: '',
			items_per_page: 250,
		};
	};
	Lib.reset_page = async function (username, key, items_per_page = 250) {
		let p = Lib.page();
		let pindex = Lib.paged_index_key(username, key);
		p.pages = 1;
		p.template = `${username}|${key}|page|#`;
		p.items_per_page = items_per_page;
		await Lib.db_put(pindex, JSON.stringify(p));
		return p;
	};
	Lib.create_page = async function (username, key, items_per_page = 250) {
		let pindex = Lib.paged_index_key(username, key);
		let meta = await Lib.db_get(pindex);
		//console.debug({ meta });
		if (xt(meta, 'pages') === null) {
			let p = Lib.page();
			p.pages = 1;
			p.template = `${username}|${key}|page|#`;
			p.items_per_page = items_per_page;
			await Lib.db_put(pindex, JSON.stringify(p));
			return p;
		}
		let p = await Lib.db_get(pindex);
		try {
			let page = JSON.parse(p);
			page.pages += 1;
			page.template = `${username}|${key}|page|#`;
			page.items_per_page = items_per_page;
			await Lib.db_put(pindex, JSON.stringify(page));
			return page;
		} catch (e) {
			//console.error({ e });
			throw new Error(e);
		}
	};
	async function staged_put(page_key, values) {
		if (Array.isArray(values)) {
			return await Lib.db_put(page_key, JSON.stringify(values));
		} else {
			return await Lib.db_put(page_key, JSON.stringify([values]));
		}
	}
	async function json_get(key, defaults) {
		let contents = await Lib.db_get(key);
		try {
			let c = JSON.parse(contents);
			if (!Array.isArray(c)) {
				return defaults;
			}
			return c;
		} catch (e) {
			//console.error(e);
		}
		return defaults;
	}
	async function json_get_object(key, defaults) {
		let contents = await Lib.db_get(key);
		try {
			let c = JSON.parse(contents);
			if (!c) {
				return defaults;
			}
			return c;
		} catch (e) {
			//console.error(e);
		}
		return defaults;
	}
	Lib.paged_set = async function (username, key, values, items_per_page = 250) {
		let page = await Lib.reset_page(username, key, items_per_page);
		let page_number = 1;
		let page_key = `${username}|${key}|page|${page_number}`;
		if (!Array.isArray(values)) {
			values = [values];
		}
		let ctr = 0;
		if (values.length >= xt(page, 'items_per_page')) {
			for (let i = 0; i <= values.length / page.items_per_page; i++) {
				let chunk = values.splice(0, page.items_per_page);
				ctr += chunk.length;
				page_key = `${username}|${key}|page|${page.pages}`;
				await staged_put(page_key, chunk);
				page = await Lib.create_page(username, key, items_per_page);
			}
		} else {
			await staged_put(page_key, values);
			ctr = values.length;
		}
		return {
			set: ctr,
			page,
			page_key,
		};
	};
	Lib.paged_store = async function (
		username,
		key,
		values,
		items_per_page = 250
	) {
		let pindex = Lib.paged_index_key(username, key);
		let page = await json_get_object(pindex);
		if (!xt(page, 'pages')) {
			page = await Lib.create_page(username, key, items_per_page);
		}
		let page_number = xt(page, 'pages');
		let page_key = `${username}|${key}|page|${page_number}`;
		if (!Array.isArray(values)) {
			values = [values];
		}
		let current = await json_get(page_key, values);
		values = [...current, ...values];
		if (values.length >= xt(page, 'items_per_page')) {
			for (let i = 0; i <= values.length / page.items_per_page; i++) {
				let chunk = values.splice(0, page.items_per_page);
				page_key = `${username}|${key}|page|${page.pages}`;
				await staged_put(page_key, chunk);
				page = await Lib.create_page(username, key, items_per_page);
			}
		} else {
			let contents = await json_get(page_key, []);
			contents = [...contents, ...values];
			contents = ArrayUtils.unique(contents);
			return await staged_put(page_key, contents);
		}
	};
	Lib.paged_get = async function (username, key, page) {
		page = parseInt(page, 10);
		return await json_get(`${username}|${key}|page|${page}`);
	};
	async function get_page_index(username, key) {
		let pindex = Lib.paged_index_key(username, key);
		return await json_get_object(pindex, null);
	}
	Lib.pages = async function (username, key, items_per_page = 250) {
		let pages = await get_page_index(username, key);
		if (pages === null) {
			pages = await Lib.create_page(username, key, items_per_page);
		}
		return pages;
	};
	Lib.paged_for_each = async function (username, key, options, cb) {
		let pages = await get_page_index(username, key);
		//if (Lib.debug) {
		//	d({ pages });
		//}
		if (!pages) {
			return 0;
		}
		let context = xt(options, 'context');
		let page_count = parseInt(pages.pages, 10);
		if (isNaN(page_count) || page_count <= 0) {
			return 0;
		}
		let ctr = 0;
		let meta = {};
		for (let i = 1; i <= pages.pages; i++) {
			++ctr;
			if (xt(options, 'include_meta') === true) {
				meta = {
					username,
					key,
					page: i,
					index: pages,
				};
			}
			let keep_going = await cb(
				await Lib.paged_get(username, key, i),
				meta,
				context
			).catch(function (error) {
				//console.error(error);
				return true;
			});
			if (keep_going === false) {
				return ctr;
			}
		}
	};
	return Lib;
};
