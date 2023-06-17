"use strict";

/**
 * Tasks:
 * - take reup script and port it to here
 * - must be able to use instances
 * - directory should be ~/.dashjoinjs/<INSTANCE_NAME>/
 * - lmdb file should be ~/.dashjoinjs/<INSTANCE_NAME>/db/data.mdb
 * # For configuration:
 * - store in lmdb:
 *   - dash.conf
 *
 * # Wallet + addresses
 * - create new wallet with randomly generated name
 * - create new addresses
 * - generate dash to wallet addresses
 * - log private keys for all addresses
 *
 */

const COIN = require("../coin-join-constants.js").COIN;
const Network = require("../network.js");

let Lib = {};
module.exports = Lib;

let config = require("../.config.json");
let NETWORK = config.network;
let cproc = require("child_process");

let DashCore = require("@dashevo/dashcore-lib");
let Transaction = DashCore.Transaction;
let Script = DashCore.Script;
let PrivateKey = DashCore.PrivateKey;
let Address = DashCore.Address;
let { hexToBytes } = require("../network-util.js");
const crypto = require("crypto");
const LOW_COLLATERAL = (COIN / 1000 + 1) / 10;
const fs = require("fs");
const { read_file, logUsedTransaction, isUsed } = require("../ctransaction.js");

let DB = require("../lmdb/lmdb.js");
Lib.__data = {
  instance: {
    name: "base",
    db_path: null,
    db_name: "dash",
    max_dbs: 10,
  },
};
Lib.__error = null;

Lib.sane_instance = function () {
  if (typeof Lib.__data.instance.name === "undefined") {
    Lib.__error = "instance structure corrupt";
    return false;
  }
  let n = Lib.__data.instance.name;
  if (n === null || String(n).length === 0) {
    Lib.__error = "empty instance name";
    return false;
  }
  Lib.__data.instance.name = n.replace(/[^a-z0-9_]+/gi, "");
  if (Lib.__data.instance.name.length === 0) {
    Lib.__error = "after sanitization: empty instance name";
    return false;
  }
  return true;
};
Lib.mkpath = async function (path) {
  await cproc.spawnSync("mkdir", ["-p", path]);
};
Lib.load_instance = async function (instance_name) {
  Lib.__data.instance.name = instance_name;
  if (!Lib.sane_instance()) {
    throw new Error(`Couldn't load instance: "${Lib.__error}"`);
  }
  let n = Lib.__data.instance.name;
  let db_path = [process.env.HOME, ".dashjoinjs", n, "db"].join("/");
  Lib.__data.instance.db_path = db_path;
  await Lib.mkpath(db_path);

  let exists = await fs.existsSync(db_path.replace(/\/$/, "") + "/data.mdb");
  DB.open({
    path: db_path,
    db_name: Lib.__data.instance.db_name,
    create: !exists,
    maxDbs: Lib.__data.instance.max_dbs,
  });
  db_cj();
};

function db_cj() {
  DB.set_namespaces(["coinjoin"]);
}
function db_cj_ns(list) {
  DB.set_namespaces(["coinjoin", ...list]);
}
function db_put(key, val) {
  DB.ns.put(key, val);
}
function db_get(key) {
  return DB.ns.get(key);
}
function db_append(key, val) {
  let ex = DB.ns.get(key);
  DB.ns.put(key, ex + val);
}
let DASH_CLI = [process.env.HOME, "bin", "dash-cli"].join("/");
Lib.run = async function (cli_arguments) {
  return await cproc.spawnSync(DASH_CLI, cli_args(cli_arguments));
};
Lib.user = {};
Lib.seed = {};
Lib.random_name = async function () {
  return crypto.randomUUID().replace(/\-/gi, "");
};
Lib.user_list = async function () {
  db_cj();
  let list = db_get("users");
  try {
    list = JSON.parse(list);
    if (!Array.isArray(list)) {
      return [];
    }
    return list;
  } catch (e) {
    return [];
  }
};

Lib.user_create = async function (username) {
  db_cj();
  let list = db_get("users");
  try {
    list = JSON.parse(list);
    if (!Array.isArray(list)) {
      list = [];
    }
  } catch (e) {
    list = [];
  }
  for (let user of list) {
    if (user === username) {
      throw new Error("user already exists");
    }
  }
  list.push(username);
  db_put("users", JSON.stringify(list));
};
function cli_args(list) {
  return [
    "-conf=" + process.env.HOME + "/.dashmate/local_seed/core/dash.conf",
    ...list,
  ];
}

Lib.wallet_exec = async function (wallet_name, cli_arguments) {
  return await cproc.spawnSync(
    DASH_CLI,
    cli_args([`-rpcwallet=${wallet_name}`, ...cli_arguments])
  );
};
async function dump_file(fn, data) {
  const fs = require("fs");
  await fs.writeFileSync(fn, JSON.stringify(data, null, 2));
}
Lib.meta_get = function (username, key) {
  if (Array.isArray(username)) {
    db_cj_ns(username);
  } else {
    db_cj_ns([username]);
  }
  try {
    let t = db_get(key);
    t = JSON.parse(t);
    if (!Array.isArray(t)) {
      return [];
    }
    return t;
  } catch (e) {
    return [];
  }
};
Lib.meta_set = async function (username, key, values) {
  if (Array.isArray(username)) {
    db_cj_ns(username);
  } else {
    db_cj_ns([username]);
  }
  if(!Array.isArray(values)){
    values = [values];
  }
  db_put(key, JSON.stringify(values));
};
Lib.meta_store = async function (username, key, values) {
  if (Array.isArray(username)) {
    db_cj_ns(username);
  } else {
    db_cj_ns([username]);
  }
  let existing = Lib.meta_get(username, key);
  if(Array.isArray(values)){
    for (const r of values) {
      existing.push(r);
    }
  }else{
    existing.push(values);
  }
  if (Array.isArray(username)) {
    db_cj_ns(username);
  } else {
    db_cj_ns([username]);
  }
  db_put(key, JSON.stringify(existing));
};
function clean_addresses(list) {
  let flist = [];
  for (const row of list) {
    flist.push(list.replace(/[^a-zA-Z0-9]+/gi, ""));
  }
  return flist;
}

Lib.get_change_addresses = async function (username) {
  return await Lib.meta_get([username, "change"], "addresses");
};
Lib.store_change_addresses = async function (username, w_addresses) {
  return await Lib.meta_store(
    [username, "change"],
    "addresses",
    clean_addresses(w_addresses)
  );
};

Lib.get_addresses = async function (username) {
  return await Lib.meta_get(username, "addresses");
};
Lib.store_addresses = async function (username, w_addresses) {
  return await Lib.meta_store(
    username,
    "addresses",
    clean_addresses(w_addresses)
  );
};

Lib.create_wallets = async function (count = 10) {
  for (let ctr = 0; ctr < count; ctr++) {
    let wallet_name = await Lib.random_name();
    await Lib.user_create(wallet_name).catch(function (error) {
      console.error(`ERROR: `, error);
    });
    console.info(`[ok]: user "${wallet_name}" created`);
    await Lib.run([
      "createwallet",
      wallet_name,
      "false",
      "false",
      "foobar",
      "false",
      "true",
    ]);
    console.info(`[ok]: wallet "${wallet_name}" created`);

    let w_addresses = [];
    for (let actr = 0; actr < 10; actr++) {
      let buffer = await Lib.wallet_exec(wallet_name, ["getnewaddress"]);
      if (buffer.stdout.toString().length) {
        w_addresses.push(buffer.stdout.toString());
      }
    }
    await Lib.store_addresses(wallet_name, w_addresses);
    await Lib.unlock_wallet(wallet_name);
  }
  await Lib.unlock_all_wallets();
  await Lib.dump_all_privkeys();
  await Lib.generate_dash_to_all();
};
Lib.unlock_wallet = async function (username) {
  return await Lib.run(
    cli_args([
      `-rpcwallet=${username}`,
      "walletpassphrase",
      "foobar",
      "100000000",
    ])
  );
};

Lib.unlock_all_wallets = async function () {
  let errors = [];
  let keep = [];
  const users = await Lib.user_list();
  for (const user of users) {
    process.stdout.write(`[ ] unlocking "${user}"...`);
    let ps = await Lib.unlock_wallet(user);
    let err = ps.stderr.toString();
    err = err.replace(/[\s]+$/i, "");
    if (err.length) {
      console.log("[x] ERROR");
      errors.push(user);
    } else {
      console.log(`[+] unlocked`);
      keep.push(user);
    }
  }
  console.info(`The following wallets should probably be cleaned up:`);
  console.info(JSON.stringify(errors, null, 2));
};

function trim(s) {
  let f = s.replace(/[\s]+$/, "");
  f.replace(/^[\s]+/, "");
  return f;
}

Lib.dump_private_key = async function (username, address) {
  let ps = await Lib.wallet_exec(username, ["dumpprivkey", address]);
  let err = trim(ps.stderr.toString());
  let out = trim(ps.stdout.toString());
  if (out.length) {
    return out;
  }
  throw new Error(`dumpprivkey failed: "${err}"`);
};

Lib.dump_all_privkeys = async function () {
  let keep = [];
  const users = await Lib.user_list();
  for (const user of users) {
    const addresses = await Lib.get_addresses(user);
    if (Array.isArray(addresses) === false || addresses.length === 0) {
      continue;
    }
    for (const address of addresses) {
      let privateKey = await Lib.dump_private_key(user, address).catch(function (
        error
      ) {
        console.error(error);
        return null;
      });
      if (privateKey === null) {
        continue;
      }
      keep.push({ user, privateKey, address });
    }
  }
  for(const pair of keep){
    let r = await Lib.meta_set([pair.user,'privatekey'],pair.address,pair.privateKey);
  }
};

Lib.generate_dash_to_all = async function(){
  let keep = [];
  const users = await Lib.user_list();
  for (const user of users) {
    const addresses = await Lib.get_addresses(user);
    if (Array.isArray(addresses) === false || addresses.length === 0) {
      continue;
    }
    for (const address of addresses) {
      let ps = await Lib.wallet_exec(user, ['generatetoaddress','10',address]);
      let {err,out} = ps_extract(ps);
      if(err.length){
        console.error(err);
      }else{
        try {
          let txns = JSON.parse(out);
          await Lib.meta_store([user,'utxos'],address,txns);
          d({[user]:address,'utxos':out,txns});
        }catch(e){
          dd(e);
        }
      }
    }
  }
};

function ps_extract(ps,newlines=true){
  let out = ps.stdout.toString();
  let err = ps.stderr.toString();
  out = out.replace(/^[\s]+/,'').replace(/[\s]+$/,'');
  err = err.replace(/^[\s]+/,'').replace(/[\s]+$/,'');
  if(!newlines){
    out = out.replace(/[\n]+$/,'');
    err = err.replace(/[\n]+$/,'');
  }
  return {err,out};
}
function d(f) {
  console.debug(f);
}
function dd(f) {
  console.debug(f);
  process.exit();
}


/**
 * args: {
 *  count: [N,G] // how many blocks to generate, default [10,10]
 * }
 */
Lib.seedall = async function (args = {}) {
  let rounds = [10, 10];
  if (
    typeof args.count !== "undefined" &&
    Array.isArray(args.count) &&
    args.count.length === 2
  ) {
    rounds = args.count;
    if (isNaN(rounds[0])) {
      throw new Error(`count[0] must be a positive integer`);
    }
    if (rounds[0] <= 0) {
      throw new Error(`count[0] must be a positive integer`);
    }
    if (isNaN(rounds[1])) {
      throw new Error(`count[1] must be a positive integer`);
    }
    if (rounds[1] <= 0) {
      throw new Error(`count[1] must be a positive integer`);
    }
  }
  for (let WALLET of Lib.wallets()) {
    for (let address of Lib.addresses.get_all_by_wallet_name(WALLET)) {
      for (let i = 0; i < rounds[0]; i++) {
        await Lib.wallet_cmd(WALLET, ["generatetoaddress", rounds[1], address]);
      }
    }
  }
};

(async () => {
  d(await Lib.load_instance("base"));
  dd(await Lib.generate_dash_to_all());
  dd(await Lib.create_wallets());
})();
