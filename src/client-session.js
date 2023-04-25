/**
 * A port of DASH core's CCoinJoinClientSession
 */

const HardDrive = require("hd.js"); // TODO: .GetDataDir())) {
const MasterNodeSync = require("master-node-sync.js");
const WalletImpl = require("wallet.js");
const NetMsgType = require("net-msg.js").NetMsgType;
const Vector = require("./vector.js");
const COutPoint = require("./outpoint.js");
const CoinJoin = require("./coin-join.js");
const {
  COINJOIN_DENOM_OUTPUTS_THRESHOLD,
  MSG_POOL_MIN,
  MSG_POOL_MAX,
} = require("./coin-join-constants.js");

let Lib = { core_name: "CCoinJoinClientSession" };
module.exports = Lib;
//class CCoinJoinClientSession : public CCoinJoinBaseSession
// Keep track of the used Masternodes
//orig: const std::unique_ptr<CMasternodeSync>& m_mn_sync;
Lib.m_mn_sync = new MasterNodeSync();

Lib.NetMsgType = NetMsgType;
// orig: std::vector<COutPoint> vecOutPointLocked;
Lib.vecOutPointLocked = new Vector(new COutPoint());
//orig: bilingual_str strLastMessage;
Lib.strLastMessage = "";
//orig: bilingual_str strAutoDenomResult;
Lib.strAutoDenomResult = "";

//orig: CDeterministicMNCPtr mixingMasternode;
Lib.mixingMasternode = {}; // TODO: FIXME:
//orig: CMutableTransaction txMyCollateral; // client side collateral
Lib.txMyCollateral = 0; // TODO: FIXME
//orig: CPendingDsaRequest pendingDsaRequest;
Lib.pendingDsaRequest = {}; //TODO: FIXME

//orig: CKeyHolderStorage keyHolderStorage; // storage for keys used in PrepareDenominate
Lib.keyHolderStorage = [];

//orig: CWallet& mixingWallet;
Lib.mixingWallet = new WalletImpl();

/// Create denominations
//orig: bool CreateDenominated(CAmount nBalanceToDenominate);
//orig: bool CreateDenominated(CAmount nBalanceToDenominate, const CompactTallyItem& tallyItem, bool fCreateMixingCollaterals);
Lib.CreateDenominated = function (
  nBalanceToDenominate,
  tallyItem = null,
  fCreateMixingCollaterals = null
) {
  // Create denominations by looping through inputs grouped by addresses
  //bool CCoinJoinClientSession::CreateDenominated(CAmount nBalanceToDenominate)
  //{

  // NOTE: We do not allow txes larger than 100 kB, so we have to limit number of inputs here.
  // We still want to consume a lot of inputs to avoid creating only smaller denoms though.
  // Knowing that each CTxIn is at least 148 B big, 400 inputs should take 400 x ~148 B = ~60 kB.
  // This still leaves more than enough room for another data of typical CreateDenominated tx.
  //orig: std::vector<CompactTallyItem> vecTally = mixingWallet.SelectCoinsGroupedByAddresses(true, true, true, 400);
  let vecTally = new Vector();
  vecTally.contents = Lib.mixingWallet.SelectCoinsGroupedByAddresses(
    true,
    true,
    true,
    400
  ); // FIXME: add to wallet.js
  if (vecTally.contents.length === 0) {
    Lib.LogPrint(
      "CCoinJoinClientSession::CreateDenominated -- SelectCoinsGroupedByAddresses can't find any inputs!"
    );
    return false;
  }

  // Start from the largest balances first to speed things up by creating txes with larger/largest denoms included
  //orig: std::sort(vecTally.begin(), vecTally.end(), [](const CompactTallyItem& a, const CompactTallyItem& b) {
  //return a.nAmount > b.nAmount;
  //});
  vecTally = Lib.sort(vecTally, function (a, b) {
    return a.nAmount > b.nAmount;
  });

  fCreateMixingCollaterals = !Lib.mixingWallet.HasCollateralInputs(); // FIXME: add to wallet.js

  for (const item of vecTally.contents) {
    if (
      !Lib.CreateDenominated(
        nBalanceToDenominate,
        item,
        fCreateMixingCollaterals
      )
    ) {
      continue;
    }
    return true;
  }

  Lib.LogPrint("CCoinJoinClientSession::CreateDenominated -- failed!");
  return false;
};

// Create denominations
//orig: bool CCoinJoinClientSession::CreateDenominated(CAmount nBalanceToDenominate, const CompactTallyItem& tallyItem, bool fCreateMixingCollaterals)
Lib.CreateDenominatedExt = function (
  nBalanceToDenominate,
  tallyItem,
  fCreateMixingCollaterals
) {
  const func = "CreateDenominatedExt";
  const __func__ = func;

  // denominated input is always a single one, so we can check its amount directly and return early
  // TODO: FIXME: make sure CompactTallyItem has vecInputCoins with a .size() function
  // TODO: FIXME: make sure CompactTallyItem has .nAmount
  if (
    tallyItem.vecInputCoins.size() == 1 &&
    CoinJoin.IsDenominatedAmount(tallyItem.nAmount)
  ) {
    return false;
  }

  //const auto pwallet = GetWallet(mixingWallet.GetName());

  let pwallet = Lib.mixingWallet;
  if (!pwallet) {
    Lib.LogPrint(
      `CCoinJoinClientSession::${func} -- Couldn't get wallet pointer`
    );
    return false;
  }

  //CTransactionBuilder txBuilder(pwallet, tallyItem);
  let txBuilder = new CTransactionBuilder(pwallet, tallyItem); // TODO: CTransactionBuilder

  Lib.LogPrint(
    `CCoinJoinClientSession::${func} -- Start ${txBuilder.ToString()}`
  );

  // ****** Add an output for mixing collaterals ************ /

  if (
    fCreateMixingCollaterals &&
    !txBuilder.AddOutput(CoinJoin.GetMaxCollateralAmount())
  ) {
    Lib.LogPrint(
      `CCoinJoinClientSession::${func} -- Failed to add collateral output`
    );
    return false;
  }

  // ****** Add outputs for denoms ************ /

  //bool fAddFinal = true;
  //auto denoms = CoinJoin::GetStandardDenominations();

  let fAddFinal = true;
  let denoms = CoinJoin.GetStandardDenominations(); // TODO:
  //std::map<CAmount, int> mapDenomCount;
  let mapDenomCount;
  for (const nDenomValue of denoms) {
    //mapDenomCount.insert(std::pair<CAmount, int>(nDenomValue, mixingWallet.CountInputsWithAmount(nDenomValue)));
    mapDenomCount[nDenomValue] = Lib.mixingWallet.CountInputsWithAmount(); // TODO
  }

  // Will generate outputs for the createdenoms up to coinjoinmaxdenoms per denom

  // This works in the way creating PS denoms has traditionally worked, assuming enough funds,
  // it will start with the smallest denom then create 11 of those, then go up to the next biggest denom create 11
  // and repeat. Previously, once the largest denom was reached, as many would be created were created as possible and
  // then any remaining was put into a change address and denominations were created in the same manner a block later.
  // Now, in this system, so long as we don't reach COINJOIN_DENOM_OUTPUTS_THRESHOLD outputs the process repeats in
  // the same transaction, creating up to nCoinJoinDenomsHardCap per denomination in a single transaction.

  while (
    txBuilder.CouldAddOutput(CoinJoin.GetSmallestDenomination()) &&
    txBuilder.CountOutputs() < COINJOIN_DENOM_OUTPUTS_THRESHOLD
  ) {
    //for (auto it = denoms.rbegin(); it != denoms.rend(); ++it) {
    for (const it of denoms) {
      let nDenomValue = it;
      let currentDenomIt = mapDenomCount.find(nDenomValue);

      let nOutputs = 0;

      const strFunc = __func__;
      let needMoreOutputs = function () {
        if (txBuilder.CouldAddOutput(nDenomValue)) {
          if (
            fAddFinal &&
            nBalanceToDenominate > 0 &&
            nBalanceToDenominate < nDenomValue
          ) {
            fAddFinal = false; // add final denom only once, only the smalest possible one
            Lib.LogPrint(
              `CCoinJoinClientSession::${strFunc} -- 1 - FINAL - nDenomValue: ${
                nDenomValue / COIN
              }, nBalanceToDenominate: ${
                nBalanceToDenominate / COIN
              }, nOutputs: ${nOutputs}, ${txBuilder.ToString()}`
            );
            return true;
          } else if (nBalanceToDenominate >= nDenomValue) {
            return true;
          }
        }
        return false;
      };

      // add each output up to 11 times or until it can't be added again or until we reach nCoinJoinDenomsGoal
      while (
        needMoreOutputs() &&
        nOutputs <= 10 &&
        currentDenomIt.second < Lib.CCoinJoinClientOptions.GetDenomsGoal()
      ) {
        // Add output and subtract denomination amount
        if (txBuilder.AddOutput(nDenomValue)) {
          ++nOutputs;
          currentDenomIt.second += 1;
          nBalanceToDenominate -= nDenomValue;
          Lib.LogPrint(
            `CCoinJoinClientSession::${__func__} -- 1 - nDenomValue: ${
              nDenomValue / COIN
            }, nBalanceToDenominate: ${nBalanceToDenominate}, nOutputs: ${nOutputs}, ${txBuilder.ToString()}`
          );
        } else {
          Lib.LogPrint(
            `CCoinJoinClientSession::${__func__} -- 1 - Error: AddOutput failed for nDenomValue: ${
              nDenomValue / COIN
            }, nBalanceToDenominate: ${
              nBalanceToDenominate / COIN
            }, nOutputs: ${nOutputs}, ${txBuilder.ToString()}`
          );
          return false;
        }
      }

      if (txBuilder.GetAmountLeft() == 0 || nBalanceToDenominate <= 0) break;
    }

    let finished = true;
    //orig: for (const auto [denom, count] : mapDenomCount) {
    for (const denom in mapDenomCount) {
      // Check if this specific denom could use another loop, check that there aren't nCoinJoinDenomsGoal of this
      // denom and that our nValueLeft/nBalanceToDenominate is enough to create one of these denoms, if so, loop again.
      let count = mapDenomCount[denom];
      if (
        count < Lib.CCoinJoinClientOptions.GetDenomsGoal() &&
        txBuilder.CouldAddOutput(denom) &&
        nBalanceToDenominate > 0
      ) {
        finished = false;
        Lib.LogPrint(
          `CCoinJoinClientSession::${__func__} -- 1 - NOT finished - nDenomValue: ${
            denom / COIN
          }, count: ${count}, nBalanceToDenominate: ${
            nBalanceToDenominate / COIN
          }, ${txBuilder.ToString()}`
        );
        break;
      }
      Lib.LogPrint(
        `CCoinJoinClientSession::${__func__} -- 1 - FINISHED - nDenomValue: ${
          denom / COIN
        }, count: ${count}, nBalanceToDenominate: ${
          nBalanceToDenominate / COIN
        }, ${txBuilder.ToString()}`
      );
    }

    if (finished) break;
  }

  // Now that nCoinJoinDenomsGoal worth of each denom have been created or the max number of denoms given the value of the input, do something with the remainder.
  if (
    txBuilder.CouldAddOutput(CoinJoin.GetSmallestDenomination()) &&
    nBalanceToDenominate >= CoinJoin.GetSmallestDenomination() &&
    txBuilder.CountOutputs() < COINJOIN_DENOM_OUTPUTS_THRESHOLD
  ) {
    let nLargestDenomValue = denoms[0];

    Lib.LogPrint(
      `CCoinJoinClientSession::${__func__} -- 2 - Process remainder: ${txBuilder.ToString()}`
    );

    let countPossibleOutputs = function (nAmount) {
      //orig: std::vector<CAmount> vecOutputs;
      let vecOutputs = new Vector();
      while (true) {
        // Create a potential output
        vecOutputs.push_back(nAmount);
        if (
          !txBuilder.CouldAddOutputs(vecOutputs) ||
          txBuilder.CountOutputs() + vecOutputs.size() >
            COINJOIN_DENOM_OUTPUTS_THRESHOLD
        ) {
          // If it's not possible to add it due to insufficient amount left or total number of outputs exceeds
          // COINJOIN_DENOM_OUTPUTS_THRESHOLD drop the output again and stop trying.
          vecOutputs.pop_back(); // TODO:
          break;
        }
      }
      return vecOutputs.size();
    };

    // Go big to small
    for (const nDenomValue of denoms.contents) {
      if (nBalanceToDenominate <= 0) break;
      let nOutputs = 0;

      // Number of denoms we can create given our denom and the amount of funds we have left
      let denomsToCreateValue = countPossibleOutputs(nDenomValue);
      // Prefer overshooting the target balance by larger denoms (hence `+1`) instead of a more
      // accurate approximation by many smaller denoms. This is ok because when we get here we
      // should have nCoinJoinDenomsGoal of each smaller denom already. Also, without `+1`
      // we can end up in a situation when there is already nCoinJoinDenomsHardCap of smaller
      // denoms, yet we can't mix the remaining nBalanceToDenominate because it's smaller than
      // nDenomValue (and thus denomsToCreateBal == 0), so the target would never get reached
      // even when there is enough funds for that.
      let denomsToCreateBal = nBalanceToDenominate / nDenomValue + 1;
      // Use the smaller value
      let denomsToCreate =
        denomsToCreateValue > denomsToCreateBal
          ? denomsToCreateBal
          : denomsToCreateValue;
      Lib.LogPrint(
        "CCoinJoinClientSession::%s -- 2 - nBalanceToDenominate: %f, nDenomValue: %f, denomsToCreateValue: %d, denomsToCreateBal: %d\n",
        __func__,
        nBalanceToDenominate / COIN,
        nDenomValue / COIN,
        denomsToCreateValue,
        denomsToCreateBal
      );
      let it = mapDenomCount.find(nDenomValue);
      //for (const auto i : irange::range(denomsToCreate)) {
      for (const i of denomsToCreate) {
        // Never go above the cap unless it's the largest denom
        if (
          nDenomValue != nLargestDenomValue &&
          it.second >= Lib.CCoinJoinClientOptions.GetDenomsHardCap()
        )
          break;

        // Increment helpers, add output and subtract denomination amount
        if (txBuilder.AddOutput(nDenomValue)) {
          nOutputs++;
          it.second++; // TODO:
          nBalanceToDenominate -= nDenomValue;
        } else {
          Lib.LogPrint(
            "CCoinJoinClientSession::%s -- 2 - Error: AddOutput failed at %d/%d, %s\n",
            __func__,
            i + 1,
            denomsToCreate,
            txBuilder.ToString()
          );
          break;
        }
        Lib.LogPrint(
          "CCoinJoinClientSession::%s -- 2 - nDenomValue: %f, nBalanceToDenominate: %f, nOutputs: %d, %s\n",
          __func__,
          nDenomValue / COIN,
          nBalanceToDenominate / COIN,
          nOutputs,
          txBuilder.ToString()
        );
        if (txBuilder.CountOutputs() >= COINJOIN_DENOM_OUTPUTS_THRESHOLD) break;
      }
      if (txBuilder.CountOutputs() >= COINJOIN_DENOM_OUTPUTS_THRESHOLD) break;
    }
  }

  Lib.LogPrint(
    "CCoinJoinClientSession::%s -- 3 - nBalanceToDenominate: %f, %s\n",
    __func__,
    nBalanceToDenominate / COIN,
    txBuilder.ToString()
  );

  //for (const auto [denom, count] : mapDenomCount) {
  for (const denom in mapDenomCount) {
    Lib.LogPrint(
      "CCoinJoinClientSession::%s -- 3 - DONE - nDenomValue: %f, count: %d\n",
      __func__,
      denom / COIN,
      count
    );
  }

  // No reasons to create mixing collaterals if we can't create denoms to mix
  if (
    (fCreateMixingCollaterals && txBuilder.CountOutputs() == 1) ||
    txBuilder.CountOutputs() == 0
  ) {
    return false;
  }

  let strResult;
  if (!txBuilder.Commit(strResult)) {
    Lib.LogPrint(
      "CCoinJoinClientSession::%s -- Commit failed: %s\n",
      __func__,
      strResult.original
    );
    return false;
  }

  // use the same nCachedLastSuccessBlock as for DS mixing to prevent race
  coinJoinClientManagers.at(mixingWallet.GetName()).UpdatedSuccessBlock();

  Lib.LogPrint(
    "CCoinJoinClientSession::%s -- txid: %s\n",
    __func__,
    strResult.original
  );

  return true;
};

/// Split up large inputs or make fee sized inputs
//orig: bool MakeCollateralAmounts();
//orig: bool MakeCollateralAmounts(const CompactTallyItem& tallyItem, bool fTryDenominated);
Lib.MakeCollateralAmounts = function (
  tallyItem = null,
  fTryDenominated = null
) {};

//orig: bool CreateCollateralTransaction(CMutableTransaction& txCollateral, std::string& strReason);
Lib.CreateCollateralTransaction = function (txCollateral, strReason) {};

//orig: bool JoinExistingQueue(CAmount nBalanceNeedsAnonymized, CConnman& connman);
Lib.JoinExistingQueue = function (nBalanceNeedsAnonymized, connman) {};
//orig: bool StartNewQueue(CAmount nBalanceNeedsAnonymized, CConnman& connman);
Lib.StartNewQueue = function (nBalanceNeedsAnonymized, connman) {};

/// step 0: select denominated inputs and txouts
//orig: bool SelectDenominate(std::string& strErrorRet, std::vector<CTxDSIn>& vecTxDSInRet);
Lib.SelectDenominate = function (strErrorRet, svecTxDSInRet) {};
/// step 1: prepare denominated inputs and outputs
//orig: bool PrepareDenominate(int nMinRounds, int nMaxRounds, std::string& strErrorRet, const std::vector<CTxDSIn>& vecTxDSIn, std::vector<std::pair<CTxDSIn, CTxOut> >& vecPSInOutPairsRet, bool fDryRun = false);
Lib.PrepareDenominate = function (
  nMinRounds,
  nMaxRounds,
  strErrorRet,
  vecTxDSIn,
  vecPSInOutPairsRet,
  fDryRun = false
) {};
/// step 2: send denominated inputs and outputs prepared in step 1
//orig: bool SendDenominate(const std::vector<std::pair<CTxDSIn, CTxOut> >& vecPSInOutPairsIn, CConnman& connman) LOCKS_EXCLUDED(cs_coinjoin);
Lib.SendDenominate = function (vecPSInOutPairsIn, connman) {};

/// Process Masternode updates about the progress of mixing
//orig: void ProcessPoolStateUpdate(CCoinJoinStatusUpdate psssup);
Lib.ProcessPoolStateUpdate = function (psssup) {};
// Set the 'state' value, with some logging and capturing when the state changed
//orig: void SetState(PoolState nStateNew);
Lib.SetState = function (nStateNew) {};

//orig: void CompletedTransaction(PoolMessage nMessageID);
Lib.CompletedTransaction = function (nMessageID) {};

/// As a client, check and sign the final transaction
//orig: bool SignFinalTransaction(const CTxMemPool& mempool, const CTransaction& finalTransactionNew, CNode& peer, CConnman& connman) LOCKS_EXCLUDED(cs_coinjoin);
Lib.SignFinalTransaction = function (
  mempool,
  finalTransactionNew,
  peer,
  connman
) {};

//orig: void RelayIn(const CCoinJoinEntry& entry, CConnman& connman) const;
Lib.RelayIn = function (entry, connman) {};

//orig: void SetNull() EXCLUSIVE_LOCKS_REQUIRED(cs_coinjoin);
Lib.SetNull = function () {};

//orig: void ProcessMessage(CNode& peer, CConnman& connman, const CTxMemPool& mempool, std::string_view msg_type, CDataStream& vRecv);
Lib.ProcessMessage = function (peer, connman, mempool, msg_type, vRecv) {
  // TODO: make easier to check: if (!CCoinJoinClientOptions::IsEnabled()) return;
  if (!Lib.m_mn_sync.IsBlockchainSynced()) {
    return;
  }

  if (msg_type == Lib.NetMsgType.DSSTATUSUPDATE) {
    if (!Lib.mixingMasternode) {
      return;
    }
    // TODO FIXME: make pdmnState.addr
    // TODO FIXME: make peer.addr
    if (Lib.mixingMasternode.pdmnState.addr != peer.addr) {
      return;
    }

    /**
     * TODO: FIXME: figure out how to unserialize a message off the wire
     * and parse it as a CCoinJoinStatusUpdate
     */
    let psssup = vRecv.read("CCoinJoinStatusUpdate");

    Lib.ProcessPoolStateUpdate(psssup);
  } else if (msg_type == Lib.NetMsgType.DSFINALTX) {
    if (!Lib.mixingMasternode) {
      return;
    }
    if (Lib.mixingMasternode.pdmnState.addr != peer.addr) {
      return;
    }

    /**
        int nMsgSessionID;
        vRecv >> nMsgSessionID;
        CTransaction txNew(deserialize, vRecv);
				*/
    let nMsgSessionID = vRecv.read("CTransaction");

    if (nSessionID != nMsgSessionID) {
      Lib.LogPrint(
        "DSFINALTX -- message doesn't match current CoinJoin session: nSessionID: %d  nMsgSessionID: %d\n",
        nSessionID,
        nMsgSessionID
      );
      return;
    }

    Lib.LogPrint("DSFINALTX -- txNew %s", txNew.ToString()); /* Continued */

    // check to see if input is spent already? (and probably not confirmed)
    SignFinalTransaction(mempool, txNew, peer, connman); // TODO
  } else if (msg_type == Lib.NetMsgType.DSCOMPLETE) {
    if (!mixingMasternode) return;
    if (mixingMasternode.pdmnState.addr != peer.addr) {
      // TODO
      Lib.LogPrint(
        "DSCOMPLETE -- message doesn't match current Masternode: infoMixingMasternode=%s  addr=%s\n",
        mixingMasternode.pdmnState.addr.ToString(),
        peer.addr.ToString()
      );
      return;
    }

    let nMsgSessionID;
    //PoolMessage nMsgMessageID;
    //orig: vRecv >> nMsgSessionID >> nMsgMessageID;
    nMsgMessageID = vRecv.read("PoolMessage"); // TODO:
    /**
     * THIS SECOND LINE IS NOT A MISTAKE.
     * We are trying to emulate reading nMsgSessionID twice
     */
    nMsgMessageID = vRecv.read("PoolMessage"); // TODO:

    if (nMsgMessageID < MSG_POOL_MIN || nMsgMessageID > MSG_POOL_MAX) {
      Lib.LogPrint(
        "DSCOMPLETE -- nMsgMessageID is out of bounds: %d\n",
        nMsgMessageID
      );
      return;
    }

    if (nSessionID !== nMsgSessionID) {
      Lib.LogPrint(
        "DSCOMPLETE -- message doesn't match current CoinJoin session: nSessionID: %d  nMsgSessionID: %d\n",
        nSessionID,
        nMsgSessionID
      );
      return;
    }

    LogPrint(
      "DSCOMPLETE -- nMsgSessionID %d  nMsgMessageID %d (%s)\n",
      nMsgSessionID,
      nMsgMessageID,
      CoinJoin.GetMessageByID(nMsgMessageID).translated
    );

    Lib.CompletedTransaction(nMsgMessageID);
  }
};

//orig: void UnlockCoins();
Lib.UnlockCoins = function () {};

//orig: void ResetPool() LOCKS_EXCLUDED(cs_coinjoin);
Lib.ResetPool = function () {};

//orig: bilingual_str GetStatus(bool fWaitForBlock) const;
Lib.GetStatus = function (fWaitForBlock) {};

//orig: bool GetMixingMasternodeInfo(CDeterministicMNCPtr& ret) const;
Lib.GetMixingMasternodeInfo = function (ret) {};

/// Passively run mixing in the background according to the configuration in settings
//orig: bool DoAutomaticDenominating(CTxMemPool& mempool, CConnman& connman, bool fDryRun = false) LOCKS_EXCLUDED(cs_coinjoin);
Lib.DoAutomaticDenominating = function (mempool, connman, fDryRun = false) {};

/// As a client, submit part of a future mixing transaction to a Masternode to start the process
//orig: bool SubmitDenominate(CConnman& connman);
Lib.SubmitDenominate = function (connman) {};

//orig: bool ProcessPendingDsaRequest(CConnman& connman);
Lib.ProcessPendingDsaRequest = function (connman) {};

//orig: bool CheckTimeout();
Lib.CheckTimeout = function () {};

//orig: void GetJsonInfo(UniValue& obj) const;
Lib.GetJsonInfo = function (obj) {};
