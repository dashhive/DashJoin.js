/**
 * A port of DASH core's CTransaction
 */
/** The basic transaction that is broadcasted on the network and contained in
 * blocks.  A transaction can contain multiple inputs and outputs.
 */
// Default transaction version.
const /*int32_t*/ CURRENT_VERSION = 2;
// Changing the default transaction version requires a two step process: first
// adapting relay policy by bumping MAX_STANDARD_VERSION, and then later date
// bumping the default CURRENT_VERSION at which point both CURRENT_VERSION and
// MAX_STANDARD_VERSION will be equal.
const /*int32_t*/ MAX_STANDARD_VERSION = 3;
const TRANSACTION_NORMAL = 0;
const OPCODES = require('./opcodes.js');
const hexToBytes = require('./network-util.js').hexToBytes;

function Transaction() {
  let self = this;
  self.vin = [];
  self.vout = [];
  //2 bytes
	self.nVersion = CURRENT_VERSION;
  //2 bytes
	self.nType = TRANSACTION_NORMAL;
  //4 bytes
  self.nLockTime = 0;
  //Variable bytes - Uint8Array() - only available for special transaction types
  self.vExtraPayload = new Uint8Array();
  //32 bytes
  self.hash = 0;

	self.clearVin = function(){
		self.vin = [];
	};
	self.clearVout = function(){
		self.vout = [];
	};
	self.addVin = function({hash, index}){
		self.vin.push({hash,index});
	};
	self.addVout = function({value,script}){
		self.vout.push({value,script});
	};
	
}

/**
 * Use case:
 */
(function({
	outpointTransaction,
}){
	if(typeof outpointTransaction.hash === 'undefined' || outpointTransaction.hash.length !== 32){
		throw new Error('Invalid hash. Must be 32 bytes');
	}
	let collateralTx = new Transaction();
	collateralTx.clearVin();
	collateralTx.clearVout();
	collateralTx.addVin(outpointTransaction);
	collateralTx.addVout({value: 0, script: [OPCODES.OP_RETURN]});
})({
	outpointTransaction: {
		hash: hexToBytes('ababf00dababf00dababf00dababf00dababf00dababf00dababf00dababf00d'),
		index: 0,
	},
});

module.exports = Transaction;
