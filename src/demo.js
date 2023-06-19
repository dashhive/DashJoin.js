#!/usr/bin/env node
"use strict";
const COIN = require("./coin-join-constants.js").COIN;
const Network = require("./network.js");
const NetworkUtil = require("./network-util.js");
const hexToBytes = NetworkUtil.hexToBytes;
const assert = require("assert");
const extractOption = require('./argv.js').extractOption;
const { extractUserDetails } = require('./bootstrap/user-details.js');

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
let dboot = null;

/**
 * Periodically print id information
 */
if (process.argv.includes("--id")) {
  setInterval(function () {
    console.info(id);
  }, 10000);
}

/**
 * argv should include:
 * - instance name
 * - user
 */
(async function (instanceName, username) {
  /**
   * Start 4 clients simultaneously
   */
  const dashboot = require("./bootstrap/index.js");
  console.info(`[status]: loading "${instanceName}" instance...`);
  dboot = await dashboot.load_instance(instanceName);

  let choices = [];
  let mainuser = await extractUserDetails(username);
  let randomPayeeName = await dboot.get_random_payee(username);
  let payee = await extractUserDetails(randomPayeeName);

  /**
   * Pass choices[N] to a different process.
   */

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
          self.denominationsAmount = parseInt(COIN / 1000, 10) + 1;
          setTimeout(async function () {
            masterNode.client.write(
              Network.packet.coinjoin.dsa({
                chosen_network: network,
                denomination: self.denominationsAmount,
                collateral: await self.makeCollateralTx(),
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
  //dd('exit');
  //FIXME let collateralTxn = await DemoData.makeDSICollateralTx();
  let collateralTxn = {};
  let userOutputs = [1000, 1000]; // FIXME

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
    coinJoinData: mainuser,
    payee: payee,
    changeAddresses: mainuser.changeAddresses,
  });

  masterNodeConnection.connect();
})(extractOption("instance", true), extractOption("username", true));

function d(f) {
  console.debug(f);
}
function dd(f) {
  console.debug(f);
  process.exit();
}
