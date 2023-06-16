"use strict";
const COIN = require("../coin-join-constants.js").COIN;
const Network = require("../network.js");

let Lib = {};
module.exports = Lib;

let config = require("../.config.json");
let NETWORK = config.network;

let DashCore = require("@dashevo/dashcore-lib");
let Transaction = DashCore.Transaction;
let Script = DashCore.Script;
let PrivateKey = DashCore.PrivateKey;
let Address = DashCore.Address;
let { hexToBytes } = require("../network-util.js");
const LOW_COLLATERAL = (COIN / 1000 + 1) / 10;
const fs = require("fs");
const { read_file, logUsedTransaction, isUsed } = require("../ctransaction.js");

let DB = require('./lmdb.js');
let user = "dp";
async function file_exists(f){
  return await fs.existsSync(f);
}
Lib.initialize = async function (uname,config) {
  user = uname;
  let exists = await file_exists(config.db_path.replace(/\/$/,'') + '/data.mdb');
  DB.open({
    path: config.db_path,
    db_name: config.db_name,
    create: !exists, 
    maxDbs: config.max_dbs,
  });

};

function db_cj(){
  DB.set_namespaces(['coinjoin']);
}
function db_cj_ns(list){
  DB.set_namespaces(['coinjoin', ...list]);
}
function db_put(key,val){
  DB.ns.put(key,val);
}
function db_get(key){
  return DB.ns.get(key);
}
function db_append(key,val){
  let ex = DB.ns.get(key);
  DB.ns.put(key,ex + val);
}
let Store = {};
Lib.store = Store;
Store.create_user = async function(username){
  db_cj();
  let list = db_get('users');
  try {
    list = JSON.parse(list);
  }catch(e){
    list = [];
  }
  for(let user of list){
    if(user === username){
      throw new Error('user already exists');
    }
  }
  list.push(username);
  db_put('users',JSON.stringify(list));
};

Lib.util = {};
Lib.util.fetchData = async function () {
  
  return {
    usedTxnFileName: data.PsendUsedTxnFile,
    txnList: data.PsendTxnList,
    changeAddress: data.PsendChangeAddress,
    sourceAddress: data.sourceAddress,
    payeeAddress: data.payeeAddress,
    privateKeySet: data.privkeySet,
  };
};


Lib.getDenominatedTransactions = async function (denomination) {};
Lib.getMultipleUnusedTransactions = async function (count) {
  let txns = [];
  for (let i = 0; i < count; i++) {
    txns.push(await getUnusedTxn());
  }
  return txns;
};
async function getUnusedTxn() {
  return null;
}
Lib.logUsedTransaction = async function (txnId) {
};

function dd(f) {
  console.debug(f);
  process.exit();
}

function sanitizePrivateKey(p){
  if(p === null){
    throw new Error('Private key is null');
  }
  return String(p).replace(/[^a-zA-Z0-9]+/gi,'');
}
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
  return {
    txid: found.txid,
    sourceAddress: Address(sourceAddress, NETWORK),
    vout: parseInt(found.vout, 10),
    satoshis: parseInt(found.amount * COIN, 10),
    privateKey,
    changeAddress: data.PsendChangeAddress,
    payeeAddress: data.payeeAddress,
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
    .to(payeeAddress, amount)
    .to(changeAddress, unspent - fee)
    .sign(privateKey);
  return tx;
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
  let denominations = require(`./${user}-denominations.json`);
  let PsendUsedTxnFile = files.usedTxn;
  let PsendTxnList = require(files.txnList);
  let PsendChangeAddress = await read_file(files.changeAddress);
  let sourceAddress = await read_file(files.sourceAddress);
  let payeeAddress = await read_file(files.payeeAddress);
  let privkeySet = PrivateKey(
    PrivateKey.fromWIF(await read_file(files.wif), NETWORK)
  );
  return {
    denominations,
    PsendUsedTxnFile,
    PsendTxnList,
    PsendChangeAddress,
    sourceAddress,
    payeeAddress,
    privkeySet,
  };
}


(async () => {
  await Lib.initialize('psend',require('./config.json'));
  Lib.store.create_user('psend');
  dd(db_get('users'));
  dd('done');
})();
