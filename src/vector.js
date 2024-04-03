/**
 * A port of DASH core's CoinJoin client
 */

function Vector(_optional_prototype = null) {
	let self = this;
	this.contents = [];
	this.proto = _optional_prototype;
	this.get = function () {
		return self.contents;
	};
	this.clear = function (_in_proto) {
		self.proto = _in_proto;
		self.contents = [];
	};
	this.erase = function (start, end) {
		let saved = [];
		for (let i = 0; i < self.contents.length; ++i) {
			if (i >= start && i < end) {
				continue;
			}
			saved.push(self.contents[i]);
		}
		self.contents = saved;
	};
	this.size = function () {
		return self.contents.length;
	};
	this.emplace_back = function (...args) {
		if (self.proto) {
			self.contents.push(new self.proto(args));
		} else {
			self.contents.push(args);
		}
	};
	this.push_back = function (...args) {
		self.emplace_back(...args);
	};
}
module.exports = Vector;
