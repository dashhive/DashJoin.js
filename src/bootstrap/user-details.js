#!/usr/bin/env node
"use strict";
var Lib = {};
module.exports = Lib;
const dboot = require("./index.js");

Lib.getRandomPayee = async function (username) {
  let users = await dboot.user_list();
  for (const user of users) {
    if (user != username && Math.random() * 100 > 50) {
      return user;
    }
  }
  return await Lib.getRandomPayee(username);
};

Lib.extractUniqueUsers = async function (count) {
  let users = await dboot.user_list();
  let choices = [];
  for (const user of users) {
    if (count === choices.length - 1) {
      return choices;
    }
    let addresses = await dboot.get_addresses(user);
    let utxos = await dboot
      .user_utxos_from_cli(user, addresses)
      .catch(function (error) {
        console.error({ error });
        return null;
      });
    if (!utxos || utxos.length === 0) {
      continue;
    }
    let addrMap = {};
    for (let k = 0; k < Object.keys(utxos).length; k++) {
      for (let x = 0; x < utxos[k].length; x++) {
        let u = utxos[k][x];
        addrMap[u.address] = 1;
      }
    }
    for (const addr in addrMap) {
      let buffer = await dboot.wallet_exec(user, ["dumpprivkey", addr]);
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
        flatUtxos.push(utxos[k][x]);
      }
    }
    let rando = await Lib.getRandomPayee(user);
    choices.push({
      user: user,
      utxos: flatUtxos,
      changeAddress: await dboot.get_change_address_from_cli(user),
      randomPayee: rando,
    });
  }
  dd({choices});
  return choices;
};
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
      flatUtxos.push(utxos[k][x]);
    }
  }
  let rando = await Lib.getRandomPayee(username);
  return {
    user: username,
    utxos: flatUtxos,
    changeAddress: await dboot.get_change_address_from_cli(username),
  };
};
