#!/usr/bin/env node
'use strict';
const xt = require('@mentoc/xtract').xt;
const fs = require('fs');

function getDataDir() {
	return `${process.env.HOME}/data`;
}

async function dataDirExists() {
	return await fs.existsSync(getDataDir());
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
async function sleep_ms(ms) {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		}, ms);
	});
}
module.exports = {
	getDataDir,
	dataDirExists,
	ps_extract,
	xt,
	sleep_ms,
};
