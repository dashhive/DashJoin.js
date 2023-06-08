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
//let Transaction = require('./ctransaction.js');
const TxnConstants = require("./transaction-constants.js");
const NetUtil = require("./network-util.js");
const hexToBytes = NetUtil.hexToBytes;
const { DEFAULT_TXIN_SEQUENCE } = TxnConstants;
const { OP_RETURN, OP_RESERVED } = require("./opcodes.js");

//let Demo = require('./demodata.js');
let Tx = require("dashtx");
let DashCore = require("@dashevo/dashcore-lib");
let Transaction = DashCore.Transaction;
let Input = DashCore.Input;
let Output = Transaction.Output;
let Script = DashCore.Script;
let PrivateKey = DashCore.PrivateKey;
let Address = DashCore.Address;
//let Networks = DashCore.Networks;
const LOW_COLLATERAL = (COIN / 1000 + 1) / 10;
const HI_COLLATERAL = LOW_COLLATERAL * 4;
const fs = require("fs");

async function logUsedTransaction(fileName, txnId) {
  let buffer = await fs.readFileSync(fileName);
  buffer = buffer.toString();
  let data = JSON.parse(buffer);
  data.list.push(txnId);
  await fs.writeFileSync(fileName, JSON.stringify(data, null, 2));
}
async function isUsed(fileName, txnId) {
  let buffer = await fs.readFileSync(fileName);
  buffer = buffer.toString();
  let data = JSON.parse(buffer);
  return data.list.indexOf(txnId) !== -1;
}
const NETWORK = 'regtest';

(async function () {
  /**
   * Goal:
   * send from psend wallet to foobar wallet.
   */
  let PsendUsedTxnFile = "/home/foobar/docs/dp-used-txn.json";
  let PsendTxnList = require("/home/foobar/docs/dp-txn.json");
  let PsendTx = null;
  let PsendChangeAddress = await read_file(
    "/home/foobar/docs/dp-change-address-0"
  );
  let sourceAddress = await read_file("/home/foobar/docs/dp-address-0");
  let payeeAddress = await read_file("/home/foobar/docs/df-address-0");

  for (let txn of PsendTxnList) {
    /**
     * Pull from PsendTxnList where:
     * 1) category is 'generate'.
     * 2) has more than zero confirmations
     * 3) where address matches dp-address-0
     * 4) txid does NOT exist in /home/foobar/docs/dp-used-txn.json
     */
    if (txn.category !== "generate") {
      continue;
    }
    if (txn.confirmations === 0) {
      continue;
    }
    if (txn.address !== sourceAddress) {
      continue;
    }
    if (await isUsed(PsendUsedTxnFile, txn.txid)) {
      continue;
    }
    PsendTx = txn;
    break;
  }
  if (PsendTx === null) {
    throw new Error("Couldnt find unused transaction");
  }

  let amount = LOW_COLLATERAL * 2;
  let privkeySet = PrivateKey(
    PrivateKey.fromWIF(
      await read_file("/home/foobar/docs/dp-privkey-0"),
      NETWORK
    )
  );

  function exit() {
    process.exit(0);
  }
  async function createCollateralTransaction(prefs) {
    let origAmount = PsendTx.amount * COIN;
    let times = 1;

    let fee = 1000;
    amount = parseInt(amount, 10);
    let unspent = origAmount - amount;
    unspent -= fee;
    console.debug({ fee, PsendTx, unspent, amount, origAmount });
    let sourceAddress = Address(PsendTx.address, NETWORK);
    /**
     * Take the input of the PrevTx, send it to another wallet
     * which will hold the new funds and the change will go to
     * a change address.
     */
    let utxos = {
      txId: PsendTx.txid,
      outputIndex: PsendTx.vout,
      sequenceNumber: 0xffffffff,
      scriptPubKey: Script.buildPublicKeyHashOut(sourceAddress),
      satoshis: origAmount,
    };
    var tx = new Transaction()
      .from(utxos) // Feed information about what unspent outputs one can use
      .to(payeeAddress, amount) // Add an output with the given amount of satoshis
      .to(PsendChangeAddress, unspent)
      .change(PsendChangeAddress) // Sets up a change address where the rest of the funds will go
      .fee(fee)
      .sign(privkeySet); // Signs all the inputs it can

    console.debug({ tx, cereal: tx.serialize() });
    console.debug(tx.inputs);
    console.debug(tx.outputs);
    console.debug(tx._changeScript);

    console.debug(tx.serialize());
    if (typeof prefs.logUsed !== "undefined" && prefs.logUsed) {
      await logUsedTransaction(PsendUsedTxnFile, utxos.txId);
    }
  }
  let logUsed = false;
  if (process.argv.includes("--log-used")) {
    logUsed = true;
  }
  createCollateralTransaction({
    logUsed,
  }).then(function(){
    process.exit(0);
  });

  //let DemoLib = require('./tx-dashcore-lib.js');

  //let d = DemoLib.demo(1);

  function makeCollateralTx() {
    return txn.serialize();
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
        masterNode.switchHandlerTo("coinjoin");
        if (dsaSent === false) {
          setTimeout(() => {
            masterNode.client.write(
              Network.packet.coinjoin.dsa({
                chosen_network: network,
                denomination: COIN / 1000 + 1,
                collateral: makeCollateralTx(),
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
  async function read_file(fname) {
    return await require("fs")
      .readFileSync(fname)
      .toString()
      .replace(/^\s+/, "")
      .replace(/\s+$/, "");
  }

  masterNodeConnection.connect();
})();
