'use strict';

let fs = require('fs');
async function file_exists(fn) {
	return await fs.existsSync(fn);
}
let FS = {};
module.exports = FS;

FS.file_exists = file_exists;
