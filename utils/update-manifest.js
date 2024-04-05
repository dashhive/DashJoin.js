#!/usr/bin/env node
'use strict';

// #vi: filetype=js
const fs = require('node:fs/promises');
const path = require('node:path');
const cproc = require('node:child_process');

let DENOMS = [1.00001];

(async () => {
	{
		/**
		 * A script to generate listtransactions output
		 */
		let SCRIPT = [
			'#!/bin/sh',
			'set -e',
			'set -u',
			'',
			'for username in foobar psend luke han chewie; do ',
			'    ./bin/dash-cli-listtransactions "${username}" 20000 \\',
			'        > ./data/w-"${username}"-txns-staged.json',
			'done',
			'',
			'git add ./data/w-*-txns-staged.json',
			'#git commit -m "chore: update staged txns"',
		].join('\n');
		await fs.writeFile('/tmp/foo', SCRIPT);
		await cproc.spawnSync('chmod', ['+x', '/tmp/foo']);
		let ps = await cproc.spawnSync('/tmp/foo');
		console.debug(ps.stdout.toString());
		console.debug(ps.stderr.toString());
	}

	async function get_priv_key(username, address) {
		let ps = await cproc.spawnSync('./bin/dash-cli-wallet', [
			username,
			'dumpprivkey',
			address,
		]);
		let privateKey = ps.stdout.toString();
		if (privateKey.length) {
			return privateKey;
		}
		//console.info(`[+] ${script} private key for "${address}": '${privateKey}'`);
		if (
			ps.stderr?.toString &&
			ps.stderr.toString().replace(/^\s+\s+$/, '').length
		) {
			console.error(`Exception: '${ps.stderr.toString()}'`);
		}
	}

	{
		/**
		 * Process all files in ./data/w-*-denominations.json
		 */

		let dir = './data';
		let files = await fs.readdir(dir);
		let keep = [];
		let sorted = {};
		for (const file of files) {
			if (!file.match(/^w-[^-]+-txns\-staged\.json$/)) {
				continue;
			}

			sorted = {};
			let fileParts = file.split('-');
			let username = fileParts[1];
			let finalName = `${dir}/w-${username}-denominations.json`;
			let fullName = path.resolve(`${dir}/${file}`);
			let contents = require(fullName);
			keep = [];
			/*
			 * [{ category: 'receive', amount; 1.00001, address: '...' }]
			 */
			for (let entry of contents) {
				if (entry.category !== 'receive' || !DENOMS.includes(entry.amount)) {
					continue;
				}

				if (typeof sorted[entry.address] === 'undefined') {
					sorted[entry.address] = {
						transactions: [],
						privateKey: await get_priv_key(username, entry.address),
					};
				}
				sorted[entry.address].transactions.push({
					txid: entry.txid,
					vout: entry.vout,
					amount: entry.amount,
					confirmations: entry.confirmations,
				});
			}
			await fs.writeFile(finalName, JSON.stringify(sorted, null, 2));
			console.info(
				`[+] Wrote ${
					JSON.stringify(sorted, null, 2).length
				} bytes to ${finalName}`,
			);
		}
	}

	{
		/**
		 * A script to generate listtransactions output
		 */
		let SCRIPT = [
			'#!/bin/sh',
			'set -e',
			'set -u',
			'',
			'for u in foobar psend luke han chewie; do ',
			'    git add ./data/w-"$u"-denominations.json',
			'done',
			'',
			'#git commit -m "chore: update denominations json"',
		].join('\n');
		await fs.writeFile('/tmp/foo', SCRIPT);
		await cproc.spawnSync('chmod', ['+x', '/tmp/foo']);
		let ps = await cproc.spawnSync('/tmp/foo');
		console.debug(ps.stdout.toString());
		console.debug(ps.stderr.toString());
	}
})();
