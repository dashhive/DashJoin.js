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
let dboot = null;

/**
 * Periodically print id information
 */
if (process.argv.includes("--id")) {
  setInterval(function () {
    console.info(id);
  }, 10000);
}
(async function () {
  /**
   * Start 4 clients simultaneously
   */
  const dashboot = require('./bootstrap/index.js');
  let instanceName = 'base';
  for(const argv of process.argv){
    let match = argv.match(/^\-\-instance=(.*)$/);
    if(match){
      instanceName = match[1];
    }
  }
  console.info(`[status]: loading "${instanceName}" instance...`);
  dboot = await dashboot.load_instance(instanceName);

  let users = await dboot.user_list();
  d({users});
  let choices = [];
  for(const user of users){
    let addresses = await dboot.user_addresses(user);
    if(addresses.length === 0){
      continue;
    }
    let utxos = await dboot.user_utxos_from_cli(user,addresses).catch(function(error){
      console.error({error});
      return null;
    });
    if(!utxos || utxos.length === 0){
      continue;
    }
    let addrMap = {};
    for(let k=0; k < Object.keys(utxos).length; k++){
      for(let x=0; x < utxos[k].length; x++){
        let u = utxos[k][x];
        addrMap[u.address] = 1;
      }
    }
    for(const addr in addrMap){
      let buffer = await dboot.wallet_exec(user, ["dumpprivkey",addr]);
      let {out,err} = dboot.ps_extract(buffer,false);
      if(err.length){
        console.error(err);
      }
      if(out.length){
        addrMap[addr] = out;
      }
    }
    let flatUtxos = [];
    for(let k=0; k < Object.keys(utxos).length;k++){
      for(let x=0; x < utxos[k].length; x++){
        let txid = utxos[k][x].txid;
        utxos[k][x].privateKey = addrMap[utxos[k][x].address];
        flatUtxos.push(utxos[k][x]);
      }
    }

    choices.push({
      user,
      utxos: flatUtxos,
      changeAddress: await dboot.get_change_address_from_cli(user),
    });
    if(choices.length > 5){
      break;
    }
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
  //console.debug(collateralTxn.uncheckedSerialize());
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
    coinJoinData: choices[0],
    payee: choices[1],
    changeAddresses: choices[0].changeAddresses,
  });

  masterNodeConnection.connect();
})();
function d(f) {
  console.debug(f);
}
function dd(f) {
  console.debug(f);
  process.exit();
}

