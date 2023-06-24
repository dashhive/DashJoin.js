#!/usr/bin/env node
"use strict";
const COIN = require("./coin-join-constants.js").COIN;
const LOW_COLLATERAL = (COIN / 1000 + 1) / 10;
const Network = require("./network.js");
//const NetworkUtil = require("./network-util.js");
//const hexToBytes = NetworkUtil.hexToBytes;
const assert = require("assert");
const extractOption = require("./argv.js").extractOption;
const { extractUserDetails } = require("./bootstrap/user-details.js");
const dashboot = require("./bootstrap/index.js");
const MasterNodeConnection =
  require("./masternode-connection.js").MasterNodeConnection;
let INPUTS = 2;
let dboot = null;

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
  let maxReps = 150000;
  let iteration = 0;
  let i = 0;
  while (selected.length < count) {
    if (++iteration > maxReps) {
      throw new Error(`Couldnt find unused user input after ${maxReps} tries`);
    }
    if (typeof txids[utxos[i].txid] !== "undefined") {
      ++i;
      continue;
    }
    txids[utxos[i].txid] = 1;
    selected.push(utxos[i]);
    await dboot.mark_txid_used(username, utxos[i].txid);
    ++i;
  }
  return selected;
}
let client_session = {
  used_txids: [],
  col_txids: [],
  used_addresses: [],
  get_used_txids: function () {
    return [...client_session.used_txids, ...client_session.col_txids];
  },
  add_txids: function (a) {
    client_session.used_txids = [...client_session.used_txids, ...a];
  },
  add_addresses: function (a) {
    client_session.used_addresses = [...client_session.used_addresses, ...a];
  },
};
//async function getUserOutputs(username, denominatedAmount, count) {}
async function onDSSUChanged(parsed) {
  //, _self) {
  let msgId = parsed.message_id[1];
  let state = parsed.state[1];
  let update = parsed.status_update[1];
  d({ msgId, state, update });
  if (msgId === "ERR_INVALID_COLLATERAL") {
    client_session.used_txids.push(mainUser.utxos[0].txid);
    await dboot.mark_txid_used(username, mainUser.utxos[0].txid);
    debug("marked collateral inputs as used");
  }
}
function extract(array, key) {
  let selected = [];
  for (const ele of array) {
    selected.push(ele[key]);
  }
  return selected;
}
async function createDSIPacket(
  masterNode,
  username,
  denominationAmount,
  count
) {
  /**
   * Step 1: create inputs
   */
  let chosenInputTxns = await dboot.filter_denominated_transaction(
    username,
    denominationAmount,
    count,
    client_session.get_used_txids()
  );
  assert.equal(
    chosenInputTxns.length,
    count,
    "couldnt find enough denominated transactions"
  );
  client_session.add_txids(extract(chosenInputTxns, "txid"));
  client_session.add_addresses(extract(chosenInputTxns, "address"));
  //dd(client_session);
  //dd(chosenInputTxns);

  /**
   * Step 2: create collateral transaction
   */
  let amount = parseInt(LOW_COLLATERAL * 2, 10);
  assert.equal(amount > 0, true, "amount has to be non-zero positive");
  let payee = await dboot.random_payee_address(username);
  assert.notEqual(payee.user, username, "payee cannot be the same as user");
  let payeeAddress = payee.address;
  assert.notEqual(payeeAddress.length, 0, "payeeAddress cannot be empty");
  let sourceAddress = await dboot.filter_address(
    username,
    client_session.used_addresses
  );
  assert.notEqual(sourceAddress, null, "sourceAddress cannot be null");
  assert.notEqual(sourceAddress.length, 0, "sourceAddress cannot be empty");
  //let txid =
  //let vout =
  //let satoshis =
  //let changeAddress =
  //if (changeAddress === null) {
  //  throw new Error("changeAddress cannot be null");
  //}
  //let privateKey = self.coinJoinData.utxos[0].privateKey;
  //let unspent = satoshis - amount;
  //let utxos = {
  //  txId: txid,
  //  outputIndex: vout,
  //  sequenceNumber: 0xffffffff,
  //  scriptPubKey: Script.buildPublicKeyHashOut(sourceAddress),
  //  satoshis,
  //};
  //let tx = new Transaction()
  //  .from(utxos)
  //  .to(payeeAddress, amount)
  //  .to(changeAddress, unspent - fee)
  //  .sign(privateKey);
  //self.collateralTx = {
  //  tx,
  //  utxos,
  //  payeeAddress,
  //  amount,
  //  changeAddress,
  //  privateKey,
  //  txid,
  //  vout,
  //  satoshis,
  //  sourceAddress,
  //  user: self.coinJoinData.user,
  //};
  //let userInputs = await getUserInputs(username, denominationAmount, count);
  //let userOutputs = await getUserOutputs(username, denominationAmount, count);
  //let packet = Network.packet.coinjoin.dsi({
  //  chosen_network: masterNode.network,
  //  userInputs,
  //  collateralTxn: await masterNode.makeCollateralTx(),
  //  userOutputs,
  //  sourceAddress,
  //});
  //return packet;
}
async function makeDSICollateralTx(masterNode, username) {
  let amount = parseInt(LOW_COLLATERAL * 2, 10);
  let fee = 50000; // FIXME
  let payeeAddress = self.payee.utxos[0].address;
  let sourceAddress = self.coinJoinData.utxos[0].address;
  let txid = self.coinJoinData.utxos[0].txid;
  let vout = self.coinJoinData.utxos[0].outputIndex;
  let satoshis = self.coinJoinData.utxos[0].satoshis;
  let changeAddress = self.coinJoinData.changeAddress;
  if (changeAddress === null) {
    throw new Error("changeAddress cannot be null");
  }
  let privateKey = self.coinJoinData.utxos[0].privateKey;
  let unspent = satoshis - amount;
  let utxos = {
    txId: txid,
    outputIndex: vout,
    sequenceNumber: 0xffffffff,
    scriptPubKey: Script.buildPublicKeyHashOut(sourceAddress),
    satoshis,
  };
  let tx = new Transaction()
    .from(utxos)
    .to(payeeAddress, amount)
    .to(changeAddress, unspent - fee)
    .sign(privateKey);
  self.collateralTx = {
    tx,
    utxos,
    payeeAddress,
    amount,
    changeAddress,
    privateKey,
    txid,
    vout,
    satoshis,
    sourceAddress,
    user: self.coinJoinData.user,
  };
  self.dispatchCollateralTxCreated(tx);
  return hexToBytes(tx.uncheckedSerialize());
}
async function onCollateralTxCreated(tx, self) {
  await dboot.mark_txid_used(tx.user, tx.txid);
}

/**
 * argv should include:
 * - instance name
 * - user
 */
(async function (_in_instanceName, _in_username, _in_nickname, _in_count) {
  if (_in_count) {
    INPUTS = parseInt(_in_count, 10);
  }
  if (isNaN(INPUTS)) {
    throw new Error(`--count must be a positive integer`);
  }

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
    user: mainUser.user,
    payee,
    changeAddresses: mainUser.changeAddresses,
  });

  let dsaSent = false;
  let dsi = await createDSIPacket(
    masterNodeConnection,
    _in_username,
    getDemoDenomination(),
    INPUTS
  );
  dd({ dsi });

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
  extractOption("nickname", true),
  extractOption("count", true)
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
