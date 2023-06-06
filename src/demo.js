#!/usr/bin/env node
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
const TxnConstants = require('./transaction-constants.js');
const NetUtil = require('./network-util.js');
const hexToBytes = NetUtil.hexToBytes;
const {
	DEFAULT_TXIN_SEQUENCE,
} = TxnConstants;
const {
	OP_RETURN,
  OP_RESERVED,
} = require('./opcodes.js');


let Demo = require('./demodata.js');
let Tx = require('dashtx');
let DemoLib = require('./tx-dashcore-lib.js');


let d = DemoLib.demo();
return;

function makeCollateralTx() {
  return hexToBytes(DemoLib.demo().serialize());

  //let tx = Tx.create({ sign: sign });
  //let Secp256k1 = require("@dashincubator/secp256k1");
  //async function sign({ privateKey, hash }) {
  //  let sigOpts = { canonical: true, extraEntropy: true };
  //  let sigBuf = await Secp256k1.sign(hash, privateKey, sigOpts);
  //  return Tx.utils.u8ToHex(sigBuf);
  //}

  //const inTx = Demo.getInTX(); 
  //const vout = 0;
	//const script= Demo.getTestScript();

	//let txn = new Transaction();
	//txn.addVin({
	//	hash: inTx,
	//	index: vout,
	//	signatureScript: script,
	//	sequence: DEFAULT_TXIN_SEQUENCE,
	//});
	//txn.addVout({
	//	value: 0,
	//	pkScript: [OP_RETURN],
	//});
  //txn.setVersion(Demo.getVersion());
  //return txn.serialize();
}
let dsaSent = false;

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
			if(dsaSent === false){
      setTimeout(() => {
        masterNode.client.write(
          Network.packet.coinjoin.dsa({
            chosen_network: network,
            denomination: COIN / 1000 + 1,
            collateral: makeCollateralTx(),
          })
        );
				dsaSent = true;
      }, 10000);
			}
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
	userAgent: config.userAgent ?? null,
});

masterNodeConnection.connect();