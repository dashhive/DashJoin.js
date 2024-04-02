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
  db_cj();

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
Lib.store = { user: {}};
Lib.store.create_user = async function(username){
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

Lib.user = {};
Lib.user.create_user = Lib.store.create_user;
Lib.store.user.add_address = function(username,address) {
  db_cj_ns([username]);
  let existing = Lib.address.get_all('addresses');
  if(existing.indexOf(address) === -1){
    existing.push(address);
    db_cj_ns([username]);
    db_put('addresses',JSON.stringify(existing));
    return true;
  }
  return false;
};
Lib.address = {};
Lib.address.add = Lib.store.user.add_address;
Lib.address.get_all = function(username){
  db_cj_ns([username]);
  try {
    let t = db_get('addresses');
    t = JSON.parse(t);
    if(!Array.isArray(t)){
      return [];
    }
    return t;
  }catch(e){
    return [];
  }
};

Lib.transaction = {};
Lib.transaction.get_all = function(username){
  db_cj_ns([username]);
  try {
    let t = db_get('transactions');
    t = JSON.parse(t);
    if(!Array.isArray(t)){
      return [];
    }
    return t;
  }catch(e){
    return [];
  }
};
Lib.transaction.remove = function(username,txn){
  db_cj_ns([username]);
  let existing = Lib.transaction.get_all(username);
  if(existing.length === 0){
    return;
  }
  let keep = [];
  for(let tx of existing){
    if(tx.txid === txn.txid){
      continue;
    }
    keep.push(tx);
  }
  Lib.transaction.set(username,keep);
};

Lib.transaction.set = function(username,items){
  if(!Array.isArray(items)){
    throw new Error(`items must be an array`);
  }
  db_cj_ns([username]);
  db_put('transactions',JSON.stringify(items));
}
Lib.transaction.add = Lib.store.user.transaction;

Lib.store.user.transaction = function(username,txn){
  /**
   * This is assuming you pass in an array or a single
   * json object that is the result of the `listtransactions`
   * dash-cli command
   */
  let existing = Lib.transaction.get_all(username);
  db_cj_ns([username]);
  /**
   * FIXME: guarantee that the same transaction doesn't get added
   */
  if(Array.isArray(txn)){
    for(let t of txn){
      existing.push(t);
    }
  }else{
    existing.push(txn);
  }
  db_put('transactions',JSON.stringify(existing));
};

function d(f) {
  console.debug(f);
}
function dd(f) {
  console.debug(f);
  process.exit();
}

const txns = [
  {
    "address": "yjNhKBVgajCpKorbbcc4u8WXojcd6wkzPt",
    "category": "receive",
    "amount": 3.00000000,
    "vout": 0,
    "confirmations": 0,
    "instantlock": true,
    "instantlock_internal": true,
    "chainlock": false,
    "trusted": true,
    "txid": "a45cc2d45f09e5408ad367fdab8e53d1fb9f21517dde6c2e4b70c753cef3dbdc",
    "walletconflicts": [
    ],
    "time": 1686896516,
    "timereceived": 1686896516
  },
  {
    "address": "yjPpZi9mPott4zeHzP1LtgoB9jPRBmB8hs",
    "category": "receive",
    "amount": 3.00000000,
    "vout": 0,
    "confirmations": 0,
    "instantlock": true,
    "instantlock_internal": true,
    "chainlock": false,
    "trusted": true,
    "txid": "e07a0d29a74f8d865f4160b772857c7a4a4b5328bfaa8289f8654cda1ad0d40d",
    "walletconflicts": [
    ],
    "time": 1686896516,
    "timereceived": 1686896516
  }
];

(async () => {
  await Lib.initialize('psend',require('./config.json'));
  //Lib.store.create_user('psend');
  //d(db_get('users'));
  let address = 'yjPpZi9mPott4zeHzP1LtgoB9jPRBmB8hs';
  Lib.store.user.add_address('psend',address);
  d(Lib.address.get_all('psend'));

  //Lib.store.user.transaction('psend',txns);
  //d(Lib.transaction.get_all('psend'));
  Lib.transaction.remove('psend',txns[0]);
  Lib.transaction.remove('psend',txns[1]);
  d(Lib.transaction.get_all('psend'));
})();
