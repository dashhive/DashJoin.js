module.exports = COutput;
//TODO: const CWalletTx = require("./cwallet-tx.js");
function COutput(
  args = {
    tx: null,
    i: null,
    nDepth: null,
    fSpendable: null,
    fSolvable: null,
    fSafe: null,
    use_max_sig: null,
  }
) {
  let self = this;
  this.tx = null; // TODO: new CWalletTx();
  this.i;
  this.nDepth;

  /** Pre-computed estimated size of this output as a fully-signed input in a transaction. Can be -1 if it could not be calculated */
  this.nInputBytes;

  /** Whether we have the private keys to spend this output */
  this.fSpendable;

  /** Whether we know how to spend this output, ignoring the lack of keys */
  this.fSolvable;

  /** Whether to use the maximum sized, 72 byte signature when calculating the size of the input spend. This should only be set when watch-only outputs are allowed */
  this.use_max_sig;

  /**
   * Whether this output is considered safe to spend. Unconfirmed transactions
   * from outside keys and unconfirmed replacement transactions are considered
   * unsafe and will not be used to fund new spending transactions.
   */
  this.fSafe;

  /**
	 * Support for constructor:
    COutput(const CWalletTx *txIn, int iIn, int nDepthIn, bool fSpendableIn, bool fSolvableIn, bool fSafeIn, bool use_max_sig_in = false)
    
		*/
  if (null !== args.tx) {
    this.tx = args.tx;
    this.nDepth = args.nDepth;
    this.fSpendable = args.fSpendable;
    this.fSolvable = args.fSolvable;
    this.fSafe = args.fSafe;
    this.nInputBytes = -1;
    this.use_max_sig = args.use_max_sig;
    // If known and signable by the given wallet, compute nInputBytes
    // Failure will keep this value -1
    if (this.fSpendable && this.tx) {
      this.nInputBytes = tx.GetSpendSize(this.i, this.use_max_sig);
    }
  }

  this.GetInputCoin = function () {
		// TODO:
    return CInputCoin(self.tx.tx, self.i, self.nInputBytes);
  };
}
