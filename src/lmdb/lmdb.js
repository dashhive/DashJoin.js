var Lib = {};
module.exports = Lib;

Lib._data = {
  lmdb: require("node-lmdb"),
  dbi: null,
  env: null,
};
Lib.open = function (
  args = {
    path,
    db_name,
    create: false,
    maxDbs: 10,
    mapSize: null,
  }
) {
  let DB = Lib._data.lmdb;
  let DBI = Lib._data.dbi;
  let mapSize = args.mapSize ?? 16 * 1024 * 1024;

  // Print the version
  console.log("Current lmdb version is", DB.version);
  // Create new LMDB environment
  Lib._data.env = new DB.Env();
  let env = Lib._data.env;
  // Open the environment
  env.open({
    // Path to the environment
    // IMPORTANT: you will get an error if the directory doesn't exist!
    path: args.path,
    // Maximum number of databases
    maxDbs: args.maxDbs,
    mapSize: mapSize,
  });
  // Open database
  Lib._data.dbi = env.openDbi({
    name: args.db_name,
    create: args.create,
  });
  return Lib._data;
};

Lib.txn = () => {
  let { env } = Lib._data;
  // Begin transaction
  Lib._data.txn = env.beginTxn();
};

Lib.get = (str) => {
  let { txn, dbi } = Lib._data;

  // Get data
  return txn.getString(dbi, str);
};

Lib.put = (k, val) => {
  let { txn, dbi } = Lib._data;
  return txn.putString(dbi, k, val);
};

Lib.del = (k) => {
  let { txn, dbi } = Lib._data;
  txn.del(dbi, k);
};

Lib.commit = () => {
  let { txn } = Lib._data;
  // Commit transaction
  txn.commit();
};

Lib.close = () => {
  let { env, dbi } = Lib._data;
  // Close the database
  dbi.close();
  // Close the environment
  env.close();
};


Lib.mput = function(items){
  Lib.txn();
  for(const row of items){
    for(const key in row){
      Lib.put(key,row[key]);
    }
  }
  Lib.commit();
};

Lib._ns = [];
Lib.ns = {};
Lib.set_namespaces = function(list){
  Lib._ns = [...list];
};
Lib.get_namespaces = function(){
  return Lib._ns;
};
Lib.make_key = function(key){
  return Lib._ns.join('|') + key;
};

Lib.ns.get = function(key){
  Lib.txn();
  let val = Lib.get(Lib.make_key(key));
  Lib.commit();
  return val;
};
Lib.ns.mget = function(items){
  Lib.txn();
  let ret = [];
  for(const key of items){
    let val = Lib.get(Lib.make_key(key));
    ret.push({[key]: val});
  }
  Lib.commit();
  return ret;
};
Lib.ns.mgetarray = function(items){
  Lib.txn();
  let ret = [];
  for(const key of items){
    ret.push( Lib.get(Lib.make_key(key)));
  }
  Lib.commit();
  return ret;
};

Lib.ns.mput = function(items){
  Lib.txn();
  for(const row of items){
    for(const key in row){
      Lib.put(Lib.make_key(key),row[key]);
    }
  }
  Lib.commit();
};

Lib.ns.put = function(key,val){
  Lib.txn();
  Lib.put(Lib.make_key(key),val);
  Lib.commit();
};

