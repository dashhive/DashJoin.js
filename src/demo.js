#!/usr/bin/env node
"use strict";
const COIN = require("./coin-join-constants.js").COIN;
const Network = require("./network.js");

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

if (process.argv.includes("--psend")) {
  DemoData.initialize("dp");
  id.data_set = "dp";
}
if (process.argv.includes("--foobar")) {
  DemoData.initialize("df");
  id.data_set = "df";
}
if (process.argv.includes("--luke")) {
  DemoData.initialize("dl");
  id.data_set = "dl";
}
if (process.argv.includes("--han")) {
  DemoData.initialize("dh");
  id.data_set = "dh";
}
if (process.argv.includes("--chewie")) {
  DemoData.initialize("dche");
  id.data_set = "dche";
}

if (process.argv.includes("--id")) {
  setInterval(() => {
    console.info(id);
  }, 10000);
}
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
        //masterNode.switchHandlerTo("coinjoin");
        if(process.argv.includes('--repeat-dsa')){
          setInterval(async () => {
            masterNode.client.write(
              Network.packet.coinjoin.dsa({
                chosen_network: network,
                denomination: COIN / 1000 + 1,
                collateral: await DemoData.makeCollateralTx(),
              })
            );
            dsaSent = true;
            console.debug("sent dsa");
          }, 5000);
        }else if (dsaSent === false) {
          setTimeout(async () => {
            masterNode.client.write(
              Network.packet.coinjoin.dsa({
                chosen_network: network,
                denomination: COIN / 1000 + 1,
                collateral: await DemoData.makeCollateralTx(),
              })
            );
            dsaSent = true;
            console.debug("sent dsa");
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
