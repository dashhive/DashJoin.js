'use strict';

let DarkSend = module.exports;

let Crypto = require('node:crypto');

let CoinJoin = require('./coinjoin.js');

DarkSend.PROTOCOL_VERSION = 70227;

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
	RELAY_NONEMPTY: 1,
	MNAUTH_CHALLENGE: 0,
	MNAUTH_CHALLENGE_NONEMPTY: 32,
	MN_CONNECTION: 0,
	MN_CONNECTION_NONEMPTY: 1,
};

DarkSend.RELAY_PROTOCOL_VERSION_INTRODUCTION = 70001;
DarkSend.MNAUTH_PROTOCOL_VERSION_INTRODUCTION = 70214;

let textEncoder = new TextEncoder();

let SIZES = {
	MAGIC_BYTES: 4,
	COMMAND_NAME: 12,
	PAYLOAD_SIZE: 4,
	CHECKSUM: 4,
};
const TOTAL_HEADER_SIZE =
	SIZES.MAGIC_BYTES + SIZES.COMMAND_NAME + SIZES.PAYLOAD_SIZE + SIZES.CHECKSUM;
DarkSend.HEADER_SIZE = TOTAL_HEADER_SIZE;

DarkSend.PING_SIZE = DarkSend.FIELD_SIZES.NONCE;
DarkSend.DSQ_SIZE = 1; // bool

const EMPTY_CHECKSUM = [0x5d, 0xf6, 0xe0, 0xe2];

/**
 * @typedef {"mainnet"|"testnet"|"regtest"|"devnet"} NetworkName
 */

DarkSend.NETWORKS = {};
DarkSend.NETWORKS.mainnet = {
	port: 9999,
	magic: new Uint8Array([
		//0xBD6B0CBF,
		0xbf, 0x0c, 0x6b, 0xbd,
	]),
	start: 0xbf0c6bbd,
	nBits: 0x1e0ffff0,
	minimumParticiparts: 3,
};
DarkSend.NETWORKS.testnet = {
	port: 19999,
	magic: new Uint8Array([
		//0xFFCAE2CE,
		0xce, 0xe2, 0xca, 0xff,
	]),
	start: 0xcee2caff,
	nBits: 0x1e0ffff0,
	minimumParticiparts: 2,
};
DarkSend.NETWORKS.regtest = {
	port: 19899,
	magic: new Uint8Array([
		//0xDCB7C1FC,
		0xfc, 0xc1, 0xb7, 0xdc,
	]),
	start: 0xfcc1b7dc,
	nBits: 0x207fffff,
	minimumParticiparts: 2,
};
DarkSend.NETWORKS.devnet = {
	port: 19799,
	magic: new Uint8Array([
		//0xCEFFCAE2,
		0xe2, 0xca, 0xff, 0xce,
	]),
	start: 0xe2caffce,
	nBits: 0x207fffff,
	minimumParticiparts: 2,
};

/**
 * @typedef {0x01|0x02|0x04|0x400} ServiceBitmask
 * @typedef {"NETWORK"|"GETUTXO "|"BLOOM"|"NETWORK_LIMITED"} ServiceName
 */

/** @type {Object.<ServiceName, ServiceBitmask>} */
let SERVICE_IDENTIFIERS = {};

/**
 * 0x00 is the default - not a full node, no guarantees
 */

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
 * @prop {NetworkName} network - "mainnet", "testnet", etc
 * @prop {Uint32?} [protocol_version] - features (default: DarkSend.PROTOCOL_VERSION)
 * @prop {Array<ServiceBitmask>?} [addr_recv_services] - default: NETWORK
 * @prop {String} addr_recv_ip - ipv6 address (can be 'ipv4-mapped') of the server
 * @prop {Uint16} addr_recv_port - 9999, 19999, etc (can be arbitrary on testnet)
 * @prop {Array<ServiceBitmask>?} [addr_trans_services] - default: NONE
 * @prop {String?} [addr_trans_ip]- null, or the external ipv6 or ipv4-mapped address
 * @prop {Uint16} [addr_trans_port] - null, or the external port (ignored for tcp?)
 * @prop {Uint32} start_height - start height of your best block
 * @prop {Uint8Array?} [nonce] - 8 random bytes to identify this transmission
 * @prop {String?} [user_agent] - ex: "DashJoin/1.0 request/1.0 node/20.0.0 macos/14.0"
 * @prop {Boolean?} [relay] - request all network tx & inv messages to be relayed to you
 * @prop {Uint8Array?} [mnauth_challenge] - 32 bytes for the masternode to sign as proof
 */

/**
 * Constructs a version message, with fields in the correct byte order.
 * @param {VersionOpts} opts
 *
 * See also:
 *   - https://dashcore.readme.io/docs/core-ref-p2p-network-control-messages#version
 */
/* jshint maxcomplexity: 9001 */
DarkSend.version = function ({
	network,
	protocol_version = DarkSend.PROTOCOL_VERSION,
	// alias of addr_trans_services
	//services,
	addr_recv_services = [SERVICE_IDENTIFIERS.NETWORK],
	addr_recv_ip,
	addr_recv_port,
	addr_trans_services = [],
	addr_trans_ip = '127.0.0.1',
	addr_trans_port = 65535,
	start_height,
	nonce = null,
	user_agent = null,
	relay = null,
	mnauth_challenge = null,
}) {
	const command = 'version';

	let args = {
		network,
		protocol_version,
		addr_recv_services,
		addr_recv_ip,
		addr_recv_port,
		addr_trans_services,
		addr_trans_ip,
		addr_trans_port,
		start_height,
		nonce,
		user_agent,
		relay,
		mnauth_challenge,
	};
	let SIZES = Object.assign({}, DarkSend.FIELD_SIZES);

	if (!DarkSend.NETWORKS[args.network]) {
		throw new Error(`"network" '${args.network}' is invalid.`);
	}
	if (!Array.isArray(args.addr_recv_services)) {
		throw new Error('"addr_recv_services" must be an array');
	}
	if (
		args.protocol_version < DarkSend.RELAY_PROTOCOL_VERSION_INTRODUCTION &&
		args.relay !== null
	) {
		throw new Error(
			`"relay" field is not supported in protocol versions prior to ${DarkSend.RELAY_PROTOCOL_VERSION_INTRODUCTION}`,
		);
	}
	if (
		args.protocol_version < DarkSend.MNAUTH_PROTOCOL_VERSION_INTRODUCTION &&
		args.mnauth_challenge !== null
	) {
		throw new Error(
			'"mnauth_challenge" field is not supported in protocol versions prior to MNAUTH_CHALLENGE_OFFSET',
		);
	}
	if (args.mnauth_challenge !== null) {
		if (!(args.mnauth_challenge instanceof Uint8Array)) {
			throw new Error('"mnauth_challenge" field must be a Uint8Array');
		}
		if (
			args.mnauth_challenge.length !== DarkSend.SIZES.MNAUTH_CHALLENGE_NONEMPTY
		) {
			throw new Error(
				`"mnauth_challenge" field must be ${DarkSend.SIZES.MNAUTH_CHALLENGE_NONEMPTY} bytes long`,
			);
		}
	}
	SIZES.USER_AGENT_STRING = args.user_agent?.length || 0;
	if (args.relay !== null) {
		SIZES.RELAY = DarkSend.FIELD_SIZES.RELAY_NONEMPTY;
	}
	// if (args.mnauth_challenge !== null) {
	SIZES.MNAUTH_CHALLENGE = DarkSend.FIELD_SIZES.MNAUTH_CHALLENGE_NONEMPTY;
	// }
	SIZES.MN_CONNECTION = DarkSend.FIELD_SIZES.MN_CONNECTION_NONEMPTY;

	let TOTAL_SIZE =
		SIZES.VERSION +
		SIZES.SERVICES +
		SIZES.TIMESTAMP +
		SIZES.ADDR_RECV_SERVICES +
		SIZES.ADDR_RECV_IP +
		SIZES.ADDR_RECV_PORT +
		SIZES.ADDR_TRANS_SERVICES +
		SIZES.ADDR_TRANS_IP +
		SIZES.ADDR_TRANS_PORT +
		SIZES.NONCE +
		SIZES.USER_AGENT_BYTES +
		SIZES.USER_AGENT_STRING +
		SIZES.START_HEIGHT +
		SIZES.RELAY +
		SIZES.MNAUTH_CHALLENGE +
		SIZES.MN_CONNECTION;
	let payload = new Uint8Array(TOTAL_SIZE);
	// Protocol version

	let versionBytes = uint32ToBytesLE(args.protocol_version);
	payload.set(versionBytes, 0);

	/**
	 * Set services to NODE_NETWORK (1) + NODE_BLOOM (4)
	 */
	const SERVICES_OFFSET = SIZES.VERSION;
	let senderServicesBytes;
	{
		let senderServicesMask = 0n;
		for (const serviceBit of addr_trans_services) {
			senderServicesMask += BigInt(serviceBit);
		}
		let senderServices64 = new BigInt64Array([senderServicesMask]); // jshint ignore:line
		senderServicesBytes = new Uint8Array(senderServices64.buffer);
		payload.set(senderServicesBytes, SERVICES_OFFSET);
	}

	const TIMESTAMP_OFFSET = SERVICES_OFFSET + SIZES.SERVICES;
	{
		let tsBytes = uint32ToBytesLE(Date.now());
		payload.set(tsBytes, TIMESTAMP_OFFSET);
	}

	let ADDR_RECV_SERVICES_OFFSET = TIMESTAMP_OFFSET + SIZES.TIMESTAMP;
	{
		let serverServicesMask = 0n;
		for (const serviceBit of addr_recv_services) {
			serverServicesMask += BigInt(serviceBit);
		}
		let serverServices64 = new BigInt64Array([serverServicesMask]); // jshint ignore:line
		let serverServicesBytes = new Uint8Array(serverServices64.buffer);
		payload.set(serverServicesBytes, ADDR_RECV_SERVICES_OFFSET);
	}

	/**
	 * "ADDR_RECV" means the host that we're sending this traffic to.
	 * So, in other words, it's the master node
	 */
	let ADDR_RECV_IP_OFFSET =
		ADDR_RECV_SERVICES_OFFSET + SIZES.ADDR_RECV_SERVICES;
	{
		let ipBytesBE = ipv4ToBytesBE(args.addr_recv_ip);
		payload.set([0xff, 0xff], ADDR_RECV_IP_OFFSET + 10);
		payload.set(ipBytesBE, ADDR_RECV_IP_OFFSET + 12);
	}

	/**
	 * Copy address recv port
	 */
	let ADDR_RECV_PORT_OFFSET = ADDR_RECV_IP_OFFSET + SIZES.ADDR_RECV_IP;
	{
		let portBytes16 = Uint16Array.from([args.addr_recv_port]);
		let portBytes = new Uint8Array(portBytes16.buffer);
		portBytes.reverse();
		payload.set(portBytes, ADDR_RECV_PORT_OFFSET);
	}

	/**
	 * Copy address transmitted services
	 */
	let ADDR_TRANS_SERVICES_OFFSET = ADDR_RECV_PORT_OFFSET + SIZES.ADDR_RECV_PORT;
	payload.set(senderServicesBytes, ADDR_TRANS_SERVICES_OFFSET);

	/**
	 * We add the extra 10, so that we can encode an ipv4-mapped ipv6 address
	 */
	let ADDR_TRANS_IP_OFFSET =
		ADDR_TRANS_SERVICES_OFFSET + SIZES.ADDR_TRANS_SERVICES;
	{
		if (is_ipv6_mapped_ipv4(args.addr_trans_ip)) {
			let ipv6Parts = args.addr_trans_ip.split(':');
			let ipv4Str = ipv6Parts.at(-1);
			let ipBytesBE = ipv4ToBytesBE(ipv4Str);
			payload.set(ipBytesBE, ADDR_TRANS_IP_OFFSET + 12);
			payload.set([0xff, 0xff], ADDR_TRANS_IP_OFFSET + 10); // we add the 10 so that we can fill the latter 6 bytes
		} else {
			/** TODO: ipv4-only & ipv6-only */
			let ipBytesBE = ipv4ToBytesBE(args.addr_trans_ip);
			payload.set(ipBytesBE, ADDR_TRANS_IP_OFFSET + 12);
			payload.set([0xff, 0xff], ADDR_TRANS_IP_OFFSET + 10); // we add the 10 so that we can fill the latter 6 bytes
		}
	}

	let ADDR_TRANS_PORT_OFFSET = ADDR_TRANS_IP_OFFSET + SIZES.ADDR_TRANS_IP;
	{
		let portBytes16 = Uint16Array.from([args.addr_trans_port]);
		let portBytes = new Uint8Array(portBytes16.buffer);
		portBytes.reverse();
		payload.set(portBytes, ADDR_TRANS_PORT_OFFSET);
	}

	// TODO we should set this to prevent duplicate broadcast
	// this can be left zero
	let NONCE_OFFSET = ADDR_TRANS_PORT_OFFSET + SIZES.ADDR_TRANS_PORT;
	if (!args.nonce) {
		args.nonce = new Uint8Array(SIZES.NONCE);
		Crypto.getRandomValues(args.nonce);
	}
	payload.set(args.nonce, NONCE_OFFSET);

	let USER_AGENT_BYTES_OFFSET = NONCE_OFFSET + SIZES.NONCE;
	if (null !== args.user_agent && typeof args.user_agent === 'string') {
		let userAgentSize = args.user_agent.length;
		payload.set([userAgentSize], USER_AGENT_BYTES_OFFSET);
		let uaBytes = textEncoder.encode(args.user_agent);
		payload.set(uaBytes, USER_AGENT_BYTES_OFFSET + 1);
	} else {
		payload.set([0x0], USER_AGENT_BYTES_OFFSET);
	}

	let START_HEIGHT_OFFSET =
		USER_AGENT_BYTES_OFFSET + SIZES.USER_AGENT_BYTES + SIZES.USER_AGENT_STRING;
	{
		let heightBytes = uint32ToBytesLE(args.start_height);
		payload.set(heightBytes, START_HEIGHT_OFFSET);
	}

	let RELAY_OFFSET = START_HEIGHT_OFFSET + SIZES.START_HEIGHT;
	if (args.relay !== null) {
		payload.set([args.relay ? 0x01 : 0x00], RELAY_OFFSET);
	}

	let MNAUTH_CHALLENGE_OFFSET = RELAY_OFFSET + SIZES.RELAY;
	if (!args.mnauth_challenge) {
		let rnd = new Uint8Array(32);
		Crypto.getRandomValues(rnd);
		args.mnauth_challenge = rnd;
	}
	payload.set(args.mnauth_challenge, MNAUTH_CHALLENGE_OFFSET);

	let MNAUTH_CONNECTION_OFFSET = MNAUTH_CHALLENGE_OFFSET + SIZES.MN_CONNECTION;
	if (args.mn_connection) {
		payload.set(0x01, MNAUTH_CONNECTION_OFFSET);
	}

	payload = DarkSend.packMessage({ network, command, payload });
	return payload;
};

/**
 * In this case the only bytes are the nonce
 * Use a .subarray(offset) to define an offset.
 * (a manual offset will not work consistently, and .byteOffset is context-sensitive)
 */
DarkSend.packPong = function pong({ bytes = null, nonce = null }) {
	if (!bytes) {
		bytes = new Uint8Array(DarkSend.PING_SIZE);
	}

	if (!nonce) {
		nonce = bytes;
		Crypto.getRandomValues(nonce);
	} else if (bytes !== nonce) {
		bytes.set(nonce, 0);
	}

	return bytes;
};

/**
 * Just a boolean
 */
DarkSend.packSendDsq = function ({ network, message = null, send = true }) {
	const command = 'senddsq';

	if (!message) {
		let dsqSize = DarkSend.HEADER_SIZE + DarkSend.DSQ_SIZE;
		message = new Uint8Array(dsqSize);
	}

	let sendByte = [0x01];
	if (!send) {
		sendByte = [0x00];
	}
	let payload = message.subarray(DarkSend.HEADER_SIZE);
	payload.set(sendByte, 0);

	void DarkSend.packMessage({ network, command, bytes: message });

	return message;
};

DarkSend.packAllow = function ({ network, denomination, collateralTx }) {
	const command = 'dsa';
	const DENOMINATION_SIZE = 4;

	let denomMask = CoinJoin.STANDARD_DENOMINATION_MASKS[denomination];
	if (!denomMask) {
		throw new Error(
			`contact your local Dash representative to vote for denominations of '${denomination}'`,
		);
	}

	let totalLength = DENOMINATION_SIZE + collateralTx.length;
	let payload = new Uint8Array(totalLength);
	let dv = new DataView(payload.buffer);

	let offset = 0;
	console.log(
		'[debug]',
		totalLength,
		payload.length,
		payload.buffer.byteLength,
		offset,
	);
	dv.setUint32(denomMask, offset);

	offset += SIZES.DENOMINATION;
	payload.set(collateralTx, offset);

	let message = DarkSend.packMessage({ network, command, payload });
	return message;
};

DarkSend.packMessage = function ({
	network,
	command,
	bytes = null,
	payload = null,
}) {
	let payloadLength = payload?.byteLength || 0;
	let messageSize = DarkSend.HEADER_SIZE + payloadLength;
	let offset = 0;

	let embeddedPayload = false;
	let message = bytes;
	if (message) {
		if (!payload) {
			payload = message.subarray(DarkSend.HEADER_SIZE);
			payloadLength = payload.byteLength;
			messageSize = DarkSend.HEADER_SIZE + payloadLength;
			embeddedPayload = true;
		}
	} else {
		message = new Uint8Array(messageSize);
	}
	if (message.length !== messageSize) {
		throw new Error(
			`expected bytes of length ${messageSize}, but got ${message.length}`,
		);
	}
	message.set(DarkSend.NETWORKS[network].magic, offset);
	offset += SIZES.MAGIC_BYTES;

	// Set command_name (char[12])
	let nameBytes = textEncoder.encode(command);
	message.set(nameBytes, offset);
	offset += SIZES.COMMAND_NAME;

	// Finally, append the payload to the header
	if (!payload) {
		// skip because it's already initialized to 0
		//message.set(payloadLength, offset);
		offset += SIZES.PAYLOAD_SIZE;

		message.set(EMPTY_CHECKSUM, offset);
		return message;
	}

	let payloadSizeBytes = uint32ToBytesLE(payloadLength);
	message.set(payloadSizeBytes, offset);
	offset += SIZES.PAYLOAD_SIZE;

	let checksum = compute_checksum(payload);
	message.set(checksum, offset);
	offset += SIZES.CHECKSUM;

	if (!embeddedPayload) {
		message.set(payload, offset);
	}
	return message;
};

/**
 * First 4 bytes of SHA256(SHA256(payload)) in internal byte order.
 */
function compute_checksum(payload) {
	// TODO this should be node-specific in node for performance reasons
	let hash = Crypto.createHash('sha256').update(payload).digest();
	let hashOfHash = Crypto.createHash('sha256').update(hash).digest();
	return hashOfHash.slice(0, 4);
}

/**
 * @param {String} ipv4
 */
function ipv4ToBytesBE(ipv4) {
	let u8s = [];
	// let u8s = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff /*,0,0,0,0*/];

	let octets = ipv4.split('.');
	for (let octet of octets) {
		let int8 = parseInt(octet);
		u8s.push(int8);
	}

	let bytes = Uint8Array.from(u8s);
	return bytes;
}

function uint32ToBytesLE(n) {
	let u32 = new Uint32Array([n]);
	let u8 = new Uint8Array(u32.buffer);
	return u8;
}

function is_ipv6_mapped_ipv4(ip) {
	return !!ip.match(/^[:]{2}[f]{4}[:]{1}.*$/);
}

/**
 * @typedef {Number} Uint64
 * @typedef {Number} Uint32
 * @typedef {Number} Uint16
 */

/**
 *
 * addr_recv_ip is the ipv6 address of the master node (can be 'ipv4-mapped')
 * @typedef {String} Ipv6Addr
 */
