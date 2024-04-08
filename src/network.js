'use strict';
/**
 * There are places in the code where we speak of ipv6 addresses.
 * Where posisble, we note with the string 'ipv4-mapped'. If you
 * see this, it means that the variable or object expects a IPv6
 * IP address, with the exception that it can be a "IPv4-mapped IPv6 address".
 * See: http://en.wikipedia.org/wiki/IPv6#IPv4-mapped_IPv6_addresses
 */
const LibCliSign = require('./cli-sign.js');
const crypto = require('crypto');
const { createHash } = crypto;
const NetUtil = require('./network-util.js');
const COIN = require('./coin-join-constants.js').COIN;
const hashByteOrder = NetUtil.hashByteOrder;
const DashCore = require('@dashevo/dashcore-lib');
const Transaction = DashCore.Transaction;
const Address = DashCore.Address;
const assert = require('assert');
const FileLib = require('./file.js');
const DebugLib = require('./debug.js');
const { d } = DebugLib;

const Lib = { packet: { parse: {} } };
module.exports = Lib;

const PROTOCOL_VERSION = 70227;
const RELAY_PROTOCOL_VERSION_INTRODUCTION = 70001;
const MNAUTH_PROTOCOL_VERSION_INTRODUCTION = 70214;
const MNAUTH_CHALLENGE_SIZE = 32;
const PING_NONCE_SIZE = 8;
const MAINNET = 'mainnet';
const TESTNET = 'testnet';
const DEVNET = 'devnet';
const REGTEST = 'regtest';
//const DEVNET_PS = 'devnet-privatesend';
const VALID_NETS = [MAINNET, TESTNET, DEVNET, REGTEST];
const MAINNET_PORT = 9999;
const TESTNET_PORT = 19999;
const REGTEST_PORT = 19899;
const DEVTEST_PORT = 19799;
//const DEVNET_PS_PORT = 19999;
//const MAX_PAYLOAD_SIZE = 0x02000000;
const MSG_HEADER = {
	MAGIC: 4,
	COMMAND: 12,
	PAYLOAD: 4,
	CHECKSUM: 4,
};

let POOL_STATE_VALUES = {
	IDLE: 0,
	QUEUE: 1,
	ACCEPTING_ENTRIES: 2,
	SIGNING: 3,
	ERROR: 4,
	SUCCESS: 5,
};
let POOL_STATE_HUSK = {
	toString: function (i) {
		for (const psKey in POOL_STATE_VALUES) {
			if (POOL_STATE_VALUES[psKey] === i) {
				return String(psKey);
			}
		}
	},
};
const POOL_STATE = Object.assign(POOL_STATE_HUSK, POOL_STATE_VALUES);

const POOL_STATUS_UPDATE = {
	REJECTED: 0,
	ACCEPTED: 1,
	toString: function (i) {
		switch (i) {
			case POOL_STATUS_UPDATE.REJECTED:
				return 'REJECTED';
			case POOL_STATUS_UPDATE.ACCEPTED:
				return 'ACCEPTED';
			default:
				return null;
		}
	},
};

const MESSAGE_ID = {
	ERR_ALREADY_HAVE: 0x00,
	ERR_DENOM: 0x01,
	ERR_ENTRIES_FULL: 0x02,
	ERR_EXISTING_TX: 0x03,
	ERR_FEES: 0x04,
	ERR_INVALID_COLLATERAL: 0x05,
	ERR_INVALID_INPUT: 0x06,
	ERR_INVALID_SCRIPT: 0x07,
	ERR_INVALID_TX: 0x08,
	ERR_MAXIMUM: 0x09,
	ERR_MN_LIST: 0x0a, // <--
	ERR_MODE: 0x0b,
	ERR_NON_STANDARD_PUBKEY: 0x0c, //	 (Not used)
	ERR_NOT_A_MN: 0x0d, //(Not used)
	ERR_QUEUE_FULL: 0x0e,
	ERR_RECENT: 0x0f,
	ERR_SESSION: 0x10,
	ERR_MISSING_TX: 0x11,
	ERR_VERSION: 0x12,
	MSG_NOERR: 0x13,
	MSG_SUCCESS: 0x14,
	MSG_ENTRIES_ADDED: 0x15,
	ERR_SIZE_MISMATCH: 0x16,
	toString: function (i) {
		for (const key in MESSAGE_ID) {
			if (key === 'toString') {
				continue;
			}
			if (MESSAGE_ID[key] === i) {
				return String(key);
			}
		}
	},
};

let PRE_CALC_MESSAGE_HEADER_SIZE = 0;
for (const key in MSG_HEADER) {
	PRE_CALC_MESSAGE_HEADER_SIZE += MSG_HEADER[key];
}
const MESSAGE_HEADER_SIZE = PRE_CALC_MESSAGE_HEADER_SIZE;
const PAYLOAD_OFFSET = MSG_HEADER.MAGIC + MSG_HEADER.COMMAND;
const SENDHEADERS_PAYLOAD_SIZE = 0;
const SENDCMPCT_PAYLOAD_SIZE = 9;
const SENDDSQ_PAYLOAD_SIZE = 1;
const PING_PAYLOAD_SIZE = 8;

const getVersionSizes = function () {
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
(function () {
	VERSION_PACKET_MINIMUM_SIZE = 0;
	let sizes = getVersionSizes();
	for (const key in sizes) {
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
	MAINNET,
	MESSAGE_ID,
	MNAUTH_PROTOCOL_VERSION_INTRODUCTION,
	MNAUTH_CHALLENGE_SIZE,
	NETWORKS,
	PING_NONCE_SIZE,
	POOL_STATE,
	PROTOCOL_VERSION,
	RELAY_PROTOCOL_VERSION_INTRODUCTION,
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
let allZeroes = NetUtil.allZeroes;
let hexToBytes = NetUtil.hexToBytes;
let str2uint8 = NetUtil.str2uint8;

function arbuf_to_hexstr(buffer) {
	// buffer is an ArrayBuffer
	return [...new Uint8Array(buffer)]
		.map((x) => x.toString(16).padStart(2, '0'))
		.join('');
}
function toSerializedFormat(uint8Dsf) {
	if (!(uint8Dsf instanceof Uint8Array)) {
		throw new Error('parameter must be an instance of Uint8Array');
	}
	return arbuf_to_hexstr(uint8Dsf);
}

function extractInt64(data, at) {
	let a = new Uint8Array([
		data[at],
		data[at + 1],
		data[at + 2],
		data[at + 3],
		data[at + 4],
		data[at + 5],
		data[at + 6],
		data[at + 7],
	]);
	let b = new BigInt64Array(a.buffer);
	return b[0];
}
function extractUint64(data, at) {
	let a = new Uint8Array([
		data[at],
		data[at + 1],
		data[at + 2],
		data[at + 3],
		data[at + 4],
		data[at + 5],
		data[at + 6],
		data[at + 7],
	]);
	let b = new BigUint64Array(a.buffer);
	return b[0];
}
function extractUint32(data, at) {
	let a = new Uint8Array([data[at], data[at + 1], data[at + 2], data[at + 3]]);
	let b = new Uint32Array(a.buffer);
	return b[0];
}
function accumulateUint32(data, at) {
	let uiArray = new Uint32Array([0]);
	for (let i = at; i < at + 4; i++) {
		uiArray[0] += data[at];
	}
	return uiArray[0];
}
function extractChunk(buffer, start, end) {
	let uiArray = new Uint8Array(end - start);
	let k = 0;
	for (let i = start; i < end; i++, k++) {
		uiArray[k] = buffer[i];
	}
	return uiArray;
}
let setUint32 = NetUtil.setUint32;
let dot2num = NetUtil.dot2num;
//let num2array = NetUtil.num2array;
let htonl = NetUtil.htonl;
let is_ipv6_mapped_ipv4 = NetUtil.is_ipv6_mapped_ipv4;
let htons = NetUtil.htons;
//let mapIPv4ToIpv6 = NetUtil.mapIPv4ToIpv6;

Lib.util = NetUtil;

/**
 * First 4 bytes of SHA256(SHA256(payload)) in internal byte order.
 */
const compute_checksum = (payload) => {
	let hash = createHash('sha256').update(payload).digest();
	let hashOfHash = createHash('sha256').update(hash).digest();
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
		packet.set([0x5d, 0xf6, 0xe0, 0xe2], CHECKSUM_OFFSET);
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
function version(
	args = {
		/**
		 * Required.
		 *
		 * Must be one of the values in NETWORKS constant above.
		 */
		chosen_network: null,
		/**
		 * Required.
		 */
		protocol_version: null,
		/**
		 * Required.
		 */
		services: null,
		/**
		 * Required.
		 */
		addr_recv_services: null,
		/**
		 * Required.
		 *
		 * addr_recv_ip is the ipv6 address of the master node (can be 'ipv4-mapped')
		 *
		 * DO NOT convert to big endian!
		 */
		addr_recv_ip: null,
		/**
		 * Required.
		 *
		 * This has to be the port on the master node that you're connecting to.
		 * This is sometimes a port like 9999, 19999, but it can sometimes be
		 * a port chosen by the masternode owners themselves.
		 *
		 * DO NOT convert to big endian!
		 */
		addr_recv_port: null,

		/**
		 * Required.
		 *
		 * This has to be the IPv6 IP of our machine (can be 'ipv4-mapped').
		 * If you're not sure, leave it null and the library will fill it for you.
		 *
		 * DO NOT convert to big endian!
		 */
		addr_trans_ip: null,
		/**
		 * Required.
		 *
		 * This is the port that corresponds to your current socket connection
		 * to the master node. Usually, the operating system gives you a random
		 * port.
		 *
		 * DO NOT convert to big endian!
		 */
		addr_trans_port: null,

		/**
		 * Required.
		 *
		 * Start height of your best block chain.
		 */
		start_height: null,

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
	},
) {
	let SIZES = getVersionSizes();

	if (!VALID_NETS.includes(args.chosen_network)) {
		throw new Error('"chosen_network" is invalid.');
	}
	if (!Array.isArray(args.services)) {
		throw new Error('"services" needs to be an array');
	}
	if (
		args.protocol_version < RELAY_PROTOCOL_VERSION_INTRODUCTION &&
		'undefined' !== typeof args.relay
	) {
		throw new Error(
			`"relay" field is not supported in protocol versions prior to ${RELAY_PROTOCOL_VERSION_INTRODUCTION}`,
		);
	}
	if (
		args.protocol_version < MNAUTH_PROTOCOL_VERSION_INTRODUCTION &&
		'undefined' !== typeof args.mnauth_challenge
	) {
		throw new Error(
			'"mnauth_challenge" field is not supported in protocol versions prior to MNAUTH_CHALLENGE_OFFSET',
		);
	}
	if ('undefined' !== typeof args.mnauth_challenge) {
		if (!(args.mnauth_challenge instanceof Uint8Array)) {
			throw new Error('"mnauth_challenge" field must be a Uint8Array');
		}
		if (args.mnauth_challenge.length !== MNAUTH_CHALLENGE_SIZE) {
			throw new Error(
				`"mnauth_challenge" field must be ${MNAUTH_CHALLENGE_SIZE} bytes long`,
			);
		}
	}
	if ('undefined' !== typeof args.relay) {
		SIZES.RELAY = RELAY_SIZE;
	}
	if ('undefined' !== typeof args.mnauth_challenge) {
		SIZES.MNAUTH_CHALLENGE = MNAUTH_CHALLENGE_SIZE;
	}
	if (
		'undefined' !== typeof args.user_agent &&
		'string' === typeof args.user_agent
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
		let ipBytes = dot2num(transmittingIP.split(':').reverse()[0]);
		let inv = htonl(ipBytes);
		packet = setUint32(packet, inv, ADDR_TRANS_IP_OFFSET + 12);
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
	if ('undefined' !== typeof args.nonce) {
		if (args.nonce instanceof Uint8Array) {
			packet.set(args.nonce, NONCE_OFFSET);
		} else {
			throw new Error('"nonce" field must be an array of 8 bytes');
		}
	} else {
		packet.set(new Uint8Array(SIZES.NONCE), NONCE_OFFSET);
	}

	let USER_AGENT_BYTES_OFFSET = NONCE_OFFSET + SIZES.NONCE;
	if (null !== args.user_agent && typeof args.user_agent === 'string') {
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
	if ('undefined' !== typeof args.relay) {
		packet.set([args.relay ? 0x01 : 0x00], RELAY_OFFSET);
	}

	let MNAUTH_CHALLENGE_OFFSET = RELAY_OFFSET + SIZES.RELAY;
	if ('undefined' !== typeof args.mnauth_challenge) {
		packet.set(args.mnauth_challenge, MNAUTH_CHALLENGE_OFFSET);
	}
	packet = wrap_packet(args.chosen_network, 'version', packet, TOTAL_SIZE);
	return packet;
}
function getaddr() {
	const cmd = 'getaddr';
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
		MAGIC_BYTES_SIZE + COMMAND_SIZE + PAYLOAD_SIZE,
	);
	return packet;
}

function pong(
	args = {
		chosen_network: null,
		nonce: null,
	},
) {
	let nonceBuffer = new Uint8Array(PING_NONCE_SIZE);
	nonceBuffer.set(args.nonce, 0);
	return wrap_packet(args.chosen_network, 'pong', nonceBuffer, PING_NONCE_SIZE);
}
function verack(
	args = {
		chosen_network: null,
	},
) {
	return wrap_packet(args.chosen_network, 'verack', null, 0);
}
function senddsq(
	args = {
		chosen_network: null,
		fSendDSQueue: null,
	},
) {
	let buffer = new Uint8Array([args.fSendDSQueue ? 1 : 0]);
	return wrap_packet(args.chosen_network, 'senddsq', buffer, buffer.length);
}
function sendaddrv2(
	args = {
		chosen_network: null,
	},
) {
	return wrap_packet(args.chosen_network, 'sendaddrv2', null, 0);
}
function sendaddr(
	args = {
		chosen_network: null,
	},
) {
	return wrap_packet(args.chosen_network, 'sendaddr', null, 0);
}

const CJDenoms = require('./coin-join-constants.js').STANDARD_DENOMINATIONS;
let CJLib = require('./coin-join-denominations.js');

function isStandardDenomination(d) {
	return CJDenoms.includes(d);
}

function dsa(
	args = {
		chosen_network: null, // 'testnet'
		denomination: null, // COIN / 1000 + 1
		collateral: null, // see: ctransaction.js
	},
) {
	if (!isStandardDenomination(args.denomination)) {
		throw new Error('Invalid denomination value');
	}
	let encodedDenom = CJLib.AmountToDenomination(args.denomination);
	if (encodedDenom === 0) {
		throw new Error("Couldn't serialize denomination");
	}

	const SIZES = {
		DENOMINATION: 4,
		COLLATERAL: args.collateral.length,
	};
	let TOTAL_SIZE = 0;
	for (const key in SIZES) {
		TOTAL_SIZE += SIZES[key];
	}

	let offset = 0;
	/**
	 * Packet payload
	 */
	let packet = new Uint8Array(TOTAL_SIZE);

	packet.set([encodedDenom, 0, 0, 0], offset);

	offset += SIZES.DENOMINATION;
	//console.debug("collateral size:", args.collateral.length);
	packet.set(args.collateral, offset);

	//console.debug({ packet });

	return wrap_packet(args.chosen_network, 'dsa', packet, packet.length);
}
function dsc() {}
function dsf() {}
function dsi(
	args = {
		chosen_network: null, // 'testnet'
		collateralTxn: null,
		denominatedAmount: null,
		client_session: null,
	},
) {
	let client_session = args.client_session;
	let denominatedAmount = args.denominatedAmount;
	if (!(args.collateralTxn instanceof Transaction)) {
		throw new Error('collateralTxn must be Transaction');
	}
	let utxos = [];
	for (const input of client_session.mixing_inputs) {
		utxos.push(input.utxo);
	}
	let userInputTxn = new Transaction().from(utxos);
	let userOutputTxn = new Transaction();
	for (const address of client_session.generated_addresses) {
		userOutputTxn.to(Address.fromString(address.address), denominatedAmount);
	}

	// FIXME: very hacky
	let trimmedUserInput = userInputTxn
		.uncheckedSerialize()
		.substr(8)
		.replace(/[0]{10}$/, '');

	//d({
	//	collateral: args.collateralTxn,
	//	serialized: args.collateralTxn.uncheckedSerialize(),
	//});
	let collateralTxn = hexToBytes(args.collateralTxn.uncheckedSerialize());

	// FIXME: very hacky
	let trimmedUserOutput = userOutputTxn
		.uncheckedSerialize()
		.substr(10)
		.replace(/[0]{8}$/, '');
	//dd(trimmedUserOutput);

	let userInputPayload = hexToBytes(trimmedUserInput);
	let userOutputPayload = hexToBytes(trimmedUserOutput);

	let TOTAL_SIZE =
		userInputPayload.length + collateralTxn.length + userOutputPayload.length;

	/**
	 * Packet payload
	 */
	let offset = 0;
	let packet = new Uint8Array(TOTAL_SIZE);
	/**
	 * Set the user inputs
	 */
	packet.set(userInputPayload);
	offset += userInputPayload.length;

	/**
	 * Set the collateral txn(s)
	 */
	packet.set(collateralTxn, offset);
	offset += collateralTxn.length;

	/**
	 * Set the outputs
	 */
	packet.set(userOutputPayload, offset);

	assert.equal(
		packet.length,
		TOTAL_SIZE,
		'packet length doesnt match TOTAL_SIZE',
	);

	return wrap_packet(args.chosen_network, 'dsi', packet, TOTAL_SIZE);
}

async function dss(
	args = {
		chosen_network: null,
		dsfPacket: null,
		client_session: null,
		dboot: null,
	},
) {
	/**
	 * User inputs
	 * -----------
	 * (for now) support only up to 252 inputs (FIXME: use compactSize integer encoding here)
	 */
	let client_session = args.client_session;
	let TOTAL_SIZE = 0;
	TOTAL_SIZE += 1; // input size length
	client_session.signatures = {};
	for (const input of client_session.mixing_inputs) {
		TOTAL_SIZE += 32;
		TOTAL_SIZE += 4;
		TOTAL_SIZE += 1; // script length
		let rawSig = input.signed.inputs[0]._script.toHex();
		let encodedSignature = hexToBytes(rawSig);
		let len = encodedSignature.length;
		d({ len, rawSig, encodedSignature });
		TOTAL_SIZE += len;
		TOTAL_SIZE += 4;
	}
	let rel_path = `dss-${client_session.username}-#DATE#`;
	await FileLib.write_json(rel_path, client_session);

	let packet = new Uint8Array(TOTAL_SIZE);
	let offset = 0;
	packet.set([client_session.mixing_inputs.length], offset);
	offset += 1;

	for (const input of client_session.mixing_inputs) {
		packet.set(hexToBytes(hashByteOrder(input.utxo.txId)), offset);
		assert.equal(
			hexToBytes(input.utxo.txId).length,
			32,
			'txid should equal 32 bytes',
		);
		offset += 32;
		packet = setUint32(packet, input.utxo.outputIndex, offset);
		offset += 4;
		let rawSig = input.signed.inputs[0]._script.toHex();
		let encodedSignature = hexToBytes(rawSig);
		let len = encodedSignature.length;
		packet.set([len], offset);
		offset += 1;
		packet.set(encodedSignature, offset);
		offset += len;
		packet = setUint32(packet, 0xffffffff, offset);
		offset += 4;
	}
	return wrap_packet(args.chosen_network, 'dss', packet, TOTAL_SIZE);
}

function dsq() {}
function dssu() {}
function dstx() {}

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
Lib.packet.parse.extractItems = function (buffer, items) {
	let extracted = [];
	for (let item of items) {
		switch (item) {
			case 'command':
				extracted.push(Lib.packet.parse.commandName(buffer));
				break;
			case 'payloadSize':
				extracted.push(Lib.packet.parse.payloadSize(buffer));
				break;
			case 'magic':
				extracted.push(Lib.packet.parse.magicBytes(buffer));
				break;
			default:
				break;
		}
	}
	return extracted;
};

Lib.packet.parse.extractPingNonce = function (buffer) {
	let offset = MESSAGE_HEADER_SIZE;
	let k = 0;
	let buf = new Uint8Array(PING_NONCE_SIZE);
	for (let i = offset; i < MESSAGE_HEADER_SIZE + PING_NONCE_SIZE; i++, k++) {
		buf[k] = buffer[i];
	}
	return buf;
};
Lib.packet.parse.hasPayload = function (buffer) {
	if (!(buffer instanceof Uint8Array)) {
		throw new Error('Must be an instance of Uint8Array');
	}
	return !Lib.packet.messagesWithNoPayload.includes(
		Lib.packet.parse.commandName(buffer),
	);
};
Lib.packet.parse.payloadSize = function (buffer) {
	if (!(buffer instanceof Uint8Array)) {
		throw new Error('Must be an instance of Uint8Array');
	}
	if (buffer.length < MESSAGE_HEADER_SIZE) {
		return null;
	}
	let uiBuffer = new Uint32Array([0]);
	uiBuffer[0] = buffer[PAYLOAD_OFFSET];
	uiBuffer[0] += buffer[PAYLOAD_OFFSET + 1];
	uiBuffer[0] += buffer[PAYLOAD_OFFSET + 2];
	uiBuffer[0] += buffer[PAYLOAD_OFFSET + 3];
	return uiBuffer[0];
};
Lib.packet.parse.magicBytes = function (buffer) {
	if (!(buffer instanceof Uint8Array)) {
		throw new Error('Must be an instance of Uint8Array');
	}
	let copy = new Uint8Array(4);
	for (let i = 0; i < 4; i++) {
		copy[i] = buffer[i];
	}
	return copy;
};

Lib.packet.parse.identifyMagicBytes = function (buffer) {
	for (let key in NETWORKS) {
		let bytesMatched = 0;
		for (let i = 0; i < 4; i++) {
			if (NETWORKS[key].magic[i] !== buffer[i]) {
				bytesMatched = 0;
				break;
			}
			++bytesMatched;
		}
		if (bytesMatched === 4) {
			return key;
		}
	}
	return null;
};

Lib.packet.parse.commandName = function (buffer) {
	if (!(buffer instanceof Uint8Array)) {
		throw new Error('Must be an instance of Uint8Array');
	}
	let cmd = '';
	for (let i = 4; i < 16 && buffer[i] !== 0x0; ++i) {
		cmd += String.fromCharCode(buffer[i]);
	}
	return cmd;
};

Lib.packet.parse.getheaders = function (buffer) {
	if (!(buffer instanceof Uint8Array)) {
		throw new Error('Must be an instance of Uint8Array');
	}
	let commandName = Lib.packet.parse.commandName(buffer);
	if (commandName !== 'getheaders') {
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
	for (let i = 0; i < 4; i++) {
		parsed.version[i] = buffer[i];
	}
	parsed.hashCount = accumulateUint32(buffer, 4);
	const OFFSET = 8;
	const HASH_SIZE = 32;
	let hash = new Uint8Array(32);
	for (let i = 0; i < parsed.hashCount; i++) {
		hash = extractChunk(
			buffer,
			OFFSET + i * HASH_SIZE,
			OFFSET + i * HASH_SIZE + HASH_SIZE,
		);
		if (allZeroes(hash)) {
			continue;
		}
		parsed.hashes.push(hash);
	}
	parsed.hashCount = parsed.hashes.length;
	return parsed;
};

Lib.packet.parse.dsq = function (buffer) {
	if (!(buffer instanceof Uint8Array)) {
		throw new Error('Must be an instance of Uint8Array');
	}
	let commandName = Lib.packet.parse.commandName(buffer);
	if (commandName !== 'dsq') {
		throw new Error('Not a dsq packet');
	}
	let parsed = {
		nDenom: 0,
		proTxHash: 0,
		nTime: 0,
		fReady: false,
		vchSig: null,
	};
	const SIZES = {
		DENOM: 4,
		PROTX: 32,
		TIME: 8,
		READY: 1,
		SIG: 97,
	};

	//console.debug("Size of dsq packet:", buffer.length);
	/**
	 * We'll need to point past the message header in
	 * order to get to the dsq packet details.
	 */
	let offset = MESSAGE_HEADER_SIZE;

	/**
	 * Grab the denomination
	 */
	parsed.nDenom = extractUint32(buffer, offset);
	offset += SIZES.DENOM;

	/**
	 * Grab the protxhash
	 */
	parsed.proTxHash = extractChunk(buffer, offset, offset + SIZES.PROTX);
	offset += SIZES.PROTX;

	/**
	 * Grab the time
	 */
	parsed.nTime = extractInt64(buffer, offset);
	offset += SIZES.TIME;

	/**
	 * Grab the fReady
	 */
	parsed.fReady = buffer[offset];
	offset += SIZES.READY;

	parsed.vchSig = extractChunk(buffer, offset, offset + SIZES.SIG);
	return parsed;
};
Lib.packet.parse.dssu = function (buffer) {
	if (!(buffer instanceof Uint8Array)) {
		throw new Error('Must be an instance of Uint8Array');
	}
	let commandName = Lib.packet.parse.commandName(buffer);
	if (commandName !== 'dssu') {
		throw new Error('Not a dssu packet');
	}
	let parsed = {
		session_id: 0,
		state: 0,
		entries_count: 0,
		status_update: 0,
		message_id: 0,
	};
	/**
	 * 4	nMsgSessionID			-	Required			-	Session ID
	 * 4	nMsgState					- Required			- Current state of processing
	 * 4	nMsgEntriesCount	- Required			- Number of entries in the pool (deprecated)
	 * 4	nMsgStatusUpdate	-	Required			- Update state and/or signal if entry was accepted or not
	 * 4	nMsgMessageID			- Required			- ID of the typical masternode reply message
	 */
	const SIZES = {
		SESSION_ID: 4,
		STATE: 4,
		ENTRIES_COUNT: 4,
		STATUS_UPDATE: 4,
		MESSAGE_ID: 4,
	};

	//console.debug("Size of dssu packet:", buffer.length);
	/**
	 * We'll need to point past the message header in
	 * order to get to the dssu packet details.
	 */
	let offset = MESSAGE_HEADER_SIZE;

	/**
	 * Grab the session id
	 */
	parsed.session_id = extractUint32(buffer, offset);
	offset += SIZES.SESSION_ID;

	/**
	 * Grab the state
	 */
	let state = extractUint32(buffer, offset);
	offset += SIZES.STATE;

	///**
	// * Grab the entries count
	// Not parsed because apparently master nodes no longer send
	// the entries count.
	// */
	//parsed.entries_count = extractUint32(buffer, offset);
	//offset += SIZES.ENTRIES_COUNT;

	/**
	 * Grab the status update
	 */
	let status_update = extractUint32(buffer, offset);
	offset += SIZES.STATUS_UPDATE;

	/**
	 * Grab the message id
	 */
	let message_id = extractUint32(buffer, offset);
	parsed.message_id = [message_id, MESSAGE_ID.toString(message_id)];
	parsed.state = [state, POOL_STATE.toString(state)];
	parsed.status_update = [
		status_update,
		POOL_STATUS_UPDATE.toString(status_update),
	];
	return parsed;
};
Lib.packet.parse.dsf = function (buffer) {
	if (!(buffer instanceof Uint8Array)) {
		throw new Error('Must be an instance of Uint8Array');
	}
	let commandName = Lib.packet.parse.commandName(buffer);
	if (commandName !== 'dsf') {
		throw new Error('Not a dsf packet');
	}
	let parsed = {
		sessionID: 0,
		transaction: {
			version: 0,
			inputCount: 0,
			inputs: [],
			outputCount: 0,
			outputs: [],
		},
	};
	const TXID_HASH_SIZE = 32;
	const VOUT_SIZE = 4;
	const SIGSCRIPT_SIZE = 1;
	const SEQUENCE_NUMBER_SIZE = 4;
	/**
	 * TRANSACTION_SIZE:
	 * 1) A TxID Hash (32 bytes)
	 * 2) vout (4 bytes)
	 * 3) sigscript bytes (1 byte)
	 * 4) sequence number (4 bytes)
	 */
	//const TRANSACTION_SIZE =
	//  TXID_HASH_SIZE + VOUT_SIZE + SIGSCRIPT_SIZE + SEQUENCE_NUMBER_SIZE;
	let SIZES = {
		SESSIONID: 4,
		VERSION: 4,
		INPUT_COUNT: 1,
		INPUTS: 0,
		OUTPUT_COUNT: 1,
		OUTPUTS: 0,
		LOCKTIME: 4,
	};

	//console.debug('Size of dsf packet:', buffer.length);
	/**
	 * We'll need to point past the message header in
	 * order to get to the dsq packet details.
	 */
	let offset = MESSAGE_HEADER_SIZE;

	/**
	 * Grab the SESSION ID
	 */
	parsed.sessionID = extractUint32(buffer, offset);
	offset += SIZES.SESSIONID;

	/**
	 * Grab the VERSION
	 */
	parsed.transaction.version = parseInt(
		extractChunk(buffer, offset, offset + SIZES.VERSION),
		10,
	);
	offset += SIZES.VERSION;

	/**
	 * Grab the INPUT COUNT
	 */
	// FIXME: parse compactSize int
	parsed.transaction.inputCount = parseInt(
		extractChunk(buffer, offset, offset + SIZES.INPUT_COUNT),
		10,
	);

	let inputs = parseInt(parsed.transaction.inputCount, 10);
	if (isNaN(inputs)) {
		throw new Error('tx input count is not a valid integer');
	}
	offset += SIZES.INPUT_COUNT;
	for (let i = 0; i < inputs; i++) {
		let transaction = {};
		transaction.txid = toSerializedFormat(
			extractChunk(buffer, offset, offset + TXID_HASH_SIZE),
		);
		offset += TXID_HASH_SIZE;
		transaction.vout = parseInt(extractUint32(buffer, offset), 10);
		offset += VOUT_SIZE;
		transaction.sigscript_bytes = parseInt(
			extractChunk(buffer, offset, offset + SIGSCRIPT_SIZE),
			10,
		);
		offset += SIGSCRIPT_SIZE;
		transaction.sequence = parseInt(extractUint32(buffer, offset), 10);
		offset += SEQUENCE_NUMBER_SIZE;
		parsed.transaction.inputs.push(transaction);
	}

	parsed.transaction.outputCount = parseInt(
		extractChunk(buffer, offset, offset + SIZES.OUTPUT_COUNT),
		10,
	);
	if (isNaN(parsed.transaction.outputCount)) {
		throw new Error("couldn't parse output count");
	}
	offset += SIZES.OUTPUT_COUNT;
	for (let i = 0; i < parsed.transaction.outputCount; i++) {
		let output = {};
		output.duffs = extractUint64(buffer, offset);
		offset += 8;
		output.pubkey_script_bytes = parseInt(
			extractChunk(buffer, offset, offset + 1),
			10,
		);
		offset += 1;
		output.pubkey_script = extractChunk(
			buffer,
			offset,
			offset + output.pubkey_script_bytes,
		);
		offset += output.pubkey_script_bytes;
		parsed.transaction.outputs.push(output);
	}

	parsed.raw_buffer = buffer;
	return parsed;
};
function dd(...args) {
	console.debug(...args);
	process.exit();
}
Lib.packet.coinjoin = {
	dsa,
	dsc,
	dsf,
	dsi,
	dsq,
	dssu,
	dss,
	dstx,
};
Lib.packet = Object.assign(Lib.packet, {
	getaddr,
	senddsq,
	sendaddr,
	sendaddrv2,
	pong,
	verack,
	version,
});
function dumpAsHex(arr, prefix = null) {
	let ctr = 0;
	for (const ch of arr) {
		process.stdout.write([prefix ?? '', ch.toString(16), ','].join(''));
		if (++ctr % 8 === 0) {
			process.stdout.write('\n');
		}
	}
}
if (process.argv.includes('--run-dsf-test')) {
	(async function () {
		const buffer = require('./example-dsf.js').example;
		let dsf = Lib.packet.parse.dsf(buffer);
		dd(
			JSON.stringify(
				dsf,
				(key, value) =>
					typeof value === 'bigint' ? value.toString() + 'n' : value,
				2,
			),
		);
		process.exit(0);
	})();
}
Lib.util.toSerializedFormat = toSerializedFormat;
Lib.util.dumpAsHex = dumpAsHex;
