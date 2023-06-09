// primary actions
const SER_NETWORK = 1 << 0;
const SER_DISK = 1 << 1;
const SER_GETHASH = 1 << 2;
const PROTOCOL_VERSION = 70227; // from version.h
//! initial proto version, to be increased after version/verack negotiation
const /* int */ INIT_PROTO_VERSION = 209;

//! disconnect from peers older than this proto version
const /* int */ MIN_PEER_PROTO_VERSION = 70215;

//! minimum proto version of masternode to accept in DKGs
const /* int */ MIN_MASTERNODE_PROTO_VERSION = 70227;

//! nTime field added to CAddress, starting with this version;
//! if possible, avoid requesting addresses nodes older than this
const /* int */ CADDR_TIME_VERSION = 31402;

//! protocol version is included in MNAUTH starting with this version
const /* int */ MNAUTH_NODE_VER_VERSION = 70218;

//! /* int */roduction of QGETDATA/QDATA messages
const /* int */ LLMQ_DATA_MESSAGES_VERSION = 70219;

//! /* int */roduction of instant send deterministic lock (ISDLOCK)
const /* int */ ISDLOCK_PROTO_VERSION = 70220;

//! GOVSCRIPT was activated in this version
const /* int */ GOVSCRIPT_PROTO_VERSION = 70221;

//! ADDRV2 was /* int */roduced in this version
const /* int */ ADDRV2_PROTO_VERSION = 70223;

//! CCoinJoinStatusUpdate bug fix was /* int */roduced in this version
const /* int */ COINJOIN_SU_PROTO_VERSION = 70224;

//! BLS scheme was /* int */roduced in this version
const /* int */ BLS_SCHEME_PROTO_VERSION = 70225;

//! DSQ and DSTX started using protx hash in this version
const /* int */ COINJOIN_PROTX_HASH_PROTO_VERSION = 70226;

//! Masternode type was /* int */roduced in this version
const /* int */ DMN_TYPE_PROTO_VERSION = 70227;

module.exports = {
  SER_NETWORK,
  SER_DISK,
  SER_GETHASH,
  INIT_PROTO_VERSION,
  MIN_PEER_PROTO_VERSION,
  MIN_MASTERNODE_PROTO_VERSION,
  CADDR_TIME_VERSION,
  MNAUTH_NODE_VER_VERSION,
  LLMQ_DATA_MESSAGES_VERSION,
  ISDLOCK_PROTO_VERSION,
  GOVSCRIPT_PROTO_VERSION,
  ADDRV2_PROTO_VERSION,
  COINJOIN_SU_PROTO_VERSION,
  BLS_SCHEME_PROTO_VERSION,
  COINJOIN_PROTX_HASH_PROTO_VERSION,
  DMN_TYPE_PROTO_VERSION,
};
