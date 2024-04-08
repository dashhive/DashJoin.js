'use strict';
const { xt } = require('@mentoc/xtract');
const assert = require('assert');
const fs = require('node:fs');
const { bigint_safe_json_stringify } = require('./array-utils.js');

let Lib = {};
module.exports = Lib;
function date() {
	const d = new Date();
	let h = d.getHours();
	if (String(h).length === 1) {
		h = `0${h}`;
	}
	let m = d.getMinutes();
	if (String(m).length === 1) {
		m = `0${m}`;
	}
	let s = d.getSeconds();
	if (String(s).length === 1) {
		s = `0${s}`;
	}
	return (
		[d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-') +
		[h, m, s].join(':')
	);
}
async function write_json(rel_path, data) {
	let fn = `${process.env.HOME}/data/`;
	rel_path = rel_path.replace('#DATE#', date());
	rel_path = rel_path.replace(/[^a-z0-9_-]+/gi, '');
	fn += rel_path + '.json';
	return await fs.writeFileSync(fn, bigint_safe_json_stringify(data, 2) + '\n');
}

Lib.write_json = write_json;
