"use strict";
let Lib = {};
module.exports = Lib;

const fs = require("fs");
const { read_file, logUsedTransaction, isUsed } = require("../ctransaction.js");
const { extractOption } = require('../argv.js');

let DB = require('../bootstrap/index.js');

(async function(){
  let inst = await DB.load_instance(extractOption('instance',true));

})();
function d(f) {
  console.debug(f);
}
function dd(f) {
  console.debug(f);
  process.exit();
}
