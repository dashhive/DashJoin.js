#!/usr/bin/env node
"use strict";
const COIN = require("./coin-join-constants.js").COIN;
const Network = require("./network.js");
const NetworkUtil = require("./network-util.js");
const hexToBytes = NetworkUtil.hexToBytes;
const assert = require("assert");
const cproc = require("child_process");
const extractOption = require('./argv.js').extractOption;

let id = {};

let config = require("./.mn0-config.json");
id.mn = 0;
if (process.argv.includes("--mn0")) {
  config = require("./.mn0-config.json");
  id.mn = 0;
}
if (process.argv.includes("--mn1")) {
  config = require("./.mn1-config.json");
  id.mn = 1;
}
if (process.argv.includes("--mn2")) {
  config = require("./.mn2-config.json");
  id.mn = 2;
}

let masterNodeIP = config.masterNodeIP;
let masterNodePort = config.masterNodePort;
let network = config.network;
let ourIP = config.ourIP;
let startBlockHeight = config.startBlockHeight;

let DashCore = require("@dashevo/dashcore-lib");
let dboot = require('./bootstrap/index.js');

/**
 * Periodically print id information
 */
if (process.argv.includes("--id")) {
  setInterval(function () {
    console.info(id);
  }, 10000);
}
(async function (instanceName) {
  /**
   * Start 4 clients simultaneously
   */
  const dashboot = require('./bootstrap/index.js');
  console.info(`[status]: loading "${instanceName}" instance...`);
  dboot = await dboot.load_instance(instanceName);
  let uniqueUsers = await dboot.extractUniqueUsers(6);

  /**
   * Pass choices[N] to a different process.
   */
  for(const choice of uniqueUsers){
    /**
     * Fork() 5 different processes. 
     * Hand them each their own user
     * Have them each submit to the same masternode
     * ...
     * profit
     *
     */
    d(choice.user);
    continue;
    cproc.spawn(node(),['./demo.js',`--instance=${instanceName}`,`--username=${choice.user}`]);
  }
dd('thats it');

  
})(extractOption('instance',true));
function d(f) {
  console.debug(f);
}
function dd(f) {
  console.debug(f);
  process.exit();
}

function node(){
  return process.argv[0];
}
