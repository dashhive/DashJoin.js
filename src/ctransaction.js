/**
 * A port of DASH core's CTransaction
 */
/** The basic transaction that is broadcasted on the network and contained in
 * blocks.  A transaction can contain multiple inputs and outputs.
 */
const TRANSACTION_NORMAL = 0;
const OPCODES = require("./opcodes.js");
const NetUtil = require("./network-util.js");
const assert = require("assert");
const { MAX_MONEY } = require('./coin.js');
const { calculateCompactSize, encodeCompactSizeBytes, setUint32, setSignedInt64, hexToBytes } =
  NetUtil;

function getTestScript() {
  return hexToBytes(
    [
      "76", // OP_DUP
      "a9", // OP_HASH160
      "14", // Byte Length: 20
      "5bcd0d776a7252310b9f1a7eee1a749d42126944", // PubKeyHash
      "88", // OP_EQUALVERIFY
      "ac", // OP_CHECKSIG
    ].join("")
  );
}
const TxnConstants = require("./transaction-constants.js");
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
const DEFAULT_TXIN_SEQUENCE = TxnConstants.DEFAULT_TXIN_SEQUENCE;

const MAX_PUBKEY_SCRIPT_SIZE = 10_000;
const DUFF_SIZE = 8; // size of int64_t

function Transaction() {
  let self = this;
  self.encodeVout = function (vout) {
		if('undefined' === typeof vout.value) {
			throw new Error(`value must be set`);
		}
		if('undefined' === typeof vout.pkScript) {
			throw new Error(`pkScript must be set`);
		}
		/**
		 * Rules for txout values:
		 * - May be zero
		 * - the sum of all outputs may not exceed the sum of duffs previously spent to the outpoints provided in the input section. 
		 * - Exception: coinbase transactions spend the block subsidy and collected transaction fees.
		 */

    /**
     * Packet size (tx_out):
     * ----------------------------------------------------
     *  8 bytes 		- (int64_t) number of duffs to spend 
		 *  compactSize	- pk_script bytes
		 *  varies			- pk_script
     */
		if(vout.pkScript.length > MAX_PUBKEY_SCRIPT_SIZE){
			throw new Error(`pkScript must not exceed ${MAX_PUBKEY_SCRIPT_SIZE}`);
		}

		if(BigInt(vout.value) > MAX_MONEY){
			throw new Error(`value must not exceed ${MAX_MONEY}`);
		}

		let size = DUFF_SIZE;
    size += calculateCompactSize(vout.pkScript);
    size += vout.pkScript.length;

    let packet = new Uint8Array(size);
    let offset = 0;

    /**
     * value
     * 8 bytes - (int64_t)
     */
    packet = setSignedInt64(packet,vout.value, offset);

    offset += DUFF_SIZE;

    /**
     * pk_script bytes
     * compactSize
     */
    packet.set(encodeCompactSizeBytes(vout.pkScript), offset);
    offset += calculateCompactSize(vout.pkScript);

    /**
     * pk_script
     * varies
     */
    packet.set(vout.pkScript, offset);

    return packet;
  };
  self.encodeVin = function (vin) {
    /**
     * Packet size (tx_in):
     * ----------------------------------------------------
     *  36 bytes - outpoint
     *  1 bytes - script bytes (compactSize)
     *  12 bytes - signature script
     *  4 bytes - sequence
     *  53 bytes
     */
    let size = 36;
    let compactSizeSigScript = calculateCompactSize(vin.signatureScript);
    let sigScriptLen = vin.signatureScript.length;

    size += compactSizeSigScript;
    size += sigScriptLen;
    size += SEQUENCE_SIZE;

    let packet = new Uint8Array(size);
    let offset = 0;

    /**
     * hash
     * (32 bytes)
     */
    packet.set(vin.hash, offset);

    offset += HASH_TXID_SIZE;

    /**
     * index
     * (4 bytes)
     */
    packet = setUint32(packet, vin.index, offset);

    offset += INDEX_SIZE;

    /**
     * Script bytes
     * (compactSize uint)
     */
    packet.set(encodeCompactSizeBytes(vin.signatureScript), offset);

    offset += calculateCompactSize(vin.signatureScript);
    /**
     * Signature script
     * (varies)
     */
    packet.set(vin.signatureScript, offset);

    offset += vin.signatureScript.length;

    //packet = setUint32(packet, vin.sequence, offset);
		/**
		 * "Default for Dash Core and almost all other programs is 0xffffffff."
		 * - from: https://docs.dash.org/projects/core/en/stable/docs/reference/transactions-raw-transaction-format.html
		 */
    packet = setUint32(packet, 0xffffffff, offset);

    return packet;
  };
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

  self.clearVin = function () {
    self.vin = [];
  };
  self.clearVout = function () {
    self.vout = [];
  };
  self.setVersion = function(_in_version){
    self.nVersion = _in_version;
  };
  self.addVin = function (_in_vin) {
    if (32 !== _in_vin.hash.length) {
      throw new Error("hash must be 32 bytes");
    }
    if (!_in_vin.sequence) {
      _in_vin.sequence = DEFAULT_TXIN_SEQUENCE;
    }
    self.vin.push(_in_vin);
  };
  self.addVout = function (vout) {
    self.vout.push(vout);
  };
  self.calculateSize = function () {
    let size = 0;
    let txinCount = 0;
    let txoutCount = 0;
    let extraPayloadCount = 0;
    txinCount = calculateCompactSize(self.vin);
    txoutCount = calculateCompactSize(self.vout);

		size += 2; // FIXME: use VERSION constant
		size += 2; // FIXME: use TYPE constant
    size += txinCount;
    for (const vin of self.vin) {
      let encoded = self.encodeVin(vin);
      size += encoded.length;
    }
		size += txoutCount;
		for(const vout of self.vout) {
			let encoded = self.encodeVout(vout);
			size += encoded.length;
		}

    size += LOCK_TIME_SIZE; // lock_time uint32_t
    return {
      total: size,
      txinCount,
      txoutCount,
      extraPayloadCount,
    };
  };

  self.serialize = function () {
    /**
     * Packet size:
     * 2 bytes version
     * 2 bytes type
     * 1 byte for 1 tx_in
     * ?? bytes for tx_in
     * 4 bytes lock_time
     *
     * 9 bytes
     * plus
     * tx_in bytes
     */
    let sizes = self.calculateSize();
    let packet = new Uint8Array(sizes.total);
    let offset = 0;
    /**
     * Set the version
     */
    packet.set([self.nVersion, 0x0], offset);
    offset += SIZES.VERSION;

    /**
     * Set the type
     */
    packet.set([self.nType, 0x0], offset);
    offset += SIZES.TYPE;

		/**
		 * Set the tx_in count (compactSize)
		 */
    let encodedSize = encodeCompactSizeBytes(self.vin);
    packet.set(encodedSize, offset);
		offset += encodedSize.length;

		/**
		 * Set the tx_in
		 */
		for(let vin of self.vin){
      let encodedVin = self.encodeVin(vin);
			packet.set(encodedVin,offset);
			offset += encodedVin.length;
		}
    /**
     * Set the tx_out count
     */
    encodedSize = encodeCompactSizeBytes(self.vout);
    packet.set(encodedSize, offset);
		offset += encodedSize.length;

		/**
		 * Set the tx_out
		 */
		for(let vout of self.vout){
			let encodedVout = self.encodeVout(vout);
			packet.set(encodedVout,offset);
			offset += encodedVout.length;
		}

    /**
     * Set the lock time
     */
    /**
     * TODO: create logic for how lock time should be processed.
     */
    packet.set([0, 0, 0, 0], offset); // FIXME

    /**
     * TODO: do logic for vExtraPayload.length and vExtraPayload
     */
    return packet;
  };
}

//	Step 1: get random UTXO
//	Step 2: get the vout of the UTXO
//	Step 3: add the hash+index of the UTXO chosen from step 1
//		- this vin will be used to pay the collateral tx
//	Step 4: create change address, if needed
//	Step 5: creates a new txn to pay to the
//		change address the difference, if change address was created

module.exports = Transaction;
