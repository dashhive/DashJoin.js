'use strict';
const xt = require('@mentoc/xtract').xt;
const fs = require('fs');
const fsPromises = require('fs/promises');

let nickName;
let initialized = false;

function setNickname(n) {
	nickName = n;
	nickName = nickName.replace(/[^a-z0-9]+/gi, '');
}

function getLogDir() {
	return `${process.env.HOME}/logs`;
}

async function dirExists() {
	return await fs.existsSync(getLogDir());
}
async function mkdir(dir) {
	return await fs.mkdirSync(dir, { recursive: true });
}

async function initialize(_in_nickName) {
	setNickname(_in_nickName);
	if (!(await dirExists())) {
		await mkdir(getLogDir());
	}
	initialized = true;
}

function bigint_safe_json_stringify(buffer, stringify_space = 2) {
	return JSON.stringify(
		buffer,
		function (key, value) {
			this.k = key;
			return typeof value === 'bigint' ? value.toString() + 'n' : value;
		},
		stringify_space,
	);
}
function getLogFile(_in_nickName = null) {
	if (_in_nickName) {
		setNickname(_in_nickName);
	}
	let nick = nickName.replace(/[^a-z0-9]+/gi, '');
	return `${getLogDir()}/${nick}.log`;
}
let verbosity = false;
function verbose(setting) {
	verbosity = setting;
}
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
		' ' +
		[h, m, s].join(':')
	);
}
async function log(...args) {
	if (!initialized) {
		await initialize('node');
	}
	return fsPromises
		.open(getLogFile(), 'a', 0o600)
		.then(function (fp) {
			fp.appendFile(
				`${date()}: ${bigint_safe_json_stringify(args, 2)}\n`,
			);
			return true;
		})
		.catch(function (error) {
			if (verbosity) {
				console.error(error);
			}
			return null;
		});
}
module.exports = {
	setNickname,
	log,
	initialize,
};
