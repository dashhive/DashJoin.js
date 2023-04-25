/** An output of a transaction.  It contains the public key that the next input
 * must be able to sign with to claim it.
 */
//class CTxOut
let CScript = require("./cscript.js");
let CAmount = require("./camount.js");
function CTxOut(args = {
	nValueIn: null,
	scriptPubKeyIn: null,
}) {
	let self = this;
    //CAmount nValue;
    //CScript scriptPubKey;

	this.nValue = new CAmount();
	this.scriptPubKey = new CScript();
	this.constructorId = 0;

  this.SetNull = function() {
		self.nValue = new CAmount(-1);
		self.scriptPubKey.clear();
  };

	/**
	 * Support for default constructor:
	 * CTxOut()
	 */
  this.SetNull();
	this.constructorId = 1;

	/** 
	 * Support for this constructor:
    CTxOut(const CAmount& nValueIn, CScript scriptPubKeyIn);
		*/
	if(null !== args.nValueIn && null !== args.scriptPubKeyIn){
		this.constructorId = 2;
    this.nValue = new CAmount(args.nValueIn);
    this.scriptPubKey = new CScript(args.scriptPubKeyIn);
	}


  this.IsNull = function() {
      return (self.nValue.equals(-1));
  };

	this.equals = function(b){
		let a = self;
		return a.nValue.equals(b.nValue) &&
						a.scriptPubKey.equals(b.scriptPubKey);
  };

  this.ToString = function() {
		// TODO: this is just temporary
		return JSON.stringify(self);
	};
};
