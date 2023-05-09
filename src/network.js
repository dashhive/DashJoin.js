"use strict";
/**
 * There are places in the code where we speak of ipv6 addresses.
 * Where posisble, we note with the string 'ipv4-mapped'. If you
 * see this, it means that the variable or object expects a IPv6
 * IP address, with the exception that it can be a "IPv4-mapped IPv6 address".
 * See: http://en.wikipedia.org/wiki/IPv6#IPv4-mapped_IPv6_addresses
 */
const net = require("net");
const crypto = require("crypto");
const { createHash } = crypto;

let Lib = {};
module.exports = Lib;

const PROTOCOL_VERSION = 70227;
const RELAY_PROTOCOL_VERSION_INTRODUCTION = 70001;
const MNAUTH_PROTOCOL_VERSION_INTRODUCTION = 70214;
const MNAUTH_CHALLENGE_SIZE = 32;
const PING_NONCE_SIZE = 8;
const MAINNET = "mainnet";
const TESTNET = "testnet";
const DEVNET = "devnet";
const REGTEST = "regtest";
const VALID_NETS = [MAINNET, TESTNET, DEVNET, REGTEST];
const MAINNET_PORT = 9999;
const TESTNET_PORT = 19999;
const REGTEST_PORT = 19899;
const DEVTEST_PORT = 19799;
const MAX_PAYLOAD_SIZE = 0x02000000;
const MSG_HEADER = {
	MAGIC: 4,
	COMMAND: 12,
	PAYLOAD: 4,
	CHECKSUM: 4,
};
let MESSAGE_HEADER_SIZE = 0;
for(let key in MSG_HEADER){
	MESSAGE_HEADER_SIZE += MSG_HEADER[key];
}
const PAYLOAD_OFFSET = MSG_HEADER.MAGIC + MSG_HEADER.COMMAND;
const SENDHEADERS_PAYLOAD_SIZE = 0;
const SENDCMPCT_PAYLOAD_SIZE = 9;
const SENDDSQ_PAYLOAD_SIZE = 1;
const PING_PAYLOAD_SIZE = 8;

const getVersionSizes = function(){
  let SIZES = {
    VERSION: 4,
    SERVICES: 8,
    TIMESTAMP: 8,
    ADDR_RECV_SERVICES: 8,
    ADDR_RECV_IP: 16,
    ADDR_RECV_PORT: 2,
    ADDR_TRANS_SERVICES: 8,
    ADDR_TRANS_IP: 16,
    ADDR_TRANS_PORT: 2,
    NONCE: 8,
    USER_AGENT_BYTES: 1, // can be skipped
    USER_AGENT_STRING: 0,
    START_HEIGHT: 4,
    // The following 2 fields are OPTIONAL
    RELAY: 0,
    MNAUTH_CHALLENGE: 0,
  };
	return SIZES;
};
let VERSION_PACKET_MINIMUM_SIZE = 0;
(function(){
	VERSION_PACKET_MINIMUM_SIZE = 0;
	let sizes = getVersionSizes();
	for(let key in sizes){
		VERSION_PACKET_MINIMUM_SIZE += sizes[key];
	}
})();

const NETWORKS = {
  [MAINNET]: {
    port: MAINNET_PORT,
    magic: new Uint8Array([
      //0xBD6B0CBF,
      0xbf, 0x0c, 0x6b, 0xbd,
    ]),
    start: 0xbf0c6bbd,
    nBits: 0x1e0ffff0,
  },
  [TESTNET]: {
    port: TESTNET_PORT,
    magic: new Uint8Array([
      //0xFFCAE2CE,
      0xce, 0xe2, 0xca, 0xff,
    ]),
    start: 0xcee2caff,
    nBits: 0x1e0ffff0,
  },
  [REGTEST]: {
    port: REGTEST_PORT,
    magic: new Uint8Array([
      //0xDCB7C1FC,
      0xfc, 0xc1, 0xb7, 0xdc,
    ]),
    start: 0xfcc1b7dc,
    nBits: 0x207fffff,
  },
  [DEVNET]: {
    port: DEVTEST_PORT,
    magic: new Uint8Array([
      //0xCEFFCAE2,
      0xe2, 0xca, 0xff, 0xce,
    ]),
    start: 0xe2caffce,
    nBits: 0x207fffff,
  },
};
const RELAY_SIZE = 1;

let SERVICE_IDENTIFIERS = {
  /**
   * NODE_UNNAMED:
   * 	This node is not a full node. It may not be
   * 	able to provide any data except for the
   * 	transactions it originates.
   */
  NODE_UNNAMED: 0x00,
  /**
   * NODE_NETWORK:
   * 	This is a full node and can be asked for full
   * 	blocks. It should implement all protocol features
   * 	available in its self-reported protocol version.
   */
  NODE_NETWORK: 0x01,
  /**
   * NODE_GETUTXO:
   * 	This node is capable of responding to the getutxo
   * 	protocol request. Dash Core does not support
   * 	this service.
   */
  NODE_GETUTXO: 0x02,
  /**
   * NODE_BLOOM:
   * 	This node is capable and willing to handle bloom-
   * 	filtered connections. Dash Core nodes used to support
   * 	this by default, without advertising this bit, but
   * 	no longer do as of protocol version 70201
   * 	(= NO_BLOOM_VERSION)
   */
  NODE_BLOOM: 0x04,
  /**
   * NODE_XTHIN:
   * 	This node supports Xtreme Thinblocks. Dash Core
   * 	does not support this service.
   */
  NODE_XTHIN: 0x08,
  /**
   * NODE_NETWORK_LIMITED:
   * 	This is the same as NODE_NETWORK with the
   * 	limitation of only serving the last 288 blocks.
   * 	Not supported prior to Dash Core 0.16.0
   */
  NODE_NETWORK_LIMITED: 0x400,
};
Lib.constants = {
	PING_NONCE_SIZE,
  NETWORKS,
  PROTOCOL_VERSION,
  RELAY_PROTOCOL_VERSION_INTRODUCTION,
  MNAUTH_PROTOCOL_VERSION_INTRODUCTION,
  MNAUTH_CHALLENGE_SIZE,
  MAINNET,
  TESTNET,
  DEVNET,
  REGTEST,
  VALID_NETS,
  RELAY_SIZE,
  SERVICE_IDENTIFIERS,
	MESSAGE_HEADER_SIZE,
	MSG_HEADER,
	VERSION_PACKET_MINIMUM_SIZE,
	SENDHEADERS_PAYLOAD_SIZE,
	SENDCMPCT_PAYLOAD_SIZE,
	SENDDSQ_PAYLOAD_SIZE,
	PING_PAYLOAD_SIZE,
};
function allZeroes(buffer){
	for(let ch of buffer){
		if(ch !== 0){
			return false;
		}
	}
	return true;
}

function str2uint8 (text) {
  return Uint8Array.from(
    Array.from(text).map((letter) => letter.charCodeAt(0))
  );
}
function extractUint32 (data,at) {
	let uiArray = new Uint32Array([0]);
	for(let i=at; i < at + 4;i++){
		uiArray[0] += data[at];
	}
	return uiArray[0];
}
function extractChunk(buffer,start,end){
	let uiArray = new Uint8Array(end - start);
	let k = 0;
	for(let i=start; i < end;i++,k++){
		uiArray[k] = buffer[i];
	}
	return uiArray;
}
function setUint32(pkt, data, at) {
  pkt.set(new Uint8Array(new Uint32Array([data]).buffer), at);
  return pkt;
};
function dot2num(dot) {
  // the same as ip2long in php
  var d = dot.split(".");
  return (+d[0] << 24) + (+d[1] << 16) + (+d[2] << 8) + +d[3];
}

function num2array(num) {
  return [
    (num & 0xff000000) >>> 24,
    (num & 0x00ff0000) >>> 16,
    (num & 0x0000ff00) >>> 8,
    num & 0x000000ff,
  ];
}

function htonl(x) {
  return dot2num(num2array(x).reverse().join("."));
}
function is_ipv6_mapped_ipv4(ip) {
  return !!ip.match(/^[:]{2}[f]{4}[:]{1}.*$/);
}

/**
 * Convert a 16-bit quantity (short integer) from host byte order to network byte order (Little-Endian to Big-Endian).
 *
 * @param {Array|Buffer} b Array of octets or a nodejs Buffer
 * @param {number} i Zero-based index at which to write into b
 * @param {number} v Value to convert
 */
const htons = function (b, i, v) {
  b[i] = 0xff & (v >> 8);
  b[i + 1] = 0xff & v;
};
const mapIPv4ToIpv6 = function (ip) {
  return "::ffff:" + ip;
};
Lib.util = {
  str2uint8,
  setUint32,
  dot2num,
  num2array,
  htonl,
  is_ipv6_mapped_ipv4,
  htons,
  mapIPv4ToIpv6,
};

/**
 * First 4 bytes of SHA256(SHA256(payload)) in internal byte order.
 */
const compute_checksum = (payload) => {
  let hash = createHash("sha256").update(payload).digest();
  let hashOfHash = createHash("sha256").update(hash).digest();
  return hashOfHash.slice(0, 4);
};

const wrap_packet = (net, command_name, payload, payload_size) => {
  const SIZES = {
    MAGIC_BYTES: 4,
    COMMAND_NAME: 12,
    PAYLOAD_SIZE: 4,
    CHECKSUM: 4,
  };
  let TOTAL_SIZE = 0;
  for (const key in SIZES) {
    TOTAL_SIZE += SIZES[key];
  }
  TOTAL_SIZE += payload_size;

  let packet = new Uint8Array(TOTAL_SIZE);
  packet.set(NETWORKS[net].magic, 0);

  /**
   * Set command_name (char[12])
   */
  let COMMAND_NAME_OFFSET = SIZES.MAGIC_BYTES;
  packet.set(str2uint8(command_name), COMMAND_NAME_OFFSET);

  let PAYLOAD_SIZE_OFFSET = COMMAND_NAME_OFFSET + SIZES.COMMAND_NAME;
  let CHECKSUM_OFFSET = PAYLOAD_SIZE_OFFSET + SIZES.PAYLOAD_SIZE;
  if (payload_size === 0 || payload === null) {
    packet.set([0x5d,0xf6,0xe0,0xe2], CHECKSUM_OFFSET);
    return packet;
  }
  packet = setUint32(packet, payload_size, PAYLOAD_SIZE_OFFSET);
  packet.set(compute_checksum(payload), CHECKSUM_OFFSET);
  /**
   * Finally, append the payload to the header
   */
  let ACTUAL_PAYLOAD_OFFSET = CHECKSUM_OFFSET + SIZES.CHECKSUM;
  packet.set(payload, ACTUAL_PAYLOAD_OFFSET);
  return packet;
};

Lib.net = {
  compute_checksum,
  wrap_packet,
};

/**
 * The arguments to this function closely follow the variable names
 * used on this page: https://dashcore.readme.io/docs/core-ref-p2p-network-control-messages#version
 * DO NOT convert any values from host to network byte order! The
 * function will handle that for you!
 */
const version = function (
  args = {
    /**
     * Required.
     *
     * Must be one of the values in NETWORKS constant above.
     */
    chosen_network,
    /**
     * Required.
     */
    protocol_version,
    /**
     * Required.
     */
    services,
    /**
     * Required.
     */
    addr_recv_services,
    /**
     * Required.
     *
     * addr_recv_ip is the ipv6 address of the master node (can be 'ipv4-mapped')
     *
     * DO NOT convert to big endian!
     */
    addr_recv_ip,
    /**
     * Required.
     *
     * This has to be the port on the master node that you're connecting to.
     * This is sometimes a port like 9999, 19999, but it can sometimes be
     * a port chosen by the masternode owners themselves.
     *
     * DO NOT convert to big endian!
     */
    addr_recv_port,

    /**
     * Required.
     *
     * This has to be the IPv6 IP of our machine (can be 'ipv4-mapped').
     * If you're not sure, leave it null and the library will fill it for you.
     *
     * DO NOT convert to big endian!
     */
    addr_trans_ip,
    /**
     * Required.
     *
     * This is the port that corresponds to your current socket connection
     * to the master node. Usually, the operating system gives you a random
     * port.
     *
     * DO NOT convert to big endian!
     */
    addr_trans_port,

    /**
     * Required.
     *
     * Start height of your best block chain.
     */
    start_height,

    /**
     * Optional.
     *
     * If you specify a nonce, be prepared to see that value in verack messages.
     */
    nonce: null,

    /**
     * Optional.
     *
     * If you'd like to, you can specify a user agent as a string of bytes.
     */
    user_agent: null,

    /**
     * Optional.
     *
     * If you specify a protocol_version that
     * is before 70001, this will be ignored.
     * This is a bit of a complex field, so I would suggest you
     * checkout the docs below.
     *
     * If you're not sure, just leave it as null or 0x00.
     * @see https://dashcore.readme.io/docs/core-ref-p2p-network-control-messages#version
     */
    relay: null,

    /**
     * Optional.
     *
     * If you pass in a protocol_version that is less than 70214,
     * this field will be ignored.
     *
     * Use this field if you want a signed response by the masternode
     * in it's verack message. See the docs for more info.
     *
     */
    mnauth_challenge: null,
  }
) {
  const cmd = "version";

  let SIZES = getVersionSizes();

  if (!VALID_NETS.includes(args.chosen_network)) {
    throw new Error(`"chosen_network" is invalid.`);
  }
  if (!Array.isArray(args.services)) {
    throw new Error('"services" needs to be an array');
  }
  if (
    args.protocol_version < RELAY_PROTOCOL_VERSION_INTRODUCTION &&
    "undefined" !== typeof args.relay
  ) {
    throw new Error(
      `"relay" field is not supported in protocol versions prior to ${RELAY_PROTOCOL_VERSION_INTRODUCTION}`
    );
  }
  if (
    args.protocol_version < MNAUTH_PROTOCOL_VERSION_INTRODUCTION &&
    "undefined" !== typeof args.mnauth_challenge
  ) {
    throw new Error(
      `"mnauth_challenge" field is not support in protocol versions prior to ${MNAUTH_CHALLENGE_OFFSET}`
    );
  }
  if ("undefined" !== typeof args.mnauth_challenge) {
    if (!(args.mnauth_challenge instanceof Uint8Array)) {
      throw new Error(`"mnauth_challenge" field must be a Uint8Array`);
    }
    if (args.mnauth_challenge.length !== MNAUTH_CHALLENGE_SIZE) {
      throw new Error(
        `"mnauth_challenge" field must be ${MNAUTH_CHALLENGE_SIZE} bytes long`
      );
    }
  }
  if ("undefined" !== typeof args.relay) {
    SIZES.RELAY = RELAY_SIZE;
  }
  if ("undefined" !== typeof args.mnauth_challenge) {
    SIZES.MNAUTH_CHALLENGE = MNAUTH_CHALLENGE_SIZE;
  }
  if (
    "undefined" !== typeof args.user_agent &&
    "string" === typeof args.user_agent
  ) {
    SIZES.USER_AGENT_STRING = args.user_agent.length;
  }

  let TOTAL_SIZE = 0;

  for (const key in SIZES) {
    TOTAL_SIZE += SIZES[key];
  }
  let packet = new Uint8Array(TOTAL_SIZE);
  // Protocol version

  packet = setUint32(packet, args.protocol_version, 0);
  /**
   * Set services to NODE_NETWORK (1) + NODE_BLOOM (4)
   */
  const SERVICES_OFFSET = SIZES.VERSION;
  let services = 0;
  for (const service of args.services) {
    services += service;
  }
  packet.set([services], SERVICES_OFFSET);

  const TIMESTAMP_OFFSET = SERVICES_OFFSET + SIZES.SERVICES;
  packet = setUint32(packet, Date.now(), TIMESTAMP_OFFSET);

  let ADDR_RECV_SERVICES_OFFSET = TIMESTAMP_OFFSET + SIZES.TIMESTAMP;
  packet.set([services], ADDR_RECV_SERVICES_OFFSET);

  /**
   * "ADDR_RECV" means the host that we're sending this traffic to.
   * So, in other words, it's the master node
   */
  let ADDR_RECV_IP_OFFSET =
    ADDR_RECV_SERVICES_OFFSET + SIZES.ADDR_RECV_SERVICES;
  let ipBytes = dot2num(args.addr_recv_ip);
  let inv = htonl(ipBytes);
  packet = setUint32(packet, inv, ADDR_RECV_IP_OFFSET);

  /**
   * Copy address recv port
   */
  let ADDR_RECV_PORT_OFFSET = ADDR_RECV_IP_OFFSET + SIZES.ADDR_RECV_IP;
  let portBuffer = new Uint8Array(2);
  htons(portBuffer, 0, args.addr_recv_port);
  packet.set(portBuffer, ADDR_RECV_PORT_OFFSET);

  /**
   * Copy address transmitted services
   */
  let ADDR_TRANS_SERVICES_OFFSET = ADDR_RECV_PORT_OFFSET + SIZES.ADDR_RECV_PORT;
  packet.set([services], ADDR_TRANS_SERVICES_OFFSET);

  /**
   * We add the extra 10, so that we can encode an ipv4-mapped ipv6 address
   */
  let ADDR_TRANS_IP_OFFSET =
    ADDR_TRANS_SERVICES_OFFSET + SIZES.ADDR_TRANS_SERVICES;
  let transmittingIP = args.addr_trans_ip;
  if (is_ipv6_mapped_ipv4(transmittingIP)) {
    let ipBytes = dot2num(transmittingIP.split(":").reverse()[0]);
    let inv = htonl(ipBytes);
    packet = setUint32(packet, inv, ADDR_TRANS_IP_OFFSET + 12);
    let encodedIP = [0xff, 0xff];
    packet.set([0xff, 0xff], ADDR_TRANS_IP_OFFSET + 10); // we add the 10 so that we can fill the latter 6 bytes
  } else {
    /** TODO: */
  }

  let ADDR_TRANS_PORT_OFFSET = ADDR_TRANS_IP_OFFSET + SIZES.ADDR_TRANS_IP;
  portBuffer = new Uint8Array(2);
  htons(portBuffer, 0, args.addr_trans_port);
  packet.set(portBuffer, ADDR_TRANS_PORT_OFFSET);

  // this can be left zero
  let NONCE_OFFSET = ADDR_TRANS_PORT_OFFSET + SIZES.ADDR_TRANS_PORT;
  if ("undefined" !== typeof args.nonce) {
    if (args.nonce instanceof Uint8Array) {
      packet.set(args.nonce, NONCE_OFFSET);
    } else {
      throw new Error(`"nonce" field must be an array of 8 bytes`);
    }
  } else {
    packet.set(new Uint8Array(SIZES.NONCE), NONCE_OFFSET);
  }

  let USER_AGENT_BYTES_OFFSET = NONCE_OFFSET + SIZES.NONCE;
  if ("undefined" !== typeof args.user_agent) {
    let userAgentSize = args.user_agent.length;
    packet.set([userAgentSize], USER_AGENT_BYTES_OFFSET);
    packet.set(str2uint8(args.user_agent), USER_AGENT_BYTES_OFFSET + 1);
  } else {
    packet.set([0x0], USER_AGENT_BYTES_OFFSET);
  }

  // Skipping user agent. it can be zero
  let START_HEIGHT_OFFSET =
    USER_AGENT_BYTES_OFFSET + SIZES.USER_AGENT_BYTES + SIZES.USER_AGENT_STRING;
  packet = setUint32(packet, args.start_height, START_HEIGHT_OFFSET);

  let RELAY_OFFSET = START_HEIGHT_OFFSET + SIZES.START_HEIGHT;
  if ("undefined" !== typeof args.relay) {
    packet.set([args.relay ? 0x01 : 0x00], RELAY_OFFSET);
  }

  let MNAUTH_CHALLENGE_OFFSET = RELAY_OFFSET + SIZES.RELAY;
  if ("undefined" !== typeof args.mnauth_challenge) {
    packet.set(args.mnauth_challenge, MNAUTH_CHALLENGE_OFFSET);
  }
  packet = wrap_packet(args.chosen_network, "version", packet, TOTAL_SIZE);
  return packet;
};
const getaddr = function () {
  const cmd = "getaddr";
  const MAGIC_BYTES_SIZE = 4;
  const COMMAND_SIZE = 12;
  const PAYLOAD_SIZE = 4;
  const CHECKSUM_SIZE = 4;
  const TOTAL_SIZE =
    MAGIC_BYTES_SIZE + COMMAND_SIZE + PAYLOAD_SIZE + CHECKSUM_SIZE;
  let packet = new Uint8Array(TOTAL_SIZE);
  // TESTNET magic bytes
  packet[0] = 0xce;
  packet[1] = 0xe2;
  packet[2] = 0xca;
  packet[3] = 0xff;
  // point us to the beginning of the command name char[12]
  let cmdArray = str2uint8(cmd);
  packet.set(cmdArray, MAGIC_BYTES_SIZE);

  packet.set(
    [0x5d, 0xf6, 0xe0, 0xe2],
    MAGIC_BYTES_SIZE + COMMAND_SIZE + PAYLOAD_SIZE
  );
  return packet;
};

const ping_message = function () {
  /**
   * FIXME: add network and adjust magic bytes accordingly
   */
  const NONCE = "12340000";
  const cmd = "ping";
  const MAGIC_BYTES_SIZE = 4;
  const COMMAND_SIZE = 12;
  const PAYLOAD_SIZE = 4;
  const CHECKSUM_SIZE = 4;
  const NONCE_SIZE = 8;
  const TOTAL_SIZE =
    MAGIC_BYTES_SIZE + COMMAND_SIZE + PAYLOAD_SIZE + CHECKSUM_SIZE + NONCE_SIZE;
  let packet = new Uint8Array(TOTAL_SIZE);
  // TESTNET magic bytes
  packet[0] = 0xce;
  packet[1] = 0xe2;
  packet[2] = 0xca;
  packet[3] = 0xff;
  // point us to the beginning of the command name char[12]
  let cmdArray = str2uint8(cmd);
  packet.set(cmdArray, MAGIC_BYTES_SIZE);
  // fill the payload
  packet.set([0, 0, 0, 0x08], MAGIC_BYTES_SIZE + COMMAND_SIZE);

  //// fill the checksum
  let hash = createHash("sha256").update(NONCE).digest();
  let hashOfHash = createHash("sha256").update(hash).digest();
  let arr = hashOfHash.slice(0, 4);
  packet.set(arr, MAGIC_BYTES_SIZE + COMMAND_SIZE + PAYLOAD_SIZE);

  let nonceArray = str2uint8(NONCE);
  // fill the nonce
  packet.set(
    nonceArray,
    MAGIC_BYTES_SIZE + COMMAND_SIZE + PAYLOAD_SIZE + CHECKSUM_SIZE
  );
  return packet;
};
function pong(args = {
	chosen_network,
	nonce,
}) {
	let nonceBuffer = new Uint8Array(PING_NONCE_SIZE);
	nonceBuffer.set(args.nonce,0);
  return wrap_packet(args.chosen_network, 'pong', nonceBuffer, PING_NONCE_SIZE);
};
function verack(args = {
	chosen_network,
}) {
  return wrap_packet(args.chosen_network, 'verack', null, 0);
};
function sendaddrv2(args = {
	chosen_network,
}) {
  return wrap_packet(args.chosen_network, 'sendaddrv2', null, 0);
};
function sendaddr(args = {
	chosen_network,
}) {
  return wrap_packet(args.chosen_network, 'sendaddr', null, 0);
};

Lib.packet = {
  version,
  //ping_message,
  getaddr,
	verack,
	sendaddrv2,
	sendaddr,
	parse: {},
	pong,
};

Lib.packet.messagesWithNoPayload = [
	'filterclear',
	'getaddr',
	'getsporks',
	'mempool',
	'sendaddr',
	'sendaddrv2',
	'sendheaders',
	'sendheaders2',
	'verack',
];
Lib.packet.parse.extractPingNonce = function(buffer){
	let offset = MESSAGE_HEADER_SIZE;
	let k = 0;
	let buf = new Uint8Array(PING_NONCE_SIZE);
	for(let i=offset; i < MESSAGE_HEADER_SIZE + PING_NONCE_SIZE; i++,k++){
		buf[k] = buffer[i];
	}
	return buf;
}
Lib.packet.parse.hasPayload = function(buffer){
	if(!(buffer instanceof Uint8Array)){
		throw new Error('Must be an instance of Uint8Array');
	}
	return !Lib.packet.messagesWithNoPayload.includes(Lib.packet.parse.commandName(buffer));
};
Lib.packet.parse.payloadSize = function(buffer){
	if(!(buffer instanceof Uint8Array)){
		throw new Error('Must be an instance of Uint8Array');
	}
	if(buffer.length < MESSAGE_HEADER_SIZE){
		return null;
	}
	let uiBuffer = new Uint32Array([0]);
	uiBuffer[0] = buffer[PAYLOAD_OFFSET];
	uiBuffer[0] += buffer[PAYLOAD_OFFSET+1];
	uiBuffer[0] += buffer[PAYLOAD_OFFSET+2];
	uiBuffer[0] += buffer[PAYLOAD_OFFSET+3];
	return uiBuffer[0];
};
Lib.packet.parse.magicBytes = function(buffer){
	if(!(buffer instanceof Uint8Array)){
		throw new Error('Must be an instance of Uint8Array');
	}
	let copy = new Uint8Array(4);
	for(let i=0; i < 4;i++){
		copy[i] = buffer[i];
	}
	return copy;
};

Lib.packet.parse.identifyMagicBytes = function(buffer){
	let bytes = Lib.packet.parse.magicBytes(buffer);

	for(let key in NETWORKS){
		let bytesMatched = 0;
		for(let i=0; i < 4;i++){
			if(NETWORKS[key].magic[i] !== buffer[i]){
				bytesMatched = 0;
				break;
			}
			++bytesMatched;
		}
		if(bytesMatched === 4){
			return key;
		}
	}
	return null;
};

Lib.packet.parse.commandName = function(buffer){
	if(!(buffer instanceof Uint8Array)){
		throw new Error('Must be an instance of Uint8Array');
	}
	let cmd = '';
	for(let i=4; i < 16 && buffer[i] !== 0x0;++i){
		cmd += String.fromCharCode(buffer[i]);
	}
	return cmd;
};

Lib.packet.parse.getheaders = function(buffer){
	if(!(buffer instanceof Uint8Array)){
		throw new Error('Must be an instance of Uint8Array');
	}
	let commandName = Lib.packet.parse.commandName(buffer);
	if(commandName !== 'getheaders'){
		throw new Error('Not a getheaders packet');
	}
	let parsed = {
		version: new Uint8Array(4),
		hashCount: 0,
		hashes: [],
	};
	/**
	 * getheaders message structure:
	 * version 							- 4 bytes
	 * hash count 					- varies
	 * block header hashes 	- varies
	 */
	for(let i = 0; i < 4; i++){
		parsed.version[i] = buffer[i];
	}
	parsed.hashCount = extractUint32(buffer,4);
	const OFFSET = 8;
	const HASH_SIZE = 32;
	let hash = new Uint8Array(32);
	for(let i=0; i < parsed.hashCount;i++){
		hash = extractChunk(buffer,OFFSET + (i * HASH_SIZE),OFFSET + ( i * HASH_SIZE) + HASH_SIZE);
		if(allZeroes(hash)){
			continue;
		}
		parsed.hashes.push(hash);
	}
	parsed.hashCount = parsed.hashes.length;
	return parsed;
};
