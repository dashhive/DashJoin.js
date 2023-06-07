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
const TxnConstants = require('./transaction-constants.js');
const NetUtil = require('./network-util.js');
const hexToBytes = NetUtil.hexToBytes;
const {
	DEFAULT_TXIN_SEQUENCE,
} = TxnConstants;
const {
	OP_RETURN,
  OP_RESERVED,
} = require('./opcodes.js');


//let Demo = require('./demodata.js');
let Tx = require('dashtx');
let DashCore = require('@dashevo/dashcore-lib');
let Transaction = DashCore.Transaction;
let Input = DashCore.Input;
let Output = Transaction.Output;
let Script = DashCore.Script;
let PrivateKey = DashCore.PrivateKey;
let Address = DashCore.Address;
//let Networks = DashCore.Networks;

/**
 * Goal:
 * send from psend wallet to foobar wallet.
 */

let PsendTx = {
    "txid": "67d05ed6f0d13dcff3314ebc8b8a3d4085e550720a0e22c75740257ba8e9cbb2",
    "vout": 0,
    "address": "yMFpaEANUDbactfQc6HwVqad3VNaJcGJPb",
    "scriptPubKey": "76a9140a4898c09be4556462d740d3d1ac1c029152271988ac",
    "amount": 124.36696936,
  };
let PsendChangeAddress = 'yVEd3LscPvxCmejeqGPfqtnbpbAyXcQSH9';
let payeeAddress = 'yb9YrDMS4csg2Wn3EoVDR1ruhJNK3YRqJW';
let amount = 12.00 * COIN;
let privkeySet = PrivateKey(PrivateKey.fromWIF('cPpPXbFDaTtmTUWfW3eXKH7BRfrFzLPFXA4zGqWJ2vSFNJwnG6SR'),'zregtest');

function exit(){
  process.exit(0);
}
/*
 * Will add a custom Network
 * @param {Object} data
 * @param {string} data.name - The name of the network
 * @param {string|string[]} data.alias - The aliased name of the network
 * @param {Number} data.pubkeyhash - The publickey hash prefix
 * @param {Number} data.privatekey - The privatekey prefix
 * @param {Number} data.scripthash - The scripthash prefix
 * @param {Number} data.xpubkey - The extended public key magic for BIP32
 * @param {Number} data.xprivkey - The extended private key magic for BIP32
 * @param {Number} data.xpubkey256bit - The extended public key magic for DIP14
 * @param {Number} data.xprivkey256bit - The extended private key magic for DIP14
 * @param {Number} data.networkMagic - The network magic number
 * @param {Number} data.port - The network port
 * @param {Array}  data.dnsSeeds - An array of dns seeds
 * @return {Network}
 */

/**
 * Create a transaction that spends a previous utxo
 */
function createTransaction(){
  let fee = 1000;
  let unspent = (PsendTx.amount * COIN) - amount;
  unspent -= fee;
  let sourceAddress = Address(PsendTx.address,'regtest');
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
    satoshis: PsendTx.amount * COIN,
  };
var tx = new Transaction()
  .from(utxos) // Feed information about what unspent outputs one can use
  .to(payeeAddress, amount) // Add an output with the given amount of satoshis
  .to(PsendChangeAddress,unspent)
  .change(PsendChangeAddress) // Sets up a change address where the rest of the funds will go
  .fee(fee)
  .sign(privkeySet); // Signs all the inputs it can
  console.debug({tx,cereal: tx.serialize()});
  console.debug(tx.inputs);
  console.debug(tx.outputs);
  console.debug(tx._changeScript);

  console.debug(tx.serialize());
}

createTransaction();
process.exit(0);

//let DemoLib = require('./tx-dashcore-lib.js');


//let d = DemoLib.demo(1);

function makeCollateralTx() {
  //return hexToBytes(DemoLib.demo(2).serialize());

  //let tx = Tx.create({ sign: sign });
  //let Secp256k1 = require("@dashincubator/secp256k1");
  //async function sign({ privateKey, hash }) {
  //  let sigOpts = { canonical: true, extraEntropy: true };
  //  let sigBuf = await Secp256k1.sign(hash, privateKey, sigOpts);
  //  return Tx.utils.u8ToHex(sigBuf);
  //}

  const inTx = Demo.getInTX(); 
  const vout = 0;
	const script= Demo.getTestScript();

	let txn = new Transaction();
	txn.addVin({
		hash: inTx,
		index: vout,
		signatureScript: script,
		sequence: DEFAULT_TXIN_SEQUENCE,
	});
	txn.addVout({
		value: 0,
		pkScript: [OP_RETURN],
	});
  txn.setVersion(2);
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
			masterNode.switchHandlerTo('coinjoin');
			if(dsaSent === false){
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

masterNodeConnection.connect();
