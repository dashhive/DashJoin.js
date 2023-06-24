#!/usr/bin/env node
"use strict";
const COIN = require("./coin-join-constants.js").COIN;
const Network = require("./network.js");
const NetworkUtil = require("./network-util.js");
const hexToBytes = NetworkUtil.hexToBytes;
const assert = require("assert");
const extractOption = require("./argv.js").extractOption;
const { extractUserDetails } = require("./bootstrap/user-details.js");
const dashboot = require("./bootstrap/index.js");
const MasterNodeConnection =
  require("./masternode-connection.js").MasterNodeConnection;

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
let mainUser;
let randomPayeeName;
let payee;
let username;
let instanceName;

let nickName = null;

/**
 * Periodically print id information
 */
if (process.argv.includes("--id")) {
  setInterval(function () {
    console.info(id);
  }, 10000);
}
/** FIXME: put in library */
function getDemoDenomination() {
  return parseInt(COIN / 1000 + 1, 10);
}
async function getUserInputs(username, denominatedAmount, count) {
  let utxos = await dboot.get_denominated_utxos(username, denominatedAmount);
  let selected = [];
  let txids = {};
  for (let i = 0; i < count; i++) {
    if (typeof txids[utxos[i].txid] !== "undefined") {
      continue;
    }

    txids[utxos[i].txid] = 1;
    selected.push(utxos[i]);
    await dboot.mark_txid_used(username, utxos[i].txid);
  }
  return selected;
}
async function getUserOutputs(username, denominatedAmount, count) {
  let utxos = await dboot.get_denominated_utxos(username, denominatedAmount);
  let selected = [];
  let txids = {};
  for (let i = 0; i < count; i++) {
    if (typeof txids[utxos[i].txid] !== "undefined") {
      continue;
    }

    txids[utxos[i].txid] = 1;
    selected.push(utxos[i]);
    await dboot.mark_txid_used(username, utxos[i].txid);
  }
  return selected;
}
async function onDSSUChanged(parsed, _self) {
  let msgId = parsed.message_id[1];
  let state = parsed.state[1];
  let update = parsed.status_update[1];
  d({ msgId, state, update });
  if (msgId === "ERR_INVALID_COLLATERAL") {
    await dboot.mark_txid_used(username, mainUser.utxos[0].txid);
    debug("marked collateral inputs as used");
  }
}
async function createDSIPacket(
  masterNode,
  username,
  denominationAmount,
  count
) {
  let userInputs = await getUserInputs(username, denominationAmount, count);
  let userOutputs = await getUserOutputs(username, denominationAmount, count);
  let sourceAddress = userInputs[0].address;
  let packet = Network.packet.coinjoin.dsi({
    chosen_network: masterNode.network,
    userInputs,
    collateralTxn: await masterNode.makeCollateralTx(),
    userOutputs,
    sourceAddress,
  });
  return packet;
}
async function onCollateralTxCreated(tx, self) {
  let tx = 0;
}

/**
 * argv should include:
 * - instance name
 * - user
 */
(async function (_in_instanceName, _in_username, _in_nickname) {
  const INPUTS = 2;

  nickName = _in_nickname;
  instanceName = _in_instanceName;
  username = _in_username;
  //console.info(`[status]: loading "${instanceName}" instance...`);
  dboot = await dashboot.load_instance(instanceName);
  mainUser = await extractUserDetails(username);
  randomPayeeName = await dboot.get_random_payee(username);
  payee = await extractUserDetails(randomPayeeName);

  let masterNodeConnection = new MasterNodeConnection({
    ip: masterNodeIP,
    port: masterNodePort,
    network,
    ourIP,
    startBlockHeight,
    onCollateralTxCreated: onCollateralTxCreated,
    onStatusChange: stateChanged,
    onDSSU: onDSSUChanged,
    debugFunction: null,
    userAgent: config.userAgent ?? null,
    coinJoinData: mainUser,
    payee,
    changeAddresses: mainUser.changeAddresses,
  });

  let dsaSent = false;

  async function stateChanged(obj) {
    let self = obj.self;
    let masterNode = self;
    switch (masterNode.status) {
      default:
        //console.info("unhandled status:", masterNode.status);
        break;
      case "CLOSED":
        console.warn("[-] Connection closed");
        break;
      case "NEEDS_AUTH":
      case "EXPECT_VERACK":
      case "EXPECT_HCDP":
      case "RESPOND_VERACK":
        //console.info("[ ... ] Handshake in progress");
        break;
      case "READY":
        //console.log("[+] Ready to start dealing with CoinJoin traffic...");
        if (dsaSent === false) {
          self.denominationsAmount = getDemoDenomination();
          masterNode.client.write(
            Network.packet.coinjoin.dsa({
              chosen_network: network,
              denomination: getDemoDenomination(),
              collateral: await masterNode.makeCollateralTx(),
            })
          );
          dsaSent = true;
          //console.debug("sent dsa");
        }
        break;
      case "DSQ_RECEIVED":
        //console.log('dsq received');
        //console.log("[+][COINJOIN] DSQ received. Responding with inputs...");
        //console.debug(self.dsq, "<< dsq");
        if (self.dsq.fReady) {
          debug("sending dsi");
          //console.log("[+][COINJOIN] Ready to send dsi message...");
        } else {
          info("[-][COINJOIN] masternode not ready for dsi...");
          return;
        }
        masterNode.client.write(packet);
        debug("sent dsi packet");
        break;
      case "EXPECT_DSQ":
        //console.info("[+] dsa sent");
        break;
    }
  }

  masterNodeConnection.connect();
})(
  extractOption("instance", true),
  extractOption("username", true),
  extractOption("nickname", true)
);

function debug(...args) {
  console.debug(`${nickName}[DBG]:`, ...args);
}
function info(...args) {
  console.info(`${nickName}[INFO]:`, ...args);
}
function error(...args) {
  console.error(`[${nickName}[ERROR]:`, ...args);
}
function d(...args) {
  debug(...args);
}
function dd(...args) {
  debug(...args);
  process.exit();
}
