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
const MetaDB = require("./metadb.js");

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
const crypto = require("crypto");
const LOW_COLLATERAL = (COIN / 1000 + 1) / 10;
const fs = require("fs");

const UserDetails = require("./user-details.js");

Lib.helpers = function () {
  return {
    db_cj,
    db_cj_ns,
    db_put,
    db_get,
    db_append,
    rng: {
      random_name: Lib.random_name,
    },
    shell: {
      ps_extract: ps_extract,
      mkpath: Lib.mkpath,
      run: Lib.run,
      cli_args,
      wallet_exec: Lib.wallet_exec,
    },
    validation: {
      sanitize_address,
    },
    users: {
      get_list: Lib.user_list,
      user_create: Lib.user_create,
    },
  };
};
Lib.ps_extract = ps_extract;
function ps_extract(ps, newlines = true) {
  let out = ps.stdout.toString();
  let err = ps.stderr.toString();
  out = out.replace(/^[\s]+/, "").replace(/[\s]+$/, "");
  err = err.replace(/^[\s]+/, "").replace(/[\s]+$/, "");
  if (!newlines) {
    out = out.replace(/[\n]+$/, "");
    err = err.replace(/[\n]+$/, "");
  }
  return { err, out };
}
Lib.set_dash_cli = function (p) {
  Lib.DASH_CLI = p;
};
Lib.get_dash_cli = function (p) {
  return Lib.DASH_CLI;
};
Lib.get_config = function () {
  Lib.__config = {
    db: {
      handle: Lib.DB,
    },
    helpers: Lib.helpers(),
    instance: Lib.__data.instance,
  };
  return Lib.__config;
};
Lib.__data = {
  instance: {
    name: "base",
    db_path: null,
    db_name: "dash",
    max_dbs: 10,
  },
};
Lib.mkpath = async function (path) {
  await cproc.spawnSync("mkdir", ["-p", path]);
};

Lib.random_name = async function () {
  return crypto.randomUUID().replace(/\-/gi, "");
};

Lib.run = async function (cli_arguments) {
  return await cproc.spawnSync(Lib.DASH_CLI, cli_args(cli_arguments));
};

Lib.__error = null;

function cli_args(list) {
  return [
    "-conf=" + process.env.HOME + "/.dashmate/local_seed/core/dash.conf",
    ...list,
  ];
}

let db_cj, db_cj_ns, db_put, db_get, db_append;

function sanitize_address(address) {
  return address.replace(/[^a-zA-Z0-9]+/gi, "").replace(/[\n]+$/, "");
}

function sanitize_addresses(list) {
  let flist = [];
  for (const row of list) {
    flist.push(row.replace(/[^a-zA-Z0-9]+/gi, ""));
  }
  return flist;
}

Lib.load_instance = async function (instance_name) {
  Lib.DASH_CLI = [process.env.HOME, "bin", "dash-cli"].join("/");
  Lib.DB = require("../lmdb/lmdb.js");
  Lib.__data.instance.name = instance_name;
  if (!Lib.sane_instance()) {
    throw new Error(`Couldn't load instance: "${Lib.__error}"`);
  }
  let n = Lib.__data.instance.name;
  let db_path = [process.env.HOME, ".dashjoinjs", n, "db"].join("/");
  Lib.__data.instance.db_path = db_path;
  await Lib.mkpath(db_path);

  let exists = await fs.existsSync(db_path.replace(/\/$/, "") + "/data.mdb");
  Lib.DB.open({
    path: db_path,
    db_name: Lib.__data.instance.db_name,
    create: !exists,
    maxDbs: Lib.__data.instance.max_dbs,
    mapSize: 32 * 1024 * 1024,
  });
  Lib.MetaDB = MetaDB(Lib.DB);
  db_cj = Lib.MetaDB.db_cj;
  db_cj_ns = Lib.MetaDB.db_cj_ns;
  db_get = Lib.MetaDB.db_get;
  db_put = Lib.MetaDB.db_put;
  db_append = Lib.MetaDB.db_append;
  Lib.meta_get = Lib.MetaDB.meta_get;
  Lib.meta_store = Lib.MetaDB.meta_store;
  Lib.meta_set = Lib.MetaDB.meta_set;
  db_cj();
  return Lib;
};

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

Lib.user_addresses = async function (username) {
  return await Lib.meta_get(username, "addresses");
};
Lib.sanitize_address = sanitize_address;

Lib.user_utxos_from_cli = async function (username, addresses) {
  let utxos = [];
  for (const address of addresses) {
    let ps = await Lib.wallet_exec(username, [
      "getaddressutxos",
      JSON.stringify({ addresses: [Lib.sanitize_address(address)] }),
    ]);
    let { err, out } = ps_extract(ps);
    if (err.length) {
      console.error(err);
    } else {
      try {
        let txns = JSON.parse(out);
        utxos.push(txns);
      } catch (e) {
        d(e);
      }
    }
  }
  return utxos;
};
Lib.user_exists = async function (username) {
  let users = await Lib.user_list();
  for (const user of users) {
    if (user === username) {
      return true;
    }
  }
  return false;
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

Lib.wallet_exec = async function (wallet_name, cli_arguments) {
  return await cproc.spawnSync(
    Lib.DASH_CLI,
    cli_args([`-rpcwallet=${wallet_name}`, ...cli_arguments])
  );
};
Lib.get_change_address_from_cli = async function (username) {
  let buffer = await Lib.wallet_exec(username, ["getrawchangeaddress"]);
  let { err, out } = ps_extract(buffer, false);
  if (out.length) {
    return out;
  }
};
Lib.get_change_addresses = async function (username) {
  return await Lib.meta_get([username, "change"], "addresses");
};
Lib.store_change_addresses = async function (username, w_addresses) {
  return await Lib.meta_store(
    [username, "change"],
    "addresses",
    sanitize_addresses(w_addresses)
  );
};
Lib.get_private_key = async function (username, address) {
  return await Lib.meta_get([username, "privatekey"], address);
};
Lib.store_addresses = async function (username, w_addresses) {
  return await Lib.meta_store(
    username,
    "addresses",
    sanitize_addresses(w_addresses)
  );
};

/**
 * Returns a user that is not `forUser`
 */
Lib.get_random_payee = async function (forUser) {
  let users = await Lib.user_list();
  for (const user of users) {
    if (user !== forUser) {
      return user;
    }
  }
};

Lib.get_addresses = async function (username) {
  return await Lib.meta_get(username, "addresses");
};
Lib.store_addresses = async function (username, w_addresses) {
  return await Lib.meta_store(
    username,
    "addresses",
    sanitize_addresses(w_addresses)
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
      let { err, out } = ps_extract(buffer, false);
      if (out.length) {
        w_addresses.push(out);
      }
    }
    await Lib.store_addresses(wallet_name, sanitize_addresses(w_addresses));
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
      let privateKey = await Lib.dump_private_key(user, address).catch(
        function (error) {
          console.error(error);
          return null;
        }
      );
      if (privateKey === null) {
        continue;
      }
      keep.push({ user, privateKey, address });
    }
  }
  for (const pair of keep) {
    let r = await Lib.meta_set(
      [pair.user, "privatekey"],
      pair.address,
      pair.privateKey
    );
  }
};
Lib.get_private_key = async function (username, address) {
  if (Array.isArray(address) === false) {
    address = [address];
  }
  let pk = [];
  for (const addr of address) {
    let r = await Lib.meta_get([username, "privatekey"], addr);
    pk.push(r);
  }
  return pk;
};

Lib.generate_dash_to_all = async function () {
  let keep = [];
  const users = await Lib.user_list();
  for (const user of users) {
    const addresses = await Lib.get_addresses(user);
    if (Array.isArray(addresses) === false || addresses.length === 0) {
      continue;
    }
    for (const address of addresses) {
      let ps = await Lib.wallet_exec(user, [
        "generatetoaddress",
        "10",
        address,
      ]);
      let { err, out } = ps_extract(ps);
      if (err.length) {
        console.error(err);
      } else {
        try {
          let txns = JSON.parse(out);
          await Lib.meta_store([user, "utxos"], address, txns);
          d({ [user]: address, utxos: out, txns });
        } catch (e) {
          dd(e);
        }
      }
    }
  }
};

Lib.generate_dash_to = async function (username) {
  let keep = [];
  let user = username;
  const addresses = await Lib.get_addresses(user);
  if (Array.isArray(addresses) === false || addresses.length === 0) {
    // TODO: instead, just create a bunch of addresses for the user
    throw new Error(`user: ${username} doesn't have any addresses`);
  }
  for (const address of addresses) {
    let ps = await Lib.wallet_exec(user, ["generatetoaddress", "10", address]);
    let { err, out } = ps_extract(ps);
    if (err.length) {
      console.error(err);
    } else {
      try {
        let txns = JSON.parse(out);
        await Lib.meta_store([user, "utxos"], address, txns);
        d({ [user]: address, utxos: out, txns });
      } catch (e) {
        dd(e);
      }
    }
  }
};
function d(f) {
  console.debug(f);
}
function dd(f) {
  console.debug(f);
  process.exit();
}

function usage() {
  console.log("Usage: dashboot [options] --instance=N");
  console.log("");
  console.log("# Options");
  console.log("-------------------------------------------------------");
  console.log(`--instance=N       Uses N as the instance. If not passed, defaults to "base"`);
  console.log(`--unlock-all       Unlocks all user wallets.`);
  console.log(`--generate-to=N    Generates DASH to the user named N`);
  console.log(`--create-wallets   Creates wallets, addresses, and UTXO's`);
  console.log("");
  console.log("# What are instances?");
  console.log("-------------------------------------------------------");
  console.log(" An instance is just a folder, but it helps in that it ");
  console.log(" it will help you separate wallets on a name basis.    ");
  console.log(' Passing in an instance of "foobar" will create the    ');
  console.log(" following folder:                                     ");
  console.log("   ~/.dashjoinjs/foobar/db/                            ");
  console.log("                                                       ");
  console.log(" Stored in that directory will be the lmdb database    ");
  console.log(" which has all wallet data for that instance. This     ");
  console.log(" makes it trivial to use different datasets by using   ");
  console.log(" different instances.                                  ");
  console.log("                                                       ");
  console.log(" Keep in mind that if you end up deleting an instance  ");
  console.log(" directory, the wallet and all its transaction data    ");
  console.log(" still exists in your dashmate cluster.                ");
  console.log(" This is usually not a problem as the point of dashboot");
  console.log(" is to allow you to easily create lots of wallets and  ");
  console.log(" addresses/utxos really easily.                        ");
  console.log("                                                       ");
  console.log("# Ideal use case                                       ");
  console.log("-------------------------------------------------------");
  console.log(" The ideal usecase is to create a completely brand new ");
  console.log(" dashmate regtest cluster, then run dashboot for a few ");
  console.log(" minutes. Then, point your development code at the LMDB");
  console.log(" database which has all the randomly named wallets,    ");
  console.log(" utxos, and addresses.                                 ");
  console.log("                                                       ");
}
const { extractOption } = require("../argv.js");

Lib.run_cli_program = async function () {
  let config = {
    instance: "base",
    unlock: null,
    generateTo: null,
    create_wallets: false,
  };
  let iname = extractOption("instance", true);
  if (iname) {
    config.instance = iname;
  }

  let help = true;
  if (extractOption("help") || extractOption("h")) {
    help = true;
  }
  if (extractOption("unlock-all")) {
    config.unlock = "all";
    console.debug("all");
    help = false;
  }
  let genTo = extractOption('generate-to',true);
  if(genTo){
    config.generateTo = genTo;
    help = false;
  }
  let cwall = extractOption('create-wallets');
  if(cwall){
    config.create_wallets = true;
  }
  if(extractUniqueUsers('create-wallets')){
    config.create_wallets = true;
    help = false;
  }

  console.debug("loading instance");
  await Lib.load_instance(config.instance);
  d("checking config.unlock");
  if (config.unlock === "all") {
    console.info("[status]: Unlocking...");
    d(await Lib.unlock_all_wallets());
    console.log("[DONE]");
    process.exit(0);
    return;
  }
  if (config.generateTo !== null) {
    console.info(
      "[status]: Generating dash to user:",
      config.generateTo,
      "..."
    );
    d(await Lib.generate_dash_to(config.generateTo));
    console.log("[DONE]");
    process.exit(0);
    return;
  }
  if (config.create_wallets ?? false) {
    dd(await Lib.create_wallets());
    process.exit(0);
  }
  if (help) {
    usage();
    process.exit(1);
    return;
  }
    process.exit(1);
};

Lib.extractUniqueUsers = async function (count) {
  let users = await Lib.user_list();
  let choices = [];
  for (const user of users) {
    if (count === choices.length - 1) {
      return choices;
    }
    let addresses = await Lib.get_addresses(user);
    let utxos = await Lib
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
      let buffer = await Lib.wallet_exec(user, ["dumpprivkey", addr]);
      let { out, err } = Lib.ps_extract(buffer, false);
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
      changeAddress: await Lib.get_change_address_from_cli(user),
      randomPayee: rando,
    });
  }
  //dd({choices});
  return choices;
};
Lib.getRandomPayee = async function (username) {
  let users = await Lib.user_list();
  for (const user of users) {
    if (user != username && Math.random() * 100 > 50) {
      return user;
    }
  }
  return await Lib.getRandomPayee(username);
};
