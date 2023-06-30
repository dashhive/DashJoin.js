#!/usr/bin/env node
'use strict';
//const { xt } = require('@mentoc/xtract');
const MetaDB = require('../bootstrap/metadb.js');
const DB = require('../lmdb/lmdb.js');
const mdb = new MetaDB(DB);
const fs = require('fs');
const { extractOption } = require('../argv.js');

(async function () {
	const db_path = `${process.env.HOME}/db2`;
	let exists = await fs.existsSync(db_path.replace(/\/$/, '') + '/data.mdb');
	DB.open({
		path: db_path,
		db_name: 'foobar',
		create: !exists,
		maxDbs: 10,
		mapSize: 2 * 1024 * 1024 * 1024,
	});
	async function create_data() {
		let values = [];
		/**
     * I have a thousand values that I want to store in LMDB.
     * As page 1 fills up with 250 items (the default), page 2
     * gets created and then the values go from 250 to 499 since
     * it's inclusive. This continues up until 1000.
     */
		for (let i = 0; i < 1000; i++) {
			values.push(i);
		}
		/**
   * IF we wanted to, we could override the default 250 per
   * page limit and call mdb.paged_store like so:
    const PER_PAGE = 512;
    await mdb.paged_store('user1','utxos',values,PER_PAGE);
   */
		await mdb.paged_store('user1', 'utxos', values);
		/**
     * We can grab the page information which will give us
     * metadata like how many pages are in this particular
     * paged lmdb key.
     */
	}
	if (extractOption('store')) {
		await create_data();
	}
	let page = await mdb.pages('user1', 'utxos');
	console.log({ page });
	/**
   * Above will output something like:
   *
    {
      page: { 
        pages: 27, 
        template: 'user1|utxos|page|27', 
        items_per_page: 250 
      }
    }
	*/
	//for (let i = 1; i <= page.pages; i++) {
	//	let stored = await mdb.paged_get('user1', 'utxos', i);
	//	console.debug({
	//		page: i,
	//		type: typeof stored,
	//	});
	//}
	/**
   * An alternate way to do something for every page
   */
	await mdb.paged_for_each(
		'user1',
		'utxos',
		{ include_meta: true },
		async function (rows, meta) {
			console.log(`Current page: ${meta.page}`);
			if (!Array.isArray(rows)) {
				return true; // returning true means keep looping
			}
			for (const value of rows) {
				process.stdout.write(`${value}\t`);
				if (value === 42) {
					console.log('Found!');
					return false; // returning false means stop looping
				}
			}
		}
	);
})();
