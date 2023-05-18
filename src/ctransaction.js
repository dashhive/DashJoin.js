/**
 * A port of DASH core's CTransaction
 */
/** The basic transaction that is broadcasted on the network and contained in
 * blocks.  A transaction can contain multiple inputs and outputs.
 */
const TRANSACTION_NORMAL = 0;
const OPCODES = require('./opcodes.js');
const NetUtil = require('./network-util.js');
const hexToBytes = NetUtil.hexToBytes;
const calculateCompactSize = NetUtil.calculateCompactSize;


const TxnConstants = require('./transaction-constants.js');
const CURRENT_VERSION = TxnConstants.CURRENT_VERSION;
const MAX_STANDARD_VERSION = TxnConstants.MAX_STANDARD_VERSION;
const OUTPOINT_SIZE = TxnConstants.OUTPOINT_SIZE;
const SEQUENCE_SIZE = TxnConstants.SEQUENCE_SIZE;
const HASH_TXID_SIZE = TxnConstants.HASH_TXID_SIZE;
const INDEX_SIZE = TxnConstants.INDEX_SIZE;
const LOCK_TIME_SIZE = TxnConstants.LOCK_TIME_SIZE;
const SIZES = {
	VERSION: 2,
	TYPE: 2,
	LOCK_TIME: 4,
};
const TXIN_HASH_SIZE = TxnConstants.TXIN_HASH_SIZE;
const TXIN_INDEX_SIZE = TxnConstants.TXIN_INDEX_SIZE;
const DEFAULT_TXIN_SEQUENCE = TxnConstants.DEFAULT_TXIN_SEQUENCE;

function encodeVin(vin){
	let packet = new Uint8Array(TXIN_HASH_SIZE + TXIN_INDEX_SIZE);
	let offset = 0;
	/**
	 * hash
	 * (32 bytes)
	 */
	packet.set(vin.hash,offset);

	offset += TXIN_HASH_SIZE;
	/**
	 * index
	 * (4 bytes)
	 */
	packet = setUint32(packet,vin.index,offset);

	offset += TXIN_INDEX_SIZE;
	/**
	 * Script bytes
	 * (compactSize uint)
	 */
	packet.set(encodeCompactSizeBytes(vin.script),offset);
	
	offset += calculateCompactSize(vin.script);

	/**
	 * Signature script
	 * (varies)
	 */
	packet.set(vin.script,offset);

	offset += vin.script.length;

	packet = setUint32(packet,vin.sequence,offset);
	
	return packet;
}

function Transaction() {
  let self = this;
  self.vin = [];
  self.vout = [];
  //2 bytes
	self.nVersion = CURRENT_VERSION;
  //2 bytes
	self.nType = TRANSACTION_NORMAL;
  //4 bytes
  self.nLockTime = 0;
  //Variable bytes - Uint8Array() - only available for special transaction types
  self.vExtraPayload = new Uint8Array();
  //32 bytes
  self.hash = 0;

	self.clearVin = function(){
		self.vin = [];
	};
	self.clearVout = function(){
		self.vout = [];
	};
	self.addVin = function({hash, index, script=null, sequence=null}){
		if(32 !== hash.length){
			throw new Error('hash must be 32 bytes');
		}
		if(!script){
			script = [];
		}
		if(!sequence){
			sequence = DEFAULT_TXIN_SEQUENCE;
		}
		self.vin.push({hash,index,script,sequence});
	};
	self.addVout = function({value,script}){
		self.vout.push({value,script});
	};
	self.calculateSize = function(){
		let size = 0;
		let txinCount = 0;
		let txoutCount = 0;
		let extraPayloadCount = 0;
		txinCount = calculateCompactSize(self.vin);
		txoutCount = calculateCompactSize(self.vout);

		size += txinCount + txoutCount;
		for(let vin of self.vin){
			size += OUTPOINT_SIZE; // previous_output (outpoint)
			size += calculateCompactSize(vin.script); // script bytes (compactSize)
			size += vin.script.length; // signature script
			size += SEQUENCE_SIZE; // sequence uint32_t
		}
		for(let vout of self.vout){
			size += HASH_TXID_SIZE; // hash - TXID of transaction
			size += INDEX_SIZE; // index uint32_t - index number of specific output
			// TODO: account for script compactSize uint length
			// TODO: account for script length
			// FIXME: when done, update unit test
		}
		size += LOCK_TIME_SIZE; // lock_time uint32_t 
		if(self.vExtraPayload && self.vExtraPayload.length){
			extraPayloadCount = calculateCompactSize(self.vExtraPayload);
			size += extraPayloadCount;
			size += self.vExtraPayload.length;
		}
		return {
			total: size,
			txinCount,
			txoutCount,
			extraPayloadCount,
		};
	};

	self.serialize = function(){
		let sizes = self.calculateSize();
		let packet = new Uint8Array(sizes.total);
		let offset = 0;
		packet.set([self.nVersion,0x0],offset);
		offset += SIZES.VERSION;
		packet.set([self.nType,0x0],offset);
		offset += SIZES.TYPE;
		switch(sizes.txinCount){
			case 1:
			case 3:
			case 5:
			case 9:
				packet.set(encodeCompactSizeBytes(self.vin.length),offset);
				break;
			default:
				break;
		}
		offset += sizes.txinCount;
		if(sizes.txinCount){
			for(let vin of self.vin){
				let encodedVin = encodeVin(vin);
				packet.set(encodedVin,offset);
				offset += encodedVin.length;
			}
		}
	};
	
}

/**
 * Use case:
 */
(function({
	outpointTransaction,
	script,
	sequence,
}){
	if(typeof outpointTransaction.hash === 'undefined' || outpointTransaction.hash.length !== 32){
		throw new Error('Invalid hash. Must be 32 bytes');
	}
	let collateralTx = new Transaction();
	collateralTx.clearVin();
	collateralTx.clearVout();
	collateralTx.addVin({
		hash: outpointTransaction.hash,
		index: outpointTransaction.index,
		script,
		sequence,
	});
	collateralTx.addVout({value: 0, script: [OPCODES.OP_RETURN]});
})({
	outpointTransaction: {
		hash: hexToBytes('9f6c92b088961b2dce8935dbfda3901bbec9a2c5703e12d54bc5f39e00f3563f'),
		index: 0,
	},
	script: null,
	sequence: null,
});
//	Step 1: get random UTXO
//	Step 2: get the vout of the UTXO
//	Step 3: add the hash+index of the UTXO chosen from step 1
//		- this vin will be used to pay the collateral tx
//	Step 4: create change address, if needed
//	Step 5: creates a new txn to pay to the 
//		change address the difference, if change address was created

module.exports = Transaction;
