"use strict";

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
function str2uint8(text) {
  return Uint8Array.from(
    Array.from(text).map((letter) => letter.charCodeAt(0))
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
function setUint32(pkt, data, at) {
  pkt.set(new Uint8Array(new Uint32Array([data]).buffer), at);
  return pkt;
}
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
function htons(b, i, v) {
  b[i] = 0xff & (v >> 8);
  b[i + 1] = 0xff & v;
}
function mapIPv4ToIpv6(ip) {
  return "::ffff:" + ip;
}
let Lib = {
  dot2num,
  htonl,
  htons,
  is_ipv6_mapped_ipv4,
  mapIPv4ToIpv6,
  hexToBytes,
  num2array,
  setUint32,
  str2uint8,
	allZeroes,
};
module.exports = Lib;
