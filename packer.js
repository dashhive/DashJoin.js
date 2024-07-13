//@ts-ignore
var CJPacker = ('object' === typeof module && exports) || {};
(function (window, CJPacker) {
	'use strict';

	let Crypto = window.crypto || require('node:crypto');
	let DashTx = window.DashTx || require('dashtx');

	// TODO the spec seems to be more of an ID, though
	// the implementation makes it look more like a mask...
	let STANDARD_DENOMINATION_MASKS = {
		//  0.00100001
		100001: 0b00010000,
		//  0.01000010
		1000010: 0b00001000,
		//  0.10000100
		10000100: 0b00000100,
		//  1.00001000
		100001000: 0b00000010,
		// 10.00010000
		1000010000: 0b00000001,
	};

	CJPacker.PROTOCOL_VERSION = 70227;

	CJPacker.FIELD_SIZES = {
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

	CJPacker.RELAY_PROTOCOL_VERSION_INTRODUCTION = 70001;
	CJPacker.MNAUTH_PROTOCOL_VERSION_INTRODUCTION = 70214;

	let textEncoder = new TextEncoder();

	let SIZES = {
		MAGIC_BYTES: 4,
		COMMAND_NAME: 12,
		PAYLOAD_SIZE: 4,
		CHECKSUM: 4,
	};
	const TOTAL_HEADER_SIZE =
		SIZES.MAGIC_BYTES +
		SIZES.COMMAND_NAME +
		SIZES.PAYLOAD_SIZE +
		SIZES.CHECKSUM;
	CJPacker.HEADER_SIZE = TOTAL_HEADER_SIZE;

	CJPacker.PING_SIZE = CJPacker.FIELD_SIZES.NONCE;
	CJPacker.DSQ_SIZE = 1; // bool

	const EMPTY_CHECKSUM = [0x5d, 0xf6, 0xe0, 0xe2];

	/**
	 * @typedef {"mainnet"|"testnet"|"regtest"|"devnet"} NetworkName
	 */

	CJPacker.NETWORKS = {};
	CJPacker.NETWORKS.mainnet = {
		port: 9999,
		magic: new Uint8Array([
			//0xBD6B0CBF,
			0xbf, 0x0c, 0x6b, 0xbd,
		]),
		start: 0xbf0c6bbd,
		nBits: 0x1e0ffff0,
		minimumParticiparts: 3,
	};
	CJPacker.NETWORKS.testnet = {
		port: 19999,
		magic: new Uint8Array([
			//0xFFCAE2CE,
			0xce, 0xe2, 0xca, 0xff,
		]),
		start: 0xcee2caff,
		nBits: 0x1e0ffff0,
		minimumParticiparts: 2,
	};
	CJPacker.NETWORKS.regtest = {
		port: 19899,
		magic: new Uint8Array([
			//0xDCB7C1FC,
			0xfc, 0xc1, 0xb7, 0xdc,
		]),
		start: 0xfcc1b7dc,
		nBits: 0x207fffff,
		minimumParticiparts: 2,
	};
	CJPacker.NETWORKS.devnet = {
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
	 * @prop {Uint32?} [protocol_version] - features (default: CJPacker.PROTOCOL_VERSION)
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
	/* jshint maxstatements:150 */
	/* (it's simply very complex, okay?) */
	CJPacker.version = function ({
		network,
		protocol_version = CJPacker.PROTOCOL_VERSION,
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
		let SIZES = Object.assign({}, CJPacker.FIELD_SIZES);

		if (!CJPacker.NETWORKS[args.network]) {
			throw new Error(`"network" '${args.network}' is invalid.`);
		}
		if (!Array.isArray(args.addr_recv_services)) {
			throw new Error('"addr_recv_services" must be an array');
		}
		if (
			//@ts-ignore - protocol_version has a default value
			args.protocol_version < CJPacker.RELAY_PROTOCOL_VERSION_INTRODUCTION &&
			args.relay !== null
		) {
			throw new Error(
				`"relay" field is not supported in protocol versions prior to ${CJPacker.RELAY_PROTOCOL_VERSION_INTRODUCTION}`,
			);
		}
		if (
			//@ts-ignore - protocol_version has a default value
			args.protocol_version < CJPacker.MNAUTH_PROTOCOL_VERSION_INTRODUCTION &&
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
				args.mnauth_challenge.length !==
				CJPacker.SIZES.MNAUTH_CHALLENGE_NONEMPTY
			) {
				throw new Error(
					`"mnauth_challenge" field must be ${CJPacker.SIZES.MNAUTH_CHALLENGE_NONEMPTY} bytes long`,
				);
			}
		}
		SIZES.USER_AGENT_STRING = args.user_agent?.length || 0;
		if (args.relay !== null) {
			SIZES.RELAY = CJPacker.FIELD_SIZES.RELAY_NONEMPTY;
		}
		// if (args.mnauth_challenge !== null) {
		SIZES.MNAUTH_CHALLENGE = CJPacker.FIELD_SIZES.MNAUTH_CHALLENGE_NONEMPTY;
		// }
		SIZES.MN_CONNECTION = CJPacker.FIELD_SIZES.MN_CONNECTION_NONEMPTY;

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

		//@ts-ignore - protocol_version has a default value
		let versionBytes = uint32ToBytesLE(args.protocol_version);
		payload.set(versionBytes, 0);

		/**
		 * Set services to NODE_NETWORK (1) + NODE_BLOOM (4)
		 */
		const SERVICES_OFFSET = SIZES.VERSION;
		let senderServicesBytes;
		{
			let senderServicesMask = 0n;
			//@ts-ignore - addr_trans_services has a default value of []
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
			//@ts-ignore - addr_recv_services has a default value
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
		let ADDR_TRANS_SERVICES_OFFSET =
			ADDR_RECV_PORT_OFFSET + SIZES.ADDR_RECV_PORT;
		payload.set(senderServicesBytes, ADDR_TRANS_SERVICES_OFFSET);

		/**
		 * We add the extra 10, so that we can encode an ipv4-mapped ipv6 address
		 */
		let ADDR_TRANS_IP_OFFSET =
			ADDR_TRANS_SERVICES_OFFSET + SIZES.ADDR_TRANS_SERVICES;
		{
			//@ts-ignore - addr_trans_ip has a default value
			if (is_ipv6_mapped_ipv4(args.addr_trans_ip)) {
				//@ts-ignore - addr_trans_ip has a default value
				let ipv6Parts = args.addr_trans_ip.split(':');
				let ipv4Str = ipv6Parts.at(-1);
				//@ts-ignore - guaranteed to be defined, actually
				let ipBytesBE = ipv4ToBytesBE(ipv4Str);
				payload.set(ipBytesBE, ADDR_TRANS_IP_OFFSET + 12);
				payload.set([0xff, 0xff], ADDR_TRANS_IP_OFFSET + 10); // we add the 10 so that we can fill the latter 6 bytes
			} else {
				/** TODO: ipv4-only & ipv6-only */
				//@ts-ignore - addr_trans_ip has a default value
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
			USER_AGENT_BYTES_OFFSET +
			SIZES.USER_AGENT_BYTES +
			SIZES.USER_AGENT_STRING;
		{
			let heightBytes = uint32ToBytesLE(args.start_height);
			payload.set(heightBytes, START_HEIGHT_OFFSET);
		}

		let RELAY_OFFSET = START_HEIGHT_OFFSET + SIZES.START_HEIGHT;
		if (args.relay !== null) {
			let bytes = [0x00];
			if (args.relay) {
				bytes[0] = 0x01;
			}
			payload.set(bytes, RELAY_OFFSET);
		}

		let MNAUTH_CHALLENGE_OFFSET = RELAY_OFFSET + SIZES.RELAY;
		if (!args.mnauth_challenge) {
			let rnd = new Uint8Array(32);
			Crypto.getRandomValues(rnd);
			args.mnauth_challenge = rnd;
		}
		payload.set(args.mnauth_challenge, MNAUTH_CHALLENGE_OFFSET);

		// let MNAUTH_CONNECTION_OFFSET = MNAUTH_CHALLENGE_OFFSET + SIZES.MN_CONNECTION;
		// if (args.mn_connection) {
		// 	payload.set([0x01], MNAUTH_CONNECTION_OFFSET);
		// }

		payload = CJPacker.packMessage({ network, command, payload });
		return payload;
	};

	/**
	 * In this case the only bytes are the nonce
	 * Use a .subarray(offset) to define an offset.
	 * (a manual offset will not work consistently, and .byteOffset is context-sensitive)
	 * @param {Object} opts
	 * @param {NetworkName} opts.network - "mainnet", "testnet", etc
	 * @param {Uint8Array?} [opts.message]
	 * @param {Uint8Array?} [opts.nonce]
	 */
	CJPacker.packPing = function ({ network, message = null, nonce = null }) {
		const command = 'ping';

		if (!message) {
			let pingSize = CJPacker.HEADER_SIZE + CJPacker.PING_SIZE;
			message = new Uint8Array(pingSize);
		}
		let payload = message.subarray(CJPacker.HEADER_SIZE);

		if (!nonce) {
			nonce = payload;
			Crypto.getRandomValues(nonce);
		} else {
			payload.set(nonce, 0);
		}

		void CJPacker.packMessage({ network, command, bytes: message });
		return message;
	};

	/**
	 * In this case the only bytes are the nonce
	 * Use a .subarray(offset) to define an offset.
	 * (a manual offset will not work consistently, and .byteOffset is context-sensitive)
	 * @param {Object} opts
	 * @param {NetworkName} opts.network - "mainnet", "testnet", etc
	 * @param {Uint8Array?} [opts.message]
	 * @param {Uint8Array} opts.nonce
	 */
	CJPacker.packPong = function ({ network, message = null, nonce }) {
		const command = 'pong';

		if (!message) {
			let pongSize = CJPacker.HEADER_SIZE + CJPacker.PING_SIZE;
			message = new Uint8Array(pongSize);
		}
		let payload = message.subarray(CJPacker.HEADER_SIZE);
		payload.set(nonce, 0);

		void CJPacker.packMessage({ network, command, bytes: message });
		return message;
	};

	/**
	 * Turns on or off DSQ messages (necessary for CoinJoin, but off by default)
	 * @param {Object} opts
	 * @param {NetworkName} opts.network - "mainnet", "testnet", etc
	 * @param {Uint8Array?} [opts.message]
	 * @param {Boolean?} [opts.send]
	 */
	CJPacker.packSendDsq = function ({ network, message = null, send = true }) {
		const command = 'senddsq';

		if (!message) {
			let dsqSize = CJPacker.HEADER_SIZE + CJPacker.DSQ_SIZE;
			message = new Uint8Array(dsqSize);
		}

		let sendByte = [0x01];
		if (!send) {
			sendByte = [0x00];
		}
		let payload = message.subarray(CJPacker.HEADER_SIZE);
		payload.set(sendByte, 0);

		void CJPacker.packMessage({ network, command, bytes: message });

		return message;
	};

	/**
	 * @param {Object} opts
	 * @param {NetworkName} opts.network - "mainnet", "testnet", etc
	 * @param {Uint32} opts.denomination
	 * @param {Uint8Array} opts.collateralTx
	 */
	CJPacker.packAllow = function ({ network, denomination, collateralTx }) {
		const command = 'dsa';
		const DENOMINATION_SIZE = 4;

		//@ts-ignore - numbers can be used as map keys
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

		let DV_LITTLE_ENDIAN = true;
		dv.setUint32(offset, denomMask, DV_LITTLE_ENDIAN);
		offset += DENOMINATION_SIZE;

		payload.set(collateralTx, offset);

		let message = CJPacker.packMessage({ network, command, payload });
		return message;
	};

	/**
	 * @param {Object} opts
	 * @param {NetworkName} opts.network - "mainnet", "testnet", etc
	 * @param {Array<import('dashtx').TxInput>} opts.inputs
	 * @param {Array<import('dashtx').TxOutput>} opts.outputs
	 * @param {Uint8Array} opts.collateralTx
	 */
	CJPacker.packDsi = function ({ network, inputs, collateralTx, outputs }) {
		const command = 'dsi';

		let neutered = [];
		for (let input of inputs) {
			let _input = {
				txId: input.txId || input.txid,
				txid: input.txid || input.txId,
				outputIndex: input.outputIndex,
			};
			neutered.push(_input);
		}

		let inputsHex = DashTx.serializeInputs(inputs);
		let inputHex = inputsHex.join('');
		let outputsHex = DashTx.serializeOutputs(outputs);
		let outputHex = outputsHex.join('');

		let len = collateralTx.length;
		len += inputHex.length / 2;
		len += outputHex.length / 2;
		let bytes = new Uint8Array(CJPacker.HEADER_SIZE + len);

		let offset = CJPacker.HEADER_SIZE;

		{
			let inputsPayload = bytes.subarray(offset);
			let j = 0;
			for (let i = 0; i < inputHex.length; i += 2) {
				let end = i + 2;
				let hex = inputHex.slice(i, end);
				inputsPayload[j] = parseInt(hex, 16);
				j += 1;
			}
			offset += inputHex.length / 2;
		}

		bytes.set(collateralTx, offset);
		offset += collateralTx.length;

		{
			let outputsPayload = bytes.subarray(offset);
			let j = 0;
			for (let i = 0; i < outputHex.length; i += 2) {
				let end = i + 2;
				let hex = outputHex.slice(i, end);
				outputsPayload[j] = parseInt(hex, 16);
				j += 1;
			}
			offset += outputHex.length / 2;
		}

		void CJPacker.packMessage({ network, command, bytes });
		return bytes;
	};

	/**
	 * @param {Object} opts
	 * @param {NetworkName} opts.network - "mainnet", "testnet", etc
	 * @param {Array<import('dashtx').CoreUtxo>} [opts.inputs]
	 */
	CJPacker.packDss = function ({ network, inputs }) {
		const command = 'dss';

		if (!inputs?.length) {
			// TODO make better
			throw new Error('you must provide some inputs');
		}

		let txInputsHex = DashTx.serializeInputs(inputs);
		let txInputHex = txInputsHex.join('');
		let payload = DashTx.utils.hexToBytes(txInputHex);

		// TODO prealloc bytes
		let bytes = CJPacker.packMessage({ network, command, payload });
		return bytes;
	};

	/**
	 * @param {Object} opts
	 * @param {NetworkName} opts.network - "mainnet", "testnet", etc
	 * @param {String} opts.command
	 * @param {Uint8Array?} [opts.bytes]
	 * @param {Uint8Array?} [opts.payload]
	 */
	CJPacker.packMessage = function ({
		network,
		command,
		bytes = null,
		payload = null,
	}) {
		let payloadLength = payload?.byteLength || 0;
		let messageSize = CJPacker.HEADER_SIZE + payloadLength;
		let offset = 0;

		let embeddedPayload = false;
		let message = bytes;
		if (message) {
			if (!payload) {
				payload = message.subarray(CJPacker.HEADER_SIZE);
				payloadLength = payload.byteLength;
				messageSize = CJPacker.HEADER_SIZE + payloadLength;
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
		message.set(CJPacker.NETWORKS[network].magic, offset);
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

		let checksum = CJPacker.checksum(payload);
		message.set(checksum, offset);
		offset += SIZES.CHECKSUM;

		if (!embeddedPayload) {
			message.set(payload, offset);
		}
		return message;
	};

	/**
	 * First 4 bytes of SHA256(SHA256(payload)) in internal byte order.
	 * @param {Uint8Array} payload
	 */
	CJPacker.checksum = function (payload) {
		// TODO this should be node-specific in node for performance reasons
		if (Crypto.createHash) {
			let hash = Crypto.createHash('sha256').update(payload).digest();
			let hashOfHash = Crypto.createHash('sha256').update(hash).digest();
			return hashOfHash.slice(0, 4);
		}

		let hash = sha256(payload);
		let hashOfHash = sha256(hash);
		return hashOfHash.slice(0, 4);
	};

	/**
	 * @param {Uint8Array} bytes
	 */
	function sha256(bytes) {
		let K = new Uint32Array([
			0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
			0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
			0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
			0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
			0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
			0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
			0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
			0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
			0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
			0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
			0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
		]);

		/**
		 * @param {Number} value
		 * @param {Number} amount
		 */
		function rightRotate(value, amount) {
			return (value >>> amount) | (value << (32 - amount));
		}

		let H = new Uint32Array([
			0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
			0x1f83d9ab, 0x5be0cd19,
		]);

		let padded = new Uint8Array((bytes.length + 9 + 63) & ~63);
		padded.set(bytes);
		padded[bytes.length] = 0x80;
		let dv = new DataView(padded.buffer);
		dv.setUint32(padded.length - 4, bytes.length << 3, false);

		let w = new Uint32Array(64);
		for (let i = 0; i < padded.length; i += 64) {
			for (let j = 0; j < 16; j += 1) {
				w[j] =
					(padded[i + 4 * j] << 24) |
					(padded[i + 4 * j + 1] << 16) |
					(padded[i + 4 * j + 2] << 8) |
					padded[i + 4 * j + 3];
			}
			for (let j = 16; j < 64; j += 1) {
				let w1 = w[j - 15];
				let w2 = w[j - 2];
				let s0 = rightRotate(w1, 7) ^ rightRotate(w1, 18) ^ (w1 >>> 3);
				let s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
				w[j] = w[j - 16] + s0 + w[j - 7] + s1;
			}

			let [a, b, c, d, e, f, g, h] = H;
			for (let j = 0; j < 64; j += 1) {
				let S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
				let ch = (e & f) ^ (~e & g);
				let temp1 = h + S1 + ch + K[j] + w[j];
				let S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
				let maj = (a & b) ^ (a & c) ^ (b & c);
				let temp2 = S0 + maj;

				h = g;
				g = f;
				f = e;
				e = d + temp1;
				d = c;
				c = b;
				b = a;
				a = temp1 + temp2;
			}

			H[0] += a;
			H[1] += b;
			H[2] += c;
			H[3] += d;
			H[4] += e;
			H[5] += f;
			H[6] += g;
			H[7] += h;
		}

		let numBytes = H.length * 4;
		let hash = new Uint8Array(numBytes);
		for (let i = 0; i < H.length; i += 1) {
			hash[i * 4] = (H[i] >>> 24) & 0xff;
			hash[i * 4 + 1] = (H[i] >>> 16) & 0xff;
			hash[i * 4 + 2] = (H[i] >>> 8) & 0xff;
			hash[i * 4 + 3] = H[i] & 0xff;
		}
		return hash;
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

	/**
	 * @param {Uint32} n
	 */
	function uint32ToBytesLE(n) {
		let u32 = new Uint32Array([n]);
		let u8 = new Uint8Array(u32.buffer);
		return u8;
	}

	/**
	 * @param {String} ip
	 */
	function is_ipv6_mapped_ipv4(ip) {
		return !!ip.match(/^[:]{2}[f]{4}[:]{1}.*$/);
	}

	// @ts-ignore
	window.CJPacker = CJPacker;
})(('object' === typeof window && window) || {}, CJPacker);
if ('object' === typeof module) {
	module.exports = CJPacker;
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
