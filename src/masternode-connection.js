"use strict";
const Network = require("./network.js");
const crypto = require("crypto");
const { createHash } = crypto;
const net = require("net");
const COIN = require("./coin-join-constants.js").COIN;

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

/**
 * "constructor"
 */
function MasterNode({
  ip,
  port,
  network,
  ourIP,
  startBlockHeight,
  onStatusChange = null,
  debugFunction = null,
  userAgent = null,
}) {
  let self = this;
  /**
   * Our member variables
   */
  self.buffer = new Uint8Array();
  self.client = null;
  self.debugFunction = debugFunction;
  self.frames = [];
  self.userAgent = userAgent;
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
    mnauth: false,
  };
  self.ip = ip;
  self.mnauth_challenge = null;
  self.network = network;
  self.onStatusChange = onStatusChange;
  self.ourIP = ourIP;
  self.port = port;
  self.processDebounce = null;
  self.processRecvBuffer = null;
  self.recv = [];
  self.startBlockHeight = startBlockHeight;
  self.status = null;
  self.statusChangedAt = 0;

  /**
   * Member functions
   */
  self.debug = function (...args) {
    if (self.debugFunction) {
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
      self.handshakeStatePhase2.mnauth
    );
  };
  self.handshakePhase1Completed = function () {
    return (
      self.handshakeState.version &&
      self.handshakeState.verack &&
      self.handshakeState.sendaddrv2
    );
  };

  self.processCoinJoinRecvBuffer = function () {
    self.debugFunction("[+] processCoinJoinRecvBuffer");
    let i = PacketParser.extractItems(self.buffer, ["command", "payloadSize"]);
    let command = i[0];
    let payloadSize = i[1];
    self.debugFunction({ command, payloadSize });
    if (command === "getheaders") {
      let parsed = PacketParser.getheaders(self.buffer);
      payloadSize += parsed.hashes.length * 32;
      self.debugFunction({parsed,payloadSize});
    }
    if (command === "dssu") {
      let dssu = PacketParser.dssu(self.buffer);
      self.debugFunction("dssu:", dssu);
    }
    if (command === "ping") {
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
    if ("function" === typeof which) {
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
  self.getDefaultRecvFunctions = function () {
    return {
      coinjoin: self.processCoinJoinRecvBuffer,
      handshake: self.processHandshakeBuffer,
    };
  };
  self.processHandshakeBuffer = function () {
    self.debug("[+] processHandshakeBuffer");
    let i = PacketParser.extractItems(self.buffer, ["command", "payloadSize"]);
    let command = i[0];
    let payloadSize = i[1];

    self.debug({ command, payloadSize });
    if (self.status === "EXPECT_HCDP" || self.status === 'READY') {
      self.debug("EXPECT_HCDP status");
      while (self.buffer.length){
        command = PacketParser.commandName(self.buffer);
        payloadSize = PacketParser.payloadSize(self.buffer);
        switch (command) {
          case "getheaders":
            self.handshakeStatePhase2.getheaders = true;
            let parsed = PacketParser.getheaders(self.buffer);
            payloadSize += parsed.hashes.length * 32;
            break;
          case "mnauth":
            self.handshakeStatePhase2.mnauth = true;
            break;
          case "sendheaders":
            self.handshakeStatePhase2.sendheaders = true;
            break;
          case "sendcmpct":
            self.handshakeStatePhase2.sendcmpct = true;
            break;
          case "senddsq":
            self.handshakeStatePhase2.senddsq = true;
            self.setStatus("READY");
            break;
          case 'dssu':
            self.debugFunction({command,payloadSize});
            let packet = PacketParser.dssu(self.buffer);
            self.debugFunction(command,packet);
            break;
          case "ping":
            self.handshakeStatePhase2.ping = true;
            let nonce = PacketParser.extractPingNonce(self.buffer);
            self.client.write(
              Network.packet.pong({ chosen_network: network, nonce })
            );
            break;
          default:
            self.debug("defaulted:", { command, payloadSize });
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
        self.debug(
          "EXPECT_VERACK but VERSION_PACKET_MINIMUM_SIZE not met:",
          self.buffer.length,
          "expected:",
          VERSION_PACKET_MINIMUM_SIZE
        );
        return;
      }
      /**
       * Step 3: parse `version`, `verack`, and `sendaddrv2` from MN
       */
      /**
       * This means we have the following:
       * 1) version packet (24 byte header, plus variable payload size)
       * 2) verack packet (24 bytes)
       * 3) sendaddrv2 (24 bytes)
       */
      let command = PacketParser.commandName(self.buffer);
      let payloadSize = PacketParser.payloadSize(self.buffer);
      self.debug("processing handshakePhase1...", { command, payloadSize });
      while (
        self.buffer.length &&
        command.length &&
        self.handshakePhase1Completed() === false
      ) {
        payloadSize = PacketParser.payloadSize(self.buffer);
        if (command === "version") {
          self.debug("got version");
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
          self.debug("got verack", self.buffer);
          self.buffer = self.extract(
            self.buffer,
            MESSAGE_HEADER_SIZE,
            self.buffer.length
          );
          self.handshakeState.verack = true;
        } else if (command === "sendaddrv2") {
          self.debug("got sendaddrv2", self.buffer);
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
      self.debug("handshakePhase1Completed. EXPECT_VERACK is next");
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
    self.debug("reached end of function");
  };

    /**
   * Creates a socket descriptor and saves it to self.client.
   * The user may use self.client to write packets to the wire.
   * No message header is prefixed, so treat self.client.write as
   * a direct socket call.
   */
  self.connect = function () {
    /**
     * There's different phases in the MasterNode handshake.
     * This is one of them.
     * switchHandlerTo("handshake") will parse and verify
     * that all traffic needed to authenticate to a master node
     * is handled correctly.
     *
     * The underlying code will automatically change the handler to
     * "coinjoin" once all steps in the handshake process have been
     * parsed and completed.
     */
    self.switchHandlerTo("handshake");

    /**
     * Here we create the socket
     */
    self.client = new net.Socket();
    /**
     * We have to handle several events on this socket.
     */
    self.client.on("close", function () {
      self.setStatus("CLOSED");
      self.client.destroy();
    });
    self.client.on("error", function (err) {
      self.client.destroy();
    });

    /**
     * The "data" event is triggered when the socket receives
     * bytes off the wire. This is equivalent to a recv() system call
     * (see man 2 recv), except there is no user intervention needed
     * to receive data. Instead, it just comes off the wire whenever
     * the kernel gets data. There doesn't seem to be a way to manually
     * fetch data, unless you use pause/resume mechanics. See the node
     * docs for more info on that.
     */
    self.client.on("data", function (payload) {
      /**
       * This is an atomic operation
       */
      self.buffer = self.appendBuffer(self.buffer, payload);

      /**
       * Debouncing the call so that we can wait until
       * we have a larger amount of data before processing it.
       */
      if (self.processDebounce) {
        clearInterval(self.processDebounce);
      }
      self.processDebounce = setInterval(() => {
        self.processRecvBuffer();
        clearInterval(self.processDebounce);
        self.processDebounce = null;
      }, 200);
    });

    /**
     * As soon as we're connected, the "ready" event will
     * be emitted. This is will be our chance to send the
     * first packet. Masternodes expect a `version` message
     */
    self.client.on("ready", function () {
      /**
       * Step 2: once connected, send a `version` message
       */

      /**
       * see: https://dashcore.readme.io/docs/core-ref-p2p-network-control-messages#version
       */
      let versionPayload = {
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
      if (null !== self.userAgent) {
        versionPayload.user_agent = self.userAgent;
      }
      self.setStatus("EXPECT_VERACK");
      self.client.write(Network.packet.version(versionPayload));
    });
    /**
     * Step 1: connect to the remote host
     */
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
