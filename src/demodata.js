
const NetUtil = require('./network-util.js');
const hexToBytes = NetUtil.hexToBytes;
const hashOfHash = NetUtil.hashOfHash;
module.exports = {
	getTestScript: function() {
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
		return hashOfHash(hexToBytes('9f6c92b088961b2dce8935dbfda3901bbec9a2c5703e12d54bc5f39e00f3563f'));
	},
}
