#!/usr/bin/env node
"use strict";
var Lib = {};
module.exports = Lib;
const dboot = require("./index.js");

Lib.extractUserDetails = async function (username) {
  let addresses = await dboot.get_addresses(username);
  let utxos = await dboot
    .user_utxos_from_cli(username, addresses)
    .catch(function (error) {
      console.error({ error });
      return null;
    });
  if (!utxos || utxos.length === 0) {
    throw new Error(`User doesn't have any UTXOS!`);
  }
  let addrMap = {};
  for (let k = 0; k < Object.keys(utxos).length; k++) {
    for (let x = 0; x < utxos[k].length; x++) {
      let u = utxos[k][x];
      addrMap[u.address] = 1;
    }
  }
  for (const addr in addrMap) {
    let buffer = await dboot.wallet_exec(username, ["dumpprivkey", addr]);
    let { out, err } = dboot.ps_extract(buffer, false);
    if (err.length) {
      console.error(err);
    }
    if (out.length) {
      addrMap[addr] = out;
    }
  }
  let flatUtxos = [];
  for (let k = 0; k < Object.keys(utxos).length; k++) {
    for (let x = 0; x < utxos[k].length; x++) {
      let txid = utxos[k][x].txid;
      utxos[k][x].privateKey = addrMap[utxos[k][x].address];
      let used = await dboot.is_txid_used(username, utxos[k][x].txid);
      if (used) {
        continue;
      }
      flatUtxos.push(utxos[k][x]);
    }
  }
  let rando = await dboot.getRandomPayee(username);
  return {
    user: username,
    utxos: flatUtxos,
    changeAddress: await dboot.get_change_address_from_cli(username),
  };
};
