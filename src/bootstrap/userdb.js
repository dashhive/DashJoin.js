'use strict';

function UserDB(globs, u = null) {
	let db_put = globs.db_put;
	let db_get = globs.db_get;
	let db_del = globs.db_del;
	let db_set_ns = globs.db_set_ns;
	let db_make_key = globs.db_make_key;
	let self = this;
	self.user = u;
	self.ns = null;
	self.set_ns = function (s) {
		self.ns = s;
	};
	self.build_ns = function () {
		let params = [];
		if (self.ns) {
			params.push(self.ns);
		}
		params.push(self.user);
		params.push('');
		db_set_ns(params);
	};
	self.set_username = function (u) {
		self.user = u;
	};
	self.get_username = function () {
		return self.user;
	};
	self.u = self.set_username;

	self.make_key = function (key) {
		return db_make_key(key);
	};
	self.get = async function (key) {
		self.build_ns();
		return await db_get(key);
	};
	self.put = async function (key, val) {
		self.build_ns();
		return await db_put(key, String(val));
	};
	self.del = async function (key) {
		self.build_ns();
		return await db_del(key);
	};
	self.main_address = async function () {
		return await self.get('main-address');
	};
	self.set_main_address = async function (mad) {
		return await self.put('main-address', mad);
	};
	self.change_address = async function () {
		return await self.get('change-address');
	};
	self.set_change_address = async function (ch) {
		return await self.put('change-address', ch);
	};
	self.set_array = async function (key, values) {
		await self.put(`${key}|n`, values.length);
		let ctr = 0;
		for (const val of values) {
			await self.put(`${key}|${ctr}`, val);
			++ctr;
		}
		return ctr;
	};
	self.remove_array = async function (key) {
		let items = await self.get(`${key}|n`);
		await self.del(`${key}|n`);
		let ctr = 0;
		for (let i = 0; i < items; i++) {
			await self.del(`${key}|${ctr}`);
		}
		return ctr;
	};
	self.get_array = async function (key) {
		let items = await self.get(`${key}|n`);
		let ctr = 0;
		let res = [];
		for (let i = 0; i < items; i++) {
			res.push(await self.get(`${key}|${ctr}`));
			++ctr;
		}
		return res;
	};
	self.page_array = async function (key, cb) {
		let items = await self.get(`${key}|n`);
		for (let i = 0; i < items; i++) {
			let val = await self.get(`${key}|${i}`);
			let result = await cb(val);
			if (result === false) {
				return;
			}
		}
	};
	self.append_array = async function (key, values) {
		let items = await self.get(`${key}|n`);
		if (items === null || items === 0) {
			return await self.set_array(key, values);
		}
		let existing = [];
		for (let i = 0; i < items; i++) {
			existing.push(await self.get(`${key}|${i}`));
		}
		for (const v of values) {
			existing.push(v);
			await self.put(`${key}|${items}`, v);
			++items;
		}
		await self.put(`${key}|n`, existing.length);
		return existing.length;
	};
	self.list_array = async function (key) {
		let item_count = await self.get(`${key}|n`);
		let good = [];
		for (let i = 0; i < item_count; i++) {
			if (await self.get(`${key}|${i}`)) {
				good.push(`${key}|${i}`);
			}
		}
		return good;
	};
}
module.exports = UserDB;
