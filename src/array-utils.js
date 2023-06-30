#!/usr/bin/env node
'use strict';
const xt = require('@mentoc/xtract').xt;

function extract(array, key) {
	let selected = [];
	for (const ele of array) {
		selected.push(ele[key]);
	}
	return selected;
}
function bigint_safe_json_stringify(buffer, stringify_space = 2) {
	return JSON.stringify(
		buffer,
		function (key, value) {
			this.k = key;
			return typeof value === 'bigint' ? value.toString() + 'n' : value;
		},
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
module.exports = {
	extract,
	bigint_safe_json_stringify,
	uniqueByKey,
	flatten,
	unique,
	ps_extract,
	xt,
};
