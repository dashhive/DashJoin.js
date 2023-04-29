"use strict";
const Network = require("./network.js");
const crypto = require("crypto");
const { createHash } = crypto;

let Lib = {};
module.exports = Lib;

const { 
	PROTOCOL_VERSION,
	MNAUTH_CHALLENGE_SIZE,
	TESTNET,
	SERVICE_IDENTIFIERS,
} = Network.constants;

const { mapIPv4ToIpv6, } = Network.util;
const { version } = Network.packet;
const { connectToMasternode } = Network.net;

let masterNodeIP = "127.0.0.1";
let masterNodePort = 19999;
let network = TESTNET;
const random_mnauth_challenge = function(){
	return new Uint8Array(crypto.randomBytes(MNAUTH_CHALLENGE_SIZE));
};
let state = {
  socket: null,
  connected: false,
  masterNode: {
    ip: masterNodeIP,
    port: masterNodePort,
  },
	network,
	mnauth_challenge: random_mnauth_challenge(),
};
function our_ip_address() {
  return "127.0.0.1";
}

function mainLogic(data) {
	if(data.eventType === 'connected') {
		/**
		 * We'll have to send a "version" message to complete
		 * the authentication with the master node
		 */
		const versionPayload = {
			chosen_network: state.network,
			protocol_version: PROTOCOL_VERSION,
			services: [
				SERVICE_IDENTIFIERS.NODE_NETWORK,
				SERVICE_IDENTIFIERS.NODE_BLOOM,
			],
			addr_recv_services: [
				SERVICE_IDENTIFIERS.NODE_NETWORK,
				SERVICE_IDENTIFIERS.NODE_BLOOM,
			],
			start_height: 89245,
			addr_recv_ip: mapIPv4ToIpv6(state.masterNode.ip),
			addr_recv_port: state.masterNode.port,
			addr_trans_ip: mapIPv4ToIpv6(our_ip_address()),
			addr_trans_port: state.masterNode.port,
			relay: true,
			mnauth_challenge: state.mnauth_challenge,
		};
		state.socket.write(version(versionPayload));
		return;
	}
	if(data.eventType === 'data'){
		console.log({
			msg: new Uint8Array(data.data),
		});
		return;
	}
	if(data.eventType === 'close'){
		console.log('closing socket');
		state.socket.destroy();
		return;
	}
}

connectToMasternode(masterNodeIP, masterNodePort, function (obj) {
  switch (obj.eventType) {
    case "connected":
      state.socket = obj.socket;
      state.connected = true;
      return mainLogic(obj);
      break;
		default:
    case "data":
			return mainLogic(obj);
      break;
    case "close":
      state.connected = false;
			return mainLogic(obj);
      break;
  }
});
