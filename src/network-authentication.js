"use strict";
const Network = require("./network.js");
const crypto = require("crypto");
const { createHash } = crypto;
const net = require("net");

let Lib = {};
module.exports = Lib;

const {
  PROTOCOL_VERSION,
  MNAUTH_CHALLENGE_SIZE,
  TESTNET,
  SERVICE_IDENTIFIERS,
} = Network.constants;

const { mapIPv4ToIpv6 } = Network.util;
const PacketParser = Network.packet.parse;
const Statuses = ["NEEDS_AUTH", "EXPECT_VERACK", "READY", "CLOSED"];

//let activeConnections = [];
function MasterNode({
  ip,
  port,
  network,
  ourIP = "127.0.0.1", // FIXME: find out how to get this automatically
  startBlockHeight = 84567, // FIXME needs to change
}) {
  let self = this;
  self.ip = ip;
  self.port = port;
  self.network = network;
  self.startBlockHeight = startBlockHeight;
  self.client = null;
  self.mnauth_challenge = null;
  self.status = null;
  self.statusChangedAt = 0;
  self.ourIP = ourIP;
  self.setStatus = function (s) {
    self.status = s;
    self.statusChangedAt = Date.now();
  };
  self.createMNAuthChallenge = function () {
    return new Uint8Array(crypto.randomBytes(MNAUTH_CHALLENGE_SIZE));
  };
	self.recv = [];
  self.connect = function () {
		console.debug('connect');
    self.client = new net.Socket();
      self.client.on("close", function () {
				self.setStatus("CLOSED");
				console.debug("closing socket");
				self.client.destroy();
      });
			self.client.on('error', function(err) {
				console.debug({err});
			});
			self.client.on('end', function(...args) {
				console.debug('end', args);
			});
      self.client.on("data", function (payload) {
				console.debug({payload});
				self.recv.push(payload);
				let magicBytes = PacketParser.magicBytes(payload);
				let command = PacketParser.commandName(payload);
				let operatingNetwork = PacketParser.identifyMagicBytes(payload);
				console.debug({ operatingNetwork, magicBytes, command });
				if (['sendaddr','sendaddrv2','version','verack'].includes(command)){
					self.setStatus('READY');
      		self.client.write(Network.packet.verack({chosen_network: self.network,}));
				}
				return true;
			});
		self.client.on('ready', function(){
			console.debug('connected. sending version');
      const versionPayload = {
        chosen_network: self.network,
        protocol_version: PROTOCOL_VERSION,
        services: [
          SERVICE_IDENTIFIERS.NODE_NETWORK,
          SERVICE_IDENTIFIERS.NODE_BLOOM,
        ],
        addr_recv_services: [
          SERVICE_IDENTIFIERS.NODE_NETWORK,
          SERVICE_IDENTIFIERS.NODE_BLOOM,
        ],
        start_height: self.startBlockHeight,
        addr_recv_ip: mapIPv4ToIpv6(self.ip),
        addr_recv_port: self.port,
        addr_trans_ip: mapIPv4ToIpv6(self.ourIP),
        addr_trans_port: self.client.localPort,
        relay: false,
        mnauth_challenge: self.createMNAuthChallenge(),
      };
			console.debug({local: self.client.localAddress, p: self.client.localPort});
      self.setStatus("EXPECT_VERACK");
      self.client.write(Network.packet.version(versionPayload));
		});
    self.setStatus("NEEDS_AUTH");
    self.client.connect({
			port: self.port, 
			host: self.ip, 
			keepAlive: true,
			keepAliveInitialDelay: 3,
			//onread: {
			//	buffer: Buffer.alloc(2 * 1024),
			//	callback: function (bytesRead, buffer) {
			//		console.debug({bytesRead,buffer});
			//		//self.recvBufferChanged();
			//		return true;
			//	},
			//},
		}, function(){
    });
  };
}

let config = require('./.config.json');
let masterNodeIP = config.masterNodeIP;
let masterNodePort = config.masterNodePort;
let network = config.network;
let ourIP = config.ourIP;
let startBlockHeight = config.startBlockHeight;

let masterNodeConnection = new MasterNode({
  ip: masterNodeIP,
  port: masterNodePort,
  network,
  ourIP,
  startBlockHeight,
});

masterNodeConnection.connect();
