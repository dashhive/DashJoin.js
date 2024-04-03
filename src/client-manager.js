/**
 * A port of DASH core's CCoinJoinClientManager
 */

const HardDrive = require('hd.js');// TODO: .GetDataDir())) {
const Set = require('./set.js');
const NetMsgType = require('net-msg.js').NetMsgType;
const MasterNodeSync = require('master-node-sync.js');
const Vector = require('./vector.js');
const WalletImpl = require('wallet.js');
const PoolState = require('./pool-state.js');
const POOL_STATE_QUEUE = PoolState.POOL_STATE_QUEUE;
const CoinJoinConstants = require('./coin-join-contants.js');
const COINJOIN_AUTO_TIMEOUT_MIN = CoinJoinConstants.COINJOIN_AUTO_TIMEOUT_MIN;
const COINJOIN_AUTO_TIMEOUT_MAX = CoinJoinConstants.COINJOIN_AUTO_TIMEOUT_MAX;
const GetRandInt = require('./random.js').GetRandInt;
const COutPoint = require('./outpoint.js');
const CCoinJoinClientSession = require('./client-session.js');

let Lib = {'core_name': 'CCoinJoinClientManager'};
module.exports = Lib;
// std::map<const std::string, std::shared_ptr<CCoinJoinClientManager>> coinJoinClientManagers;
Lib.NetMsgType = NetMsgType;
Lib._shutdownRequested = false;
Lib.ShutdownRequested = function(){
	return Lib._shutdownRequested;
};

//std::vector<COutPoint> vecMasternodesUsed;
Lib.vecMasternodesUsed = new Vector(new COutPoint());
// Keep track of the used Masternodes
//orig: const std::unique_ptr<CMasternodeSync>& m_mn_sync;
Lib.m_mn_sync = new MasterNodeSync();

Lib.CCoinJoinClientOptions = require('./options.js');

//orig: std::deque<CCoinJoinClientSession> deqSessions GUARDED_BY(cs_deqsessions);
Lib.deqSessions = new Vector(new CCoinJoinClientSession());
//    std::atomic<bool> fMixing{false};
Lib.fMixing = false;
Lib.IsMixing = function(){
	return Lib.fMixing;
};
// orig: int nCachedLastSuccessBlock{0};
Lib.nCachedLastSuccessBlock = 0;
// how many blocks to wait for after one successful mixing tx in non-multisession mode
//orig: int nMinBlocksToWait{1}; // how many blocks to wait for after one successful mixing tx in non-multisession mode
Lib.nMinBlocksToWait = 1;
// orig: bilingual_str strAutoDenomResult;
Lib.strAutoDenomResult = '';
//orig: CWallet& mixingWallet;
Lib.mixingWallet = new WalletImpl();

// Keep track of current block height
//orig: int nCachedBlockHeight{0};
Lib.nCachedBlockHeight = 0;
// orig: bool WaitForAnotherBlock() const;
Lib.WaitForAnotherBlock = function() {
	/** Returns true/false */
	if(!Lib.m_mn_sync.IsBlockchainSynced()) {
		return true;
	}

	if(Lib.CCoinJoinClientOptions.IsMultiSessionEnabled()) {
		return false;
	}

	return Lib.nCachedBlockHeight - Lib.nCachedLastSuccessBlock < Lib.nMinBlocksToWait;
};

Lib.StartMixing = function() {
	return Lib.fMixing = true;
}

Lib.StopMixing = function() {
	Lib.fMixing = false;
}

Lib.IsMixing = function() {
	return Lib.fMixing;
}
Lib.ResetPool = function(){
	Lib.nCachedLastSuccessBlock = 0;
	Lib.vecMasternodesUsed.clear();
	for(const session of Lib.deqSessions.contents) {
		session.ResetPool();
	}
	Lib.deqSessions.clear();
};

// Make sure we have enough keys since last backup
//orig: bool CheckAutomaticBackup();
/**
 * @return bool
 */
Lib.CheckAutomaticBackup = function() {
	/**
	 * Returns bool
	 */
	if(!Lib.CCoinJoinClientOptions.IsEnabled() || !Lib.IsMixing()) {
		return false;
	}

	//TODO
//	switch(Lib.nWalletBackups) {
//		case 0:
//			strAutoDenomResult = _("Automatic backups disabled") + Untranslated(", ") + _("no mixing available.");
//			LogPrint(BCLog::COINJOIN, "CCoinJoinClientManager::CheckAutomaticBackup -- %s\n", strAutoDenomResult.original);
//			StopMixing();
//			mixingWallet.nKeysLeftSinceAutoBackup = 0; // no backup, no "keys since last backup"
//			return false;
//		case -1:
//			// Automatic backup failed, nothing else we can do until user fixes the issue manually.
//			// There is no way to bring user attention in daemon mode, so we just update status and
//			// keep spamming if debug is on.
//			strAutoDenomResult = _("ERROR! Failed to create automatic backup") + Untranslated(", ") + _("see debug.log for details.");
//			LogPrint(BCLog::COINJOIN, "CCoinJoinClientManager::CheckAutomaticBackup -- %s\n", strAutoDenomResult.original);
//			return false;
//		case -2:
//			// We were able to create automatic backup but keypool was not replenished because wallet is locked.
//			// There is no way to bring user attention in daemon mode, so we just update status and
//			// keep spamming if debug is on.
//			strAutoDenomResult = _("WARNING! Failed to replenish keypool, please unlock your wallet to do so.") + Untranslated(", ") + _("see debug.log for details.");
//			LogPrint(BCLog::COINJOIN, "CCoinJoinClientManager::CheckAutomaticBackup -- %s\n", strAutoDenomResult.original);
//			return false;
//	}
//
//	if(mixingWallet.nKeysLeftSinceAutoBackup < COINJOIN_KEYS_THRESHOLD_STOP) {
//		// We should never get here via mixing itself but probably something else is still actively using keypool
//		strAutoDenomResult = strprintf(_("Very low number of keys left: %d") + Untranslated(", ") + _("no mixing available."), mixingWallet.nKeysLeftSinceAutoBackup);
//		LogPrint(BCLog::COINJOIN, "CCoinJoinClientManager::CheckAutomaticBackup -- %s\n", strAutoDenomResult.original);
//		// It's getting really dangerous, stop mixing
//		StopMixing();
//		return false;
//	} else if(mixingWallet.nKeysLeftSinceAutoBackup < COINJOIN_KEYS_THRESHOLD_WARNING) {
//		// Low number of keys left, but it's still more or less safe to continue
//		strAutoDenomResult = strprintf(_("Very low number of keys left: %d"), mixingWallet.nKeysLeftSinceAutoBackup);
//		LogPrint(BCLog::COINJOIN, "CCoinJoinClientManager::CheckAutomaticBackup -- %s\n", strAutoDenomResult.original);
//
//		if(fCreateAutoBackups) {
//			LogPrint(BCLog::COINJOIN, "CCoinJoinClientManager::CheckAutomaticBackup -- Trying to create new backup.\n");
//			bilingual_str errorString;
//			std::vector<bilingual_str> warnings;
//
//			if(!mixingWallet.AutoBackupWallet("", errorString, warnings)) {
//				if(!warnings.empty()) {
//					// There were some issues saving backup but yet more or less safe to continue
//					LogPrint(BCLog::COINJOIN, "CCoinJoinClientManager::CheckAutomaticBackup -- WARNING! Something went wrong on automatic backup: %s\n", Join(warnings, Untranslated("\n")).translated);
//				}
//				if(!errorString.original.empty()) {
//					// Things are really broken
//					strAutoDenomResult = _("ERROR! Failed to create automatic backup") + Untranslated(": ") + errorString;
//					LogPrint(BCLog::COINJOIN, "CCoinJoinClientManager::CheckAutomaticBackup -- %s\n", strAutoDenomResult.original);
//					return false;
//				}
//			}
//		} else {
//			// Wait for something else (e.g. GUI action) to create automatic backup for us
//			return false;
//		}
//	}
//
//	LogPrint(BCLog::COINJOIN, "CCoinJoinClientManager::CheckAutomaticBackup -- Keys left since latest backup: %d\n", mixingWallet.nKeysLeftSinceAutoBackup);
//
	return true;
}

//int nCachedNumBlocks{std::numeric_limits<int>::max()};    // used for the overview screen
Lib.nCachedNumBlocks = 9999; /** FIXME: use numeric_limits::max */
//bool fCreateAutoBackups{true}; // builtin support for automatic backups
Lib.fCreateAutoBackups = true;  // builtin support for automatic backups
//void ProcessMessage(CNode& peer, CConnman& connman, const CTxMemPool& mempool, std::string_view msg_type, CDataStream& vRecv) LOCKS_EXCLUDED(cs_deqsessions);
Lib.ProcessMessage = function(/*CNode& */peer,
	/*CConnman& */ connman,
	/*const CTxMemPool&*/ mempool,
	/*std::string_view*/ msg_type,
	/*CDataStream&*/ vRecv) {
	if(!Lib.CCoinJoinClientOptions.IsEnabled()) {
		return;
	}
	if(!Lib.m_mn_sync.IsBlockchainSynced()) {
		return;
	}

	if(!HardDrive.CheckDiskSpace(HardDrive.GetDataDir())) {
		Lib.ResetPool();
		Lib.StopMixing();
		Lib.LogPrint("CCoinJoinClientManager::ProcessMessage -- Not enough disk space, disabling CoinJoin.");
		return;
	}

	if(msg_type == Lib.NetMsgType.DSSTATUSUPDATE ||
	    msg_type == Lib.NetMsgType.DSFINALTX ||
	    msg_type == Lib.NetMsgType.DSCOMPLETE) {
		for(const session of Lib.deqSessions.contents){
			session.ProcessMessage(peer, connman, mempool, msg_type, vRecv);
		}
	}
}

//orig: bilingual_str CCoinJoinClientManager::GetStatuses()
Lib.GetStatuses = function(){
    let strStatus;
    let fWaitForBlock = Lib.WaitForAnotherBlock();

    for (const session of Lib.deqSessions.contents) {
        strStatus = strStatus + session.GetStatus(fWaitForBlock) + "; ";
    }
    return strStatus;
};

//std::string CCoinJoinClientManager::GetSessionDenoms()
Lib.GetSessionDenoms = function () {
    let strSessionDenoms;

    for (const session of Lib.deqSessions.contents) {
        strSessionDenoms += Lib.CCoinJoin.DenominationToString(session.nSessionDenom);
        strSessionDenoms += "; ";
    }
    return strSessionDenoms.length === 0 ? "N/A" : strSessionDenoms;
};

//orig: bool CCoinJoinClientManager::GetMixingMasternodesInfo(std::vector<CDeterministicMNCPtr>& vecDmnsRet) const
Lib.GetMixingMasternodesInfo = function() {
	let vecDmnsRet = [];
    for (const session of Lib.deqSessions.contents) {
        //CDeterministicMNCPtr dmn;
				let dmn = session.GetMixingMasternodeInfo();
        if(dmn){
					vecDmnsRet.push(dmn);
        }
    }
    return vecDmnsRet.length > 0;
};

//orig: void CCoinJoinClientManager::CheckTimeout()
Lib.CheckTimeout = function(){
    if (!Lib.CCoinJoinClientOptions.IsEnabled() || !Lib.IsMixing()){
			return;
		}
    for (const session of Lib.deqSessions.contents) {
        if (session.CheckTimeout()) {
            strAutoDenomResult = "Session timed out.";
        }
    }
};

//orig: void CCoinJoinClientManager::UpdatedSuccessBlock()
Lib.UpdatedSuccessBlock = function(){
    Lib.nCachedLastSuccessBlock = Lib.nCachedBlockHeight;
};

//orig: bool CCoinJoinClientManager::WaitForAnotherBlock() const
Lib.WaitForAnotherBlock = function(){
    if (!Lib.m_mn_sync.IsBlockchainSynced()){
			return true;
		}

    if (Lib.CCoinJoinClientOptions.IsMultiSessionEnabled()){
			return false;
		}

    return Lib.nCachedBlockHeight - Lib.nCachedLastSuccessBlock < Lib.nMinBlocksToWait;
};


//orig: bool CCoinJoinClientManager::DoAutomaticDenominating(CTxMemPool& mempool, CConnman& connman, bool fDryRun)
Lib.DoAutomaticDenominating = function(mempool, connman, fDryRun){
    if (!Lib.CCoinJoinClientOptions.IsEnabled() || !Lib.IsMixing()) {
			return false;
		}

    if (!Lib.m_mn_sync.IsBlockchainSynced()) {
        Lib.strAutoDenomResult = "Can't mix while sync in progress.";
        return false;
    }

    if (!fDryRun && Lib.mixingWallet.IsLocked(true)) {
        Lib.strAutoDenomResult = "Wallet is locked.";
        return false;
    }

		//FIXME: we need to port the deterministicMNManager
    let nMnCountEnabled = Lib.deterministicMNManager.GetListAtChainTip().GetValidMNsCount();

    // If we've used 90% of the Masternode list then drop the oldest first ~30%
    let nThreshold_high = Lib.nMnCountEnabled * 0.9;
    let nThreshold_low = Lib.nThreshold_high * 0.7;
    Lib.LogPrint(
			`Checking vecMasternodesUsed: size: ${Lib.vecMasternodesUsed.size()}, threshold: ${nThreshold_high}`
		);

    if (Lib.vecMasternodesUsed.size() > nThreshold_high) {
        Lib.vecMasternodesUsed.erase(0, vecMasternodesUsed.size() - nThreshold_low);
        Lib.LogPrint(`vecMasternodesUsed: new size: ${Lib.vecMasternodesUsed.size()}, threshold: ${nThreshold_high}`);
    }

    let fResult = true;
    if (Lib.deqSessions.size() < Lib.CCoinJoinClientOptions.GetSessions()) {
        Lib.deqSessions.emplace_back(Lib.mixingWallet, Lib.m_mn_sync);
    }
    for (const session of Lib.deqSessions.contents) {
        if (!Lib.CheckAutomaticBackup()){
					return false;
				}

        if (Lib.WaitForAnotherBlock()) {
            Lib.strAutoDenomResult = "Last successful action was too recent.";
            Lib.LogPrint(`CCoinJoinClientManager::DoAutomaticDenominating -- ${Lib.strAutoDenomResult.original}`);
            return false;
        }

        fResult &= session.DoAutomaticDenominating(mempool, connman, fDryRun);
    }

    return fResult;
};

//orig: void CCoinJoinClientManager::AddUsedMasternode(const COutPoint& outpointMn)
Lib.AddUsedMasternode = function(outpointMn) {
    Lib.vecMasternodesUsed.push_back(outpointMn);
};
Lib.Shuffle = function(elements) {

};
Lib.excludeSet = {};
//orig: CDeterministicMNCPtr CCoinJoinClientManager::GetRandomNotUsedMasternode()
Lib.GetRandomNotUsedMasternode = function () {
	const __FUNCTION__ = 'GetRandomNotUsedMasternode';
	//TODO FIXME: get deterministicMNManager impl
    let mnList = Lib.deterministicMNManager.GetListAtChainTip();

    let nCountEnabled = mnList.GetValidMNsCount();
    let nCountNotExcluded = nCountEnabled - Lib.vecMasternodesUsed.size();

    Lib.LogPrint(`CCoinJoinClientManager::${__FUNCTION__} -- ${nCountEnabled} ` +
			`enabled masternodes, ${nCountNotExcluded} masternodes to choose from`
		);
    if (nCountNotExcluded < 1) {
        return null;
    }

    // fill a vector
    //std::vector<CDeterministicMNCPtr> vpMasternodesShuffled;
		// TODO FIXME: need to do a deep dive on this
		let vpMasternodesShuffled = [];
    mnList.ForEachMNShared(true, function (dmn) {
        vpMasternodesShuffled.push(dmn);
    });

    // shuffle pointers
    vpMasternodesShuffled = Lib.Shuffle(vpMasternodesShuffled); //TODO: need a Shuffle function

		//std::set<COutPoint> excludeSet(vecMasternodesUsed.begin(), vecMasternodesUsed.end());
		let excludeSet = new Set.create(vecMasternodesUsed);
    // loop through
    for (const dmn of vpMasternodesShuffled) {
			// count() returns the number of items that have that key in the set
        if (excludeSet.count(dmn.collateralOutpoint)) {
            continue;
        }
        Lib.LogPrint(
					`CCoinJoinClientManager::${__FUNCTION__} -- found, masternode=${dmn.collateralOutpoint.ToStringShort()}`); // TODO: FIXME: do dmn.collateralOutpoint
        return dmn;
    }

    Lib.LogPrint(`CCoinJoinClientManager::${__FUNCTION__} -- failed`);
    return nullptr;
};
//orig: void CCoinJoinClientManager::ProcessPendingDsaRequest(CConnman& connman)
Lib.ProcessPendingDsaRequest = function (connman) {
    for (const session of Lib.deqSessions.contents) {
        if (session.ProcessPendingDsaRequest(connman)) { // TODO: FIXME: must implement ProcessPendingDsaRequest
            Lib.strAutoDenomResult = "Mixing in progress...";
        }
    }
};
//orig: bool CCoinJoinClientManager::TrySubmitDenominate(const CService& mnAddr, CConnman& connman)
Lib.TrySubmitDenominate = function(mnAddr, connman) {
    for (const session of Lib.deqSessions.contents) {
        //CDeterministicMNCPtr mnMixing;
				let mnMixing = null;
        mnMixing = session.GetMixingMasternodeInfo(mnMixing);
				if(mnMixing && mnMixing.pdmnState.addr == mnAddr && session.GetState() == POOL_STATE_QUEUE) {
            session.SubmitDenominate(connman); // TODO FIXME: session needs SubmitDenominate
            return true;
        }
    }
    return false;
};

//orig: bool CCoinJoinClientManager::MarkAlreadyJoinedQueueAsTried(CCoinJoinQueue& dsq) const
Lib.MarkAlreadyJoinedQueueAsTried = function(dsq) {
    for (const session of Lib.deqSessions.contents) {
        //CDeterministicMNCPtr mnMixing;
				let mnMixing = null;
        mnMixing = session.GetMixingMasternodeInfo(mnMixing);
				if(mnMixing && mnMixing.collateralOutpoint == dsq.masternodeOutpoint) { // TODO: FIXME: need dsq.masternodeOutpoint to be coded
            dsq.fTried = true; // TODO: FIXME: need fTried on dsq
            return true;
        }
    }
    return false;
};
//orig: void CCoinJoinClientManager::UpdatedBlockTip(const CBlockIndex* pindex)
Lib.UpdatedBlockTip = function(pindex) {
    Lib.nCachedBlockHeight = pindex.nHeight; // TODO FIXME: get nHeight
    Lib.LogPrint(`CCoinJoinClientManager::UpdatedBlockTip -- nCachedBlockHeight: ${Lib.nCachedBlockHeight}`);
};
//orig: void CCoinJoinClientManager::DoMaintenance(CTxMemPool& mempool, CConnman& connman)
Lib.DoMaintenance = function(mempool, connman) {
    if (!Lib.CCoinJoinClientOptions.IsEnabled()) {
			return;
		}
    if (Lib.m_mn_sync == null) {
			return;
		}
	// TODO: FIXME: do IsBlockchainSynced()
    if (!Lib.m_mn_sync.IsBlockchainSynced() || Lib.ShutdownRequested()) {
			return;
		}

    let nTick = 0;
    let nDoAutoNextRun = nTick + COINJOIN_AUTO_TIMEOUT_MIN;

    nTick++;
    Lib.CheckTimeout();
    Lib.ProcessPendingDsaRequest(connman);
    if (nDoAutoNextRun == nTick) {
        Lib.DoAutomaticDenominating(mempool, connman);
        nDoAutoNextRun = nTick + COINJOIN_AUTO_TIMEOUT_MIN + GetRandInt(COINJOIN_AUTO_TIMEOUT_MAX - COINJOIN_AUTO_TIMEOUT_MIN);
    }
};
//orig: void CCoinJoinClientManager::GetJsonInfo(UniValue& obj) const
Lib.GetJsonInfo = function(obj) {
	let session_list = [];

    for (const session of Lib.deqSessions.contents) {
        if (session.GetState() != POOL_STATE_IDLE) {
            session_list.push(session.GetJsonInfo());
        }
    }
	return {
		running: Lib.IsMixing(),
    sessions: session_list,
	};
}
