/**
 * A port of DASH core's CCoinJoinClientManager
 */

const HardDrive = require('hd.js');// TODO: .GetDataDir())) {

let Lib = {'core_name': 'CCoinJoinClientManager'};
module.exports = Lib;
// std::map<const std::string, std::shared_ptr<CCoinJoinClientManager>> coinJoinClientManagers;
Lib.NetMsgType = require('net-msg.js').NetMsgType;

//std::vector<COutPoint> vecMasternodesUsed;
Lib.vecMasternodesUsed = [];
Lib.CCoinJoinClientManager = {};
// Keep track of the used Masternodes
//orig: const std::unique_ptr<CMasternodeSync>& m_mn_sync;
Lib.m_mn_sync = {};

Lib.CCoinJoinClientOptions = require('./options.js');

//orig: std::deque<CCoinJoinClientSession> deqSessions GUARDED_BY(cs_deqsessions);
Lib.deqSessions = {};
//    std::atomic<bool> fMixing{false};
Lib.isMixing = false;
Lib.IsMixing = function(){
	return Lib.isMixing;
};
// orig: int nCachedLastSuccessBlock{0};
Lib.nCachedLastSuccessBlock = 0;
// how many blocks to wait for after one successful mixing tx in non-multisession mode
//orig: int nMinBlocksToWait{1}; // how many blocks to wait for after one successful mixing tx in non-multisession mode
Lib.nMinBlocksToWait = 1;
// orig: bilingual_str strAutoDenomResult;
Lib.strAutoDenomResult = '';
//orig: CWallet& mixingWallet;
Lib.walletImpl = require('wallet.js');
Lib.mixingWallet = Lib.walletImpl.loadFromJSON(require('./data/wallet.json'));

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
	if(!Lib.m_mn_sync->IsBlockchainSynced()) {
		return;
	}

	if(!HardDrive.CheckDiskSpace(HardDrive.GetDataDir())) {
		ResetPool();
		StopMixing();
		LogPrint(BCLog::COINJOIN, "CCoinJoinClientManager::ProcessMessage -- Not enough disk space, disabling CoinJoin.\n");
		return;
	}

	if(msg_type == NetMsgType::DSSTATUSUPDATE ||
	    msg_type == NetMsgType::DSFINALTX ||
	    msg_type == NetMsgType::DSCOMPLETE) {
		AssertLockNotHeld(cs_deqsessions);
		LOCK(cs_deqsessions);
		for(auto& session : deqSessions) {
			session.ProcessMessage(peer, connman, mempool, msg_type, vRecv);
		}
	}
}


};
//bool StartMixing();
//void StopMixing();
//bool IsMixing() const;
//void ResetPool() LOCKS_EXCLUDED(cs_deqsessions);

//bilingual_str GetStatuses() LOCKS_EXCLUDED(cs_deqsessions);
//std::string GetSessionDenoms() LOCKS_EXCLUDED(cs_deqsessions);

//bool GetMixingMasternodesInfo(std::vector<CDeterministicMNCPtr>& vecDmnsRet) const LOCKS_EXCLUDED(cs_deqsessions);

/// Passively run mixing in the background according to the configuration in settings
//bool DoAutomaticDenominating(CTxMemPool& mempool, CConnman& connman, bool fDryRun = false) LOCKS_EXCLUDED(cs_deqsessions);

//bool TrySubmitDenominate(const CService& mnAddr, CConnman& connman) LOCKS_EXCLUDED(cs_deqsessions);
//bool MarkAlreadyJoinedQueueAsTried(CCoinJoinQueue& dsq) const LOCKS_EXCLUDED(cs_deqsessions);

//void CheckTimeout() LOCKS_EXCLUDED(cs_deqsessions);

//void ProcessPendingDsaRequest(CConnman& connman) LOCKS_EXCLUDED(cs_deqsessions);

//void AddUsedMasternode(const COutPoint& outpointMn);
//CDeterministicMNCPtr GetRandomNotUsedMasternode();

//void UpdatedSuccessBlock();

//void UpdatedBlockTip(const CBlockIndex* pindex);

//void DoMaintenance(CTxMemPool& mempool, CConnman& connman);

//void GetJsonInfo(UniValue& obj) const LOCKS_EXCLUDED(cs_deqsessions);
