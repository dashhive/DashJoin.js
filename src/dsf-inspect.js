'use strict';
const Network = require('./network.js');
const xt = require('@mentoc/xtract').xt;

let LibDsfInput = {};

module.exports = LibDsfInput;

LibDsfInput.dump_parsed = function dump_parsed(parsed) {
	console.log('sessionID', xt(parsed, 'sessionID'));
	console.log('transaction: { ');
	console.log('version: ', xt(parsed, 'transaction.version'), ',');
	console.log('inputCount: ', xt(parsed, 'transaction.inputCount'), ',');
	process.stdout.write('inputs: [');
	const inputs = xt(parsed, 'transaction.inputs');
	for (let i = 0; i < inputs.length; i++) {
		process.stdout.write(bigint_safe_json_stringify(inputs[i], 2));
		if (i + 1 !== inputs.length) {
			console.log(',');
		}
	}
	console.log('],');
	console.log('outputCount: ', xt(parsed, 'transaction.outputCount'), ',');
	process.stdout.write('outputs: [');
	const outputs = xt(parsed, 'transaction.outputs');
	for (let i = 0; i < outputs.length; i++) {
		process.stdout.write('{');
		console.log('duffs: ', xt(outputs, `${i}.duffs`), ',');
		console.log(
			'pubkey_script_bytes: ',
			xt(outputs, `${i}.pubkey_script_bytes`),
			',',
		);
		console.log('pubkey_script: [');
		Network.util.dumpAsHex(xt(outputs, `${i}.pubkey_script`));
		process.stdout.write(']}');
		if (i + 1 !== outputs.length) {
			console.log(',');
		}
	}
	console.log('],');
};
