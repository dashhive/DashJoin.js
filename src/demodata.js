"use strict";
const COIN = require("./coin-join-constants.js").COIN;
const Network = require("./network.js");

let Lib = {};
module.exports = Lib;
const exit = () => process.exit(0);

let config = require("./.config.json");
let network = config.network;

let DashCore = require("@dashevo/dashcore-lib");
let Transaction = DashCore.Transaction;
let Script = DashCore.Script;
let PrivateKey = DashCore.PrivateKey;
let Address = DashCore.Address;
const LOW_COLLATERAL = (COIN / 1000 + 1) / 10;
const HI_COLLATERAL = LOW_COLLATERAL * 4;
const fs = require("fs");
const NETWORK = "regtest";
const { 
  read_file,
  logUsedTransaction,
  isUsed,
  sendCoins,
} = require('./ctransaction.js');

async function fetchData(){
  let files = require('./config.demodata.json');
  let PsendUsedTxnFile = files.usedTxn;
  let PsendTxnList = require(files.txnList);
  let PsendChangeAddress = await read_file(
    files.changeAddress
  );
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
async function getUnusedTxn(){
  let {
    PsendTxnList,
    sourceAddress,
    PsendUsedTxnFile,
  } = await fetchData();
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
    return txn;
  }
  return null;
};
Lib.logUsedTransaction = async function(txnId) {
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
Lib.getUnusedTransaction = async function(){
  let data = await fetchData();
  let txn = await getUnusedTxn();
  return {
    txid: txn.txid,
    sourceAddress: Address(data.sourceAddress,NETWORK),
    vout: parseInt(txn.vout,10),
    satoshis: parseInt(txn.amount * COIN,10),
    privateKey: data.privkeySet,
    changeAddress: data.PsendChangeAddress,
    payeeAddress: data.payeeAddress,
    _origTxin: txn,
    _data: data,
  };
};

Lib.makeCollateralTx = async function(){
  let PsendTx = await Lib.getUnusedTransaction();

  if (PsendTx === null) {
    throw new Error("Couldnt find unused transaction");
  }

  async function makeCollateralTx() {
    let amount = parseInt(LOW_COLLATERAL * 2, 10);
    let fee = 50000;
    let { payeeAddress, sourceAddress, txid, vout, satoshis, changeAddress, privateKey } =
      PsendTx;
    console.debug({ PsendTx });
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
  return await makeCollateralTx();
};

/*
(async function(){
  let tx = await Lib.getUnusedTransaction();
  console.debug({tx});
  exit();
})();
*/
