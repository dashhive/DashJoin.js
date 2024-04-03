'use strict';
let assert = require('assert');
let path = require('path');
let Transaction = require(__dirname + '/../src/ctransaction.js');
let NetUtil = require(__dirname + '/../src/network-util.js');
let calculateCompactSize = NetUtil.calculateCompactSize;
let hexToBytes = NetUtil.hexToBytes;
let crypto = require('crypto');
let TxnConstants = require(__dirname + '/../src/transaction-constants.js');
const { LOCK_TIME_SIZE, OUTPOINT_SIZE, SEQUENCE_SIZE, DEFAULT_TXIN_SEQUENCE } =
	TxnConstants;
const OPCODES = require(__dirname + '/../src/opcodes.js');

function randomHash(len) {
	return crypto.randomBytes(len);
}

function getBaseTxnSize() {
	return 4 /* VERSION + TYPE */ + LOCK_TIME_SIZE;
}
const script_zero = hexToBytes(
	[
		'76', // OP_DUP
		'a9', // OP_HASH160
		'14', // Byte Length: 20
		'5bcd0d776a7252310b9f1a7eee1a749d42126944', // PubKeyHash
		'88', // OP_EQUALVERIFY
		'ac', // OP_CHECKSIG
	].join(''),
);

function getTestScript() {
	return script_zero;
}
/**
 * Create datasets for calculateSize() comparisons
 */
let dataSet = [
	{
		vin: {
			hash: randomHash(32),
			index: 0,
			signatureScript: script_zero,
			sequence: DEFAULT_TXIN_SEQUENCE,
		},
		calculateSize: 75,
	},
];

describe('Transactions', function () {
	describe('addVin', function () {
		it('should throw when hash isnt 32 bytes', function () {
			let txn = new Transaction();
			assert.throws(function () {
				txn.addVin({
					hash: randomHash(3),
					index: 0,
				});
			}, /bytes/);
		});
	});
	describe('calculateSize', function () {
		it('should calculate the correct size based on lengths of fields', function () {
			let payload = {
				hash: randomHash(32),
				index: 0,
				signatureScript: getTestScript(),
				sequence: DEFAULT_TXIN_SEQUENCE,
			};

			let collateralTx = new Transaction();
			collateralTx.addVin(payload);
			//collateralTx.addVout({ value: 0, script: [OPCODES.OP_RETURN] });
			let size = collateralTx.calculateSize();
			assert.equal(size.total, 75);
		});
		it('should calculate the correct base packet size', function () {
			let txn = new Transaction();
			let { total, txinCount, txoutCount, extraPayloadCount } =
				txn.calculateSize();
			assert.equal(total, getBaseTxnSize());
			assert.equal(txinCount, 0);
			assert.equal(txoutCount, 0);
			assert.equal(extraPayloadCount, 0);
		});
		it('should calculate the correct packet size per txin', function () {
			let txn = new Transaction();
			txn.clearVin();
			txn.addVin({
				hash: randomHash(32),
				index: 0,
				signatureScript: getTestScript(),
				sequence: DEFAULT_TXIN_SEQUENCE,
			});
			let { total, txinCount, txoutCount, extraPayloadCount } =
				txn.calculateSize();
			assert.notEqual(total, getBaseTxnSize());
			assert.equal(txinCount, 1);
			assert.equal(txoutCount, 0);
			assert.equal(extraPayloadCount, 0);

			let vinEncoded = txn.encodeVin(txn.vin[0]);
			let size =
				4 /* VERSION + TYPE */ +
				calculateCompactSize(vinEncoded) /* TXIN COUNT */ +
				vinEncoded.length /* tx_in contents */ +
				LOCK_TIME_SIZE;
			assert.equal(total, size);
			assert.equal(total, 75);
		});
	});
});
