/**
* A port of DASH core's CCoinJoin
*/

let Lib = {'core_name': 'CCoinJoin'};
const { COIN } = require('./coin.js');
const { COINJOIN_ENTRY_MAX_SIZE } = require('./coin-join-constants.js');

module.exports = Lib;
// static members
Lib.vecStandardDenominations = [
	(10 * COIN) + 10000,
	(1 * COIN) + 1000,
	(COIN / 10) + 100,
	(COIN / 100) + 10,
	(COIN / 1000) + 1,
];

//orig: static std::map<uint256, CCoinJoinBroadcastTx> mapDSTX GUARDED_BY(cs_mapdstx);
Lib.mapDSTX = {}; // FIXME: this can most likely just be an object
//orig: static void CheckDSTXes(const CBlockIndex* pindex, const llmq::CChainLocksHandler& clhandler) LOCKS_EXCLUDED(cs_mapdstx);
Lib.CheckDSTXes = function (pindex, clhandler) {

};

//orig: static constexpr std::array<CAmount, 5> GetStandardDenominations() { return vecStandardDenominations; }
Lib.GetStandardDenominations = function(){
	return Lib.vecStandardDenominations;
}
//orig: static constexpr CAmount GetSmallestDenomination() { return vecStandardDenominations.back(); }
Lib.GetSmallestDenomination = function() { 
	return Lib.vecStandardDenominations[Lib.vecStandardDenominations.length-1];
};

//orig: static constexpr bool IsDenominatedAmount(CAmount nInputAmount) { return AmountToDenomination(nInputAmount) > 0; }
Lib.IsDenominatedAmount = function(nInputAmount) {
	return Lib.AmountToDenomination(nInputAmount) > 0;
};
//orig: static constexpr bool IsValidDenomination(int nDenom) { return DenominationToAmount(nDenom) > 0; }
Lib.IsValidDenomination = function(nDenom) {
	return Lib.DenominationToAmount(nDenom) > 0;
};
/*
		Return a bitshifted integer representing a denomination in vecStandardDenominations
		or 0 if none was found
*/
//orig: static constexpr int AmountToDenomination(CAmount nInputAmount)
Lib.AmountToDenomination = function(nInputAmount) {
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

		if (nDenom >= (1 << nMaxDenoms) || nDenom < 0) {
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
Lib.DenominationToString = function (nDenom){

};

//orig: static bilingual_str GetMessageByID(PoolMessage nMessageID);
Lib.GetMessageByID = function(nMessageID){

};

/// Get the minimum/maximum number of participants for the pool
//orig: static int GetMinPoolParticipants();
Lib.GetMinPoolParticipants = function(){

};
//orig: static int GetMaxPoolParticipants();
Lib.GetMaxPoolParticipants = function(){

};

//orig: static constexpr CAmount GetMaxPoolAmount() { return COINJOIN_ENTRY_MAX_SIZE * vecStandardDenominations.front(); }
Lib.GetMaxPoolAmount = function() {
	return COINJOIN_ENTRY_MAX_SIZE * Lib.vecStandardDenominations[0];
};

/// If the collateral is valid given by a client
//orig: static bool IsCollateralValid(CTxMemPool& mempool, const CTransaction& txCollateral);
Lib.IsCollateralValid = function(mempool, txCollateral){
	// TODO: FIXME: create CTransaction with .vout.empty()
    if (txCollateral.vout.empty()) {
			return false;
		}
    if (txCollateral.nLockTime != 0) {
			return false;
		}

    //CAmount nValueIn = 0;
    //CAmount nValueOut = 0;

	
	let nValueIn = 0; // TODO: convert to CAmount
	let nValueOut = 0; // TODO: convert to CAmount
    for (const auto& txout : txCollateral.vout) {
        nValueOut += txout.nValue;

        if (!txout.scriptPubKey.IsPayToPublicKeyHash() && !txout.scriptPubKey.IsUnspendable()) {
            LogPrint(BCLog::COINJOIN, "CCoinJoin::IsCollateralValid -- Invalid Script, txCollateral=%s", txCollateral.ToString()); /* Continued */
            return false;
        }
    }

    for (const auto& txin : txCollateral.vin) {
        Coin coin;
        auto mempoolTx = mempool.get(txin.prevout.hash);
        if (mempoolTx != nullptr) {
            if (mempool.isSpent(txin.prevout) || !llmq::quorumInstantSendManager->IsLocked(txin.prevout.hash)) {
                LogPrint(BCLog::COINJOIN, "CCoinJoin::IsCollateralValid -- spent or non-locked mempool input! txin=%s\n", txin.ToString());
                return false;
            }
            nValueIn += mempoolTx->vout[txin.prevout.n].nValue;
        } else if (GetUTXOCoin(txin.prevout, coin)) {
            nValueIn += coin.out.nValue;
        } else {
            LogPrint(BCLog::COINJOIN, "CCoinJoin::IsCollateralValid -- Unknown inputs in collateral transaction, txCollateral=%s", txCollateral.ToString()); /* Continued */
            return false;
        }
    }

    //collateral transactions are required to pay out a small fee to the miners
    if (nValueIn - nValueOut < GetCollateralAmount()) {
        LogPrint(BCLog::COINJOIN, "CCoinJoin::IsCollateralValid -- did not include enough fees in transaction: fees: %d, txCollateral=%s", nValueOut - nValueIn, txCollateral.ToString()); /* Continued */
        return false;
    }

    LogPrint(BCLog::COINJOIN, "CCoinJoin::IsCollateralValid -- %s", txCollateral.ToString()); /* Continued */

    {
        LOCK(cs_main);
        CValidationState validationState;
        if (!AcceptToMemoryPool(mempool, validationState, MakeTransactionRef(txCollateral), /*pfMissingInputs=*/nullptr, /*bypass_limits=*/false, /*nAbsurdFee=*/DEFAULT_MAX_RAW_TX_FEE, /*test_accept=*/true)) {
            LogPrint(BCLog::COINJOIN, "CCoinJoin::IsCollateralValid -- didn't pass AcceptToMemoryPool()\n");
            return false;
        }
    }

    return true;
};
//orig: static constexpr CAmount GetCollateralAmount() { return GetSmallestDenomination() / 10; }
Lib.GetCollateralAmount = function() {
	return Lib.GetSmallestDenomination() / 10;
};
//orig: static constexpr CAmount GetMaxCollateralAmount() { return GetCollateralAmount() * 4; }
Lib.GetMaxCollateralAmount = function() {
	return Lib.GetCollateralAmount() * 4;
};

//orig: static constexpr bool IsCollateralAmount(CAmount nInputAmount)
Lib.IsCollateralAmount = function(nInputAmount) {
	// collateral input can be anything between 1x and "max" (including both)
	return (nInputAmount >= Lib.GetCollateralAmount() && 
		nInputAmount <= Lib.GetMaxCollateralAmount());
}

//orig: static constexpr int CalculateAmountPriority(CAmount nInputAmount)
Lib.CalculateAmountPriority = function(nInputAmount) {

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
	for(const denom of Lib.GetStandardDenominations()){
		if(denom === nInputAmount){
			optDenom = denom;
			return COIN / optDenom * 10000;
		}
	}
	if(nInputAmount < COIN) {
		return 20000;
	}
	//nondenom return largest first
	return -1 * (nInputAmount / COIN);
};


//orig: static void AddDSTX(const CCoinJoinBroadcastTx& dstx) LOCKS_EXCLUDED(cs_mapdstx);
Lib.AddDSTX = function (dstx) {

};
//orig: static CCoinJoinBroadcastTx GetDSTX(const uint256& hash) LOCKS_EXCLUDED(cs_mapdstx);
Lib.GetDSTX = function(hash) {

};

//orig: static void UpdatedBlockTip(const CBlockIndex* pindex, const llmq::CChainLocksHandler& clhandler, const std::unique_ptr<CMasternodeSync>& mn_sync);
Lib.UpdatedBlockTip = function(pindex, clhandler, mn_sync){

};
//orig: static void NotifyChainLock(const CBlockIndex* pindex, const llmq::CChainLocksHandler& clhandler, const std::unique_ptr<CMasternodeSync>& mn_sync);
Lib.NotifyChainLock = function(pindex, clhandler, mn_sync){

};

//orig: static void UpdateDSTXConfirmedHeight(const CTransactionRef& tx, int nHeight);
Lib.UpdateDSTXConfirmedHeight = function (tx, nHeight){

};
//orig: static void TransactionAddedToMempool(const CTransactionRef& tx) LOCKS_EXCLUDED(cs_mapdstx);
Lib.TransactionAddedToMempool = function(tx) {

};
//orig: static void BlockConnected(const std::shared_ptr<const CBlock>& pblock, const CBlockIndex* pindex) LOCKS_EXCLUDED(cs_mapdstx);
Lib.BlockConnected = function(pblock, pindex) {

};
//orig: static void BlockDisconnected(const std::shared_ptr<const CBlock>& pblock, const CBlockIndex*) LOCKS_EXCLUDED(cs_mapdstx);
Lib.BlockDisconnected = function(pblock, CBlockIndex) {

};

