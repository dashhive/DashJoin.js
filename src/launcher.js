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
const cproc = require('child_process');
const extractOption = require('./argv.js').extractOption;
const path = require('path');
const dashboot = require('./bootstrap/index.js');

const INPUTS = 1;
const CURDIR = path.resolve(__dirname);
let dboot = null;

let id = {};

/**
 * Periodically print id information
 */
if (process.argv.includes('--id')) {
	setInterval(function () {
		console.info(id);
	}, 10000);
}
let ctr = 0;
function nickname() {
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
const CONCURRENT_USERS = 2;
module.exports = {
	run_cli_program: function () {
		(async function (instanceName) {
			/**
       * Start CONCURRENT_USERS clients simultaneously
       */
			console.info(`[status]: loading "${instanceName}" instance...`);
			dboot = await dashboot.load_instance(instanceName);
			let mnRingBuffer = await dboot.ring_buffer_next('masternodes');
			if (typeof mnRingBuffer === 'undefined' || mnRingBuffer === null) {
				await dboot.ring_buffer_init('masternodes', [
					'local_1',
					'local_2',
					'local_3',
				]);
				mnRingBuffer = await dboot.ring_buffer_next('masternodes');
			}
			let except = [];
			let uniqueUsers = await dboot.extract_unique_users(
				CONCURRENT_USERS,
				getDemoDenomination(),
				except
			);

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
				//d({ user: choice.user, node: node() });
				let m = cproc.spawn('node', [
					`${CURDIR}/demo.js`,
					`--instance=${instanceName}`,
					`--username=${choice.user}`,
					`--nickname=${nickname(choice.user)}`,
					'--verbose=false',
					`--mn=${mnRingBuffer}`,
					`--count=${INPUTS}`,
					'--senddsi=true',
				]);
				m.stdout.on('data', (data) => {
					console.log(data.toString());
				});
				m.stderr.on('data', (data) => {
					console.error('error', data.toString());
				});
				f.push(m);
			}
			let i = 0;
			do {
				await sleep(500);
			} while (i < 100);
		})(extractOption('instance', true));
	},
};
async function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		}, ms);
	});
}
/** FIXME: put in library */
function getDemoDenomination() {
	return parseInt(COIN / 1000 + 1, 10);
}
