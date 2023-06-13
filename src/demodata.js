"use strict";
const COIN = require("./coin-join-constants.js").COIN;
const Network = require("./network.js");

let Lib = {};
module.exports = Lib;

let config = require("./.config.json");
let NETWORK = config.network;

let DashCore = require("@dashevo/dashcore-lib");
let Transaction = DashCore.Transaction;
let Script = DashCore.Script;
let PrivateKey = DashCore.PrivateKey;
let Address = DashCore.Address;
let { hexToBytes } = require("./network-util.js");
const LOW_COLLATERAL = (COIN / 1000 + 1) / 10;
const fs = require("fs");
const { read_file, logUsedTransaction, isUsed } = require("./ctransaction.js");
let user = "dp";
Lib.initialize = function (uname) {
  user = uname;
};
Lib.util = {};
Lib.util.fetchData = async function () {
  let data = await fetchData();
  return {
    usedTxnFileName: data.PsendUsedTxnFile,
    txnList: data.PsendTxnList,
    changeAddress: data.PsendChangeAddress,
    sourceAddress: data.sourceAddress,
    payeeAddress: data.payeeAddress,
    privateKeySet: data.privkeySet,
  };
};
Lib.getMultipleUnusedTransactions = async function(count){
  let txns = [];
  for(let i=0; i < count;i++){
    txns.push(await getUnusedTxn());
  }
  return txns;
};
Lib.getMultipleUnusedTransactionsFilter = async function(count,properties){
  let txns = await Lib.getMultipleUnusedTransactions(count);
  let finalTxns = [];
  for(let txn of txns){
    let obj = {};
    for(let prop of properties){
      obj[prop] = txn[prop];
    }
    finalTxns.push(obj);
    obj = {};
  }
  return finalTxns;
};

async function getUnusedTxn() {
  let { PsendTxnList, sourceAddress, PsendUsedTxnFile } = await fetchData();
  for (let txn of PsendTxnList) {
    /**
     * Pull from PsendTxnList where:
     * 1) category is 'generate'.
     * 2) has more than zero confirmations
     * 3) where address matches dp-address-0
     * 4) txid does NOT exist in /home/foobar/docs/dp-used-txn.json
     */
    if (txn.category === "receive" || txn.category === "send") {
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
    return txn;
  }
  return null;
}
Lib.logUsedTransaction = async function (txnId) {
  let fileName = await fetchData();
  fileName = fileName.PsendUsedTxnFile;
  let buffer = await fs.readFileSync(fileName);
  buffer = buffer.toString();
  let data = JSON.parse(buffer);
  data.list.push(txnId);
  await fs.writeFileSync(fileName, JSON.stringify(data, null, 2));
};
/**
 * Returns {
 *  txid,
 *  vout,
 *  sourceAddress,
 *  satoshis,
 *  privateKey,
 *  changeAddress,
 *  payeeAddress,
 * }
 */
Lib.getUnusedTransaction = async function () {
  let data = await fetchData();
  let txn = await getUnusedTxn();
  return {
    txid: txn.txid,
    sourceAddress: Address(data.sourceAddress, NETWORK),
    vout: parseInt(txn.vout, 10),
    satoshis: parseInt(txn.amount * COIN, 10),
    privateKey: data.privkeySet,
    changeAddress: data.PsendChangeAddress,
    payeeAddress: data.payeeAddress,
    _origTxin: txn,
    _data: data,
  };
};
Lib.makeDSICollateralTx = async function () {
  let PsendTx = await Lib.getUnusedTransaction();

  if (PsendTx === null) {
    throw new Error("Couldnt find unused transaction");
  }

  let amount = parseInt(LOW_COLLATERAL * 2, 10);
  let fee = 50000; // FIXME
  let {
    payeeAddress,
    sourceAddress,
    txid,
    vout,
    satoshis,
    changeAddress,
    privateKey,
  } = PsendTx;
  let unspent = satoshis - amount;
  let utxos = {
    txId: txid,
    outputIndex: vout,
    sequenceNumber: 0xffffffff,
    scriptPubKey: Script.buildPublicKeyHashOut(sourceAddress),
    satoshis,
  };
  var tx = new Transaction()
    .from(utxos)
    //.to(payeeAddress, amount)
    //.to(changeAddress, unspent - fee)
    .sign(privateKey);
  return hexToBytes(tx.uncheckedSerialize());
  //return hexToBytes(tx.uncheckedSerialize());
};

Lib.makeCollateralTx = async function () {
  let PsendTx = await Lib.getUnusedTransaction();

  if (PsendTx === null) {
    throw new Error("Couldnt find unused transaction");
  }

  let amount = parseInt(LOW_COLLATERAL * 2, 10);
  let fee = 50000; // FIXME
  let {
    payeeAddress,
    sourceAddress,
    txid,
    vout,
    satoshis,
    changeAddress,
    privateKey,
  } = PsendTx;
  let unspent = satoshis - amount;
  let utxos = {
    txId: txid,
    outputIndex: vout,
    sequenceNumber: 0xffffffff,
    scriptPubKey: Script.buildPublicKeyHashOut(sourceAddress),
    satoshis,
  };
  var tx = new Transaction()
    .from(utxos)
    .to(payeeAddress, amount)
    .to(changeAddress, unspent - fee)
    .sign(privateKey);
  return hexToBytes(tx.uncheckedSerialize());
};
Lib.LOW_COLLATERAL = (COIN / 1000 + 1) / 10;
async function fetchData() {
  let files = {};
  switch (user) {
    default:
    case "dh":
      files = require("./dh-config.demodata.json");
      break;
    case "dche":
      files = require("./dche-config.demodata.json");
      break;
    case "dl":
      files = require("./dl-config.demodata.json");
      break;
    case "dp":
      files = require("./dp-config.demodata.json");
      break;
    case "df":
      files = require("./df-config.demodata.json");
      break;
  }
  let PsendUsedTxnFile = files.usedTxn;
  let PsendTxnList = require(files.txnList);
  let PsendChangeAddress = await read_file(files.changeAddress);
  let sourceAddress = await read_file(files.sourceAddress);
  let payeeAddress = await read_file(files.payeeAddress);
  let privkeySet = PrivateKey(
    PrivateKey.fromWIF(await read_file(files.wif), NETWORK)
  );
  return {
    PsendUsedTxnFile,
    PsendTxnList,
    PsendChangeAddress,
    sourceAddress,
    payeeAddress,
    privkeySet,
  };
}
