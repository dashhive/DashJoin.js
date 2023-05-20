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
let Transaction = require('./ctransaction.js');
const NetUtil = require('./network-util.js');
const hexToBytes = NetUtil.hexToBytes;


function makeCollateralTx() {
  const inTx = hexToBytes(
		'9f6c92b088961b2dce8935dbfda3901bbec9a2c5703e12d54bc5f39e00f3563f'
  );
  const vout = 0;
	const script= hexToBytes('76a9145e648edc6e2321237443a7564074da5d59de9f2588ac');

	let txn = new Transaction();
	txn.addVin({
		hash: inTx,
		index: vout,
		signatureScript: script,
		sequence: DEFAULT_TXIN_SEQUENCE,
	});
  return tx.serialize();
}

function makeCollateralTx(){
	let txn = new Transaction();
	txn.addVin({
		hash: hexToBytes('9f6c92b088961b2dce8935dbfda3901bbec9a2c5703e12d54bc5f39e00f3563f'),
		index: 0,
	});
	return txn.serialize();
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
