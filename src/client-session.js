#!/usr/bin/env node
'use strict';
const ArrayUtils = require('./array-utils.js');

function ClientSession() {
	let self = this;
	self.address_info = {};
	self.username = null;
	self.used_txids = [];
	self.col_txids = [];
	self.used_addresses = [];
	self.mixing_inputs = [];
	self.get_used_txids = function () {
		return [...self.used_txids, ...self.col_txids];
	};
	self.add_inputs = function (chosenInputTxns) {
		self.add_txids(ArrayUtils.extract(chosenInputTxns, 'txid'));
		self.add_addresses(ArrayUtils.extract(chosenInputTxns, 'address'));
		self.mixing_inputs = chosenInputTxns;
	};
	self.get_inputs = function () {
		return self.mixing_inputs;
	};
	self.get_used_addresses = function () {
		return self.used_addresses;
	};
	self.add_txids = function (a) {
		self.used_txids = [...self.used_txids, ...a];
	};
	self.add_addresses = function (a) {
		self.used_addresses = [...self.used_addresses, ...a];
	};
	self.report_inputs = function () {
		let rep = [];
		for (const i of self.get_inputs()) {
			rep.push(`txid: ${i.txid}`);
			rep.push(`address: ${i.address}`);
			rep.push(`vout: ${i.vout ?? '?'}`);
			rep.push(`outputIndex: ${i.outputIndex ?? '?'}`);
			rep.push('=============================================================');
		}
		return rep.join('\n');
	};
}

module.exports = {
	ClientSession,
};
