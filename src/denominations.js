let Lib = {};
const ONLY_READY_TO_MIX = '';
const { MAX_MONEY } = require('./coin.js');
const CoinType = require('./cointype-constants.js');

const CCoinJoin = require('./coin-join.js');
const { SEQUENCE_FINAL } = require('./ctxin-constants.js');
const Vector = require('./vector.js');
const COutPoint = require('./coutpoint.js');
const COutput = require('./coutput.js');
const CCoinControl = require('./coincontrol.js');
const CCoinJoinDenominations = require('./coin-join-denominations.js');
const LOCKTIME_THRESHOLD = 500000000;
const LOCKTIME_MEDIAN_TIME_PAST = 1 << 1;
const { COIN } = require('./coin.js');
const { SER_GETHASH, PROTOCOL_VERSION } = require('./protocol-constants.js');
Lib.constants = CoinType;
module.exports = Lib;

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
 *
 * Requirements:
 * wallet - needs to have a function defined on it called GetSpendableTXs(options).
 * Where 'options' is an object: 
 * {
		onlySafe: boolean,
		minDepth: int,
		maxDepth: int,
		isMatureCoinBase: boolean,
		coinType: any value from 'cointype-constants.js' i.e.: ALL_COINS,
		minAmount: int,
		maxAmount: int,
		allowUsed: boolean,
	}
 *
 */
Lib.SelectDenominatedAmounts = function (nValueMax, wallet) {
	let setAmountsRet = {};
	let nValueTotal = 0;
	let coinControl = new CCoinControl({
		wallet,
	});
	let { vCoins } = Lib.AvailableCoins({
		wallet,
		fOnlySafe: true,
		coinControl,
	});
	// larger denoms first
	vCoins = Lib.sortByLargestDenoms(vCoins);

	for (const out of vCoins.contents) {
		let nValue = out.tx.tx.vout[out.i].nValue;
		if (nValueTotal + nValue <= nValueMax) {
			nValueTotal += nValue;
			setAmountsRet[nValue] = 1;
		}
	}

	return {
		valid: nValueTotal >= CCoinJoinDenominations.GetSmallestDenomination(),
		setAmountsRet,
	};
};

Lib.CalculateAmountPriority = function (nInputAmount) {
	for (const denom of CCoinJoinDenominations.GetStandardDenominations()) {
		if (nInputAmount === denom) {
			return (COIN / denom) * 10000;
		}
	}
	if (nInputAmount < COIN) {
		return 20000;
	}

	//nondenom return largest first
	return -1 * (nInputAmount / COIN);
};
Lib.sortByLargestDenoms = function (vCoins) {
	//(const COutput& t1, const COutput& t2) const {
	vCoins.contents.sort(function (a, b) {
		let aval = Lib.CalculateAmountPriority(
			a.GetInputCoin().effective_value,
		);
		let bval = Lib.CalculateAmountPriority(
			b.GetInputCoin().effective_value,
		);
		if (aval < bval) {
			return -1;
		}
		if (aval > bval) {
			return 1;
		}
		return 0;
	});
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
	const /*int*/ nBlockHeight = Lib.ChainActive().Height() + 1; // TODO: ChainActive().Height()

	// BIP113 requires that time-locked transactions have nLockTime set to
	// less than the median time of the previous block they're contained in.
	// When the next block is created its previous block will be the current
	// chain tip, so we use that to calculate the median time passed to
	// IsFinalTx() if LOCKTIME_MEDIAN_TIME_PAST is set.
	const /*int64_t*/ nBlockTime =
			flags & LOCKTIME_MEDIAN_TIME_PAST
				? Lib.ChainActive().Tip().GetMedianTimePast() // TODO: ChainActive().Tip().GetMedianTimePast()
				: Lib.GetAdjustedTime(); // TODO: GetAdjustedTime()

	return Lib.IsFinalTx(tx, nBlockHeight, nBlockTime); // TODO: IsFinalTx
};

Lib.GetBlocksToMaturity = function (coin) {
	// TODO:
	//if(!Lib.IsCoinBase(coin)) {
	//	return false;
	//}
	//let chain_depth = Lib.GetDepthInMainChain();
	//return Lib.max(0, (COINBASE_MATURITY+1) - chain_depth);
};
Lib.IsImmatureCoinBase = function (coin) {
	// note GetBlocksToMaturity is 0 for non-coinbase tx
	//TODO: return Lib.GetBlocksToMaturity(coin) > 0;
	return false; // FIXME
};
Lib.GetDepthInMainChain = function (coin) {};
/** Pulled from wallet DB ("ps_salt") and used when mixing a random number of rounds.
 *  This salt is needed to prevent an attacker from learning how many extra times
 *  the input was mixed based only on information in the blockchain.
 */
//uint256 nCoinJoinSalt;
Lib.getCoinJoinSalt = function (wallet) {
	/** TODO: */
};
//orig: bool CWallet::IsFullyMixed(const COutPoint& outpoint) const {
Lib.IsFullyMixed = function (wallet, outpoint) {
	let nRounds = GetRealOutpointCoinJoinRounds(outpoint);
	// Mix again if we don't have N rounds yet
	if (nRounds < wallet.CCoinJoinClientOptions().GetRounds()) {
		// TODO: make sure this wallet function is documented correctly
		return false;
	}

	// Try to mix a "random" number of rounds more than minimum.
	// If we have already mixed N + MaxOffset rounds, don't mix again.
	// Otherwise, we should mix again 50% of the time, this results in an exponential decay
	// N rounds 50% N+1 25% N+2 12.5%... until we reach N + GetRandomRounds() rounds where we stop.
	if (
		nRounds <
		wallet.CCoinJoinClientOptions().GetRounds() +
			wallet.CCoinJoinClientOptions().GetRandomRounds()
	) {
		// TODO: make sure these wallet functions are documented correctly
		//CDataStream ss(SER_GETHASH, PROTOCOL_VERSION);
		//ss << outpoint << nCoinJoinSalt;
		//uint256 nHash;
		let ss = new CDataStream(SER_GETHASH, PROTOCOL_VERSION);
		// This is how the '<<' operator is defined in streams.h
		// for the CDataStream type. It's a write operation. It
		// will take the parameters and write them to the stream's
		// internal vch vector.
		//template<typename T>
		//CDataStream& operator<<(const T& obj)
		//{
		//    // Serialize to this stream
		//    ::Serialize(*this, obj);
		//    return (*this);
		//}
		ss.write(outpoint);
		ss.write(Lib.getCoinJoinSalt(wallet));
		let nHash;
		// TODO: need CSHA256()
		// TODO: need CSHA256().Write(stream)
		// TODO: need CSHA256().Write(stream).Finalize(hash)
		CSHA256().Write(ss).Finalize(nHash);
		if (ReadLE64(nHash) % 2 == 0) {
			// TODO: need ReadLE64
			return false;
		}
	}

	return true;
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
Lib.AvailableCoins = function ({
	wallet,
	coinControl,
	fOnlySafe = true,
	nMinimumAmount = 1,
	nMaximumAmount = MAX_MONEY,
	nMinimumSumAmount = MAX_MONEY,
	nMaximumCount = 0,
	nMinDepth = 0,
	nMaxDepth = 9999999,
	allow_used_addresses = false,
}) {
	let ret = {
		vCoins: new Vector(COutput),
	};

	let nCoinType = coinControl.nCoinType;

	let nTotal = 0;
	// Either the WALLET_FLAG_AVOID_REUSE flag is not set (in which case we always allow), or we default to avoiding, and only in the case where
	// a coin control object is provided, and has the avoid address reuse flag set to false, do we allow already used addresses
	//let allow_used_addresses = !Lib.IsWalletFlagSet(WALLET_FLAG_AVOID_REUSE) || (coinControl && !coinControl.m_avoid_address_reuse);

	/**
	 * At some point, we may have to write GetSpendableTXs() and bring
	 * that logic into this library. As of right now, it's fine to
	 * leave this up to the wallet impelementation.
	 */
	for (let pcoin of wallet.GetSpendableTXs({
		onlySafe: fOnlySafe,
		minDepth: nMinDepth,
		maxDepth: nMaxDepth,
		isMatureCoinBase: true,
		coinType: nCoinType,
		minAmount: nMinimumAmount,
		maxAmount: nMaximumAmount,
		allowUsed: allow_used_addresses,
	})) {
		let wtxid = Lib.GetCoinHash(pcoin); // TODO: implement GetCoinHash(pcoin)

		let vOuts = Lib.GetVoutsFromTx(pcoin.tx); // TODO: implement GetVoutsFromTx
		for (let i = 0; i < vOuts.length; i++) {
			let found = false;
			let nValue = vOuts[i].nValue;
			if (nCoinType == CoinType.ONLY_FULLY_MIXED) {
				if (!CCoinJoinDenominations.IsDenominatedAmount(nValue)) {
					continue;
				}
				found = Lib.IsFullyMixed(
					new COutPoint({ hashIn: wtxid, nIn: i }),
				);
			} else if (nCoinType == CoinType.ONLY_READY_TO_MIX) {
				if (!CCoinJoinDenominations.IsDenominatedAmount(nValue)) {
					continue;
				}
				found = !Lib.IsFullyMixed(
					new COutPoint({ hashIn: wtxid, nIn: i }),
				);
			} else if (nCoinType == CoinType.ONLY_NONDENOMINATED) {
				if (CCoinJoinDenominations.IsCollateralAmount(nValue)) {
					continue; // do not use collateral amounts
				}
				found = !CCoinJoinDenominations.IsDenominatedAmount(nValue);
			} else if (nCoinType == CoinType.ONLY_MASTERNODE_COLLATERAL) {
				found = dmn_types.IsCollateralAmount(nValue);
			} else if (nCoinType == CoinType.ONLY_COINJOIN_COLLATERAL) {
				found = CCoinJoin.IsCollateralAmount(nValue);
			} else {
				found = true;
			}
			if (!found) {
				continue;
			}

			if (nValue < nMinimumAmount || nValue > nMaximumAmount) {
				continue;
			}

			if (
				coinControl.HasSelected() &&
				!coinControl.fAllowOtherInputs &&
				!coinControl.IsSelected(
					new COutPoint({ hashIn: wtxid, nIn: i }),
				)
			) {
				continue;
			}

			if (
				Lib.IsLockedCoin(wtxid, i) && // TODO: Implement IsLockedCoin
				nCoinType != CoinType.ONLY_MASTERNODE_COLLATERAL
			) {
				continue;
			}

			if (Lib.IsSpent(wtxid, i)) {
				// TODO: implement IsSpent
				continue;
			}

			let mine = Lib.IsMine(vOuts[i]); // TODO: implement IsMine

			if (mine == ISMINE_NO) {
				// TODO: deinf ISMINE_NO
				continue;
			}

			// TODO: complete this
			//let provider = Lib.GetSigningProvider(pcoin.tx.vout[i].scriptPubKey);
			//let solvable = provider
			//  ? Lib.IsSolvable(provider, pcoin.tx.vout[i].scriptPubKey)
			//  : false;
			//let spendable =
			//  (mine & ISMINE_SPENDABLE) != ISMINE_NO ||
			//  ((mine & ISMINE_WATCH_ONLY) != ISMINE_NO &&
			//    coinControl &&
			//    coinControl.fAllowWatchOnly &&
			//    solvable);

			//TODO: let nDepth = Lib.GetDepthInMainChain(pcoin);
			let nDepth = 0;
			ret.vCoins.push_back({
				tx: pcoin,
				i,
				nDepth,
				fSpendable: spendable,
				fSolvable: solvable,
				fSafe: safeTx,
				use_max_sig: coinControl.fAllowWatchOnly,
			});

			// Checks the sum amount of all UTXO's.
			if (nMinimumSumAmount != MAX_MONEY) {
				nTotal += vOuts[i].nValue;

				if (nTotal >= nMinimumSumAmount) {
					return ret;
				}
			}

			// Checks the maximum number of UTXO's.
			if (nMaximumCount > 0 && ret.vCoins.size() >= nMaximumCount) {
				return ret;
			}
		}
	}
	return ret;
};
