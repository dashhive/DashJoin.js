
const NetUtil = require('./network-util.js');
const hexToBytes = NetUtil.hexToBytes;
const hashOfHash = NetUtil.hashOfHash;
const hashByteOrder = NetUtil.hashByteOrder;
const opcodes = require('./opcodes.js');

const data = require('./data.json'); /** FIXME: remove prior to prod */

module.exports = {
  getVersion: function(){
    return data.version;
  },
  getType: function(){
    return data.type;
  },
	getTestScript: function() {
    return [opcodes.OP_RESERVED];
		//'OP_DUP OP_HASH160 6f608cf778ab1c9ed1730fc21f6eb3ec01b4cf70 OP_EQUALVERIFY OP_CHECKSIG'
	return hexToBytes('000000006b483045022100f4d8fa0ae4132235fecd540a62715ccfb1c9a97f8698d066656e30bb1e' +
		'1e06b90220301b4cc93f38950a69396ed89dfcc0' +
		'8e72ec8e6e7169463592a0bf504946d98b812102' +
		'fa4b9c0f9e76e06d57c75cab9c8368a62a1ce8db' +
		'6eb0c25c3e0719ddd9ab549cffffffff01e09304' +
		'00000000001976a914f895'
  );
		//TODO:
		//At some point we'll need to construct something like this:
		//'OP_DUP OP_HASH160 98dcf362b3b5a977d94dcba884468949d418c9d0 OP_EQUALVERIFY OP_CHECKSIG'
	},
	getInTX: function(){
    /**
     * How to get the txid:
     * 1) Get the block height of the transaction
     * 2) call the RPC `dash-cli getblockhash HEIGHT`
     * 3) pass that value to RPC: `dash-cli getblock $(dash-cli getblockhash HEIGHT) true`
     * 4) Copy the tx value
     */
		return hexToBytes(hashByteOrder(data.txid));
	},
}
