let assert = require('assert');
let Transaction = require(__dirname + '/../src/ctransaction.js');
let NetUtil = require(__dirname + '/../src/network-util.js');
let { calculateCompactSize, encodeCompactSizeBytes } = NetUtil;

describe('calculateCompactSize', function () {
	it('gives predictable byte lengths', function () {
		for (let pair of [
			[32, 1],
			[256, 3],
			[0x10001, 5],
		]) {
			let bytes = new Uint8Array(pair[0]);
			let bytesSize = calculateCompactSize(bytes);
			assert.equal(bytesSize, pair[1]);
		}
	});
});
describe('encodeCompactSizeBytes', function () {
	it('prefixes sizes with byte code markers', function () {
		for (let pair of [
			[32, 32],
			[256, 0xfd],
			[0x10001, 0xfe],
		]) {
			let bytes = new Uint8Array(pair[0]);
			let bytesSize = encodeCompactSizeBytes(bytes);
			assert.equal(bytesSize[0], pair[1]);
		}
	});
});
