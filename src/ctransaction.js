/**
 * A port of DASH core's CTransaction
 */
/** The basic transaction that is broadcasted on the network and contained in
 * blocks.  A transaction can contain multiple inputs and outputs.
 */
// Default transaction version.
const /*int32_t*/ CURRENT_VERSION = 2;
// Changing the default transaction version requires a two step process: first
// adapting relay policy by bumping MAX_STANDARD_VERSION, and then later date
// bumping the default CURRENT_VERSION at which point both CURRENT_VERSION and
// MAX_STANDARD_VERSION will be equal.
const /*int32_t*/ MAX_STANDARD_VERSION = 3;

const CTxIn = require("./ctxin.js");
const CTxOut = require("./ctxout.js");
function CTransaction(args = {
	cmutabletx: null,
}) {
  let self = this;
  this.constructorId = 0;
  // The local variables are made const to prevent unintended modification
  // without updating the cached hash value. However, CTransaction is not
  // actually immutable; deserialization and assignment are implemented,
  // and bypass the constness. This is safe, as they update the entire
  // structure, including the hash.
  //std::vector<CTxIn> vin;
  this.vin = new Vector(CTxIn);
  //std::vector<CTxOut> vout;
  this.vout = new Vector(CTxOut);
  //int16_t nVersion;
  this.nVersion = 0;
  //uint16_t nType;
  this.nType = 0;
  //uint32_t nLockTime;
  this.nLockTime = 0;
  //std::vector<uint8_t> vExtraPayload; // only available for special transaction types
  this.vExtraPayload = new Uint8Array();
  //const uint256 hash;
  this.hash = 0;
  this.ComputeHash = function () {};

  /**
   * Support for constructor:
		 CTransaction::CTransaction() : vin(), vout(), nVersion(CTransaction::CURRENT_VERSION), nType(TRANSACTION_NORMAL), nLockTime(0), hash{} {}
	 || comment from src/primitives/transaction.cpp: ||
	 		"For backward compatibility, the hash is initialized to 0. TODO: remove the need for this default constructor entirely."
   */
	this.nVersion = CURRENT_VERSION;
	this.nType = TRANSACTION_NORMAL;
	this.nLockTime = 0;
	this.constructorId = 0;

	/**
	 * Support for constructor: 
	 * CTransaction::CTransaction(const CMutableTransaction& tx)
	 */
	if(null !== args.cmutabletx){
		this.vin = args.cmutabletx.vin;
		this.vout = args.cmutabletx.vout;
		this.nVersion = args.cmutabletx.nVersion;
		this.nType = args.cmutabletx.nType;
		this.nLockTime = args.cmutabletx.nLockTime;
		this.vExtraPayload = args.cmutabletx.vExtraPayload;
		this.hash = this.ComputeHash();
	}

  this.IsNull = function () {
    return self.vin.empty() && self.vout.empty();
  };
  this.Serialize = function () {
    // TODO:
    /*int32_t*/ let n32bitVersion = self.nVersion | (self.nType << 16);
    //s << n32bitVersion;
    //s << vin;
    //s << vout;
    //s << nLockTime;
    //if (this->nVersion == 3 && this->nType != TRANSACTION_NORMAL)
    //    s << vExtraPayload;
  };

  // Return sum of txouts.
  //CAmount GetValueOut() const;
  this.GetValueOut = function () {
    //TODO:
  };
  // GetValueIn() is a method on CCoinsViewCache, because
  // inputs must be known to compute value in.
  /**
   * Get the total transaction size in bytes, including witness data.
   * "Total Size" defined in BIP141 and BIP144.
   * @return Total transaction size in bytes
   */
  //TODO: unsigned int GetTotalSize() const;
  this.IsCoinBase = function () {
    return self.vin.size() == 1 && self.vin[0].prevout.IsNull(); // FIXME: verify which is needed: IsNull() or === null
  };
  this.equals = function (b) {
    return self.hash == b.hash;
  };
}

module.exports = CTransaction;
