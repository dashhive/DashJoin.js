/**
 * Ported from Dash core
 * Dash Core file: https://github.com/dashpay/dash/blob/master/src/primitives/transaction.h
 *
 * An input of a transaction. It contains the location of the previous
 * transaction's output that it claims and a signature that matches the
 * output's public key.
 */

let COutPoint = require('./coutpoint.js');
let CScript = require('./cscript.js');
const {
	SEQUENCE_FINAL,
	SEQUENCE_LOCKTIME_DISABLE_FLAG,
	SEQUENCE_LOCKTIME_TYPE_FLAG,
	SEQUENCE_LOCKTIME_MASK,
	SEQUENCE_LOCKTIME_GRANULARITY,
} = require('./ctxin-constants.js');

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
function CTxIn(
	args = {
		hashPrevTx: null,
		nOut: null,
		prevoutIn: null,
		scriptSigIn: null,
		nSequenceIn: SEQUENCE_FINAL,
	},
) {
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
	if (
		null !== args.prevoutIn &&
		null !== args.scriptSigIn &&
		null !== args.nSequenceIn
	) {
		this.constructorId = 2;
		this.prevout = new COutPoint({ hashIn: args.prevoutIn });
		this.scriptSig = new CScript({ cscript: args.scriptSigIn });
		this.nSequence = args.nSequenceIn;
	}
	/**
	 * Support for this constructor:
		CTxIn::CTxIn(uint256 hashPrevTx, uint32_t nOut, CScript scriptSigIn, uint32_t nSequenceIn)
		*/
	if (
		null !== args.hashPrevTx &&
		null !== args.nOut &&
		null !== args.scriptSigIn &&
		null !== args.nSequenceIn
	) {
		this.constructorId = 3;
		this.prevout = new COutPoint({
			hashIn: args.hashPrevTx,
			nIn: args.nOut,
		});
		this.scriptSig = new CScript({ cscript: args.scriptSigIn });
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
		str += 'CTxIn(';
		str += self.prevout.ToString();
		if (self.prevout.IsNull()) {
			str += ', coinbase ' + self.scriptSig.ToHexStr();
		} else {
			str += ', scriptSig=' + self.scriptSig.ToHexStr().substr(0, 24);
		}
		if (self.nSequence != SEQUENCE_FINAL) {
			str += ', nSequence=' + self.nSequence;
		}
		str += ')';
		return str;
	};
}
