// TODO
// create byte stream socket
// auto handle version / verack
// auto handle ping / pong
// auto pool inv
// emit other messages
// reciprocal parsers and packers
// no backwards-compat with really old legacy clients

var DashP2P = ('object' === typeof module && exports) || {};
(function (window, DashP2P) {
	'use strict';

	const DV_LITTLE_ENDIAN = true;

	let EMPTY_CHECKSUM_BYTES = [0x5d, 0xf6, 0xe0, 0xe2];
	let E_CLOSE = {
		code: 'E_CLOSE',
		message: 'promise stream closed',
	};

	const PAYLOAD_SIZE_MAX = 4 * 1024 * 1024;
	DashP2P.PAYLOAD_SIZE_MAX = PAYLOAD_SIZE_MAX;

	let SIZES = {
		// header
		MAGIC_BYTES: 4,
		COMMAND_NAME: 12,
		PAYLOAD_SIZE: 4,
		CHECKSUM: 4,
		// version
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
		// RELAY: 0,
		RELAY_NONEMPTY: 1,
		// MNAUTH_CHALLENGE: 0,
		MNAUTH_CHALLENGE_NONEMPTY: 32,
		// MN_CONNECTION: 0,
		MN_CONNECTION_NONEMPTY: 1,
	};

	let Crypto = globalThis.crypto;
	let textDecoder = new TextDecoder();
	let textEncoder = new TextEncoder();

	let Packers = {};
	let Parsers = {};
	let Sizes = {};
	let Utils = {};

	DashP2P.create = function () {
		const HEADER_SIZE = Sizes.HEADER;

		let p2p = {};
		p2p.state = 'header';
		/** @type {Array<Uint8Array>} */
		p2p.chunks = [];
		p2p.chunksLength = 0;
		/** @type {Error?} */
		p2p.error = null;
		/** @type {Parser.Header?} */
		p2p.header = null;
		/** @type {Uint8Array?} */
		p2p.payload = null;
		let explicitEvents = ['version', 'verack', 'ping', 'pong'];
		p2p._eventStream = Utils.EventStream.create(explicitEvents);

		p2p._wsc = null;
		p2p.send = function (bytes) {
			throw new Error('no socket has been initialized');
		};
		p2p.close = function () {
			throw new Error('no socket has been initialized');
		};
		p2p._close = function (bytes) {
			try {
				p2p._eventStream.close();
			} catch (e) {
				console.error('error closing event stream:', e);
			}
		};

		p2p.createSubscriber = p2p._eventStream.createSubscriber;

		p2p.initWebSocket = async function (
			wsc,
			{ network, hostname, port, start_height },
		) {
			p2p._wsc = wsc;

			p2p.send = function (bytes) {
				return wsc.send(bytes);
			};

			p2p.close = function () {
				try {
					wsc.close();
				} catch (e) {
					console.error('error closing websocket:', e);
				}
				p2p._close(true);
			};

			wsc.addEventListener('message', async function (wsevent) {
				let ab = await wsevent.data.arrayBuffer();
				let bytes = new Uint8Array(ab);
				console.log(
					`%c ws.onmessage => p2p.processBytes(bytes) [${bytes.length}]`,
					`color: #bada55`,
				);
				p2p.processBytes(bytes);
			});

			wsc.addEventListener('open', async function () {
				{
					let versionBytes = DashP2P.packers.version({
						network: network,
						addr_recv_ip: hostname,
						addr_recv_port: port,
						start_height: start_height,
					});
					console.log('DEBUG wsc.send(versionBytes)');
					wsc.send(versionBytes);
				}

				{
					let verackBytes = DashP2P.packers.verack({ network: network });
					console.log('DEBUG wsc.send(verackBytes)');
					wsc.send(verackBytes);
				}
			});

			wsc.addEventListener('close', p2p.close);

			let evstream = p2p.createSubscriber(['version', 'verack', 'ping']);
			console.log('%c subscribed', 'color: red');

			void (await evstream.once('version'));
			console.log('%c[[version]] PROCESSED', 'color: red');
			// void (await evstream.once('verack'));
			// console.log('%c[[verack]] PROCESSED', 'color: red');

			(async function () {
				for (;;) {
					let msg = await evstream.once('ping');
					console.log('%c received ping', 'color: red');
					let pongBytes = DashP2P.packers.pong({
						network: network,
						nonce: msg.payload,
					});
					console.log('%c[[PING]] wsc.send(pongBytes)', 'color: blue;');
					wsc.send(pongBytes);
				}
			})().catch(DashP2P.createCatchClose(['ping']));

			return;
		};

		/** @param {Uint8Array?} */
		p2p.processBytes = function (chunk) {
			if (p2p.state === 'error') {
				p2p._eventStream.rejectAll(p2p.error);

				// in the case of UDP where we miss a packet,
				// we can log the error but still resume on the next one.
				p2p.chunks = [];
				p2p.chunksLength = 0;
				p2p.state = 'header';
			}

			if (p2p.state === 'header') {
				p2p.processHeaderBytes(chunk);
				return;
			}

			if (p2p.state === 'payload') {
				p2p.processPayloadBytes(chunk);
				return;
			}

			if (p2p.state === 'result') {
				let cmd = p2p.header.command;
				let len = p2p.payload?.length || 0;
				console.info(`%c[[RCV: ${cmd}]]`, `color: purple`, len);
				let msg = {
					command: p2p.header.command,
					header: p2p.header,
					payload: p2p.payload,
				};
				p2p._eventStream.emit(msg.command, msg);

				p2p.state = 'header';
				p2p.processBytes(chunk);
				return;
			}

			let err = new Error(`developer error: unknown state '${p2p.state}'`);
			p2p._eventStream.rejectAll(err);
			p2p.state = 'header';
			p2p.processBytes(chunk);
		};

		/**
		 * @param {Uint8Array?} chunk
		 */
		p2p.processHeaderBytes = function (chunk) {
			if (chunk) {
				p2p.chunks.push(chunk);
				p2p.chunksLength += chunk.byteLength;
			}
			if (p2p.chunksLength < HEADER_SIZE) {
				if (chunk) {
					console.log('... partial header');
				}
				return;
			}

			chunk = Utils.concatBytes(p2p.chunks, p2p.chunksLength);

			p2p.chunks = [];
			p2p.chunksLength = 0;
			if (chunk.byteLength > HEADER_SIZE) {
				let nextChunk = chunk.slice(HEADER_SIZE);
				p2p.chunks.push(nextChunk);
				p2p.chunksLength += nextChunk.byteLength;
				chunk = chunk.slice(0, HEADER_SIZE);
			}

			// 'header' is complete, on to 'payload'
			try {
				p2p.header = Parsers.header(chunk);
			} catch (e) {
				p2p.state = 'error';
				p2p.error = new Error(`header parse error: ${e.message}`);
				// TODO maybe throw away all chunks?
				console.error(e);
				console.error(chunk);
				return;
			}

			p2p.state = 'payload';
			if (p2p.header.payloadSize > DashP2P.PAYLOAD_SIZE_MAX) {
				p2p.state = 'error';
				p2p.error = new Error(
					`header's payload size ${p2p.header.payloadSize} is larger than the maximum allowed size of ${DashP2P.PAYLOAD_SIZE_MAX}`,
				);
				return;
			}

			if (p2p.header.payloadSize === 0) {
				// 'payload' is complete (skipped), on to the 'result'
				p2p.state = 'result';
				p2p.payload = null;
			}

			let nextChunk = p2p.chunks.pop();
			p2p.processBytes(nextChunk);
		};

		/**
		 * @param {Uint8Array?} bytes
		 */
		p2p.processPayloadBytes = function (chunk) {
			if (chunk) {
				p2p.chunks.push(chunk);
				p2p.chunksLength += chunk.byteLength;
			}
			if (p2p.chunksLength < p2p.header.payloadSize) {
				if (chunk) {
					console.log('... partial payload');
				}
				return;
			}

			chunk = Utils.concatBytes(p2p.chunks, p2p.chunksLength);
			p2p.chunks = [];
			p2p.chunksLength = 0;

			if (chunk.byteLength > p2p.header.payloadSize) {
				let nextChunk = chunk.slice(p2p.header.payloadSize);
				p2p.chunks.push(nextChunk);
				p2p.chunksLength += chunk.byteLength;
				chunk = chunk.slice(0, p2p.header.payloadSize);
			}
			p2p.state = 'result';
			p2p.payload = chunk;

			let nextChunk = p2p.chunks.pop();
			p2p.processBytes(nextChunk);
		};

		return p2p;
	};

	DashP2P.createCatchClose = function (names) {
		function catchClose(err) {
			if (err.code !== 'E_CLOSE') {
				console.error(
					`error caused '${names}' event stream to close unexpectedly:`,
				);
				console.error(err);
			}
		}
		return catchClose;
	};

	DashP2P.catchClose = function (err) {
		if (err.code !== 'E_CLOSE') {
			console.error(`error caused event stream to close unexpectedly:`);
			console.error(err);
		}
	};

	const TOTAL_HEADER_SIZE =
		SIZES.MAGIC_BYTES + // 4
		SIZES.COMMAND_NAME + // 12
		SIZES.PAYLOAD_SIZE + // 4
		SIZES.CHECKSUM; // 4
	Sizes.HEADER = TOTAL_HEADER_SIZE; // 24
	Sizes.PING = SIZES.NONCE; // same as pong
	Sizes.VERACK = 0;

	Packers.PROTOCOL_VERSION = 70227;
	Packers.NETWORKS = {};
	Packers.NETWORKS.mainnet = {
		port: 9999,
		magic: new Uint8Array([
			//0xBD6B0CBF,
			0xbf, 0x0c, 0x6b, 0xbd,
		]),
		start: 0xbf0c6bbd,
		nBits: 0x1e0ffff0,
		minimumParticiparts: 3,
	};
	Packers.NETWORKS.testnet = {
		port: 19999,
		magic: new Uint8Array([
			//0xFFCAE2CE,
			0xce, 0xe2, 0xca, 0xff,
		]),
		start: 0xcee2caff,
		nBits: 0x1e0ffff0,
		minimumParticiparts: 2,
	};
	Packers.NETWORKS.regtest = {
		port: 19899,
		magic: new Uint8Array([
			//0xDCB7C1FC,
			0xfc, 0xc1, 0xb7, 0xdc,
		]),
		start: 0xfcc1b7dc,
		nBits: 0x207fffff,
		minimumParticiparts: 2,
	};
	Packers.NETWORKS.devnet = {
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
	Packers.SERVICE_IDENTIFIERS = SERVICE_IDENTIFIERS;

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
	//SERVICE_IDENTIFIERS.GETUTXO = 0x02;

	/**
	 * NODE_BLOOM:
	 * 	This node is capable and willing to handle bloom-
	 * 	filtered connections. Dash Core nodes used to support
	 * 	this by default, without advertising this bit, but
	 * 	no longer do as of protocol version 70201
	 * 	(= NO_BLOOM_VERSION)
	 */
	// SERVICE_IDENTIFIERS.BLOOM = 0x04;

	/**
	 * 0x08 is not supported by Dash
	 */

	/**
	 * NODE_NETWORK_LIMITED:
	 * 	This is the same as NODE_NETWORK with the
	 * 	limitation of only serving the last 288 blocks.
	 * 	Not supported prior to Dash Core 0.16.0
	 */
	// SERVICE_IDENTIFIERS.NETWORK_LIMITED = 0x400;

	/**
	 * @param {PackMessage} opts
	 */
	Packers.message = function ({
		network,
		command,
		bytes = null,
		payload = null,
	}) {
		if (!Packers.NETWORKS[network]) {
			throw new Error(`"network" '${network}' is invalid.`);
		}

		let payloadLength = payload?.byteLength || 0;
		let messageSize = Sizes.HEADER + payloadLength;
		let offset = 0;

		let embeddedPayload = false;
		let message = bytes;
		if (message) {
			if (!payload) {
				payload = message.subarray(Sizes.HEADER);
				payloadLength = payload.byteLength;
				messageSize = Sizes.HEADER + payloadLength;
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
		message.set(Packers.NETWORKS[network].magic, offset);
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

			message.set(EMPTY_CHECKSUM_BYTES, offset);
			return message;
		}

		let payloadSizeBytes = Utils._uint32ToBytesLE(payloadLength);
		message.set(payloadSizeBytes, offset);
		offset += SIZES.PAYLOAD_SIZE;

		let checksum = Packers._checksum(payload);
		message.set(checksum, offset);
		offset += SIZES.CHECKSUM;

		if (!embeddedPayload) {
			message.set(payload, offset);
		}
		return message;
	};

	/**
	 * Returns a correctly-sized buffer and subarray into the payload
	 * @param {Uint8Array} bytes
	 * @param {Uint16} payloadSize
	 */
	Packers._alloc = function (bytes, payloadSize) {
		let messageSize = DashP2P.sizes.HEADER + payloadSize;
		if (!bytes) {
			bytes = new Uint8Array(messageSize);
		} else if (bytes.length !== messageSize) {
			if (bytes.length < messageSize) {
				let msg = `the provided buffer is only ${bytes.length} bytes, but at least ${messageSize} are needed`;
				throw new Error(msg);
			}
			bytes = bytes.subarray(0, messageSize);
		}

		let payload = bytes.subarray(DashP2P.sizes.HEADER);

		return [bytes, payload];
	};

	/**
	 * First 4 bytes of SHA256(SHA256(payload)) in internal byte order.
	 * @param {Uint8Array} payload
	 */
	Packers._checksum = function (payload) {
		// TODO this should be node-specific in node for performance reasons
		if (Crypto.createHash) {
			let hash = Crypto.createHash('sha256').update(payload).digest();
			let hashOfHash = Crypto.createHash('sha256').update(hash).digest();
			return hashOfHash.slice(0, 4);
		}

		let hash = Utils.sha256(payload);
		let hashOfHash = Utils.sha256(hash);
		return hashOfHash.slice(0, 4);
	};

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
	Packers.version = function ({
		network = 'mainnet',
		message,
		protocol_version = Packers.PROTOCOL_VERSION,
		// alias of addr_trans_services
		//services,
		addr_recv_services = [SERVICE_IDENTIFIERS.NETWORK],
		addr_recv_ip, // required to match
		addr_recv_port, // required to match
		addr_trans_services = [],
		addr_trans_ip = '127.0.0.1',
		addr_trans_port = Math.ceil(65535 * Math.random()),
		start_height,
		nonce = null,
		user_agent = null,
		relay = null,
		mnauth_challenge = null,
	}) {
		const command = 'version';

		if (!Array.isArray(addr_recv_services)) {
			throw new Error('"addr_recv_services" must be an array');
		}
		if (mnauth_challenge !== null) {
			if (!(mnauth_challenge instanceof Uint8Array)) {
				throw new Error('"mnauth_challenge" field must be a Uint8Array');
			}
			if (mnauth_challenge.length !== SIZES.MNAUTH_CHALLENGE_NONEMPTY) {
				throw new Error(
					`"mnauth_challenge" field must be ${SIZES.MNAUTH_CHALLENGE_NONEMPTY} bytes long, not ${mnauth_challenge.length}`,
				);
			}
		}

		let sizes = {
			userAgentString: user_agent?.length || 0,
			relay: 0,
			mnauthChallenge: 0,
			mnConnection: 0,
		};
		if (relay !== null) {
			sizes.relay = SIZES.RELAY_NONEMPTY;
		}
		sizes.mnauthChallenge = SIZES.MNAUTH_CHALLENGE_NONEMPTY;
		sizes.mnConnection = SIZES.MN_CONNECTION_NONEMPTY;

		let versionSize =
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
			sizes.userAgentString + // calc
			SIZES.START_HEIGHT +
			sizes.relay + // calc
			sizes.mnauthChallenge + // calc
			sizes.mnConnection; // calc

		let [bytes, payload] = Packers._alloc(message, versionSize);

		// Protocol version
		//@ts-ignore - protocol_version has a default value
		let versionBytes = Utils._uint32ToBytesLE(protocol_version);
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
			let tsBytes = Utils._uint32ToBytesLE(Date.now());
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
			let ipBytesBE = Utils._ipv4ToBytesBE(addr_recv_ip);
			payload.set([0xff, 0xff], ADDR_RECV_IP_OFFSET + 10);
			payload.set(ipBytesBE, ADDR_RECV_IP_OFFSET + 12);
		}

		/**
		 * Copy address recv port
		 */
		let ADDR_RECV_PORT_OFFSET = ADDR_RECV_IP_OFFSET + SIZES.ADDR_RECV_IP;
		{
			let portBytes16 = Uint16Array.from([addr_recv_port]);
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
			let isIpv6Mapped = addr_trans_ip.startsWith('::ffff:');
			if (isIpv6Mapped) {
				//@ts-ignore - addr_trans_ip has a default value
				let ipv6Parts = addr_trans_ip.split(':');
				let ipv4Str = ipv6Parts.at(-1);
				//@ts-ignore - guaranteed to be defined, actually
				let ipBytesBE = Utils._ipv4ToBytesBE(ipv4Str);
				payload.set(ipBytesBE, ADDR_TRANS_IP_OFFSET + 12);
				payload.set([0xff, 0xff], ADDR_TRANS_IP_OFFSET + 10); // we add the 10 so that we can fill the latter 6 bytes
			} else {
				/** TODO: ipv4-only & ipv6-only */
				//@ts-ignore - addr_trans_ip has a default value
				let ipBytesBE = Utils._ipv4ToBytesBE(addr_trans_ip);
				payload.set(ipBytesBE, ADDR_TRANS_IP_OFFSET + 12);
				payload.set([0xff, 0xff], ADDR_TRANS_IP_OFFSET + 10); // we add the 10 so that we can fill the latter 6 bytes
			}
		}

		let ADDR_TRANS_PORT_OFFSET = ADDR_TRANS_IP_OFFSET + SIZES.ADDR_TRANS_IP;
		{
			let portBytes16 = Uint16Array.from([addr_trans_port]);
			let portBytes = new Uint8Array(portBytes16.buffer);
			portBytes.reverse();
			payload.set(portBytes, ADDR_TRANS_PORT_OFFSET);
		}

		// TODO we should set this to prevent duplicate broadcast
		// this can be left zero
		let NONCE_OFFSET = ADDR_TRANS_PORT_OFFSET + SIZES.ADDR_TRANS_PORT;
		if (!nonce) {
			nonce = new Uint8Array(SIZES.NONCE);
			Crypto.getRandomValues(nonce);
		}
		payload.set(nonce, NONCE_OFFSET);

		let USER_AGENT_BYTES_OFFSET = NONCE_OFFSET + SIZES.NONCE;
		if (null !== user_agent && typeof user_agent === 'string') {
			let userAgentSize = user_agent.length;
			payload.set([userAgentSize], USER_AGENT_BYTES_OFFSET);
			let uaBytes = textEncoder.encode(user_agent);
			payload.set(uaBytes, USER_AGENT_BYTES_OFFSET + 1);
		} else {
			payload.set([0x0], USER_AGENT_BYTES_OFFSET);
		}

		let START_HEIGHT_OFFSET =
			USER_AGENT_BYTES_OFFSET +
			SIZES.USER_AGENT_BYTES +
			SIZES.USER_AGENT_STRING;
		{
			let heightBytes = Utils._uint32ToBytesLE(start_height);
			payload.set(heightBytes, START_HEIGHT_OFFSET);
		}

		let RELAY_OFFSET = START_HEIGHT_OFFSET + SIZES.START_HEIGHT;
		if (relay !== null) {
			let bytes = [0x00];
			if (relay) {
				bytes[0] = 0x01;
			}
			payload.set(bytes, RELAY_OFFSET);
		}

		let MNAUTH_CHALLENGE_OFFSET = RELAY_OFFSET + SIZES.RELAY;
		if (!mnauth_challenge) {
			let rnd = new Uint8Array(32);
			Crypto.getRandomValues(rnd);
			mnauth_challenge = rnd;
		}
		payload.set(mnauth_challenge, MNAUTH_CHALLENGE_OFFSET);

		// let MNAUTH_CONNECTION_OFFSET = MNAUTH_CHALLENGE_OFFSET + SIZES.MN_CONNECTION;
		// if (mn_connection) {
		// 	payload.set([0x01], MNAUTH_CONNECTION_OFFSET);
		// }

		void Packers.message({ network, command, bytes });
		return bytes;
	};

	/**
	 * No payload, just an ACK
	 * @param {Object} opts
	 * @param {NetworkName} opts.network - "mainnet", "testnet", etc
	 * @param {Uint8Array?} [opts.message] - preallocated bytes
	 */
	Packers.verack = function ({ network = 'mainnet', message }) {
		const command = 'verack';
		let [bytes] = Packers._alloc(message, Sizes.VERACK);

		void Packers.message({ network, command, bytes });
		return bytes;
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
	Packers.pong = function ({ network = 'mainnet', message = null, nonce }) {
		const command = 'pong';
		let [bytes, payload] = Packers._alloc(message, Sizes.PING);

		payload.set(nonce, 0);

		void Packers.message({ network, command, bytes });
		return bytes;
	};

	/**
	 * Parse the 24-byte P2P Message Header
	 *   -  4 byte magic bytes (delimiter) (possibly intended for non-tcp messages?)
	 *   - 12 byte string (stop at first null)
	 *   -  4 byte payload size
	 *   -  4 byte checksum
	 *
	 * See also:
	 *     - https://docs.dash.org/projects/core/en/stable/docs/reference/p2p-network-message-headers.html#message-headers
	 * @param {Uint8Array} bytes
	 */
	Parsers.header = function (bytes) {
		if (bytes.length < Sizes.HEADER) {
			let msg = `developer error: header should be ${Sizes.HEADER}+ bytes (optional payload), not ${bytes.length}`;
			throw new Error(msg);
		}
		let dv = new DataView(bytes.buffer, bytes.byteOffset);

		let index = 0;

		let magicBytes = bytes.subarray(index, index + SIZES.MAGIC_BYTES);
		index += SIZES.MAGIC_BYTES; // +4 = 4

		let commandBuf = bytes.subarray(index, index + SIZES.COMMAND_NAME);
		let command = '';
		{
			let commandEnd = commandBuf.indexOf(0x00);
			if (commandEnd !== -1) {
				commandBuf = commandBuf.subarray(0, commandEnd);
			}
			try {
				command = textDecoder.decode(commandBuf);
			} catch (e) {
				// invalid command name
				throw e;
			}
		}
		index += SIZES.COMMAND_NAME; // +12 = 16

		let payloadSize = dv.getUint32(index, DV_LITTLE_ENDIAN);
		index += 1; // +1 = 17

		let checksum = bytes.subarray(index, index + SIZES.CHUCKSUM);
		//index += SIZES.CHECKSUM // +4 = 21 (ends at 20)

		let headerMessage = {
			magicBytes,
			command,
			payloadSize,
			checksum,
		};

		return headerMessage;
	};
	Parsers.SIZES = SIZES;

	/**
	 * @param {String} hex
	 * @param {Uint8Array} payload
	 */
	Utils.hexToPayload = function (hex, payload) {
		let i = 0;
		let index = 0;
		let lastIndex = hex.length - 2;
		for (;;) {
			if (i > lastIndex) {
				break;
			}

			let h = hex.slice(i, i + 2);
			let b = parseInt(h, 16);
			payload[index] = b;

			i += 2;
			index += 1;
		}

		return payload;
	};

	Utils.EventStream = {};

	/** @param {String} events */
	Utils.EventStream.create = function (explicitEvents) {
		let stream = {};

		stream._explicitEvents = explicitEvents;

		/** @type {Array<any>} */
		stream._connections = [];

		/**
		 * @param {Array<String>} events - ex: ['*', 'error'] for default events, or list by name
		 * @param {Function} eventLoopFn - called in a loop until evstream.close()
		 */
		stream.createSubscriber = function (events, eventLoopFn) {
			let conn = Utils.EventStream.createSubscriber(stream, events);
			if (!eventLoopFn) {
				return conn;
			}

			let go = async function (eventLoop, conn) {
				for (;;) {
					await eventLoop(conn);
				}
			};
			go(eventLoopFn, conn).catch(DashP2P.createCatchClose(events));
			return null;
		};

		stream.emit = function (eventname, msg) {
			if (eventname === 'error') {
				return stream.rejectAll(msg);
			}
			for (let p of stream._connections) {
				let isSubscribed = p._events.includes(eventname);
				if (isSubscribed) {
					p._resolve(msg);
					continue;
				}

				let isExplicit = stream._explicitEvents.includes(eventname);
				if (isExplicit) {
					continue;
				}

				let hasCatchall = p._events.includes('*');
				if (hasCatchall) {
					p._resolve(msg);
				}
			}
		};

		stream.rejectAll = function (err) {
			if (!(err instanceof Error)) {
				throw new Error(`'error instanceof Error' must be true for errors`);
			}
			let handled = false;
			for (let p of stream._connections) {
				let handlesErrors = p._events.includes('error');
				if (!handlesErrors) {
					continue;
				}

				handled = true;
				p._reject(err);
			}
			if (!handled) {
				for (let p of stream._connections) {
					p._reject(err);
				}
			}
		};

		stream.close = function () {
			for (let conn of stream._connections) {
				conn._close(true);
			}
		};

		return stream;
	};

	Utils.EventStream.createSubscriber = function (stream, defaultEvents = null) {
		let p = {};
		stream._connections.push(p);

		p._events = defaultEvents;

		p.closed = false;
		p._settled = false;
		p._resolve = function (msg) {};
		p._reject = function (err) {};
		p._promise = Promise.resolve(null);
		p._next = async function () {
			p._settled = false;
			p._promise = new Promise(function (_resolve, _reject) {
				p._resolve = function (msg) {
					// p._close(true);
					_resolve(msg);
				};
				p._reject = function (err) {
					// p._close(true);
					_reject(err);
				};
			});

			return await p._promise;
		};

		/**
		 * Waits for and returns the next message of the given event name,
		 * or of any of the default event names.
		 * @param {String} eventname - '*' for default events, 'error' for error, or others by name
		 */
		p.once = async function (eventname) {
			if (p.closed) {
				let err = new Error('cannot receive new events after close');
				Object.assign(err, { code: 'E_ALREADY_CLOSED' });
				throw err;
			}

			if (eventname) {
				p._events = [eventname];
			} else if (defaultEvents?.length) {
				p._events = defaultEvents;
			} else {
				let err = new Error(
					`call stream.createSubscriber(['*']) or conn.once('*') for default events`,
				);
				Object.assign(err, { code: 'E_NO_EVENTS' });
				throw err;
			}
			console.log('%c[[RESUB]]', 'color: red; font-weight: bold;', p._events);

			return await p._next();
		};

		p._close = function (_settle) {
			if (p.closed) {
				return;
			}
			p.closed = true;

			let index = stream._connections.indexOf(p);
			if (index >= 0) {
				void stream._connections.splice(index, 1);
			}
			if (_settle) {
				p._settled = true;
			}
			if (p._settled) {
				return;
			}

			p._settled = true;
			let err = new Error(E_CLOSE.message);
			Object.assign(err, E_CLOSE);
			p._reject(err);
		};

		/**
		 * Causes `let msg = conn.once()` to fail with E_CLOSE or E_ALREADY_CLOSED
		 */
		p.close = function () {
			p._close(false);
		};

		return p;
	};

	// /** @param {String} events */
	// Utils.createPromiseGenerator = function (events) {
	// 	let g = {};

	// 	g.events = events;

	// 	// g._settled = true;
	// 	g._promise = Promise.resolve(); // for type hint
	// 	g._results = [];

	// 	g.resolve = function (result) {};
	// 	g.reject = function (err) {};

	// 	// g.init = async function () {
	// 	// 	if (!g._settled) {
	// 	// 		console.warn('g.init() called again before previous call was settled');
	// 	// 		return await g._promise;
	// 	// 	}
	// 	// 	g._settled = false;
	// 	g._promise = new Promise(function (_resolve, _reject) {
	// 		g.resolve = _resolve;
	// 		g.reject = _reject;
	// 		// g.resolve = function (result) {
	// 		// 	if (g._settled) {
	// 		// 		g._results.push(result);
	// 		// 		return;
	// 		// 	}
	// 		// 	g._settled = true;
	// 		// 	_resolve(result);
	// 		// };
	// 		// g.reject = function (error) {
	// 		// 	if (g._settled) {
	// 		// 		g._results.push(error);
	// 		// 		return;
	// 		// 	}
	// 		// 	g._settled = true;
	// 		// 	_reject(error);
	// 		// };
	// 	});
	// 	// if (g._results.length) {
	// 	// 	let result = g._results.shift();
	// 	// 	if (result instanceof Error) {
	// 	// 		g.reject(result);
	// 	// 	} else {
	// 	// 		g.resolve(result);
	// 	// 	}
	// 	// }
	// 	// return await g._promise;
	// 	// };

	// 	return g;
	// };

	/**
	 * @param {Array<Uint8Array>} byteArrays
	 * @param {Number?} [len]
	 * @returns {Uint8Array}
	 */
	Utils.concatBytes = function (byteArrays, len) {
		if (byteArrays.length === 1) {
			return byteArrays[0];
		}

		if (!len) {
			for (let bytes of byteArrays) {
				len += bytes.length;
			}
		}

		let allBytes = new Uint8Array(len);
		let offset = 0;
		for (let bytes of byteArrays) {
			allBytes.set(bytes, offset);
			offset += bytes.length;
		}

		return allBytes;
	};

	/**
	 * @param {String} ipv4
	 */
	Utils._ipv4ToBytesBE = function (ipv4) {
		let u8s = [];
		// let u8s = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff /*,0,0,0,0*/];

		let octets = ipv4.split('.');
		for (let octet of octets) {
			let int8 = parseInt(octet);
			u8s.push(int8);
		}

		let bytes = Uint8Array.from(u8s);
		return bytes;
	};

	/**
	 * @param {Uint32} n
	 */
	Utils._uint32ToBytesLE = function (n) {
		let u32 = new Uint32Array([n]);
		let u8 = new Uint8Array(u32.buffer);
		return u8;
	};

	/**
	 * @param {Uint8Array} bytes
	 */
	Utils.sha256 = function (bytes) {
		/* jshint ignore:start */
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
		let dv = new DataView(padded.buffer, padded.byteOffset);
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
		/* jshint ignore:end */
	};

	DashP2P.packers = Packers;
	DashP2P.parsers = Parsers;
	DashP2P.sizes = Sizes;
	DashP2P.utils = Utils;

	//@ts-ignore
	window.DashP2P = DashP2P;
})(globalThis.window || {}, DashP2P);
if ('object' === typeof module) {
	module.exports = DashP2P;
}
