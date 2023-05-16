"use strict";
const COIN = require('./coin-join-constants.js').COIN;

let Lib = {};
module.exports = Lib;

let config = require("./.config.json");
let masterNodeIP = config.masterNodeIP;
let masterNodePort = config.masterNodePort;
let network = config.network;
let ourIP = config.ourIP;
let startBlockHeight = config.startBlockHeight;

function makeCollateralTx(){
	let tx = new Uint8Array(216);
	return tx;
}
function stateChanged(obj) {
  let self = obj.self;
  switch (self.status) {
    default:
      console.info("unhandled status:", self.status);
      break;
		case "NEEDS_AUTH":
		case "EXPECT_VERACK":
    case "EXPECT_HCDP":
    case "RESPOND_VERACK":
			console.info('[ ... ] Handshake in progress');
			break;
    case "READY":
			console.log('[+] Ready to start dealing with CoinJoin traffic...');
				self.client.write(
					Network.packet.coinjoin.dsa({
						chosen_network: network,
						denomination: COIN / 1000 + 1,
						collateral: makeCollateralTx(),
					})
				);
      break;
		case "EXPECT_DSQ":
			console.info("[+] dsa sent");
			break;
  }
}

let MasterNodeConnection = require('./masternode-connection.js').MasterNodeConnection;
let masterNodeConnection = new MasterNodeConnection({
  ip: masterNodeIP,
  port: masterNodePort,
  network,
  ourIP,
  startBlockHeight,
  onStatusChange: stateChanged,
	debugFunction: console.debug,
});

masterNodeConnection.connect();
