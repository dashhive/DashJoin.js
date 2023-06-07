"use strict";
/**
 * 1) Choose an input
 * 2) Create a change output
 * 3) sign it
 */

let Dashcore = require("@dashevo/dashcore-lib");
let Transaction = Dashcore.Transaction;
let Script = Dashcore.Script;
let Utils = require('./network-util.js');
let hashByteOrder = Utils.hashByteOrder;
let hexToBytes = Utils.hexToBytes;
let wallets = require('./wallets.json');
let addresses = Object.keys(wallets);
const COIN = 100000000;
const LOW_COLLATERAL = ((COIN / 1000 + 1) / 10 );
const HI_COLLATERAL = LOW_COLLATERAL * 4;

//console.debug({LOW_COLLATERAL,HI_COLLATERAL});
//console.debug({in_dash: LOW_COLLATERAL / COIN, hi_in_dash: HI_COLLATERAL / COIN });
(function(){
  /**
   * Owned by "psend" wallet
   */
	let PrevTx = {
    "address": "yfLCwJqTN3uKkNM2vvaaMofbNQscCDYZ9a",
    "amount": parseInt(99.57515735 * COIN,10),
    "vout": 0,
    "txid": "1593a250efe1b4e3cf8edd2301e7ed614e105758b4136c0daea89eacb2dfc626",
  };
  let amount = parseInt(LOW_COLLATERAL + 100 * COIN,10);
  let privkeySet = 'cV3gU6nXfiAQ5bCj8ffAMDf8RjBAmPrLHPAAFVERygctsrTJVo3R';
  let changeAddress = 'yUXAvpMJ73eAaRTNi95Q8NR7oLYHxzUB5Q';
  /**
   * Owned by "funbar" wallet
   */
  let toAddress = 'yhvXaFqbcXKJaVi5s15yympWy2xZifvyoy'; 
  let utxos = {
    txid: PrevTx.txid,
    vout: PrevTx.vout,
    sequenceNumber: 0xffffffff,
    script: new Script(Script.buildPublicKeyHashOut(toAddress)),
    satoshis: amount,
  };
  

  let tx = new Transaction()
    .from(utxos)
    .to(toAddress,amount)
    .change(changeAddress)
    .fee(67)
    .sign(privkeySet);
  console.debug(tx.serialize());
})();
process.exit(0);
//return;

function demo(index=2){
  return splitTransaction(index);
}

function splitTransaction(index){
  //let PrevTx = require('./tx.json')[index];

  let PrevTx = {
    "address": "yN2DYvCAxL3zBUQnNjMnFteGCXRF7egyQC",
    "category": "receive",
    "amount": 0.00025000,
    "label": "",
    "vout": 0,
    "confirmations": 0,
    "instantlock": false,
    "instantlock_internal": false,
    "chainlock": false,
    "trusted": false,
    "txid": "c73c690e24dba9fddc9ef23c4a8a50b11a553f414c6e7331ec4c06c6fd3672ee",
    "walletconflicts": [ ],
    "time": 1685520437,
    "timereceived": 1685520437
  };
  console.debug({PrevTx});
  /**
   * FIXME: remove before production
   */
  let sourceAddr = PrevTx.address;
  let sourceWif = wallets[sourceAddr];
  if(sourceWif === null || typeof sourceWif === 'undefined'){
    throw new Error('sourceWif for address could not be found!');
  }
  let payAddr = addresses[0];
  if(payAddr === null || typeof payAddr === 'undefined'){
    throw new Error('payAddr couldnt be found');
  }

  let unspentAmount = LOW_COLLATERAL * COIN; //PrevTx.amount * COIN;
  let payAmount = 0;//LOW_COLLATERAL;
  let feeAmount = 225;

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
  let pubkeyHash = "12ae145ffb38a91938d0876b3540c4452a04b310";

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
        txId,
        outputIndex: 0,
        address: sourceAddr,
        script: lockScript,
        satoshis: unspentAmount,
      },
    ]);

  
  //@ts-ignore - see above
  tx.fee(feeAmount);
  tx.change(sourceAddr);
  tx.sign([sourceWif]);

  return tx;
}
