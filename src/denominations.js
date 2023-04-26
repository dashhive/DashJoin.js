let Lib = {};
const ONLY_READY_TO_MIX = "";
const CoinType = {
  ALL_COINS: 0,
  ONLY_FULLY_MIXED: 1,
  ONLY_READY_TO_MIX: 2,
  ONLY_NONDENOMINATED: 3,
  ONLY_MASTERNODE_COLLATERAL: 4, // find masternode outputs including locked ones (use with caution)
  ONLY_COINJOIN_COLLATERAL: 5,
  // Attributes
  MIN_COIN_TYPE: 0,
  MAX_COIN_TYPE: 5,
};

const CCoinJoin = require("./coin-join.js");
const { SEQUENCE_FINAL } = require("./ctxin-constants.js");
module.exports = {
  Lib,
  constants: {
    CoinType,
  },
};
//orig: bool CWallet::SelectDenominatedAmounts(CAmount nValueMax, std::set<CAmount>& setAmountsRet) const {
/**
 * This function will have to return an object that
 * will contain a boolean result and the setAmountsRet
 * reference variable.
 *
 * In short, because C++ allows you to pass by reference,
 * we cannot accept the second parameter like how core does.
 *
 * Should return:
 * {
 *  	valid: true|false,
 *  	setAmountsRet: {} // a set emulating std::set<CAmount>
 * }
 */
Lib.SelectDenominatedAmounts = function (nValueMax, wallet) {
  let nValueTotal = 0;
  //std::vector<COutput> vCoins;
  let vCoins = new Vector(COutput);
  //CCoinControl coin_control;
  let coin_control = {
    nCoinType: CoinType.ONLY_READY_TO_MIX,
    m_avoid_address_reuse: true, // FIXME: pull this value from user's wallet settings
  };
  vCoins = Lib.AvailableCoins(wallet, true, coin_control);
  // larger denoms first
  vCoins = Lib.sort(vCoins, Lib.CompareByPriority);

  for (const out of vCoins.contents) {
    let nValue = out.tx.tx.vout[out.i].nValue;
    if (nValueTotal + nValue <= nValueMax) {
      nValueTotal += nValue;
      setAmountsRet[nValue] = 1;
    }
  }

  return {
    valid: nValueTotal >= CCoinJoin.GetSmallestDenomination(),
    setAmountsRet,
  };
};
Lib.CompareByPriority = function () {
  //TODO:
};
Lib.sort = function (value, callback) {
  //TODO:
};

Lib.getWalletUTXOs = function (wallet) {};

/**
 * The original code had a `mapWallet` member in
 * the CWallet class:
 * std::map<uint256, CWalletTx> mapWallet GUARDED_BY(cs_wallet);
 */
Lib.mapWallet = {};
Lib.findWalletTxByHash = function (hash) {
  if ("undefined" !== typeof Lib.mapWallet[hash]) {
    return Lib.mapWallet[hash];
  }
  return null;
};

//orig: std::unordered_set<const CWalletTx*, WalletTxHasher> CWallet::GetSpendableTXs() const {
Lib.GetSpendableTXs = function (wallet) {
  //std::unordered_set<const CWalletTx*, WalletTxHasher> ret;
  let ret = {};
  for (let outpoint of Lib.getWalletUTXOs(wallet)) {
    let jt = Lib.findWalletTxByHash(outpoint.hash);
    if (jt !== null) {
      ret[jt] = 1;
    }

    // setWalletUTXO is sorted by COutPoint, which means that all UTXOs for the same TX are neighbors
    // skip entries until we encounter a new TX
    //while(it != setWalletUTXO.end() && it->hash == outpoint.hash) {
    //	++it;
    //}
  }
  return ret;
};

//orig: bool IsFinalTx(const CTransaction &tx, int nBlockHeight, int64_t nBlockTime)
Lib.IsFinalTx = function (tx, nBlockHeight, nBlockTime) {
  if (tx.nLockTime == 0) {
    return true;
  }
  if (
    tx.nLockTime <
    (tx.nLockTime < LOCKTIME_THRESHOLD ? nBlockHeight : nBlockTime)
  ) {
    return true;
  }

  // Even if tx.nLockTime isn't satisfied by nBlockHeight/nBlockTime, a
  // transaction is still considered final if all inputs' nSequence ==
  // SEQUENCE_FINAL (0xffffffff), in which case nLockTime is ignored.
  //
  // Because of this behavior OP_CHECKLOCKTIMEVERIFY/CheckLockTime() will
  // also check that the spending input's nSequence != SEQUENCE_FINAL,
  // ensuring that an unsatisfied nLockTime value will actually cause
  // IsFinalTx() to return false here:
  for (const txin of tx.vin) {
    if (!(txin.nSequence === SEQUENCE_FINAL)) {
      return false;
    }
  }
  return true;
};
/**
 * This should essentially do what chain().checkFinalTx() does in
 * src/validation.cpp
 */
//orig: bool CheckFinalTx(const CTransaction &tx, int flags)
Lib.checkFinalTx = function (wallet, tx) {
  // By convention a negative value for flags indicates that the
  // current network-enforced consensus rules should be used. In
  // a future soft-fork scenario that would mean checking which
  // rules would be enforced for the next block and setting the
  // appropriate flags. At the present time no soft-forks are
  // scheduled, so no flags are set.
  wallet.flags = Lib.max(wallet.flags, 0);

  // CheckFinalTx() uses ::ChainActive().Height()+1 to evaluate
  // nLockTime because when IsFinalTx() is called within
  // CBlock::AcceptBlock(), the height of the block *being*
  // evaluated is what is used. Thus if we want to know if a
  // transaction can be part of the *next* block, we need to call
  // IsFinalTx() with one more than ::ChainActive().Height().
  const /*int*/ nBlockHeight = Lib.ChainActive().Height() + 1;

  // BIP113 requires that time-locked transactions have nLockTime set to
  // less than the median time of the previous block they're contained in.
  // When the next block is created its previous block will be the current
  // chain tip, so we use that to calculate the median time passed to
  // IsFinalTx() if LOCKTIME_MEDIAN_TIME_PAST is set.
  const /*int64_t*/ nBlockTime =
      flags & LOCKTIME_MEDIAN_TIME_PAST
        ? Lib.ChainActive().Tip().GetMedianTimePast()
        : Lib.GetAdjustedTime();

  return Lib.IsFinalTx(tx, nBlockHeight, nBlockTime);
};
//orig: void CWallet::AvailableCoins(
//std::vector<COutput>& vCoins,
//bool fOnlySafe,
//const CCoinControl *coinControl,
//const CAmount& nMinimumAmount,
//const CAmount& nMaximumAmount,
//const CAmount& nMinimumSumAmount,
//const uint64_t nMaximumCount,
//const int nMinDepth,
//const int nMaxDepth) const {
Lib.AvailableCoins = function (
  wallet,
  fOnlySafe, // bool
  coinControl, // CCoinControl*
  nMinimumAmount,
  nMaximumAmount,
  nMinimumSumAmount,
  nMaximumCount,
  nMinDepth,
  nMaxDepth,
  allow_used_addresses
) {
  let vCoins = new Vector(COutPoint);
  let ret = {
    vCoins: [],
  };
  let nCoinType = coinControl ? coinControl.nCoinType : CoinType.ALL_COINS;

  let nTotal = 0;
  // Either the WALLET_FLAG_AVOID_REUSE flag is not set (in which case we always allow), or we default to avoiding, and only in the case where
  // a coin control object is provided, and has the avoid address reuse flag set to false, do we allow already used addresses
  //let allow_used_addresses = !Lib.IsWalletFlagSet(WALLET_FLAG_AVOID_REUSE) || (coinControl && !coinControl.m_avoid_address_reuse);

  for (let pcoin of Lib.GetSpendableTXs(wallet)) {
    let wtxid = pcoin.GetHash();

    if (!Lib.checkFinalTx(wallet, pcoin.tx)) {
      continue;
    }

    if (pcoin.IsImmatureCoinBase()) {
      continue;
    }

    let nDepth = pcoin.GetDepthInMainChain();

    // We should not consider coins which aren't at least in our mempool
    // It's possible for these to be conflicted via ancestors which we may never be able to detect
    if (nDepth == 0 && !pcoin.InMempool()) {
      continue;
    }

    let safeTx = pcoin.IsTrusted();

    if (fOnlySafe && !safeTx) {
      continue;
    }

    if (nDepth < nMinDepth || nDepth > nMaxDepth) {
      continue;
    }

    for (let i = 0; i < pcoin.tx.vout.size(); i++) {
      let found = false;
      if (nCoinType == CoinType.ONLY_FULLY_MIXED) {
        if (!CCoinJoin.IsDenominatedAmount(pcoin.tx.vout[i].nValue)) {
          continue;
        }
        found = Lib.IsFullyMixed(COutPoint(wtxid, i));
      } else if (nCoinType == CoinType.ONLY_READY_TO_MIX) {
        if (!CCoinJoin.IsDenominatedAmount(pcoin.tx.vout[i].nValue)) {
          continue;
        }
        found = !Lib.IsFullyMixed(COutPoint(wtxid, i));
      } else if (nCoinType == CoinType.ONLY_NONDENOMINATED) {
        if (CCoinJoin.IsCollateralAmount(pcoin.tx.vout[i].nValue)) {
          continue; // do not use collateral amounts
        }
        found = !CCoinJoin.IsDenominatedAmount(pcoin.tx.vout[i].nValue);
      } else if (nCoinType == CoinType.ONLY_MASTERNODE_COLLATERAL) {
        found = dmn_types.IsCollateralAmount(pcoin.tx.vout[i].nValue);
      } else if (nCoinType == CoinType.ONLY_COINJOIN_COLLATERAL) {
        found = CCoinJoin.IsCollateralAmount(pcoin.tx.vout[i].nValue);
      } else {
        found = true;
      }
      if (!found) {
        continue;
      }

      if (
        pcoin.tx.vout[i].nValue < nMinimumAmount ||
        pcoin.tx.vout[i].nValue > nMaximumAmount
      ) {
        continue;
      }

      if (
        coinControl &&
        coinControl.HasSelected() &&
        !coinControl.fAllowOtherInputs &&
        !coinControl.IsSelected(COutPoint(wtxid, i))
      ) {
        continue;
      }

      if (
        Lib.IsLockedCoin(wtxid, i) &&
        nCoinType != CoinType.ONLY_MASTERNODE_COLLATERAL
      ) {
        continue;
      }

      if (IsSpent(wtxid, i)) {
        continue;
      }

      let mine = Lib.IsMine(pcoin.tx.vout[i]);

      if (mine == ISMINE_NO) {
        continue;
      }

      if (!allow_used_addresses && Lib.IsSpentKey(wtxid, i)) {
        continue;
      }

      let provider = Lib.GetSigningProvider(pcoin.tx.vout[i].scriptPubKey);

      let solvable = provider
        ? Lib.IsSolvable(provider, pcoin.tx.vout[i].scriptPubKey)
        : false;
      let spendable =
        (mine & ISMINE_SPENDABLE) != ISMINE_NO ||
        ((mine & ISMINE_WATCH_ONLY) != ISMINE_NO &&
          coinControl &&
          coinControl.fAllowWatchOnly &&
          solvable);

      vCoins.push_back(
        COutput(
          pcoin,
          i,
          nDepth,
          spendable,
          solvable,
          safeTx,
          coinControl && coinControl.fAllowWatchOnly
        )
      );

      // Checks the sum amount of all UTXO's.
      if (nMinimumSumAmount != MAX_MONEY) {
        nTotal += pcoin.tx.vout[i].nValue;

        if (nTotal >= nMinimumSumAmount) {
          return ret;
        }
      }

      // Checks the maximum number of UTXO's.
      if (nMaximumCount > 0 && vCoins.size() >= nMaximumCount) {
        return ret;
      }
    }
  }
  return ret;
};
