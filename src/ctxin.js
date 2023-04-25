/** 
 * Ported from Dash core
 * Dash Core file: https://github.com/dashpay/dash/blob/master/src/primitives/transaction.h
 *
 * An input of a transaction. It contains the location of the previous
 * transaction's output that it claims and a signature that matches the
 * output's public key.
 */

let COutPoint = require("./coutpoint.js");
let CScript = require("./cscript.js");
/* Setting nSequence to this value for every input in a transaction
 * disables nLockTime. */
const /*uint32_t*/ SEQUENCE_FINAL = 0xffffffff;
/* Below flags apply in the context of BIP 68*/
/* If this flag set, CTxIn::nSequence is NOT interpreted as a
 * relative lock-time. */
const /*uint32_t*/ SEQUENCE_LOCKTIME_DISABLE_FLAG = 1 << 31;
/* If CTxIn::nSequence encodes a relative lock-time and this flag
 * is set, the relative lock-time has units of 512 seconds,
 * otherwise it specifies blocks with a granularity of 1. */
const /*uint32_t*/ SEQUENCE_LOCKTIME_TYPE_FLAG = 1 << 22;
/* If CTxIn::nSequence encodes a relative lock-time, this mask is
 * applied to extract that lock-time from the sequence field. */
const /*uint32_t*/ SEQUENCE_LOCKTIME_MASK = 0x0000ffff;
/* In order to use the same number of bits to encode roughly the
 * same wall-clock duration, and because blocks are naturally
 * limited to occur every 600s on average, the minimum granularity
 * for time-based relative lock-time is fixed at 512 seconds.
 * Converting from CTxIn::nSequence to seconds is performed by
 * multiplying by 512 = 2^9, or equivalently shifting up by
 * 9 bits. */
const /*int*/ SEQUENCE_LOCKTIME_GRANULARITY = 9;

module.exports = {
	constants: {
		SEQUENCE_FINAL,
		SEQUENCE_LOCKTIME_DISABLE_FLAG,
		SEQUENCE_LOCKTIME_TYPE_FLAG,
		SEQUENCE_LOCKTIME_MASK,
		SEQUENCE_LOCKTIME_GRANULARITY,
	},
	CTxIn,
};

//explicit CTxIn(COutPoint prevoutIn, CScript scriptSigIn=CScript(), uint32_t nSequenceIn=SEQUENCE_FINAL);
//CTxIn(uint256 hashPrevTx, uint32_t nOut, CScript scriptSigIn=CScript(), uint32_t nSequenceIn=SEQUENCE_FINAL);
function CTxIn(args = {
  hashPrevTx : null,
  nOut : null,
  prevoutIn : null,
  scriptSigIn : null,
  nSequenceIn : SEQUENCE_FINAL,
}) {
  let self = this;
	//console.debug({args});
  this.prevout = new COutPoint();
  this.scriptSig = new CScript();
  this.nSequence = SEQUENCE_FINAL;
	this.constructorId = 0;

	/**
	 * Support for this constructor:
	 * CTxIn::CTxIn(COutPoint prevoutIn, CScript scriptSigIn, uint32_t nSequenceIn)
	 */
	if(null !== args.prevoutIn  && null !== args.scriptSigIn  && null !== args.nSequenceIn){
		this.constructorId = 2;
		this.prevout = new COutPoint({hashIn: args.prevoutIn});
		this.scriptSig = new CScript({cscript: args.scriptSigIn});
		this.nSequence = args.nSequenceIn;
	}
	/**
	 * Support for this constructor:
		CTxIn::CTxIn(uint256 hashPrevTx, uint32_t nOut, CScript scriptSigIn, uint32_t nSequenceIn)
		*/
	if(null !== args.hashPrevTx && null !== args.nOut && null !== args.scriptSigIn && null !== args.nSequenceIn) {
		this.constructorId = 3;
    this.prevout = new COutPoint({hashIn: args.hashPrevTx, nIn: args.nOut});
    this.scriptSig = new CScript({cscript: args.scriptSigIn });
    this.nSequence = args.nSequenceIn;
	}
  this.compare = function (other) {
    return (
      self.prevout.equals(other.prevout) &&
      self.scriptSig.equals(other.scriptSig) &&
      self.nSequence.equals(other.nSequence)
    );
  };
	this.equals = this.compare;

  this.lessThan = function (other) {
    return self.prevout.lessThan(other.prevout);
  };
  this.ToString = function () {
    let str;
    str += "CTxIn(";
    str += self.prevout.ToString();
    if (self.prevout.IsNull()) {
      str += ", coinbase " + self.scriptSig.ToHexStr();
    } else {
      str += ", scriptSig=" + self.scriptSig.ToHexStr().substr(0, 24);
    }
    if (self.nSequence != SEQUENCE_FINAL){
      str += ", nSequence=" + self.nSequence;
		}
    str += ")";
    return str;
  };
}
