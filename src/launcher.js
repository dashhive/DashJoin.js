#!/usr/bin/env node
'use strict';
/**
 * launcher.js:
 * Spawns CONCURRENT_USERS demo.js instances. Passes to each instance
 * a unique user which already has denomination transactions in the
 * amount of 0.00100001 as per `bin/dboot --instance=INST --create-denoms`
 *
 * Each demo.js instance reads from the instance providede and the user's
 * information as stored in combination of dash-cli and the lmdb database
 * that was created.
 *
 * Each instance then goes on to complete the Dash coinjoin handshake and
 * ultimately sends dsa, dsi, and the rest of the interaction is handled
 * by demo.js.
 */

const COIN = require('./coin-join-constants.js').COIN;
const Network = require('./network.js');
const NetworkUtil = require('./network-util.js');
const hexToBytes = NetworkUtil.hexToBytes;
const assert = require('assert');
const cproc = require('child_process');
const extractOption = require('./argv.js').extractOption;
const path = require('path');
const dashboot = require('./bootstrap/index.js');
const DashCore = require('@dashevo/dashcore-lib');

const CURDIR = path.resolve(__dirname);
let dboot = null;

let id = {};

let config = require('./.mn0-config.json');
id.mn = 0;
if (process.argv.includes('--mn0')) {
	config = require('./.mn0-config.json');
	id.mn = 0;
}
if (process.argv.includes('--mn1')) {
	config = require('./.mn1-config.json');
	id.mn = 1;
}
if (process.argv.includes('--mn2')) {
	config = require('./.mn2-config.json');
	id.mn = 2;
}

let masterNodeIP = config.masterNodeIP;
let masterNodePort = config.masterNodePort;
let network = config.network;
let ourIP = config.ourIP;
let startBlockHeight = config.startBlockHeight;

/**
 * Periodically print id information
 */
if (process.argv.includes('--id')) {
	setInterval(function () {
		console.info(id);
	}, 10000);
}
let ctr = 0;
function nickname(user) {
	const names = [
		'luke',
		'han',
		'chewie',
		'r2',
		'c3p0',
		'leia',
		'vader',
		'jabba',
		'obiwan',
	];
	if (ctr === names.length) {
		ctr = 0;
	}
	return names[ctr++];
}
const CONCURRENT_USERS = 6;
module.exports = {
	run_cli_program: function () {
		(async function (instanceName) {
			/**
       * Start CONCURRENT_USERS clients simultaneously
       */
			console.info(`[status]: loading "${instanceName}" instance...`);
			dboot = await dashboot.load_instance(instanceName);
			let uniqueUsers = await dboot.extract_unique_users(CONCURRENT_USERS, {
				filterByDenoms: getDemoDenomination(),
			});

			/**
       * Pass choices[N] to a different process.
       */
			let f = [];
			for (const choice of uniqueUsers) {
				/**
         * Spawn CONCURRENT_USERS different processes.
         * Hand them each their own user
         * Have them each submit to the same masternode
         *
         */
				d({ user: choice.user, node: node() });
				let m = cproc.spawn('node', [
					`${CURDIR}/demo.js`,
					`--instance=${instanceName}`,
					`--username=${choice.user}`,
					`--nickname=${nickname(choice.user)}`,
				]);
				m.stdout.on('data', (data) => {
					console.log('[ok]: ', data.toString());
				});
				m.stderr.on('data', (data) => {
					console.error('error', data.toString());
				});
				f.push(m);
			}
			while (1) {
				await sleep(500);
			}
		})(extractOption('instance', true));
	},
};
async function sleep(ms) {
	return new Promise((resolve, reject) => {
		setTimeout(() => {
			resolve();
		}, ms);
	});
}
/** FIXME: put in library */
function getDemoDenomination() {
	return parseInt(COIN / 1000 + 1, 10);
}
function d(f) {
	console.debug(f);
}
function dd(f) {
	console.debug(f);
	process.exit();
}

function node() {
	return process.argv[0];
}
