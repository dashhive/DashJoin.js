'use strict';

let DarkSend = module.exports;

let Crypto = require('node:crypto');

DarkSend.FIELD_SIZES = {
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
	RELAY_MAX: 1,
	MNAUTH_CHALLENGE: 0,
	MNAUTH_CHALLENGE_MAX: 32,
};

DarkSend.RELAY_PROTOCOL_VERSION_INTRODUCTION = 70001;

let SIZES = {
	MAGIC_BYTES: 4,
	COMMAND_NAME: 12,
	PAYLOAD_SIZE: 4,
	CHECKSUM: 4,
};
const TOTAL_HEADER_SIZE =
	SIZES.MAGIC_BYTES + SIZES.COMMAND_NAME + SIZES.PAYLOAD_SIZE + SIZES.CHECKSUM;

const EMPTY_CHECKSUM = [0x5d, 0xf6, 0xe0, 0xe2];

/**
 * @typedef {"mainnet"|"testnet"|"regtest"|"devnet"} NetworkName
 */

let NETWORKS = {};
NETWORKS.mainnet = {
	port: 9999,
	magic: new Uint8Array([
		//0xBD6B0CBF,
		0xbf, 0x0c, 0x6b, 0xbd,
	]),
	start: 0xbf0c6bbd,
	nBits: 0x1e0ffff0,
};
NETWORKS.testnet = {
	port: 19999,
	magic: new Uint8Array([
		//0xFFCAE2CE,
		0xce, 0xe2, 0xca, 0xff,
	]),
	start: 0xcee2caff,
	nBits: 0x1e0ffff0,
};
NETWORKS.regtest = {
	port: 19899,
	magic: new Uint8Array([
		//0xDCB7C1FC,
		0xfc, 0xc1, 0xb7, 0xdc,
	]),
	start: 0xfcc1b7dc,
	nBits: 0x207fffff,
};
NETWORKS.devnet = {
	port: 19799,
	magic: new Uint8Array([
		//0xCEFFCAE2,
		0xe2, 0xca, 0xff, 0xce,
	]),
	start: 0xe2caffce,
	nBits: 0x207fffff,
};

/**
 * @typedef {0x00|0x01|0x02|0x04|0x400} ServiceIdentifier
 */
let SERVICE_IDENTIFIERS = {};

/**
 * NODE_UNNAMED:
 * 	This node is not a full node. It may not be
 * 	able to provide any data except for the
 * 	transactions it originates.
 */
SERVICE_IDENTIFIERS.UNNAMED = 0x00;

/**
 * NODE_NETWORK:
 * 	This is a full node and can be asked for full
 * 	blocks. It should implement all protocol features
 * 	available in its self-reported protocol version.
 */
SERVICE_IDENTIFIERS.NETWORK = 0x01;

/**
 * NODE_GETUTXO:
 * 	This node is capable of responding to the getutxo
 * 	protocol request. Dash Core does not support
 * 	this service.
 */
SERVICE_IDENTIFIERS.GETUTXO = 0x02;

/**
 * NODE_BLOOM:
 * 	This node is capable and willing to handle bloom-
 * 	filtered connections. Dash Core nodes used to support
 * 	this by default, without advertising this bit, but
 * 	no longer do as of protocol version 70201
 * 	(= NO_BLOOM_VERSION)
 */
SERVICE_IDENTIFIERS.BLOOM = 0x04;

/**
 * 0x08 is not supported by Dash
 */

/**
 * NODE_NETWORK_LIMITED:
 * 	This is the same as NODE_NETWORK with the
 * 	limitation of only serving the last 288 blocks.
 * 	Not supported prior to Dash Core 0.16.0
 */
SERVICE_IDENTIFIERS.NETWORK_LIMITED = 0x400;

/**
 * @typedef VersionOpts
 * @prop {NetworkName} chosen_network - "mainnet", "testnet", etc
 * @prop {Uint32} protocol_version - signals which features are available or/or used
 * @prop {Array<ServiceIdentifier>} services - what we support / provide
 * @prop {Array<ServiceIdentifier>} addr_recv_services - what we expect of the server
 * @prop {String} addr_recv_ip - ipv6 address (can be 'ipv4-mapped') of the server
 * @prop {Uint16} addr_recv_port - 9999, 19999, etc (can be arbitrary on testnet)
 * @prop {String?} [addr_trans_ip]- null, or the external ipv6 or ipv4-mapped address
 * @prop {String?} [addr_trans_port] - null, or the external port (ignored for tcp?)
 * @prop {Uint32} start_height - start height of your best block
 * @prop {Uint8Array?} [nonce] - 8 random bytes to identify this transmission
 * @prop {String?} [user_agent] - ex: "DashJoin/1.0 request/1.0 node/20.0.0 macos/14.0"
 * @prop {Boolean?} [relay] - request all network tx & inv messages to be relayed to you
 * @prop {Uint8Array?} [mnauth_challenge] - 32 bytes for the masternode to sign as proof
 */

/**
 * Constructs a version packet, with fields in the correct byte order.
 * @param {VersionOpts} opts
 *
 * See also:
 *   - https://dashcore.readme.io/docs/core-ref-p2p-network-control-messages#version
 */
/* jshint maxcomplexity: 9001 */
DarkSend.version = function ({
	chosen_network,
	protocol_version,
	services,
	addr_recv_services,
	addr_recv_ip,
	addr_recv_port,
	// alias of services
	//addr_trans_services,
	addr_trans_ip = null,
	addr_trans_port = null,
	start_height,
	nonce = null,
	user_agent = null,
	relay = false,
	mnauth_challenge = null,
}) {
	let args = {
		chosen_network,
		protocol_version,
		services,
		addr_recv_services,
		addr_recv_ip,
		addr_recv_port,
		addr_trans_ip,
		addr_trans_port,
		start_height,
		nonce,
		user_agent,
		relay,
		mnauth_challenge,
	};
	let SIZES = Object.assign({}, DarkSend.FIELD_SIZES);

	if (!DarkSend.NETWORKS[args.chosen_network]) {
		throw new Error('"chosen_network" is invalid.');
	}
	if (!Array.isArray(args.services)) {
		throw new Error('"services" needs to be an array');
	}
	if (
		args.protocol_version < DarkSend.RELAY_PROTOCOL_VERSION_INTRODUCTION &&
		'undefined' !== typeof args.relay
	) {
		throw new Error(
			`"relay" field is not supported in protocol versions prior to ${DarkSend.RELAY_PROTOCOL_VERSION_INTRODUCTION}`,
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
		if (args.mnauth_challenge.length !== DarkSend.SIZES.MNAUTH_CHALLENGE_MAX) {
			throw new Error(
				`"mnauth_challenge" field must be ${DarkSend.SIZES.MNAUTH_CHALLENGE_MAX} bytes long`,
			);
		}
	}
	if ('undefined' !== typeof args.relay) {
		SIZES.RELAY = DarkSend.SIZES.RELAY_MAX;
	}
	if ('undefined' !== typeof args.mnauth_challenge) {
		SIZES.MNAUTH_CHALLENGE = DarkSend.SIZES.MNAUTH_CHALLENGE_MAX;
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

	void setUint32(packet, args.protocol_version, 0);
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
	void setUint32(packet, Date.now(), TIMESTAMP_OFFSET);

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
	void setUint32(packet, inv, ADDR_RECV_IP_OFFSET);

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
		void setUint32(packet, inv, ADDR_TRANS_IP_OFFSET + 12);
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
	void setUint32(packet, args.start_height, START_HEIGHT_OFFSET);

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
};

function wrap_packet(net, command_name, payload, payload_size) {
	let TOTAL_SIZE = TOTAL_HEADER_SIZE + payload_size;

	let packet = new Uint8Array(TOTAL_SIZE);
	packet.set(NETWORKS[net].magic, 0);

	/**
	 * Set command_name (char[12])
	 */
	let COMMAND_NAME_OFFSET = SIZES.MAGIC_BYTES;
	let textEncoder = new TextEncoder();
	let nameBytes = textEncoder.encode(command_name);
	packet.set(nameBytes, COMMAND_NAME_OFFSET);

	let PAYLOAD_SIZE_OFFSET = COMMAND_NAME_OFFSET + SIZES.COMMAND_NAME;
	let CHECKSUM_OFFSET = PAYLOAD_SIZE_OFFSET + SIZES.PAYLOAD_SIZE;
	if (payload_size === 0 || payload === null) {
		packet.set(EMPTY_CHECKSUM, CHECKSUM_OFFSET);
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
}

/**
 * First 4 bytes of SHA256(SHA256(payload)) in internal byte order.
 */
function compute_checksum(payload) {
	let hash = Crypto.createHash('sha256').update(payload).digest();
	let hashOfHash = Crypto.createHash('sha256').update(hash).digest();
	return hashOfHash.slice(0, 4);
}

function setUint32(bytes, data, at) {
	let u32 = new Uint32Array([data]);
	let u8 = new Uint8Array(u32.buffer);
	bytes.set(u8, at);
}

/**
 * @typedef {Number} Uint32
 * @typedef {Number} Uint16
 */

/**
 *
 * addr_recv_ip is the ipv6 address of the master node (can be 'ipv4-mapped')
 * @typedef {String} Ipv6Addr
 */
