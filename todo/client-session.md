# Overview

The following is a TODO list made from the header file located in Dash core at
`src/coinjoin/client.h`. It contains all member functions and types that the
coinjoin client session relies on. The order that items are listed here are in
non-prioritized order. For a prioritized list of features that will get us to a
pre-alpha the fastest, take a look at `client-session-prioritized.md`

# First, the base class

## `CCoinJoinBaseSession`

The Client Session class relies on this base class

-   `// base class`
-   `class CCoinJoinBaseSession`

## Member variables

-   [ ] `mutable Mutex cs_coinjoin;`
    -   this is a mutex, which javascript does _not_ have. We'll have to figure
        out locking on our own
-   [ ] `std::vector<CCoinJoinEntry> vecEntries GUARDED_BY(cs_coinjoin); // Masternode/clients entries`
-   [ ] `std::atomic<PoolState> nState{POOL_STATE_IDLE}; // should be one of the POOL_STATE_XXX values`
-   [ ] `std::atomic<int64_t> nTimeLastSuccessfulStep{0}; // the time when last successful mixing step was performed`
-   [ ] `std::atomic<int> nSessionID{0}; // 0 if no mixing session is active`
-   [ ] `CMutableTransaction finalMutableTransaction GUARDED_BY(cs_coinjoin); // the finalized transaction ready for signing`
-   [ ] `int nSessionDenom{0}; // Users must submit a denom matching this`

## Member functions

-   [ ] `void SetNull() EXCLUSIVE_LOCKS_REQUIRED(cs_coinjoin);`
-   [ ] `bool IsValidInOuts(const CTxMemPool& mempool, const std::vector<CTxIn>& vin, const std::vector<CTxOut>& vout, PoolMessage& nMessageIDRet, bool* fConsumeCollateralRet) const;`
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
-   [ ] `const std::unique_ptr<CMasternodeSync>& m_mn_sync;`
-   [ ] `std::vector<COutPoint> vecOutPointLocked;`
-   [ ] `CDeterministicMNCPtr mixingMasternode;`
    -   This could possibly be simplified greatly
    -   we could theoretically just have a connection to the master node and
        leave it at that
-   [ ] `CMutableTransaction txMyCollateral; // client side collateral`
-   [ ] `CPendingDsaRequest pendingDsaRequest;`

    -   This should be a priority.
    -   Anything relating to DS-prefixed constants will be something we want to
        implement quickly/first

-   [ ] `CKeyHolderStorage keyHolderStorage; // storage for keys used in PrepareDenominate`
    -   This could possibly be simplified/left out
-   [ ] `CWallet& mixingWallet;`
    -   We can rely on a static wallet for development/testing

## Member functions

-   `/// Create denominations`
-   [ ] `bool CreateDenominated(CAmount nBalanceToDenominate);`
-   [ ] `bool CreateDenominated(CAmount nBalanceToDenominate, const CompactTallyItem& tallyItem, bool fCreateMixingCollaterals);`
-   [ ] `bool MakeCollateralAmounts();`
    -   Split up large inputs or make fee sized inputs
-   [ ] `bool MakeCollateralAmounts(const CompactTallyItem& tallyItem, bool fTryDenominated);`
-   [ ] `bool CreateCollateralTransaction(CMutableTransaction& txCollateral, std::string& strReason);`
-   [ ] `bool JoinExistingQueue(CAmount nBalanceNeedsAnonymized, CConnman& connman);`
-   [ ] `bool StartNewQueue(CAmount nBalanceNeedsAnonymized, CConnman& connman);`
-   [ ] `bool SelectDenominate(std::string& strErrorRet, std::vector<CTxDSIn>& vecTxDSInRet);`
    -   step 0: select denominated inputs and txouts
-   [ ] `bool PrepareDenominate(int nMinRounds, int nMaxRounds, std::string& strErrorRet, const std::vector<CTxDSIn>& vecTxDSIn, std::vector<std::pair<CTxDSIn, CTxOut> >& vecPSInOutPairsRet, bool fDryRun = false);`
    -   step 1: prepare denominated inputs and outputs
-   [ ] `bool SendDenominate(const std::vector<std::pair<CTxDSIn, CTxOut> >& vecPSInOutPairsIn, CConnman& connman) LOCKS_EXCLUDED(cs_coinjoin);`
    -   step 2: send denominated inputs and outputs prepared in step 1
-   [ ] `void ProcessPoolStateUpdate(CCoinJoinStatusUpdate psssup);`
    -   Process Masternode updates about the progress of mixing
-   [ ] `void SetState(PoolState nStateNew);`
    -   Set the 'state' value, with some logging and capturing when the state
        changed
-   [ ] `void CompletedTransaction(PoolMessage nMessageID);`
-   [ ] `bool SignFinalTransaction(const CTxMemPool& mempool, const CTransaction& finalTransactionNew, CNode& peer, CConnman& connman) LOCKS_EXCLUDED(cs_coinjoin);`
    -   As a client, check and sign the final transaction
-   [ ] `void RelayIn(const CCoinJoinEntry& entry, CConnman& connman) const;`
-   [ ] `void SetNull() EXCLUSIVE_LOCKS_REQUIRED(cs_coinjoin);`
-   [ ] `explicit CCoinJoinClientSession(CWallet& pwallet, const std::unique_ptr<CMasternodeSync>& mn_sync) : m_mn_sync(mn_sync), mixingWallet(pwallet)`
-   [ ] `void ProcessMessage(CNode& peer, CConnman& connman, const CTxMemPool& mempool, std::string_view msg_type, CDataStream& vRecv);`
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
-   [ ] `bool ProcessPendingDsaRequest(CConnman& connman);`
-   [ ] `bool CheckTimeout();`
-   [ ] `void GetJsonInfo(UniValue& obj) const;` - we won't really be needing
        this. Serializing to json will be trivial in any use case };
