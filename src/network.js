'use strict';
const net = require('net');

let client = new net.Socket();
const PROTOCOL_VERSION = 70227;

const testnet_magic_bytes = function(){
	let packet = new Uint8Array(4);
	packet[0] = 0xce;
	packet[1] = 0xe2;
	packet[2] = 0xca;
	packet[3] = 0xff;
	return packet;
};
const { createHash } = require('crypto');
const str2uint8 = (text) => {
	return Uint8Array.from(Array.from(text).map(letter => letter.charCodeAt(0)));
};
const setUint32 = (pkt,data,at) => {
	pkt.set(new Uint8Array(new Uint32Array([data]).buffer),at);
	return pkt;
};
function dot2num(dot) { // the same as ip2long in php
    var d = dot.split('.');
    return ((+d[0]) << 24) +  
           ((+d[1]) << 16) + 
           ((+d[2]) <<  8) + 
            (+d[3]);
}

function num2array(num) {
     return [
        (num & 0xFF000000) >>> 24,
        (num & 0x00FF0000) >>> 16,   
        (num & 0x0000FF00) >>>  8,
        (num & 0x000000FF)
       ];    
}

function htonl(x) {
     return dot2num(num2array(x).reverse().join('.')); 
}

/**
 * Convert a 16-bit quantity (short integer) from host byte order to network byte order (Little-Endian to Big-Endian).
 *
 * @param {Array|Buffer} b Array of octets or a nodejs Buffer
 * @param {number} i Zero-based index at which to write into b
 * @param {number} v Value to convert
 */
const htons = function(b, i, v) {
	b[i] = (0xff & (v >> 8));
	b[i + 1] = (0xff & (v));
};

/**
 * First 4 bytes of SHA256(SHA256(payload)) in internal byte order.
 */
const compute_checksum = (payload) => {
	let hash = createHash('sha256').update(payload).digest();
	let hashOfHash = createHash('sha256').update(hash).digest();
	console.debug({hashOfHash});
	return hashOfHash.slice(0,4);
};

const wrap_packet = (net, command_name, payload, payload_size) => {
	const SIZES = {
		MAGIC_BYTES: 4,
		COMMAND_NAME: 12,
		PAYLOAD_SIZE: 4,
		CHECKSUM: 4,
	};
	let TOTAL_SIZE = 0;
	for(const key in SIZES){
		TOTAL_SIZE += SIZES[key];
	}
	TOTAL_SIZE += payload_size;
	console.debug({net,command_name,payload_size,TOTAL_SIZE});

	let packet = new Uint8Array(TOTAL_SIZE);
	/**
	 * FIXME: we just assume net is always testnet.
	 */
	/**
	 * TODO: switch(net){ ... }
	 */
	packet.set(testnet_magic_bytes(),0);

	/**
	 * Set command_name (char[12])
	 */
	let COMMAND_NAME_OFFSET = SIZES.MAGIC_BYTES;
	packet.set(str2uint8(command_name),COMMAND_NAME_OFFSET);


	let PAYLOAD_SIZE_OFFSET = COMMAND_NAME_OFFSET + SIZES.COMMAND_NAME;
	let CHECKSUM_OFFSET = PAYLOAD_SIZE_OFFSET + SIZES.PAYLOAD_SIZE;
	if(payload_size === 0 || payload === null) {
		packet = setUint32(packet,0x5df6e0e2,CHECKSUM_OFFSET);
		return packet;
	}
	console.debug({payload_size});
	packet = setUint32(packet,payload_size,PAYLOAD_SIZE_OFFSET);
	for(let i=PAYLOAD_SIZE_OFFSET; i < PAYLOAD_SIZE_OFFSET + 4; i++){
		console.debug({i,char: packet[i]});
	}
	packet.set(compute_checksum(payload),CHECKSUM_OFFSET);
	/**
	 * Finally, append the payload to the header
	 */
	let ACTUAL_PAYLOAD_OFFSET = CHECKSUM_OFFSET + SIZES.CHECKSUM;
	packet.set(payload,ACTUAL_PAYLOAD_OFFSET);
	return packet;
};







const version = function(){
	const cmd = 'version';

	const SIZES = {
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
		START_HEIGHT: 4,
		// The following 2 fields are OPTIONAL
		RELAY: 1,
		MNAUTH_CHALLENGE: 32,
	};
	let TOTAL_SIZE = 0;

	for(const key in SIZES){
		TOTAL_SIZE += SIZES[key];
	}
	console.debug({TOTAL_SIZE});
	let packet = new Uint8Array(TOTAL_SIZE);
	// Protocol version

	packet = setUint32(packet,PROTOCOL_VERSION,0);
	/**
	 * Set services to NODE_NETWORK (1) + NODE_BLOOM (4)
	 */
	const SERVICES_OFFSET = SIZES.VERSION;
	let services = [0x05];
	packet.set(services,SERVICES_OFFSET);

	const TIMESTAMP_OFFSET = SERVICES_OFFSET + SIZES.SERVICES;
	packet = setUint32(packet,Date.now(),TIMESTAMP_OFFSET);

	let ADDR_RECV_SERVICES_OFFSET = TIMESTAMP_OFFSET + SIZES.TIMESTAMP;
	packet.set([0x01],ADDR_RECV_SERVICES_OFFSET);

	let ADDR_RECV_IP_OFFSET = ADDR_RECV_SERVICES_OFFSET + SIZES.ADDR_RECV_SERVICES;
	let ipBytes = dot2num('127.0.0.1'); //FIXME: get this from the host
	let inv = htonl(ipBytes);
	packet = setUint32(packet,inv,ADDR_RECV_IP_OFFSET);

	/**
	 * Copy address recv port
	 */
	let ADDR_RECV_PORT_OFFSET = ADDR_RECV_IP_OFFSET + SIZES.ADDR_RECV_IP;
	let portBuffer = new Uint8Array(2);
	htons(portBuffer,0,19999); // FIXME: get this from the host
	packet.set(portBuffer,ADDR_RECV_PORT_OFFSET);

	/**
	 * Copy address transmitted services
	 */
	let ADDR_TRANS_SERVICES_OFFSET = ADDR_RECV_PORT_OFFSET + SIZES.ADDR_RECV_PORT;
	packet.set(services,ADDR_TRANS_SERVICES_OFFSET);

	/**
	 * We add the extra 10, so that we can encode an ipv4-mapped ipv6 address
	 */
	let ADDR_TRANS_IP_OFFSET = ADDR_TRANS_SERVICES_OFFSET + SIZES.ADDR_TRANS_SERVICES;
	// FIXME: convert this hard-coded crap
	packet.set([0xff,0xff,0xcb,0x00,0x71,0xc0],ADDR_TRANS_IP_OFFSET + 10); // we add the 10 so that we can fill the latter 6 bytes

	let ADDR_TRANS_PORT_OFFSET = ADDR_TRANS_IP_OFFSET + SIZES.ADDR_TRANS_IP;
	portBuffer = new Uint8Array(2);
	htons(portBuffer,0,19999); // FIXME: grab the real port
	packet.set(portBuffer,ADDR_TRANS_PORT_OFFSET);

	// this can be left zero
	let NONCE_OFFSET = ADDR_TRANS_PORT_OFFSET + SIZES.ADDR_TRANS_PORT;
	packet.set([0x1,0x2,0x3,0x4,0x5,0x6,0x7],NONCE_OFFSET);

	let USER_AGENT_BYTES_OFFSET = NONCE_OFFSET + SIZES.NONCE;
	packet.set([0x0],USER_AGENT_BYTES_OFFSET);

	// Skipping user agent. it can be zero
	let START_HEIGHT_OFFSET = USER_AGENT_BYTES_OFFSET + SIZES.USER_AGENT_BYTES;
	packet = setUint32(packet,876829,START_HEIGHT_OFFSET); // FIXME: grab this from an api or a block explorer or something

	let RELAY_OFFSET = START_HEIGHT_OFFSET + SIZES.START_HEIGHT;
	packet.set([0x1],RELAY_OFFSET);

	let MNAUTH_CHALLENGE_OFFSET = RELAY_OFFSET + SIZES.RELAY;
	packet.set([0x1,0x2,0x3,0x4,0x5,0x6],MNAUTH_CHALLENGE_OFFSET);
	packet = wrap_packet('testnet', 'version', packet, TOTAL_SIZE);
	//{
	//	for(let k=0; k < TOTAL_SIZE;k++){
	//		console.debug(k,':',packet[k]);
	//	}
	//}
	return packet;
};
const getaddr = function(){
	const cmd = 'getaddr';
	const MAGIC_BYTES_SIZE = 4;
	const COMMAND_SIZE = 12;
	const PAYLOAD_SIZE = 4;
	const CHECKSUM_SIZE = 4;
	const TOTAL_SIZE = MAGIC_BYTES_SIZE + COMMAND_SIZE + PAYLOAD_SIZE + CHECKSUM_SIZE;
	let packet = new Uint8Array(TOTAL_SIZE);
	// TESTNET magic bytes
	packet[0] = 0xce;
	packet[1] = 0xe2;
	packet[2] = 0xca;
	packet[3] = 0xff;
	// point us to the beginning of the command name char[12]
	let cmdArray = str2uint8(cmd);
	packet.set(cmdArray,MAGIC_BYTES_SIZE);

	packet.set([0x5d,0xf6,0xe0,0xe2],MAGIC_BYTES_SIZE + COMMAND_SIZE + PAYLOAD_SIZE);
	//{
	//	for(let k=0; k < TOTAL_SIZE;k++){
	//		console.debug(k,':',packet[k]);
	//	}
	//}
	return packet;
};

const ping_message = function(){
	const NONCE = '12340000';
	const cmd = 'ping';
	const MAGIC_BYTES_SIZE = 4;
	const COMMAND_SIZE = 12;
	const PAYLOAD_SIZE = 4;
	const CHECKSUM_SIZE = 4;
	const NONCE_SIZE = 8;
	const TOTAL_SIZE = MAGIC_BYTES_SIZE + COMMAND_SIZE + PAYLOAD_SIZE + CHECKSUM_SIZE + NONCE_SIZE;
	let packet = new Uint8Array(TOTAL_SIZE);
	// TESTNET magic bytes
	packet[0] = 0xce;
	packet[1] = 0xe2;
	packet[2] = 0xca;
	packet[3] = 0xff;
	// point us to the beginning of the command name char[12]
	let cmdArray = str2uint8(cmd);
	packet.set(cmdArray,MAGIC_BYTES_SIZE);
	// fill the payload
	packet.set([0,0,0,0x08],MAGIC_BYTES_SIZE + COMMAND_SIZE);

	//// fill the checksum
	let hash = createHash('sha256').update(NONCE).digest();
	let hashOfHash = createHash('sha256').update(hash).digest();
	//console.debug({hash,hashOfHash});
	let arr = hashOfHash.slice(0,4);
	packet.set(arr,MAGIC_BYTES_SIZE + COMMAND_SIZE + PAYLOAD_SIZE);

	let nonceArray = str2uint8(NONCE);
	// fill the nonce
	packet.set(nonceArray,MAGIC_BYTES_SIZE + COMMAND_SIZE + PAYLOAD_SIZE + CHECKSUM_SIZE);
	{
		for(let k=0; k < TOTAL_SIZE;k++){
			console.debug(k,':',packet[k]);
		}
	}
	return packet;
};

client.connect(19999, '127.0.0.1', function() {

	console.log('Connected');
		client.write(version());
	//client.write(ping_message());
});

client.on('data', function(data) {
	//client.write(getaddr());
	console.log('Received: ' + data);
});

client.on('close', function() {
	console.log('Connection closed');
	//client.destroy(); // kill client after server's response
});
