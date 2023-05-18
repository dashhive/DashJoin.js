let assert = require('assert');
let path = require('path');
let Transaction = require(__dirname + '/../src/ctransaction.js');
let NetUtil = require(__dirname + '/../src/network-util.js');
let calculateCompactSize = NetUtil.calculateCompactSize;
let hexToBytes = NetUtil.hexToBytes;
let crypto = require('crypto');
let TxnConstants = require(__dirname + '/../src/transaction-constants.js');
const {
	LOCK_TIME_SIZE,
	OUTPOINT_SIZE,
	SEQUENCE_SIZE,
} = TxnConstants;

function randomHash(len){
	return crypto.randomBytes(len);
}

function getBaseTxnSize(){
	let txinCount = calculateCompactSize([]);
	let txoutCount = calculateCompactSize([]);
	return txinCount + txoutCount + LOCK_TIME_SIZE;
}
function getTestScript(){
		return [
				"\x76", // OP_DUP
				"\xa9", // OP_HASH160
				"\x14", // Byte Length: 20
				"\x5b\xcd\x0d\x77\x6a\x72\x52\x31\x0b\x9f\x1a\x7e\xee\x1a\x74\x9d\x42\x12\x69\x44", // PubKeyHash
				"\x88", // OP_EQUALVERIFY
				"\xac", // OP_CHECKSIG
			].join("");
}
describe('Transactions', function(){
	describe('addVin',function(){
		it('should throw when hash isnt 32 bytes', function(){
			let txn = new Transaction();
			assert.throws(function(){
				txn.addVin({
					hash: randomHash(3),
					index: 0,
				});
			},/bytes/);
		});
	});
	describe('calculateSize', function(){
		it('should calculate the correct base packet size', function(){
			let txn = new Transaction();
			let { total, txinCount, txoutCount, extraPayloadCount} = txn.calculateSize();
			assert.equal(total,getBaseTxnSize());
			assert.equal(txinCount,0);
			assert.equal(txoutCount,0);
			assert.equal(extraPayloadCount,0);
		});
		it('should calculate the correct packet size per txin', function(){
			let txn = new Transaction();
			let script = hexToBytes(getTestScript());
			let sequence = 1;
			txn.addVin({
				hash: randomHash(32),
				index: 0,
				script,
			});
			let { total, txinCount, txoutCount, extraPayloadCount} = txn.calculateSize();
			assert.notEqual(total,getBaseTxnSize());
			assert.equal(txinCount,1);
			assert.equal(txoutCount,0);
			assert.equal(extraPayloadCount,0);
			let size = LOCK_TIME_SIZE;
			size += OUTPOINT_SIZE;
			size += calculateCompactSize(txn.vin);
			size += calculateCompactSize(script);
			size += script.length;
			size += SEQUENCE_SIZE;
			assert.equal(total,size);
		});
	});
});
