#!/usr/bin/env node
'use strict';

let nickName;

function setNickname(n) {
	nickName = n;
}

function debug(...args) {
	console.debug(`${nickName}:`, ...args);
}
function info(...args) {
	console.info(`${nickName}[INFO]:`, ...args);
}
function error(...args) {
	console.error(`[${nickName}[ERROR]:`, ...args);
}
function d(...args) {
	debug(...args);
}
function dd(...args) {
	debug(...args);
	process.exit();
}

module.exports = {
	setNickname,
	debug,
	info,
	dd,
	d,
	error,
};
