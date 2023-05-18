"use strict";
const COIN = require("./coin-join-constants.js").COIN;
const Network = require("./network.js");

let Lib = {};
module.exports = Lib;

let config = require("./.config.json");
let masterNodeIP = config.masterNodeIP;
let masterNodePort = config.masterNodePort;
let network = config.network;
let ourIP = config.ourIP;
let startBlockHeight = config.startBlockHeight;


function makeCollateralTx() {
	/**
nDenom 16 (0.00100001)  
txCollateral CMutableTransaction(
	hash=76628593a9, 
	ver=1, 
	type=0, 
	vin.size=0, 
	vout.size=1, 
	nLockTime=419430400, 
	vExtraPayload.size=0)
  CTxOut(
		nValue=-49857400784.-30016560, 
		scriptPubKey=)
*/

  const outTx = Network.util.hexToBytes(
    "d02bc072d017cfba3a2ddd539b29d8df85f1e680682d4321f6b1e11946b30dca"
  );
  const vout = 1;
	const scriptPubKey = Network.util.hexToBytes('76a9145e648edc6e2321237443a7564074da5d59de9f2588ac');
  /**
   * see https://dashcore.readme.io/docs/core-ref-transactions-raw-transaction-format
   */
	const SIZES = {
		VERSION: 2,
		TYPE: 2,
		TXIN_COUNT: 1,
		TXIN: 0,
		TXOUT_COUNT: 1,
		TXOUT: 8,
		INDEX: 4,
		LOCK_TIME: 4,
		SCRIPT_SIZE: 1,
		SCRIPT: scriptPubKey.length,
	};

	let TOTAL_SIZE = 0;
	for(const key in SIZES){
		TOTAL_SIZE += SIZES[key];
	}

  let tx = new Uint8Array(TOTAL_SIZE);
	let offset = 0;
  /**
   * Version
	 * (2 bytes)
	 * value: 2
   */
  tx.set([0x02, 0x00], offset);
	offset += SIZES.VERSION;

	/**
	 * Type
	 * (2 bytes)
	 * value: 0
	 * 	- for DIP2 special transactions, this would be non-zero
	 */
	tx.set([0x00, 0x00], offset);

	offset += SIZES.TYPE;

  /**
   * How many _IN_ transactions
   * (1 byte)
   */
  tx.set([0x0], offset);

	offset += SIZES.TXIN_COUNT;
	offset += SIZES.TXIN;

  /**
   * How many _OUT_ transactions
   * (1 byte)
   */
  tx.set([0x01], offset);

	offset += SIZES.TXOUT_COUNT;
  /**
   * The actual TxOUT:
   * (32 bytes)
   */
  tx.set(outTx, offset);

	offset += SIZES.TXOUT;
  /**
   * The index
   * (32 bytes)
   */
  tx = Network.util.setUint32(tx, [vout, 0, 0, 0], offset);

	offset += SIZES.INDEX;
  /**
   * Bytes in signature script
   * (4 bytes)
   */
	// TODO: handle sizes greater than 255 and 65535
  tx.set([scriptPubKey.length, 0, 0, 0], offset);

	offset += SIZES.SCRIPT_SIZE;
	/**
	 * Set the script pub key (unlock script)
	 */
	tx.set(scriptPubKey,offset);

	offset += SIZES.SCRIPT;
	/**
	 * Set the locktime
	 * (4 bytes)
	 */
  tx = Network.util.setUint32(tx, Date.now() + (60 * 60 * 4), offset);

  return tx;
}
function stateChanged(obj) {
  let masterNode = obj.self;
  switch (masterNode.status) {
    default:
      console.info("unhandled status:", masterNode.status);
      break;
    case "CLOSED":
      console.warn("[-] Connection closed");
      break;
    case "NEEDS_AUTH":
    case "EXPECT_VERACK":
    case "EXPECT_HCDP":
    case "RESPOND_VERACK":
      console.info("[ ... ] Handshake in progress");
      break;
    case "READY":
      console.log("[+] Ready to start dealing with CoinJoin traffic...");
			masterNode.switchHandlerTo('coinjoin');
      setInterval(() => {
        masterNode.client.write(
          Network.packet.coinjoin.dsa({
            chosen_network: network,
            denomination: COIN / 1000 + 1,
            collateral: makeCollateralTx(),
          })
        );
      }, 1000);
      break;
    case "EXPECT_DSQ":
      console.info("[+] dsa sent");
      break;
  }
}

let MasterNodeConnection =
  require("./masternode-connection.js").MasterNodeConnection;
let masterNodeConnection = new MasterNodeConnection({
  ip: masterNodeIP,
  port: masterNodePort,
  network,
  ourIP,
  startBlockHeight,
  onStatusChange: stateChanged,
  debugFunction: console.debug,
});

masterNodeConnection.connect();
