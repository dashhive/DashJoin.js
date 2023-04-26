/**
 * A port of DASH core's CCoinJoin
 */

let Lib = { core_name: "CCoinJoin" };
const { COIN } = require("./coin.js");
const { COINJOIN_ENTRY_MAX_SIZE } = require("./coin-join-constants.js");
const llmq = require("./llmq.js");

let Validation = {};
//orig: CChainState& ChainstateActive()
Validation.ChainstateActiveCoinsTipGetCoin = function (outpoint, coin) {
  //bool CChainState::LoadChainTip(const CChainParams& chainparams)
  //{
  //    AssertLockHeld(cs_main);
  //    const CCoinsViewCache& coins_cache = CoinsTip();
  //    assert(!coins_cache.GetBestBlock().IsNull()); // Never called when the coins view is empty
  //    const CBlockIndex* tip = m_chain.Tip();
  //
  //    if (tip && tip->GetBlockHash() == coins_cache.GetBestBlock()) {
  //        return true;
  //    }
  //
  //    // Load pointer to end of best chain
  //    CBlockIndex* pindex = LookupBlockIndex(coins_cache.GetBestBlock());
  //    if (!pindex) {
  //        return false;
  //    }
  //    m_chain.SetTip(pindex);
  //    PruneBlockIndexCandidates();
  //
  //    tip = m_chain.Tip();
  //    LogPrintf("Loaded best chain: hashBestChain=%s height=%d date=%s progress=%f\n",
  //        tip->GetBlockHash().ToString(),
  //        m_chain.Height(),
  //        FormatISO8601DateTime(tip->GetBlockTime()),
  //        GuessVerificationProgress(chainparams.TxData(), tip));
  //    return true;
  //}
  //
  //return g_chainman.m_active_chainstate; // TODO: g_chainman.m_active_chainstate
  //bool CCoinsViewCache::GetCoin(const COutPoint &outpoint, Coin &coin) const {
  //    CCoinsMap::const_iterator it = FetchCoin(outpoint);
  //    if (it != cacheCoins.end()) {
  //        coin = it->second.coin;
  //        return !coin.IsSpent();
  //    }
  //    return false;
  //}
  //CCoinsMap::iterator CCoinsViewCache::FetchCoin(const COutPoint &outpoint) const {
  //    CCoinsMap::iterator it = cacheCoins.find(outpoint);
  //    if (it != cacheCoins.end())
  //        return it;
  //    Coin tmp;
  //    if (!base->GetCoin(outpoint, tmp))
  //        return cacheCoins.end();
  //    CCoinsMap::iterator ret = cacheCoins.emplace(std::piecewise_construct, std::forward_as_tuple(outpoint), std::forward_as_tuple(std::move(tmp))).first;
  //    if (ret->second.coin.IsSpent()) {
  //        // The parent only has an empty entry for this outpoint; we can consider our
  //        // version as fresh.
  //        ret->second.flags = CCoinsCacheEntry::FRESH;
  //    }
  //    cachedCoinsUsage += ret->second.coin.DynamicMemoryUsage();
  //    return ret;
  //}

  let ret = {
    valid: false,
  };
  return ret;
};

//orig: bool GetUTXOCoin(const COutPoint& outpoint, Coin& coin)
Validation.GetUTXOCoin = function (outpoint, coin) {
  let utxoCoin = {};

  //orig: if (!Lib.ChainstateActive().CoinsTip().GetCoin(outpoint, coin)){
  utxoCoin.coin = Validation.ChainstateActiveCoinsTipGetCoin(outpoint, coin);
  if (!utxoCoin.coin.valid) {
    utxoCoin.valid = false;
    return utxoCoin;
  }
  if (coin.IsSpent()) {
    utxoCoin.valid = false;
    return utxoCoin;
  }
  utxoCoin.out = {
    nValue: coin.out.nValue,
  };
  return utxoCoin;
};

module.exports = Lib;
// static members
Lib.vecStandardDenominations = [
  10 * COIN + 10000,
  1 * COIN + 1000,
  COIN / 10 + 100,
  COIN / 100 + 10,
  COIN / 1000 + 1,
];

//orig: static std::map<uint256, CCoinJoinBroadcastTx> mapDSTX GUARDED_BY(cs_mapdstx);
Lib.mapDSTX = {}; // FIXME: this can most likely just be an object
//orig: static void CheckDSTXes(const CBlockIndex* pindex, const llmq::CChainLocksHandler& clhandler) LOCKS_EXCLUDED(cs_mapdstx);
Lib.CheckDSTXes = function (pindex, clhandler) {};

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

  //CAmount nDenomAmount{-3};
  let nDenomAmount = -3; //TODO: FIXME: make a CAmount type
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

//orig: static bilingual_str GetMessageByID(PoolMessage nMessageID);
Lib.GetMessageByID = function (nMessageID) {};

/// Get the minimum/maximum number of participants for the pool
//orig: static int GetMinPoolParticipants();
Lib.GetMinPoolParticipants = function () {};
//orig: static int GetMaxPoolParticipants();
Lib.GetMaxPoolParticipants = function () {};

//orig: static constexpr CAmount GetMaxPoolAmount() { return COINJOIN_ENTRY_MAX_SIZE * vecStandardDenominations.front(); }
Lib.GetMaxPoolAmount = function () {
  return COINJOIN_ENTRY_MAX_SIZE * Lib.vecStandardDenominations[0];
};

/// If the collateral is valid given by a client
//orig: static bool IsCollateralValid(CTxMemPool& mempool, const CTransaction& txCollateral);
Lib.IsCollateralValid = function (mempool, txCollateral) {
  /** TODO: FIXME: this function references a lot of currently unimplemented functionality.
   */
  // TODO: FIXME: create CTransaction with .vout.empty()
  if (txCollateral.vout.empty()) {
    return false;
  }
  // TODO: implement CTransaction.nLockTime
  if (txCollateral.nLockTime !== 0) {
    return false;
  }

  //CAmount nValueIn = 0;
  //CAmount nValueOut = 0;

  // TODO: implement CAmount

  let nValueIn = 0; // TODO: convert to CAmount
  let nValueOut = 0; // TODO: convert to CAmount
  for (const txout of txCollateral.vout) {
    // TODO: implement .vout
    nValueOut += txout.nValue; // TODO: implement .nValue

    // TODO: implement scriptPubKey.IsPayToPublicKeyHash()
    // TODO: implement scriptPubKey.IsUnspendable()
    if (
      !txout.scriptPubKey.IsPayToPublicKeyHash() &&
      !txout.scriptPubKey.IsUnspendable()
    ) {
      Lib.LogPrint(
        `CCoinJoin::IsCollateralValid -- Invalid Script, txCollateral=${txCollateral.ToString()}`
      ); // TODO: implement CTransaction::ToString()
      return false;
    }
  }

  for (const txin of txCollateral.vin) {
    // TODO: implement CTransaction::vin
    //Coin coin;
    let coin = 0;
    let mempoolTx = mempool.get(txin.prevout.hash); // TODO: prevout.hash
    let utxoCoin = Validation.GetUTXOCoin(txin.prevout, coin);
    if (mempoolTx !== null) {
      if (
        mempool.isSpent(txin.prevout) ||
        !llmq.quorumInstantSendManager.IsLocked(txin.prevout.hash)
      ) {
        // TODO: llmq, llmq.quorumInstantSendManager, llmq.IsLocked()
        Lib.LogPrint(
          `CCoinJoin::IsCollateralValid -- spent or non-locked mempool input! txin=${txin.ToString()}`
        ); // TODO: txin.ToString()
        return false;
      }
      nValueIn += mempoolTx.vout[txin.prevout.n].nValue; // TODO: txin.prevout, txin.prevout.n
      /*orig: } else if (Validation.GetUTXOCoin(txin.prevout, coin)) { 
            nValueIn += coin.out.nValue;
						*/
    } else if (utxoCoin.valid) {
      nValueIn += utxoCoin.out.nValue;
    } else {
      Lib.LogPrint(
        `CCoinJoin::IsCollateralValid -- Unknown inputs in collateral transaction, txCollateral=${txCollateral.ToString()}`
      ); /* Continued */
      return false;
    }
  }

  //collateral transactions are required to pay out a small fee to the miners
  if (nValueIn - nValueOut < Lib.GetCollateralAmount()) {
    Lib.LogPrint(
      `CCoinJoin::IsCollateralValid -- did not include enough fees in transaction: fees: ${
        nValueOut - nValueIn
      }, txCollateral=${txCollateral.ToString()}`
    ); /* Continued */
    return false;
  }

  Lib.LogPrint(
    `CCoinJoin::IsCollateralValid -- ${txCollateral.ToString()}`
  ); /* Continued */

  {
    //CValidationState validationState;
    let validationState = 0;
    if (
      !Lib.AcceptToMemoryPool(
        mempool,
        validationState,
        Lib.MakeTransactionRef(txCollateral),
        /*pfMissingInputs=*/ null,
        /*bypass_limits=*/ false,
        /*nAbsurdFee=*/ DEFAULT_MAX_RAW_TX_FEE /** TODO FIXME: need this defined */,
        /*test_accept=*/ true
      )
    ) {
      Lib.LogPrint(
        `CCoinJoin::IsCollateralValid -- didn't pass AcceptToMemoryPool()`
      );
      return false;
    }
  }

  return true;
};
//orig: static constexpr CAmount GetCollateralAmount() { return GetSmallestDenomination() / 10; }
Lib.GetCollateralAmount = function () {
  return Lib.GetSmallestDenomination() / 10;
};
//orig: static constexpr CAmount GetMaxCollateralAmount() { return GetCollateralAmount() * 4; }
Lib.GetMaxCollateralAmount = function () {
  return Lib.GetCollateralAmount() * 4;
};

//orig: static constexpr bool IsCollateralAmount(CAmount nInputAmount)
Lib.IsCollateralAmount = function (nInputAmount) {
  // collateral input can be anything between 1x and "max" (including both)
  return (
    nInputAmount >= Lib.GetCollateralAmount() &&
    nInputAmount <= Lib.GetMaxCollateralAmount()
  );
};

//orig: static constexpr int CalculateAmountPriority(CAmount nInputAmount)
Lib.CalculateAmountPriority = function (nInputAmount) {
  /*
		if (auto optDenom = ranges::find_if_opt(GetStandardDenominations(), [&nInputAmount](const auto& denom) {
				return nInputAmount == denom;
		})) {
				return (float)COIN / *optDenom * 10000;
		}
		if (nInputAmount < COIN) {
				return 20000;
		}
		*/
  let optDenom = null;
  for (const denom of Lib.GetStandardDenominations()) {
    if (denom === nInputAmount) {
      optDenom = denom;
      return (COIN / optDenom) * 10000;
    }
  }
  if (nInputAmount < COIN) {
    return 20000;
  }
  //nondenom return largest first
  return -1 * (nInputAmount / COIN);
};

//orig: static void AddDSTX(const CCoinJoinBroadcastTx& dstx) LOCKS_EXCLUDED(cs_mapdstx);
Lib.AddDSTX = function (dstx) {};
//orig: static CCoinJoinBroadcastTx GetDSTX(const uint256& hash) LOCKS_EXCLUDED(cs_mapdstx);
Lib.GetDSTX = function (hash) {};

//orig: static void UpdatedBlockTip(const CBlockIndex* pindex, const llmq::CChainLocksHandler& clhandler, const std::unique_ptr<CMasternodeSync>& mn_sync);
Lib.UpdatedBlockTip = function (pindex, clhandler, mn_sync) {};
//orig: static void NotifyChainLock(const CBlockIndex* pindex, const llmq::CChainLocksHandler& clhandler, const std::unique_ptr<CMasternodeSync>& mn_sync);
Lib.NotifyChainLock = function (pindex, clhandler, mn_sync) {};

//orig: static void UpdateDSTXConfirmedHeight(const CTransactionRef& tx, int nHeight);
Lib.UpdateDSTXConfirmedHeight = function (tx, nHeight) {};
//orig: static void TransactionAddedToMempool(const CTransactionRef& tx) LOCKS_EXCLUDED(cs_mapdstx);
Lib.TransactionAddedToMempool = function (tx) {};
//orig: static void BlockConnected(const std::shared_ptr<const CBlock>& pblock, const CBlockIndex* pindex) LOCKS_EXCLUDED(cs_mapdstx);
Lib.BlockConnected = function (pblock, pindex) {};
//orig: static void BlockDisconnected(const std::shared_ptr<const CBlock>& pblock, const CBlockIndex*) LOCKS_EXCLUDED(cs_mapdstx);
Lib.BlockDisconnected = function (pblock, CBlockIndex) {};
