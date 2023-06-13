#!/usr/bin/env node
"use strict";
const COIN = require("./coin-join-constants.js").COIN;
const Network = require("./network.js");
const NetworkUtil = require("./network-util.js");
const hexToBytes = NetworkUtil.hexToBytes;
const assert = require("assert");

let id = {};

let config = require("./.mn0-config.json");
id.mn = 0;
if (process.argv.includes("--mn0")) {
  config = require("./.mn0-config.json");
  id.mn = 0;
}
if (process.argv.includes("--mn1")) {
  config = require("./.mn1-config.json");
  id.mn = 1;
}
if (process.argv.includes("--mn2")) {
  config = require("./.mn2-config.json");
  id.mn = 2;
}

let masterNodeIP = config.masterNodeIP;
let masterNodePort = config.masterNodePort;
let network = config.network;
let ourIP = config.ourIP;
let startBlockHeight = config.startBlockHeight;

let DashCore = require("@dashevo/dashcore-lib");

let DemoData = require("./demodata.js");

/**
 * -rpcwallet=psend
 */
if (process.argv.includes("--psend")) {
  DemoData.initialize("dp");
  id.data_set = "dp";
}
/**
 * -rpcwallet=foobar
 */
if (process.argv.includes("--foobar")) {
  DemoData.initialize("df");
  id.data_set = "df";
}
/**
 * -rpcwallet=luke
 */
if (process.argv.includes("--luke")) {
  DemoData.initialize("dl");
  id.data_set = "dl";
}
/**
 * -rpcwallet=han
 */
if (process.argv.includes("--han")) {
  DemoData.initialize("dh");
  id.data_set = "dh";
}
/**
 * -rpcwallet=chewie
 */
if (process.argv.includes("--chewie")) {
  DemoData.initialize("dche");
  id.data_set = "dche";
}

/**
 * Periodically print id information
 */
if (process.argv.includes("--id")) {
  setInterval(function () {
    console.info(id);
  }, 10000);
}
(async function () {
  if (process.argv.includes("--eat-txn")) {
    let txn = await DemoData.getUnusedTransaction();
    await DemoData.logUsedTransaction(txn.txid);
    let txn2 = await DemoData.getUnusedTransaction();
    assert.equal(
      txn.txid === txn2.txid,
      false,
      "duplicate transaction found after --eat-txn!"
    );
    process.exit();
  }
  let dsaSent = false;

  function stateChanged(obj) {
    let self = obj.self;
    let masterNode = self;
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
        if (dsaSent === false) {
          self.denominationsAmount = parseInt(COIN / 1000,10) + 1;
          setTimeout(async function () {
            masterNode.client.write(
              Network.packet.coinjoin.dsa({
                chosen_network: network,
                denomination: self.denominationsAmount,
                collateral: await DemoData.makeCollateralTx(),
              })
            );
            dsaSent = true;
            console.debug("sent dsa");
          }, 2000);
        }
        break;
      case "DSQ_RECEIVED":
        console.log("[+][COINJOIN] DSQ received. Responding with inputs...");
        console.debug(self.dsq, "<< dsq");
        if (self.dsq.fReady) {
          console.log("[+][COINJOIN] Ready to send dsi message...");
        } else {
          console.info("[-][COINJOIN] masternode not ready for dsi...");
          return;
        }
        setTimeout(async function () {
          let data = await DemoData.util.fetchData();
          let sourceAddress = data.sourceAddress;
          let userInputs = await DemoData.getMultipleUnusedTransactionsFilter(
            2,
            ["txid", "vout", "amount"]
          );
          let collateralTxn = await DemoData.makeDSICollateralTx();
          collateralTxn = hexToBytes(collateralTxn.uncheckedSerialize());
          let userOutputs = [self.denominationsAmount];
          masterNode.client.write(
            Network.packet.coinjoin.dsi({
              chosen_network: network,
              userInputs,
              collateralTxn,
              userOutputs,
              sourceAddress,
            })
          );
          console.debug("sent dsi packet");
        }, 2000);
        break;
      case "EXPECT_DSQ":
        console.info("[+] dsa sent");
        break;
    }
  }
  let data = await DemoData.util.fetchData();
  let sourceAddress = data.sourceAddress;
  let userInputs = await DemoData.getMultipleUnusedTransactionsFilter(2, [
    "txid",
    "vout",
    "amount",
  ]);
  let collateralTxn = await DemoData.makeDSICollateralTx();
  console.debug(collateralTxn.uncheckedSerialize());
  let userOutputs = [1000, 1000]; // FIXME
  //console.debug(
  //  Network.packet.coinjoin.dsi({
  //    chosen_network: network,
  //    userInputs,
  //    collateralTxn,
  //    userOutputs,
  //    sourceAddress,
  //  })
  //);
  //console.debug("sent dsi packet");
  //process.exit();

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
})();
