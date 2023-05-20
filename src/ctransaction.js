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
const { calculateCompactSize, encodeCompactSizeBytes, setUint32, hexToBytes } =
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

function Transaction() {
  let self = this;
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

    //console.debug({ 
		//	HASH_TXID_SIZE,
		//	INDEX_SIZE,
		//	compactSizeSigScript,
		//	sigScriptLen,
		//	SEQUENCE_SIZE,
		//});
    size += compactSizeSigScript;
    size += sigScriptLen;
    size += SEQUENCE_SIZE;
    let packet = new Uint8Array(size);
    let offset = 0;

    assert.equal(32, vin.hash.length);
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

    assert.equal(offset, 36);
    /**
     * Script bytes
     * (compactSize uint)
     */
    packet.set(encodeCompactSizeBytes(vin.signatureScript), offset);

    offset += calculateCompactSize(vin.signatureScript);

    assert.equal(offset, 37);
    /**
     * Signature script
     * (varies)
     */
    packet.set(vin.signatureScript, offset);

    offset += vin.signatureScript.length;

    packet = setUint32(packet, vin.sequence, offset);

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

		size += 2; // FIXME: use VERSION constant
		size += 2; // FIXME: use TYPE constant
    size += txinCount;
    for (const vin of self.vin) {
      let encoded = self.encodeVin(vin);
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

		let encodedLength = 0;
    for (let vin of self.vin) {
      let encodedVin = self.encodeVin(vin);
      encodedLength += encodedVin.length;
    }
    let encodedSize = encodeCompactSizeBytes(encodedLength);
    packet.set(encodedSize, offset);
		offset += encodedSize.length;

		for(let vin of self.vin){
      let encodedVin = self.encodeVin(vin);
			packet.set(encodedVin,offset);
			offset += encodedVin.length;
		}
    /**
     * FIXME: we will need to process vout
     */
    /**
     * Set the tx_out count to zero for now FIXME
     */
    //packet.set([0],offset);

    //offset += 1;

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
