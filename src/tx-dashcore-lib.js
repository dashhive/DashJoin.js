"use strict";

let Dashcore = require("@dashevo/dashcore-lib");
let Transaction = Dashcore.Transaction;
const COIN = 100000000;
const CollateralAmount = ((COIN / 1000 + 1) / 10 ) * 2;

/**
 * splitTransaction() created the following:

  {
    "bestblock": "681f4d83a1e1d8bbdbcc2f5a4992614f238b27ff3e13fbe0f720e195caf1470e",
    "confirmations": 100,
    "value": 0.00020000,
    "scriptPubKey": {
      "asm": "OP_DUP OP_HASH160 009c0f2f82419b3eae635a74c13bdf9bf68d73a5 OP_EQUALVERIFY OP_CHECKSIG",
      "hex": "76a914009c0f2f82419b3eae635a74c13bdf9bf68d73a588ac",
      "reqSigs": 1,
      "type": "pubkeyhash",
      "addresses": [
        "yLNfoPqjCMgKYXq2Ky5Lrx39VENtXUBcyR"
      ]
    },
    "coinbase": false
  }

*/ 
function createCollateralTransaction(){
  //let PrevTx = require('./tx.json')[index];
  let PrevTx = {
    "address": "yLNfoPqjCMgKYXq2Ky5Lrx39VENtXUBcyR",
    "category": "receive",
    "amount": 0.00020000,
    "label": "",
    "vout": 0,
    "confirmations": 100,
    "instantlock": false,
    "instantlock_internal": false,
    "chainlock": false,
    "blockhash": "74610446ae3371b89977e5d61bb510440bf8044ab95a86c7a7e28fd649dc40a8",
    "blockindex": 1,
    "blocktime": 1685520495,
    "txid": "d7a2b7380d031cf548cf816bb0fc128110589f93337c607fb32ce0353968d874",
    "walletconflicts": [
    ],
    "time": 1685520437,
    "timereceived": 1685520437
  };

  /**
   * FIXME: remove before production
   */
	let wallets = require('./wallets.json');
  let addresses = Object.keys(wallets);
  let sourceAddr = PrevTx.address;
  let sourceWif = wallets[sourceAddr];
  let payAddr = addresses[0];

  /**
   * Let's give them CollateralAmount DASH
   */
  let unspentAmount = PrevTx.amount * COIN;
  let payAmount = parseInt(CollateralAmount,10);
  let feeAmount = 0;

  /**
   * You can get a pubkey hash by doing:
   * -> dp gettxout 15538e287a4adbd45fa35290eaaf14bdb63cce3003f3710b1e953a898e268ab5 0
   *  It should show something like:
   *  
			{
				"bestblock": "51c8381e5dad2b46ede81b59129c5b291e73af78723887b74d8a040b02191c82",
				"confirmations": 8,
				"value": 115.48361444,
				"scriptPubKey": {
					"asm": "OP_DUP OP_HASH160 82acf25253e190ee72f73cb7bdbfd607f18c0285 OP_EQUALVERIFY OP_CHECKSIG",
					"hex": "76a91482acf25253e190ee72f73cb7bdbfd607f18c028588ac",
					"reqSigs": 1,
					"type": "pubkeyhash",
					"addresses": [
						"yYEPsgMKLK6V7Gee4mYzxRDvAQhevfSob2"
					]
				},
				"coinbase": true
			}
   */
  //let pubkeyHash = "03e9cfbfcd62b160136dd9bfd4ad300d98a8d8d75a6ac34d94f5bc35caa1efc13c";
  //let pubkeyHash = "82acf25253e190ee72f73cb7bdbfd607f18c0285";
  let pubkeyHash = "64b28383cc35bbd03c1ed9617707098152fdbe06";

  let tx = sendTo({
    sourceWif,
    sourceAddr,
    payAddr,
    unspentAmount,
    feeAmount,
    payAmount,
    txId: PrevTx.txid,
    pubkeyHash,
  });
  console.debug(JSON.stringify(tx,null,2));
  console.debug(tx.serialize());
  return tx;
};
function splitTransaction(index){
  let PrevTx = require('./tx.json')[index];

  /**
   * FIXME: remove before production
   */
	let wallets = require('./wallets.json');
  let addresses = Object.keys(wallets);
  let sourceAddr = PrevTx.address;
  let sourceWif = wallets[sourceAddr];
  let payAddr = addresses[0];

  /**
   * Let's give them CollateralAmount DASH
   */
  let unspentAmount = PrevTx.amount * COIN;
  let payAmount = parseInt(CollateralAmount,10) + 100;
  let feeAmount = 226;

  /**
   * You can get a pubkey hash by doing:
   * -> dp gettxout 15538e287a4adbd45fa35290eaaf14bdb63cce3003f3710b1e953a898e268ab5 0
   *  It should show something like:
   *  
			{
				"bestblock": "51c8381e5dad2b46ede81b59129c5b291e73af78723887b74d8a040b02191c82",
				"confirmations": 8,
				"value": 115.48361444,
				"scriptPubKey": {
					"asm": "OP_DUP OP_HASH160 82acf25253e190ee72f73cb7bdbfd607f18c0285 OP_EQUALVERIFY OP_CHECKSIG",
					"hex": "76a91482acf25253e190ee72f73cb7bdbfd607f18c028588ac",
					"reqSigs": 1,
					"type": "pubkeyhash",
					"addresses": [
						"yYEPsgMKLK6V7Gee4mYzxRDvAQhevfSob2"
					]
				},
				"coinbase": true
			}
   */
  //let pubkeyHash = "03e9cfbfcd62b160136dd9bfd4ad300d98a8d8d75a6ac34d94f5bc35caa1efc13c";
  //let pubkeyHash = "82acf25253e190ee72f73cb7bdbfd607f18c0285";
  let pubkeyHash = "64b28383cc35bbd03c1ed9617707098152fdbe06";

  let tx = sendTo({
    sourceWif,
    sourceAddr,
    payAddr,
    unspentAmount,
    feeAmount,
    payAmount,
    txId: PrevTx.txid,
    pubkeyHash,
  });
  console.debug(JSON.stringify(tx,null,2));

  console.debug(tx.serialize());
  return tx;
};

function demo(callSplit=false,index=0){
  // FIXME: remove hardcoded
  if(true){
    return splitTransaction(0);
  }
  //createCollateralTransaction();
}
module.exports = {
  sendTo,
  demo, // FIXME: remove me on production
};
function sendTo({
  sourceWif,
  sourceAddr,
  payAddr,
  unspentAmount,
  feeAmount,
  payAmount,
  txId,
  pubkeyHash,
}) {
  //@ts-ignore - no input required, actually
  let lockScript = [
    "76", // OP_DUP
    "a9", // OP_HASH160
    "14", // Byte Length: 20
    pubkeyHash,
    //"5bcd0d776a7252310b9f1a7eee1a749d42126944", // PubKeyHash
    "88", // OP_EQUALVERIFY
    "ac", // OP_CHECKSIG
  ].join("");
  let tx = new Transaction()
    //@ts-ignore - allows single value or array
    .from([
      // CoreUtxo
      {
        txId: txId,
        outputIndex: 0,
        address: sourceAddr,
        script: lockScript,
        satoshis: unspentAmount,
      },
    ]);
  tx.to(payAddr, payAmount);
  //tx.to(sourceAddr, payAmount);
  //tx.to(sourceAddr, payAmount);
  //tx.to(sourceAddr, payAmount);
  //tx.to(sourceAddr, payAmount);

  tx.fee(feeAmount);
  //@ts-ignore - see above
  tx.change(sourceAddr);
  tx.sign([sourceWif]);

  return tx;
}
