let Lib = {};
module.exports = Lib;
Lib.create = function (items) {
	this.contents = {};
	let self = this;
	this.count = function (value) {
		return 'undefined' !== typeof self.contents[value];
	};
	this.make = function (values) {
		self.contents = {};
		for (const value of values) {
			self.contents[value] = 1;
		}
	};
	this.make(items);
	return this;
};
