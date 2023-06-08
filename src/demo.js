#!/usr/bin/env node
"use strict";
const COIN = require("./coin-join-constants.js").COIN;
const Network = require("./network.js");

function exit() {
  process.exit(0);
}
let Lib = {};
module.exports = Lib;

let config = require("./.config.json");
let masterNodeIP = config.masterNodeIP;
let masterNodePort = config.masterNodePort;
let network = config.network;
let ourIP = config.ourIP;
let startBlockHeight = config.startBlockHeight;
const TxnConstants = require("./transaction-constants.js");
const NetUtil = require("./network-util.js");
const hexToBytes = NetUtil.hexToBytes;

let DashCore = require("@dashevo/dashcore-lib");
let Transaction = DashCore.Transaction;
let Script = DashCore.Script;
let PrivateKey = DashCore.PrivateKey;
let Address = DashCore.Address;
const LOW_COLLATERAL = (COIN / 1000 + 1) / 10;
const HI_COLLATERAL = LOW_COLLATERAL * 4;
const fs = require("fs");

const NETWORK = "regtest";
let DemoData = require("./demodata.js");

(async function () {
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
        masterNode.switchHandlerTo("coinjoin");
        if (dsaSent === false) {
          setTimeout(async () => {
            masterNode.client.write(
              Network.packet.coinjoin.dsa({
                chosen_network: network,
                denomination: COIN / 1000 + 1,
                collateral: await DemoData.makeCollateralTx(),
              })
            );
            dsaSent = true;
          }, 2000);
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
})();
