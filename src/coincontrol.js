/**
 * This is a port of Dash Core's CCoinControl class.
 *
 * How to use this:
 * 1) You will need a generic "wallet" variable. This can be any
 * javascript object that has the following object defined on it:
   {
    "destChange",
    "fRequireAllInputs",
    "fAllowWatchOnly",
    "m_feerate",
    "m_discard_feerate",
    "m_confirm_target",
    "m_avoid_partial_spends",
    "m_avoid_address_reuse",
    "m_fee_mode",
    "m_min_depth",
		"nCoinType",
  }

	Assuming your wallet object is named 'my_wallet', you could do
	the following:

	let my_wallet = {};
	my_wallet.coin_control = {
		destChange: nul,
		fRequireAllInputs: true,
		fAllowWatchOnly: false,
		nCoinType: CoinType.ALL_COINS,
	};
 Note that all key/value pairs are optional, but if you decide
 to leave one out, the CCoinControl class will fill those in
 with a default value.  You can always go back and set these
 values on the resulting CCoinControl object after you've 
 constructed it. See step 3 for how

	
	2) Once you've set the coin_control object on your wallet,
	you can now create a CCoinControl object:

 let coin_control = new CCoinControl(my_wallet);

  3) Optionally, you can always set the variables on coin_control
	after you've constructed the object:

	For example, maybe you want to change the nCoinType:

	coin_control.nCoinType = CoinType.ONLY_FULLY_MIXED;

 */

let Lib = {};
const Vector = require("./vector.js");
const COutPoint = require("./coutpoint.js");
const COutput = require("./coutput.js");
const CoinType = require("./cointype-constants.js");
const { ONLY_FULLY_MIXED, ALL_COINS } = CoinType;
module.exports = {
  CCoinControl,
  constants: {
    CoinType,
  },
};
//class CCoinControl
function CCoinControl(
  args = {
    wallet: null,
  }
) {
  let self = this;
  //CTxDestination destChange;
  this.destChange = 0;
  //! If false, allows unselected inputs, but requires all selected inputs be used if fAllowOtherInputs is true (default)
  //bool fAllowOtherInputs;
  this.fAllowOtherInputs = false;
  //! If false, only include as many inputs as necessary to fulfill a coin selection request. Only usable together with fAllowOtherInputs
  this.fRequireAllInputs = false;
  //! Includes watch only addresses which are solvable
  this.fAllowWatchOnly = false;
  //! Override automatic min/max checks on fee, m_feerate must be set if true
  this.fOverrideFeeRate = false;
  //! Override the wallet's m_pay_tx_fee if set
  this.m_feerate = 0;
  //! Override the discard feerate estimation with m_discard_feerate in CreateTransaction if set
  this.m_discard_feerate = 0;
  //! Override the default confirmation target if set
  this.m_confirm_target = 0;
  //! Avoid partial use of funds sent to a given address
  this.m_avoid_partial_spends = false;
  //! Forbids inclusion of dirty (previously used) addresses
  this.m_avoid_address_reuse = false;
  //! Fee estimation mode to control arguments to estimateSmartFee
  this.m_fee_mode = "";
  //! Minimum chain depth value for coin availability
  this.m_min_depth = 0;
  //! Controls which types of coins are allowed to be used (default: ALL_COINS)
  this.nCoinType = CoinType.ALL_COINS;

  //std::set<COutPoint> setSelected;
  this.setSelected = {};
  this.assignable = [
    "destChange",
    "fRequireAllInputs",
    "fAllowWatchOnly",
    "m_feerate",
    "m_discard_feerate",
    "m_confirm_target",
    "m_avoid_partial_spends",
    "m_avoid_address_reuse",
    "m_fee_mode",
    "m_min_depth",
    "nCoinType",
  ];
  this.defaults = {
    destChange: null,
    fRequireAllInputs: true,
    fAllowWatchOnly: false,
    m_feerate: 0,
    m_discard_feerate: 0,
    m_confirm_target: true,
    m_avoid_partial_spends: true,
    m_avoid_address_reuse: true,
    m_fee_mode: "",
    m_min_depth: 0,
		nCoinType: CoinType.ALL_COINS,
  };
  this.setFromWallet = function (w) {
    for (const key of self.assignable) {
      if ("undefined" !== typeof w.coinControl[key]) {
        self[key] = w.coinControl[key];
      } else {
        self[key] = self.defaults[key];
      }
    }
  };
  this.SetNull = function (fResetCoinType = true) {};

  this.HasSelected = function () {
    return Object.keys(self.setSelected).length > 0;
  };

  this.IsSelected = function (output) {
    return "undefined" !== self.setSelected[output];
  };

  this.Select = function (output) {
    self.setSelected[output] = 1;
  };

  this.UnSelect = function (output) {
    delete self.setSelected[output];
  };

  this.UnSelectAll = function () {
    self.setSelected = {};
  };

  this.ListSelected = function (vOutpoints) {
    //FIXME
    vOutpoints.assign(self.setSelected);
  };

  // Dash-specific helpers

  this.UseCoinJoin = function (fUseCoinJoin) {
    self.nCoinType = fUseCoinJoin ? ONLY_FULLY_MIXED : ALL_COINS;
  };

  this.IsUsingCoinJoin = function () {
    return self.nCoinType === ONLY_FULLY_MIXED;
  };

  if (null !== args.wallet) {
    this.setFromWallet(args.wallet);
  }
}
