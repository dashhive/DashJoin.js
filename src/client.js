/**
 * A port of DASH core's CoinJoin client
 */


let Lib = {};
module.exports = Lib;
// std::map<const std::string, std::shared_ptr<CCoinJoinClientManager>> coinJoinClientManagers;
Lib.NetMsgType = require('net-msg.js').NetMsgType;

//Orig: std::deque<CCoinJoinClientSession> deqSessions GUARDED_BY(cs_deqsessions);
Lib.deqSessions = {};
Lib.coinJoinQueue = {};
Lib.coinJoinQueue.write = function(msg) {

};
Lib.coinJoinQueue.dsq = function() {
	return 'dsq'; // FIXME: return actual dsq message
};

Lib.vRecv = {};

Lib.CCoinJoinClientManager = {};
/** 
 * Used to keep track of current status of mixing pool
 */
//class CCoinJoinClientManager
    // Keep track of the used Masternodes
    //std::vector<COutPoint> vecMasternodesUsed;

Lib.vecMasternodesUsed = [];
//orig: const std::unique_ptr<CMasternodeSync>& m_mn_sync;
Lib.m_mn_sync = {};

//orig: std::deque<CCoinJoinClientSession> deqSessions GUARDED_BY(cs_deqsessions);
Lib.deqSessions = {};
//    std::atomic<bool> fMixing{false};
Lib.isMixing = false;

Lib.CCoinJoinClientOptions = {};
Lib.CCoinJoinClientOptions.IsMultiSessionEnabled = function() {

};
/** orig:
    int nCachedLastSuccessBlock{0};
    int nMinBlocksToWait{1}; // how many blocks to wait for after one successful mixing tx in non-multisession mode
    bilingual_str strAutoDenomResult;
		*/

Lib.nCachedLastSuccessBlock = 0;
// how many blocks to wait for after one successful mixing tx in non-multisession mode
Lib.nMinBlocksToWait = 1;
Lib.strAutoDenomResult = '';
//orig: CWallet& mixingWallet;
Lib.walletImpl = require('wallet.js');
Lib.mixingWallet = Lib.walletImpl.loadFromJSON(require('./data/wallet.json'));

// Keep track of current block height
//orig: int nCachedBlockHeight{0};
Lib.nCachedBlockHeight = 0;

bool WaitForAnotherBlock() const;
Lib.WaitForAnotherBlock = function () {
	if(!Lib.m_mn_sync.IsBlockchainSynced()) {
		return true;
	}

	if(Lib.CCoinJoinClientOptions.IsMultiSessionEnabled()) {
		return false;
	}

	return nCachedBlockHeight - nCachedLastSuccessBlock < nMinBlocksToWait;

    // Make sure we have enough keys since last backup
    bool CheckAutomaticBackup();

public:
    int nCachedNumBlocks{std::numeric_limits<int>::max()};    // used for the overview screen
    bool fCreateAutoBackups{true}; // builtin support for automatic backups

    CCoinJoinClientManager() = delete;
    CCoinJoinClientManager(CCoinJoinClientManager const&) = delete;
    CCoinJoinClientManager& operator=(CCoinJoinClientManager const&) = delete;

    explicit CCoinJoinClientManager(CWallet& wallet, const std::unique_ptr<CMasternodeSync>& mn_sync) :
        m_mn_sync(mn_sync), mixingWallet(wallet) {}

    void ProcessMessage(CNode& peer, CConnman& connman, const CTxMemPool& mempool, std::string_view msg_type, CDataStream& vRecv) LOCKS_EXCLUDED(cs_deqsessions);

    bool StartMixing();
    void StopMixing();
    bool IsMixing() const;
    void ResetPool() LOCKS_EXCLUDED(cs_deqsessions);

    bilingual_str GetStatuses() LOCKS_EXCLUDED(cs_deqsessions);
    std::string GetSessionDenoms() LOCKS_EXCLUDED(cs_deqsessions);

    bool GetMixingMasternodesInfo(std::vector<CDeterministicMNCPtr>& vecDmnsRet) const LOCKS_EXCLUDED(cs_deqsessions);

    /// Passively run mixing in the background according to the configuration in settings
    bool DoAutomaticDenominating(CTxMemPool& mempool, CConnman& connman, bool fDryRun = false) LOCKS_EXCLUDED(cs_deqsessions);

    bool TrySubmitDenominate(const CService& mnAddr, CConnman& connman) LOCKS_EXCLUDED(cs_deqsessions);
    bool MarkAlreadyJoinedQueueAsTried(CCoinJoinQueue& dsq) const LOCKS_EXCLUDED(cs_deqsessions);

    void CheckTimeout() LOCKS_EXCLUDED(cs_deqsessions);

    void ProcessPendingDsaRequest(CConnman& connman) LOCKS_EXCLUDED(cs_deqsessions);

    void AddUsedMasternode(const COutPoint& outpointMn);
    CDeterministicMNCPtr GetRandomNotUsedMasternode();

    void UpdatedSuccessBlock();

    void UpdatedBlockTip(const CBlockIndex* pindex);

    void DoMaintenance(CTxMemPool& mempool, CConnman& connman);

    void GetJsonInfo(UniValue& obj) const LOCKS_EXCLUDED(cs_deqsessions);
};
