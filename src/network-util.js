'use strict';

let crypto = require('crypto');
function hashOfHash(data) {
	return crypto
		.createHash('sha256')
		.update(crypto.createHash('sha256').update(data).digest())
		.digest();
}
function hashByteOrder(str) {
	let bytes = [];
	for (let i = str.length - 1; i >= 0; i -= 2) {
		bytes.push(str.substr(i - 1, 2));
	}
	return bytes.join('');
}

/**
 * Compact Size UINT documentation:
 * https://docs.dash.org/projects/core/en/stable/docs/reference/transactions-compactsize-unsigned-integers.html
 */
function calculateCompactSize(obj) {
	if (obj.length > 0 && obj.length <= 252) {
		return 1;
	}
	if (obj.length > 253 && obj.length <= 0xffff) {
		return 3;
	}
	if (obj.length > 0x10000 && obj.length <= 0xffffffff) {
		return 5;
	}
	if (obj.length > 0x100000000 && obj.length <= 0xffffffffffffffff) {
		return 9;
	}
	return 0;
}
function encodeCompactSizeBytes(obj) {
	let size = calculateCompactSize(obj);
	if (size === 0) {
		return [0];
	}
	let len = 0;
	if (typeof obj === 'number') {
		len = obj;
	} else {
		len = obj.length;
	}
	switch (size) {
		case 1:
			return [len];
		case 3:
			return [0xfd, len & 0xff, len >> 8];
		case 5:
			/**
			 *  32      24      16       8       1
			 *   |-------|-------|-------|-------|
			 *
			 */
			return [
				0xfe,
				len & 0xff,
				len >> 8,
				(len >> 16) & 0xff,
				(len >> 24) & 0xff,
			];
		case 9:
			return [
				0xff,
				len & 0xff, // byte 1
				(len >> 8) & 0xff, // byte 2
				(len >> 16) & 0xff, // byte 3
				(len >> 24) & 0xff, // byte 4
				(len >> 32) & 0xff, // byte 5
				(len >> 40) & 0xff, // byte 6
				(len >> 48) & 0xff, // byte 7
				(len >> 56) & 0xff, // byte 8
			];
	}
}

function allZeroes(buffer) {
	for (let ch of buffer) {
		if (ch !== 0) {
			return false;
		}
	}
	return true;
}

function hexToBytes(hex) {
	let bytes = new Uint8Array(hex.length / 2);
	let i = 0;
	for (let c = 0; c < hex.length; c += 2) {
		bytes[i] = parseInt(hex.substr(c, 2), 16);
		++i;
	}
	return bytes;
}
function bytesToString(b) {
	let bytes = new Uint8Array(b);
	let str = [];
	for (let i = 0; i < bytes.length; i++) {
		if (bytes[i].toString(16).length === 1) {
			str.push(0);
		}
		str.push(bytes[i].toString(16));
	}
	return str.join('');
}
function str2uint8(text) {
	return Uint8Array.from(
		Array.from(text).map((letter) => letter.charCodeAt(0)),
	);
}
function extractUint32(data, at) {
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
function setSignedInt32(pkt, data, at) {
	pkt.set(new Uint8Array(new Int32Array([data]).buffer), at);
	return pkt;
}
function setUint32(pkt, data, at) {
	pkt.set(new Uint8Array(new Uint32Array([data]).buffer), at);
	return pkt;
}
function setSignedInt64(pkt, data, at) {
	if (data === 0) {
		pkt.set(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]), at);
		return pkt;
	}

	pkt.set(new Uint8Array(new BigInt64Array([data]).buffer), at);
	return pkt;
}
function setUint64(pkt, data, at) {
	if (data === 0) {
		pkt.set(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]), at);
		return pkt;
	}
	pkt.set(new Uint8Array(new BigUint64Array([data]).buffer), at);
	return pkt;
}
function dot2num(dot) {
	// the same as ip2long in php
	var d = dot.split('.');
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
	return dot2num(num2array(x).reverse().join('.'));
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
function htons(b, i, v) {
	b[i] = 0xff & (v >> 8);
	b[i + 1] = 0xff & v;
}
function mapIPv4ToIpv6(ip) {
	return '::ffff:' + ip;
}
let Lib = {
	dot2num,
	hashByteOrder,
	hashOfHash,
	htonl,
	htons,
	is_ipv6_mapped_ipv4,
	mapIPv4ToIpv6,
	hexToBytes,
	num2array,
	setUint32,
	setUint64,
	setSignedInt32,
	setSignedInt64,
	str2uint8,
	allZeroes,
	calculateCompactSize,
	encodeCompactSizeBytes,
	bytesToString,
};
module.exports = Lib;
