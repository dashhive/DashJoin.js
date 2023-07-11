# Overview
Code review of Dash Core C++ code. Particularly, DSS flow.

# Where we're concerned
```
2023-07-07T04:02:11Z (mocktime: 2023-07-07T04:06:14Z) CCoinJoinServer::CheckPool -- entries count 2
2023-07-07T04:02:11Z (mocktime: 2023-07-07T04:06:14Z) CCoinJoinServer::CheckPool -- SIGNING
2023-07-07T04:02:11Z (mocktime: 2023-07-07T04:06:14Z) CCoinJoinServer::CommitFinalTransaction -- finalTransaction=CTransaction(hash=7efae2e243, ver=2, type=0, vin.size=6, vout.size=6, nLockTime=0, vExtraPayload.size=0)
    CTxIn(COutPoint(01c6baa2efc525ee41b1f6f57583293c1df8ae494565d223be55557d52c998fe, 0), scriptSig=483045022100eeb87227d8d3)
    CTxIn(COutPoint(1914a266d3724a723294df7b36d8e530d4d3c28d9a92675ea48ceb7f5ed253fe, 0), scriptSig=483045022100942755e89e80)
    CTxIn(COutPoint(1e19b1e944c4971213580bbcf96cda8916f38d692a40c782b1405182ec7f39ff, 0), scriptSig=483045022100a03c2f968a39)
    CTxIn(COutPoint(2176c7b6b145d46db973bb736fa3635b39428931608ea76e92bf9b390ce7e8ff, 0), scriptSig=4730440220266a081aec8403)
    CTxIn(COutPoint(2306d64528adf12109c34b0f740a494eefbdc8b026fc28f67e0da24915fd60ff, 0), scriptSig=47304402206aa6b8fc519157)
    CTxIn(COutPoint(a5189b3aa2731ff5cfbcce4cd2228c68bc48908df94e6b5a2acd1e84b94954fe, 0), scriptSig=483045022100a2da22ef5494)
    CTxOut(nValue=0.00100001, scriptPubKey=76a914164d9a977ebfe5dd7d805132)
    CTxOut(nValue=0.00100001, scriptPubKey=76a91452f4609f8a34560d5f880393)
    CTxOut(nValue=0.00100001, scriptPubKey=76a9147686f5fcf93bf3e15a13b9a7)
    CTxOut(nValue=0.00100001, scriptPubKey=76a914781fe680d7d6ed65b7cd80a7)
    CTxOut(nValue=0.00100001, scriptPubKey=76a91481026d6367d1ffbce44fe41d)
    CTxOut(nValue=0.00100001, scriptPubKey=76a914d075a514565f8e022e5d7f11)
2023-07-07T04:02:11Z (mocktime: 2023-07-07T04:06:14Z) PrioritiseTransaction: 7efae2e2435138bf1ca30de8df49db47195812b52a1d0f8b031c338d612775fd feerate += 0.10
2023-07-07T04:02:11Z (mocktime: 2023-07-07T04:06:14Z) AcceptToMemoryPoolWithTime: 7efae2e2435138bf1ca30de8df49db47195812b52a1d0f8b031c338d612775fd mandatory-script-verify-flag-failed (Signature must be zero for failed CHECK(MULTI)SIG operation) ()
2023-07-07T04:02:11Z (mocktime: 2023-07-07T04:06:14Z) CCoinJoinServer::CommitFinalTransaction -- AcceptToMemoryPool() error: Transaction not valid
```

# Entry `void CCoinJoinServer::CommitFinalTransaction()` in server.cpp
server.cpp:327: `mempool.PrioritiseTransaction(hashTx, 0.1 * COIN);`

Line 328 is the top of the call stack. It is where the DSS flow ultimately fails.
server.cpp:328:
```
        if (!lockMain || !AcceptToMemoryPool(mempool, validationState, finalTransaction, nullptr /* pfMissingInputs */, false /* bypass_limits */, DEFAULT_MAX_RAW_TX_FEE /* nAbsurdFee */)) {
            LogPrint(BCLog::COINJOIN, "CCoinJoinServer::CommitFinalTransaction -- AcceptToMemoryPool() error: Transaction not valid\n");
            WITH_LOCK(cs_coinjoin, SetNull());
            // not much we can do in this case, just notify clients
            RelayCompletedTransaction(ERR_INVALID_TX);
            return;
        }
    }
```

## PrioritiseTransaction
- Updates ancestry data with fees

## AcceptToMemoryPool
Is just a wrapper function to `AcceptToMemoryPoolWithTime`.
```
bool AcceptToMemoryPool(
  CTxMemPool& pool,       // mempool
  CValidationState &state,  // validationState
  const CTransactionRef &tx,  // finalTransaction
  bool* pfMissingInputs,
  bool bypass_limits,
  const CAmount nAbsurdFee, 
  bool test_accept) {
    const CChainParams& chainparams = Params();
    return AcceptToMemoryPoolWithTime(
      chainparams,  // 
      pool,   // mempool
      state,  // validationState
      tx,     // finalTransaction
      pfMissingInputs, // nullptr when called
      GetTime(),      // 
      bypass_limits,  // false when called
      nAbsurdFee,     // DEFAULT_MAX_RAW_TX_FEE
      test_accept);
}
```
## validationState:
```
CValidationState validationState;
```
- is mostly used as a pass by reference parameter which will change by the called functions it's passed to


## finalTransaction
```
CTransactionRef finalTransaction = WITH_LOCK(cs_coinjoin, return MakeTransactionRef(finalMutableTransaction));
uint256 hashTx = finalTransaction->GetHash();
```
- locks the coinjoin mutex
- references the `finalMutableTransaction`
- fetches the hash... txid?


## AcceptToMemoryPoolWithTime
Description as per comment above function: 
```
/** (try to) add transaction to memory pool with a specified acceptance time **/
```
```
static bool AcceptToMemoryPoolWithTime(
const CChainParams& chainparams,  // when called: const CChainParams& chainparams = Params();
CTxMemPool& pool,   // mempool
CValidationState &state,  // validationState
const CTransactionRef &tx,  // finalTransaction
bool* pfMissingInputs,  // nullptr when called
int64_t nAcceptTime,  // GetTime() when called
bool bypass_limits,   // false when called
const CAmount nAbsurdFee, // DEFAULT_MAX_RAW_TX_FEE
bool test_accept    //  not sure where this is set
) EXCLUSIVE_LOCKS_REQUIRED(cs_main)
```

```
    boost::posix_time::ptime start = boost::posix_time::microsec_clock::local_time();
    const CTransaction& tx = *ptx;
    const uint256 hash = tx.GetHash();
    AssertLockHeld(cs_main);
    LOCK(pool.cs); // mempool "read lock" (held through GetMainSignals().TransactionAddedToMempool())
    if (pfMissingInputs) {
        *pfMissingInputs = false;
    }

```
- pfMissingInputs is nullptr, so will not be set to false

### Some things we can assume about AcceptToMemoryPoolWithTime
- The transaction that gets prioritised is *not* already in the mempool since the following line does not cause the function to return early:
```
    // is it already in the memory pool?
    if (pool.exists(hash)) {
```
- It's not a coinbase tx
- It is a standard tx
- Serialized size is good:
```
    // Transactions smaller than this are not relayed to mitigate CVE-2017-12842 by not relaying
    // 64-byte transactions.
```
- CheckTxInputs (for consensus) checks out
```
if (!Consensus::CheckTxInputs(tx, state, view, GetSpendHeight(view), nFees)) {
```
- All inputs are standard:
```
        // Check for non-standard pay-to-script-hash in inputs
        if (fRequireStandard && !AreInputsStandard(tx, view))
            return state.Invalid(ValidationInvalidReason::TX_NOT_STANDARD, false, REJECT_NONSTANDARD, "bad-txns-nonstandard-inputs");
```

## CheckInputs
```
        // Check against previous transactions
        // This is done last to help prevent CPU exhaustion denial-of-service attacks.
        PrecomputedTransactionData txdata;
        if (!CheckInputs(
        tx,   // CTransactionRef  (finalTransaction)
        state, // validationState
        view, // CCoinsViewCache view(&dummy);
        true, // fScriptChecks
        scriptVerifyFlags, // when called: STANDARD_SCRIPT_VERIFY_FLAGS
        true,   // cacheSigStore
        false,  // cacheFullScriptStore
        txdata  // PrecomputedTransactionData txdata; (pass by ref)
        )) {
            assert(IsTransactionReason(state.GetReason()));
            return false; // state filled in by CheckInputs
        }
```
### Function signature:
```
bool CheckInputs(
const CTransaction& tx,     // finalTransaction
CValidationState &state,    // validationState
 const CCoinsViewCache &inputs, // CCoinsViewCache
 bool fScriptChecks,          // true when called
 unsigned int flags,          // STANDARD_SCRIPT_VERIFY_FLAGS
 bool cacheSigStore,          // true when called
 bool cacheFullScriptStore,   // false when called
 PrecomputedTransactionData& txdata,  // pass by ref. filled in by function
 std::vector<CScriptCheck> *pvChecks) EXCLUSIVE_LOCKS_REQUIRED(cs_main)
```

## CheckInputs
- Checks all inputs are valid
  - no double spends
  - scripts+sigs are good
  - amounts are good
- if `pvChecks` not nullptr,
  - script checks pushed onto it
- setting `cacheFullScriptStore` to false (we are)
  - will remove elements from the corresponding cache

### Point of failure
```
                // Verify signature
                CScriptCheck check(coin.out, tx, i, flags, cacheSigStore, &txdata);
                if (pvChecks) {
                    pvChecks->push_back(CScriptCheck());
                    check.swap(pvChecks->back());
                } else if (!check()) { <<<---- here
```

## CScriptCheck
- The constructor is called at validation.cpp:1468
```
CScriptCheck check(
coin.out,   // inputs.AccessCoin(tx.vin[i].prevout)
tx,         // 
i, 
flags, 
cacheSigStore, 
&txdata
);
```
- Constructor:
```
    CScriptCheck(
    const CTxOut& outIn,  // m_tx_out
 const CTransaction& txToIn,  // ptxTo
 unsigned int nInIn,  // nIn
 unsigned int nFlagsIn, // nFlags
 bool cacheIn,  // cacheStore
 PrecomputedTransactionData* txdataIn // txdata
 // error(SCRIPT_ERR_UNKNOWN_ERROR)
 )
```
- coin is the current vin's previous out:
```
for (unsigned int i = 0; i < tx.vin.size(); i++) {
    const COutPoint &prevout = tx.vin[i].prevout;
    const Coin& coin = inputs.AccessCoin(prevout);
```

```
bool CScriptCheck::operator()() {
    const CScript &scriptSig = ptxTo->vin[nIn].scriptSig;
    PrecomputedTransactionData txdata(*ptxTo);
    return VerifyScript(
    scriptSig,  // CScript scriptSig vinput[outputIndex].scriptSig
 m_tx_out.scriptPubKey, // 
 nFlags,  // STANDARD_SCRIPT_VERIFY_FLAGS
 CachingTransactionSignatureChecker(ptxTo,
 nIn,
 m_tx_out.nValue,
 txdata,
 cacheStore),
 &error);
}
```

## VerifyScript
```
bool VerifyScript(
const CScript& scriptSig, // scriptSig 
 const CScript& scriptPubKey, //m_tx_out.scriptPubKey
 unsigned int flags,  // STANDARD_SCRIPT_VERIFY_FLAGS
 const BaseSignatureChecker& checker, //CachingTransactionSignatureChecker
 ScriptError* serror  // pass by ref
 )
```


## EvalScript
- `OP_CHECKSIGVERIFY`
  - `bool fSuccess = checker.CheckSig(vchSig, vchPubKey, scriptCode, sigversion);`
  - script/interpreter.cpp:998


- `OP_CHECKDATASIG/OP_CHECKDATASIGVERIFY`
```
bool fSuccess = false;
if (vchSig.size()) {
    valtype vchHash(32);
    CSHA256()
        .Write(vchMessage.data(), vchMessage.size())
        .Finalize(vchHash.data());
    fSuccess = CPubKey(vchPubKey).Verify(uint256(vchHash), vchSig);
}
```
  - script/interpreter.cpp:1039

- `OP_CHECKMULTISIG/OP_CHECKMULTISIGVERIFY`
```
```
  - script/interpreter.cpp:1136

