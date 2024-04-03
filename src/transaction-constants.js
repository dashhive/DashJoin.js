const CURRENT_VERSION = 3;
const MAX_STANDARD_VERSION = 3;
const TRANSACTION_NORMAL = 0;
const OUTPOINT_SIZE = 36;
const SEQUENCE_SIZE = 4;
const HASH_TXID_SIZE = 32;
const INDEX_SIZE = 4;
const LOCK_TIME_SIZE = 4;
const TXIN_HASH_SIZE = 32;
const TXIN_INDEX_SIZE = 4;
const DEFAULT_TXIN_SEQUENCE = 0xffffffff;

// About : CTxIn
//=================
//    /* Setting nSequence to this value for every input in a transaction
//     * disables nLockTime. */
//    static const uint32_t SEQUENCE_FINAL = 0xffffffff;
//
//    /* Below flags apply in the context of BIP 68*/
//    /* If this flag set, CTxIn::nSequence is NOT interpreted as a
//     * relative lock-time. */
//    static const uint32_t SEQUENCE_LOCKTIME_DISABLE_FLAG = (1U << 31);
//
//    /* If CTxIn::nSequence encodes a relative lock-time and this flag
//     * is set, the relative lock-time has units of 512 seconds,
//     * otherwise it specifies blocks with a granularity of 1. */
//    static const uint32_t SEQUENCE_LOCKTIME_TYPE_FLAG = (1 << 22);
//
//    /* If CTxIn::nSequence encodes a relative lock-time, this mask is
//     * applied to extract that lock-time from the sequence field. */
//    static const uint32_t SEQUENCE_LOCKTIME_MASK = 0x0000ffff;
//
//    /* In order to use the same number of bits to encode roughly the
//     * same wall-clock duration, and because blocks are naturally
//     * limited to occur every 600s on average, the minimum granularity
//     * for time-based relative lock-time is fixed at 512 seconds.
//     * Converting from CTxIn::nSequence to seconds is performed by
//     * multiplying by 512 = 2^9, or equivalently shifting up by
//     * 9 bits. */
//    static const int SEQUENCE_LOCKTIME_GRANULARITY = 9;

module.exports = {
	CURRENT_VERSION,
	MAX_STANDARD_VERSION,
	TRANSACTION_NORMAL,
	OUTPOINT_SIZE,
	SEQUENCE_SIZE,
	HASH_TXID_SIZE,
	INDEX_SIZE,
	LOCK_TIME_SIZE,
	TXIN_HASH_SIZE,
	TXIN_INDEX_SIZE,
	DEFAULT_TXIN_SEQUENCE,
};
