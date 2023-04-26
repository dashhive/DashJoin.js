/**
 * A port of DASH core's CCoinJoin
 */

let Lib = {};
const { COIN } = require("./coin.js");
const { COINJOIN_ENTRY_MAX_SIZE } = require("./coin-join-constants.js");

module.exports = Lib;
// static members
Lib.vecStandardDenominations = [
  10 * COIN + 10000,
  1 * COIN + 1000,
  COIN / 10 + 100,
  COIN / 100 + 10,
  COIN / 1000 + 1,
];

//orig: static constexpr std::array<CAmount, 5> GetStandardDenominations() { return vecStandardDenominations; }
Lib.GetStandardDenominations = function () {
  return Lib.vecStandardDenominations;
};
//orig: static constexpr CAmount GetSmallestDenomination() { return vecStandardDenominations.back(); }
Lib.GetSmallestDenomination = function () {
  return Lib.vecStandardDenominations[Lib.vecStandardDenominations.length - 1];
};

//orig: static constexpr bool IsDenominatedAmount(CAmount nInputAmount) { return AmountToDenomination(nInputAmount) > 0; }
Lib.IsDenominatedAmount = function (nInputAmount) {
  return Lib.AmountToDenomination(nInputAmount) > 0;
};
//orig: static constexpr bool IsValidDenomination(int nDenom) { return DenominationToAmount(nDenom) > 0; }
Lib.IsValidDenomination = function (nDenom) {
  return Lib.DenominationToAmount(nDenom) > 0;
};
/*
		Return a bitshifted integer representing a denomination in vecStandardDenominations
		or 0 if none was found
*/
//orig: static constexpr int AmountToDenomination(CAmount nInputAmount)
Lib.AmountToDenomination = function (nInputAmount) {
  for (let i = 0; i < Lib.vecStandardDenominations.length; ++i) {
    if (nInputAmount == Lib.vecStandardDenominations[i]) {
      return 1 << i;
    }
  }
  return 0;
};

/*
		Returns:
		- one of standard denominations from vecStandardDenominations based on the provided bitshifted integer
		- 0 for non-initialized sessions (nDenom = 0)
		- a value below 0 if an error occurred while converting from one to another
*/
//orig: static constexpr CAmount DenominationToAmount(int nDenom)
Lib.DenominationToAmount = function (nDenom) {
  /** FIXME: create a CAmount type. return that */
  if (nDenom == 0) {
    // not initialized
    return 0;
  }

  let nMaxDenoms = Lib.vecStandardDenominations.length;

  if (nDenom >= 1 << nMaxDenoms || nDenom < 0) {
    // out of bounds
    return -1;
  }

  if ((nDenom & (nDenom - 1)) != 0) {
    // non-denom
    return -2;
  }

  let nDenomAmount = -3;
  for (let i = 0; i < nMaxDenoms; ++i) {
    if (nDenom & (1 << i)) {
      nDenomAmount = Lib.vecStandardDenominations[i];
      break;
    }
  }

  return nDenomAmount;
};

/*
Same as DenominationToAmount but returns a string representation
*/
//orig: static std::string DenominationToString(int nDenom);
Lib.DenominationToString = function (nDenom) {};
