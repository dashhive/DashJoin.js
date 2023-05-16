"use strict";
const Network = require("./network.js");
const crypto = require("crypto");
const { createHash } = crypto;
const net = require("net");
const { EventEmitter } = require("events");
const COIN = require('./coin-join-constants.js').COIN;

let Lib = {};
module.exports = Lib;

const {
  PROTOCOL_VERSION,
  MNAUTH_CHALLENGE_SIZE,
  TESTNET,
  SERVICE_IDENTIFIERS,
  MESSAGE_HEADER_SIZE,
  VERSION_PACKET_MINIMUM_SIZE,
  SENDHEADERS_PAYLOAD_SIZE /* (H) sendheaders payload */,
  SENDCMPCT_PAYLOAD_SIZE /* (C) sendcmpct payload */,
  SENDDSQ_PAYLOAD_SIZE /* (D) senddsq payload */,
  PING_PAYLOAD_SIZE /* (P) Ping message payload */,
  PING_NONCE_SIZE,
} = Network.constants;

const { mapIPv4ToIpv6 } = Network.util;
const PacketParser = Network.packet.parse;

let STATUSES = [
  "NEEDS_AUTH",
  "EXPECT_VERACK",
  "RESPOND_VERACK",
  /**
   * HCDP is an acronym for:
   * 'headers', 'cmpct', 'dsq', 'ping'
   * These corresspond to to the response of
   * the MN sending the following once you send a verack to
   * the MN:
   * - sendheaders
   * - sendcmpct
   * - senddsq
   * - ping
   */
  "EXPECT_HCDP",
  "READY",
];

function MasterNode({
  ip,
  port,
  network,
  ourIP,
  startBlockHeight,
  onStatusChange = null,
	debugFunction = null,
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
  self.events = new EventEmitter();
  self.onStatusChange = onStatusChange;
	self.debugFunction = debugFunction;
	self.debug = function(...args){
		if(self.debugFunction){
			self.debugFunction(...args);
		}
	};
  self.setStatus = function (s) {
    self.status = s;
    self.statusChangedAt = Date.now();
    if (self.onStatusChange) {
      self.onStatusChange({
        self,
      });
    }
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
  self.handshakeStatePhase2 = {
    sendaddrv2: false,
    sendheaders: false,
    sendcmpct: false,
    senddsq: false,
    ping: false,
  };
  self.extract = function (buffer, start, end) {
    if (start > end) {
      return new Uint8Array();
    }
    let extracted = new Uint8Array(end - start);
    let extractedIndex = 0;
    for (let i = start; i < end; i++) {
      extracted[extractedIndex++] = buffer[i];
    }
    return extracted;
  };
  self.clearBuffer = function () {
    self.buffer = new Uint8Array();
  };
  self.appendBuffer = function (dest, src) {
    let finalBuffer = new Uint8Array(dest.length + src.length);
    finalBuffer.set(dest, 0);
    finalBuffer.set(src, dest.length);
    return finalBuffer;
  };
  self.cutBuffer = function (buffer, start, end) {
    let finalBuffer = new Uint8Array(end - start);
    let k = 0;
    for (let i = start; i < end; i++) {
      finalBuffer.set([buffer[i]], k++);
    }
    return finalBuffer;
  };
  self.handshakePhase2Completed = function () {
    return (
      self.handshakeStatePhase2.sendheaders &&
      self.handshakeStatePhase2.sendcmpct &&
      self.handshakeStatePhase2.senddsq &&
      self.handshakeStatePhase2.ping &&
      self.handshakeStatePhase2.getheaders
    );
  };
  self.handshakePhase1Completed = function () {
    return (
      self.handshakeState.version &&
      self.handshakeState.verack &&
      self.handshakeState.sendaddrv2
    );
  };

  self.processDebounce = null;
  self.processRecvBuffer = null;
  self.processCoinJoinRecvBuffer = function () {
    self.debugFunction("[+] processCoinJoinRecvBuffer");
      let i = PacketParser.extractItems(self.buffer, [
        "command",
        "payloadSize",
      ]);
		let command = i[0];
		let payloadSize = i[1];
		self.debugFunction({command,payloadSize});
		if(command === 'ping'){
				let nonce = PacketParser.extractPingNonce(self.buffer);
				self.client.write(
					Network.packet.pong({ chosen_network: network, nonce })
				);
		}
		self.buffer = self.extract(
			self.buffer,
			MESSAGE_HEADER_SIZE + payloadSize,
			self.buffer.length
		);
  };
  self.switchHandlerTo = function (which) {
		if('function' === typeof which){
			self.processRecvBuffer = which;
			return;
		}
    switch (which) {
      case "coinjoin":
        self.processRecvBuffer = self.processCoinJoinRecvBuffer;
        break;
      case "handshake":
      default:
        self.processRecvBuffer = self.processHandshakeBuffer;
        break;
    }
  };
	self.getDefaultRecvFunctions = function(){
		return {
			'coinjoin': self.processCoinJoinRecvBuffer,
			'handshake': self.processHandshakeBuffer,
		};
	};
  self.processHandshakeBuffer = function () {
    self.debug("[+] processHandshakeBuffer");
    if (self.status === "EXPECT_HCDP") {
      self.debug("EXPECT_HCDP status");
      const HCDP_SIZE =
        MESSAGE_HEADER_SIZE * 4 +
        (SENDHEADERS_PAYLOAD_SIZE /* (H) sendheaders payload */ +
          SENDCMPCT_PAYLOAD_SIZE /* (C) sendcmpct payload */ +
          SENDDSQ_PAYLOAD_SIZE /* (D) senddsq payload */ +
          PING_PAYLOAD_SIZE) /* (P) Ping message payload */;
      if (self.buffer.length < HCDP_SIZE) {
        self.debug(`[-] Need more data:${self.buffer.length} need: ${HCDP_SIZE}`);
        return;
      }

      let i = PacketParser.extractItems(self.buffer, [
        "command",
        "payloadSize",
      ]);
      let command = i[0];
      let payloadSize = i[1];

      if (command === "getheaders") {
        self.handshakeStatePhase2.getheaders = true;
        let parsed = PacketParser.getheaders(self.buffer);
        payloadSize += parsed.hashes.length * 32;
        self.buffer = self.extract(
          self.buffer,
          MESSAGE_HEADER_SIZE + payloadSize,
          self.buffer.length
        );
        self.setStatus("READY");
        return;
      }
      while (self.buffer.length && self.handshakePhase2Completed() === false) {
        command = PacketParser.commandName(self.buffer);
        payloadSize = PacketParser.payloadSize(self.buffer);
        switch (command) {
          case "getheaders":
            self.handshakeStatePhase2.getheaders = true;
            let parsed = PacketParser.getheaders(self.buffer);
            payloadSize += parsed.hashes.length * 32;
            self.setStatus("READY");
      			self.switchHandlerTo("coinjoin");
            break;
          case "sendheaders":
            self.handshakeStatePhase2.sendheaders = true;
            break;
          case "sendcmpct":
            self.handshakeStatePhase2.sendcmpct = true;
            break;
          case "senddsq":
            self.handshakeStatePhase2.senddsq = true;
            break;
          case "ping":
            self.handshakeStatePhase2.ping = true;
            let nonce = PacketParser.extractPingNonce(self.buffer);
            self.client.write(
              Network.packet.pong({ chosen_network: network, nonce })
            );
            break;
          default:
            break;
        }
        self.buffer = self.extract(
          self.buffer,
          MESSAGE_HEADER_SIZE + payloadSize,
          self.buffer.length
        );
      }
    }
    if (self.status === "EXPECT_VERACK") {
      if (
        self.buffer.length <
        MESSAGE_HEADER_SIZE * 3 + VERSION_PACKET_MINIMUM_SIZE
      ) {
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
      while (
        self.buffer.length &&
        command.length &&
        self.handshakePhase1Completed() === false
      ) {
        payloadSize = PacketParser.payloadSize(self.buffer);
        if (command === "version") {
          self.masterNodeVersion = self.extract(
            self.buffer,
            0,
            MESSAGE_HEADER_SIZE + payloadSize
          );
          self.buffer = self.extract(
            self.buffer,
            MESSAGE_HEADER_SIZE + payloadSize,
            self.buffer.length
          );
          self.handshakeState.version = true;
        } else if (command === "verack") {
          self.buffer = self.extract(
            self.buffer,
            MESSAGE_HEADER_SIZE,
            self.buffer.length
          );
          self.handshakeState.verack = true;
        } else if (command === "sendaddrv2") {
          self.buffer = self.extract(
            self.buffer,
            MESSAGE_HEADER_SIZE,
            self.buffer.length
          );
          self.handshakeState.sendaddrv2 = true;
        }
        command = PacketParser.commandName(self.buffer);
      }
    }
    if (self.handshakePhase1Completed() && self.status === "EXPECT_VERACK") {
      self.clearBuffer();
      self.setStatus("RESPOND_VERACK");
      self.client.write(
        Network.packet.verack({ chosen_network: network }),
        function () {
          self.debug("[+] Done sending verack");
          self.setStatus("EXPECT_HCDP");
        }
      );
      return;
    }
  };
  self.connect = function () {
    self.switchHandlerTo("handshake");
    self.client = new net.Socket();
    self.client.on("close", function () {
      self.setStatus("CLOSED");
      self.client.destroy();
    });
    self.client.on("error", function (err) {
      self.client.destroy();
    });
    self.client.on("data", function (payload) {
      self.buffer = self.appendBuffer(self.buffer, payload);
      if (self.processDebounce) {
        clearInterval(self.processDebounce);
      }
      self.processDebounce = setInterval(() => {
        self.processRecvBuffer();
        clearInterval(self.processDebounce);
        self.processDebounce = null;
      }, 500);
    });
    self.client.on("ready", function () {
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

Lib.MasterNodeConnection = MasterNode;
