# Overview

The following contains what I think will get us to a pre-alpha state the
fastest.

# High priority

-   [ ] `bool CreateDenominated(CAmount nBalanceToDenominate);`
    -   place this in `client-session.js`
    -   [ ] Write unit test for this
-   [ ] `bool CreateDenominated(CAmount nBalanceToDenominate, const CompactTallyItem& tallyItem, bool fCreateMixingCollaterals);`
    -   [ ] unit tests
-   [ ] `bool CreateCollateralTransaction(CMutableTransaction& txCollateral, std::string& strReason);`
    -   [ ] unit tests
-   [ ] `bool MakeCollateralAmounts();`
    -   [ ] unit tests

## Split up large inputs or make fee sized inputs

-   [ ] `bool MakeCollateralAmounts(const CompactTallyItem& tallyItem, bool fTryDenominated);`
    -   [ ] unit tests
-   [ ] `bool SelectDenominate(std::string& strErrorRet, std::vector<CTxDSIn>& vecTxDSInRet);`
    -   [ ] unit tests

## step 0: select denominated inputs and txouts

-   [ ] `bool PrepareDenominate(int nMinRounds, int nMaxRounds, std::string& strErrorRet, const std::vector<CTxDSIn>& vecTxDSIn, std::vector<std::pair<CTxDSIn, CTxOut> >& vecPSInOutPairsRet, bool fDryRun = false);`
    -   [ ] unit tests

## step 1: prepare denominated inputs and outputs

-   [ ] `bool SendDenominate(const std::vector<std::pair<CTxDSIn, CTxOut> >& vecPSInOutPairsIn, CConnman& connman) LOCKS_EXCLUDED(cs_coinjoin);`
    -   [ ] unit tests

## step 2: send denominated inputs and outputs prepared in step 1

-   [ ] `void CompletedTransaction(PoolMessage nMessageID);`
    -   [ ] unit tests
-   [ ] `bool SignFinalTransaction(const CTxMemPool& mempool, const CTransaction& finalTransactionNew, CNode& peer, CConnman& connman) LOCKS_EXCLUDED(cs_coinjoin);`
    -   [ ] unit tests

## As a client, check and sign the final transaction

# First steps

-   [ ] `std::vector<CCoinJoinEntry> vecEntries GUARDED_BY(cs_coinjoin); // Masternode/clients entries`
    -   [ ] This should be one of the first things to implement (CCoinJoinEntry)

# `CTxIn` and `CTxOut`

-   [x] Implement these two classes
-   [ ] Come up with an array that contains the pool state
    -   [ ] `std::atomic<PoolState> nState{POOL_STATE_IDLE}; // should be one of the POOL_STATE_XXX values`
-   [ ] `bool IsValidInOuts(const CTxMemPool& mempool, const std::vector<CTxIn>& vin, const std::vector<CTxOut>& vout, PoolMessage& nMessageIDRet, bool* fConsumeCollateralRet) const;`

# Implement `CTransaction`

-   [ ] unit tests

# Implement `CAmount`

-   [x] `CAmount` is just an `int64_t`. See this `typedef` from `src/amount.h`:

```
/** Amount in satoshis (Can be negative) */
typedef int64_t CAmount;
```

# Masternode data

These variables would be absolutely crucial. For a pre-alpha, we may be able to
get away with simplifying/hard-coding this for the time being.

-   [ ] `const std::unique_ptr<CMasternodeSync>& m_mn_sync;`
-   [ ] `CDeterministicMNCPtr mixingMasternode;`
-   [ ] `void ProcessPoolStateUpdate(CCoinJoinStatusUpdate psssup);`
    -   Process Masternode updates about the progress of mixing

# Networking

-   [ ] `CPendingDsaRequest pendingDsaRequest;`
    -   This should be a priority.
    -   Anything relating to DS-prefixed constants will be something we want to
        implement quickly/first
-   [ ] `bool JoinExistingQueue(CAmount nBalanceNeedsAnonymized, CConnman& connman);`
-   [ ] `bool StartNewQueue(CAmount nBalanceNeedsAnonymized, CConnman& connman);`
-   [ ] `void ProcessMessage(CNode& peer, CConnman& connman, const CTxMemPool& mempool, std::string_view msg_type, CDataStream& vRecv);`
-   [ ] `bool ProcessPendingDsaRequest(CConnman& connman);`

# Collateral

-   [ ] `CMutableTransaction txMyCollateral; // client side collateral`

# Anything below this line

1. has been deemed less important for the time being
2. may be moved up higher in priority at a later date
3. Has the potential of being moved up due to cohesion with the implementation
   of the code listed above this line

-   [ ] `std::atomic<int64_t> nTimeLastSuccessfulStep{0}; // the time when last successful mixing step was performed`
-   [ ] `std::atomic<int> nSessionID{0}; // 0 if no mixing session is active`
-   [ ] `CMutableTransaction finalMutableTransaction GUARDED_BY(cs_coinjoin); // the finalized transaction ready for signing`
-   [ ] `int nSessionDenom{0}; // Users must submit a denom matching this`

## Member functions

-   [ ] `void SetNull() EXCLUSIVE_LOCKS_REQUIRED(cs_coinjoin);`
-   [ ] `int GetState() const { return nState; }`
-   [ ] `std::string GetStateString() const;`
-   [ ] `int GetEntriesCount() const LOCKS_EXCLUDED(cs_coinjoin) { LOCK(cs_coinjoin); return vecEntries.size(); }`
-   [ ] `int GetEntriesCountLocked() const EXCLUSIVE_LOCKS_REQUIRED(cs_coinjoin) { return vecEntries.size(); }`

# Second, the derived class

## `CCoinJoinClientSession`

```
class CCoinJoinClientSession : public CCoinJoinBaseSession
```

## Member variables

-   [ ] `bilingual_str strLastMessage;`
-   [ ] `bilingual_str strAutoDenomResult;`
-   [ ] `std::vector<COutPoint> vecOutPointLocked;`

    -   This could possibly be simplified greatly
    -   we could theoretically just have a connection to the master node and
        leave it at that

-   [ ] `CKeyHolderStorage keyHolderStorage; // storage for keys used in PrepareDenominate`
    -   This could possibly be simplified/left out
-   [ ] `CWallet& mixingWallet;`
    -   We can rely on a static wallet for development/testing

## Member functions

-   `/// Create denominations`
-   [ ] `void SetState(PoolState nStateNew);`
    -   Set the 'state' value, with some logging and capturing when the state
        changed
-   [ ] `void RelayIn(const CCoinJoinEntry& entry, CConnman& connman) const;`
-   [ ] `void SetNull() EXCLUSIVE_LOCKS_REQUIRED(cs_coinjoin);`
-   [ ] `explicit CCoinJoinClientSession(CWallet& pwallet, const std::unique_ptr<CMasternodeSync>& mn_sync) : m_mn_sync(mn_sync), mixingWallet(pwallet)`
-   [ ] `void UnlockCoins();`
-   [ ] `void ResetPool() LOCKS_EXCLUDED(cs_coinjoin);`
-   [ ] `bilingual_str GetStatus(bool fWaitForBlock) const;`
-   [ ] `bool GetMixingMasternodeInfo(CDeterministicMNCPtr& ret) const;`
-   [ ] `bool DoAutomaticDenominating(CTxMemPool& mempool, CConnman& connman, bool fDryRun = false) LOCKS_EXCLUDED(cs_coinjoin);`
    -   Passively run mixing in the background according to the configuration in
        settings
-   [ ] `bool SubmitDenominate(CConnman& connman);`
    -   As a client, submit part of a future mixing transaction to a Masternode
        to start the process
-   [ ] `bool CheckTimeout();`
-   [ ] `void GetJsonInfo(UniValue& obj) const;` - we won't really be needing
        this. Serializing to json will be trivial in any use case };
