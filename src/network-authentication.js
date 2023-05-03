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
	MESSAGE_HEADER_SIZE,
	VERSION_PACKET_MINIMUM_SIZE,
} = Network.constants;

const { mapIPv4ToIpv6 } = Network.util;
const PacketParser = Network.packet.parse;

//let activeConnections = [];
function MasterNode({
  ip,
  port,
  network,
  ourIP,
  startBlockHeight,
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
	self.frames = [];
	self.needMoreData = false;
	self.buffer = new Uint8Array();
	self.handshakeState = {
		version: false,
		verack: false,
		sendaddr: false,
	};
	self.extract = function(buffer,start,end){
		if(start > end){
			return new Uint8Array();
		}
		let extracted = new Uint8Array(end - start);
		let extractedIndex = 0;
		for(let i=start; i < end;i++){
			extracted[extractedIndex++] = buffer[i];
		}
		return extracted;
	};
	self.appendBuffer = function(dest,src){
		let finalBuffer = new Uint8Array(dest.length + src.length);
		finalBuffer.set(dest,0);
		finalBuffer.set(src,dest.length);
		return finalBuffer;
	};
	self.cutBuffer = function(buffer,start,end){
		let finalBuffer = new Uint8Array(end - start);
		let k = 0;
		for(let i=start; i < end; i++){
			finalBuffer.set([buffer[i]],k++);
		}
		return finalBuffer;
	};
	self.handshakeCompleted = function(){
		return self.handshakeState.version && self.handshakeState.verack && self.handshakeState.sendaddr;
	};

	self.processDebounce = null;
	self.processRecvBuffer = function(){
		if(self.status === 'EXPECT_VERACK'){
			if(self.buffer.length < (MESSAGE_HEADER_SIZE * 3) + VERSION_PACKET_MINIMUM_SIZE){
				return;
			}
			/**
			 * This means we have the following:
			 * 1) version packet (24 byte header, plus variable payload size)
			 * 2) verack packet (24 bytes)
			 * 3) sendaddrv2 (24 bytes)
			 */
			let command = PacketParser.commandName(self.buffer);
			let payloadSize = PacketParser.payloadSize(self.buffer);
			while(self.buffer.length && command.length && self.handshakeCompleted() === false){
				if(command === 'version'){
					self.masterNodeVersion = self.extract(self.buffer,0,MESSAGE_HEADER_SIZE + payloadSize);
					self.buffer = self.extract(self.buffer,MESSAGE_HEADER_SIZE + payloadSize,self.buffer.length);
					self.handshakeState.version = true;
				}else if(command === 'verack'){
					self.buffer = self.extract(self.buffer,MESSAGE_HEADER_SIZE,self.buffer.length);
					self.handshakeState.verack = true;
				}else if(command === 'sendaddr'){
					self.buffer = self.extract(self.buffer,MESSAGE_HEADER_SIZE,self.buffer.length);
					self.handshakeState.sendaddr = true;
				}
				command = PacketParser.commandName(self.buffer);
			}
		}
		if(self.handshakeCompleted()){
			self.setStatus('READY');
		}
	};
  self.connect = function () {
    self.client = new net.Socket();
		self.client.on("close", function () {
			self.setStatus("CLOSED");
			self.client.destroy();
		});
		self.client.on('error', function(err) {
			self.client.destroy();
		});
		self.client.on("data", function (payload) {
			self.buffer = self.appendBuffer(self.buffer,payload);
			if(self.processDebounce) {
				clearInterval(self.processDebounce);
			}
			self.processDebounce = setInterval(() => {
				self.processRecvBuffer();
				clearInterval(self.processDebounce);
				self.processDebounce = null;
			},500);
		});
		self.client.on('ready', function(){
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
      self.setStatus("EXPECT_VERACK");
      self.client.write(Network.packet.version(versionPayload));
		});
    self.setStatus("NEEDS_AUTH");
    self.client.connect({
			port: self.port, 
			host: self.ip, 
			keepAlive: true,
			keepAliveInitialDelay: 3,
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
